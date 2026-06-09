/**
 * Backfills gps_source for records that already have lat/lng from the
 * first geocoding run (before the gps_source column was added).
 *
 * Re-geocodes using the same query and only updates the gps_source column
 * — does NOT overwrite existing coordinates.
 *
 * Run from backend root:
 *   node scripts/backfill_gps_source.js
 */

import "dotenv/config";
import pg           from "pg";
import { execSync } from "child_process";

const { Client } = pg;
const API_KEY    = process.env.GOOGLE_MAPS_API_KEY;
const DELAY_MS   = 120;

if (!API_KEY) { console.error("GOOGLE_MAPS_API_KEY not set"); process.exit(1); }

function geocodeSource(query) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${API_KEY}`;
  try {
    const raw  = execSync(`curl -s "${url}"`, { timeout: 10_000 }).toString("utf-8");
    const json = JSON.parse(raw);
    if (json.status === "OK" && json.results.length > 0)
      return json.results[0].geometry.location_type;
    return null;
  } catch { return null; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function backfill(client, cfg) {
  const { table, idCol, nameCol, locationCol, townCol, districtCol } = cfg;

  const { rows } = await client.query(`
    SELECT ${idCol}, ${nameCol}, ${locationCol},
           ${townCol ? townCol + "," : ""}
           ${districtCol}
    FROM "${table}"
    WHERE latitude IS NOT NULL AND gps_source IS NULL
  `);

  console.log(`\n${table}: ${rows.length} records to backfill`);
  if (rows.length === 0) return;

  let done = 0;
  for (const row of rows) {
    const query = [row[nameCol], row[locationCol], townCol ? row[townCol] : null, row[districtCol], "Uganda"]
      .filter(Boolean).map(s => s.trim()).join(", ");

    const source = geocodeSource(query);
    if (source) {
      await client.query(
        `UPDATE "${table}" SET gps_source = $1 WHERE ${idCol} = $2`,
        [source, row[idCol]]
      );
    }
    done++;
    process.stdout.write(`\r  ${done}/${rows.length}  last: ${source ?? "null"}`);
    await sleep(DELAY_MS);
  }
  console.log(`\n${table} backfill complete.`);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected.");

  await backfill(client, {
    table: "Facility", idCol: "id", nameCol: "name",
    locationCol: "location", townCol: null, districtCol: "district",
  });

  await backfill(client, {
    table: "Pharmacy", idCol: "id", nameCol: "pharmacy_name",
    locationCol: "location", townCol: "town", districtCol: "district",
  });

  await client.end();
  console.log("\nAll done.");
}

main().catch(e => { console.error(e); process.exit(1); });
