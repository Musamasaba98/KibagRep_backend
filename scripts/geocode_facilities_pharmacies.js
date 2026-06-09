/**
 * Geocodes Facility and Pharmacy records that are missing lat/lng.
 * Uses Google Maps Geocoding API.
 *
 * Run from backend root:
 *   node scripts/geocode_facilities_pharmacies.js
 *
 * Options (env vars):
 *   TABLE=facility|pharmacy   — only geocode one table (default: both)
 *   LIMIT=100                 — stop after N records (default: all)
 *   DRY_RUN=true              — print queries without writing to DB
 *
 * Safe to re-run — only processes records where latitude IS NULL.
 */

import "dotenv/config";
import fs           from "fs";
import pg           from "pg";
import { execSync } from "child_process";

const { Client }  = pg;
const API_KEY     = process.env.GOOGLE_MAPS_API_KEY;
const TABLE_FILTER = process.env.TABLE ?? "both";
const LIMIT        = parseInt(process.env.LIMIT ?? "999999", 10);
const DRY_RUN      = process.env.DRY_RUN === "true";
const DELAY_MS     = 120; // ~8 req/sec — well within 50 QPS limit

if (!API_KEY) { console.error("GOOGLE_MAPS_API_KEY not set in .env"); process.exit(1); }

// ── Geocode one address string ────────────────────────────────────────────────
function geocode(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${API_KEY}`;
  try {
    const raw = execSync(`curl -s "${url}"`, { timeout: 10_000 }).toString("utf-8");
    const json = JSON.parse(raw);
    if (json.status === "OK" && json.results.length > 0) {
      const loc = json.results[0].geometry.location;
      return {
        lat:       loc.lat,
        lng:       loc.lng,
        source:    json.results[0].geometry.location_type,  // ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE
        formatted: json.results[0].formatted_address,
      };
    }
    return { error: json.status };
  } catch (e) {
    return { error: e.message };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Process one table ─────────────────────────────────────────────────────────
async function processTable(client, tableConfig) {
  const { table, nameCol, locationCol, townCol, districtCol, latCol, lngCol, idCol } = tableConfig;

  const { rows } = await client.query(`
    SELECT ${idCol}, ${nameCol}, ${locationCol},
           ${townCol ? townCol + "," : ""}
           ${districtCol}
    FROM "${table}"
    WHERE ${latCol} IS NULL
    ORDER BY ${districtCol}
    LIMIT $1
  `, [LIMIT]);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${table.toUpperCase()} — ${rows.length} records to geocode`);
  console.log(`${"─".repeat(60)}`);

  if (rows.length === 0) { console.log("Nothing to do."); return { ok: 0, failed: 0 }; }

  let ok = 0, failed = 0;
  const failures = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name     = row[nameCol]     ?? "";
    const location = row[locationCol] ?? "";
    const town     = townCol ? (row[townCol] ?? "") : "";
    const district = row[districtCol] ?? "";

    // Build query: most specific → least specific
    const query = [name, location, town, district, "Uganda"]
      .map(s => s.trim())
      .filter(Boolean)
      .join(", ");

    process.stdout.write(`\r  [${i + 1}/${rows.length}] ${name.slice(0, 40).padEnd(40)} … `);

    const result = geocode(query);

    if (result.error) {
      failures.push({ id: row[idCol], name, query, error: result.error });
      failed++;
      process.stdout.write(`FAIL (${result.error})\n`);
    } else {
      if (!DRY_RUN) {
        await client.query(
          `UPDATE "${table}" SET ${latCol} = $1, ${lngCol} = $2, gps_source = $3 WHERE ${idCol} = $4`,
          [result.lat, result.lng, result.source, row[idCol]]
        );
      }
      ok++;
      process.stdout.write(`✓ ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}  [${result.source}]\n`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n${table}: ${ok} geocoded, ${failed} failed.`);

  if (failures.length > 0) {
    const logPath = `/tmp/geocode_failures_${table.toLowerCase()}.json`;
    fs.writeFileSync(logPath, JSON.stringify(failures, null, 2));
    console.log(`Failures logged to ${logPath}`);
  }

  return { ok, failed };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) console.log("DRY RUN — no DB writes.\n");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to database.");

  const tables = [];

  if (TABLE_FILTER === "both" || TABLE_FILTER === "facility") {
    tables.push({
      table:       "Facility",
      idCol:       "id",
      nameCol:     "name",
      locationCol: "location",
      townCol:     null,
      districtCol: "district",
      latCol:      "latitude",
      lngCol:      "longitude",
    });
  }

  if (TABLE_FILTER === "both" || TABLE_FILTER === "pharmacy") {
    tables.push({
      table:       "Pharmacy",
      idCol:       "id",
      nameCol:     "pharmacy_name",
      locationCol: "location",
      townCol:     "town",
      districtCol: "district",
      latCol:      "latitude",
      lngCol:      "longitude",
    });
  }

  let totalOk = 0, totalFailed = 0;
  for (const t of tables) {
    const { ok, failed } = await processTable(client, t);
    totalOk     += ok;
    totalFailed += failed;
  }

  await client.end();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`TOTAL: ${totalOk} geocoded ✓   ${totalFailed} failed ✗`);
  console.log(`${"═".repeat(60)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
