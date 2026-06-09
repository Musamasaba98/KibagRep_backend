/**
 * Copies lat/lng/gps_source from local DB to Render DB for Facility and Pharmacy.
 * Matches records by name + district (both DBs have different UUIDs from separate imports).
 *
 * Run from backend root:
 *   RENDER_DB_URL="postgresql://..." node scripts/sync_coords_to_render.js
 *
 * Options:
 *   TABLE=facility|pharmacy  — sync only one table (default: both)
 *   DRY_RUN=true             — show counts without writing
 */

import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const LOCAL_URL    = process.env.DATABASE_URL;
const RENDER_URL   = process.env.RENDER_DB_URL;
const TABLE_FILTER = process.env.TABLE ?? "both";
const DRY_RUN      = process.env.DRY_RUN === "true";
const BATCH        = 500;

if (!LOCAL_URL)  { console.error("DATABASE_URL not set"); process.exit(1); }
if (!RENDER_URL) { console.error("RENDER_DB_URL not set"); process.exit(1); }

function normalize(s) {
  return (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

async function syncTable(local, render, cfg) {
  const { table, nameCol, districtCol, townCol } = cfg;

  // Pull local records that have coordinates
  const { rows: localRows } = await local.query(`
    SELECT ${nameCol}, ${districtCol}, ${townCol ? townCol + "," : ""}
           latitude, longitude, gps_source
    FROM "${table}"
    WHERE latitude IS NOT NULL
  `);
  console.log(`\n${table}: ${localRows.length} local records with coordinates`);

  // Build lookup key → coords map from local
  const localMap = new Map();
  for (const r of localRows) {
    // Primary key: name + district
    const key = normalize(r[nameCol]) + "|" + normalize(r[districtCol]);
    if (!localMap.has(key)) localMap.set(key, r);
  }

  // Pull render records without coords (or without gps_source)
  const { rows: renderRows } = await render.query(`
    SELECT id, ${nameCol}, ${districtCol}
    FROM "${table}"
    WHERE latitude IS NULL OR gps_source IS NULL
  `);
  console.log(`  Render records needing update: ${renderRows.length}`);

  let updated = 0, notFound = 0;

  for (let i = 0; i < renderRows.length; i += BATCH) {
    const batch = renderRows.slice(i, i + BATCH);

    for (const renderRow of batch) {
      const key = normalize(renderRow[nameCol]) + "|" + normalize(renderRow[districtCol]);
      const local = localMap.get(key);

      if (!local) { notFound++; continue; }

      if (!DRY_RUN) {
        await render.query(
          `UPDATE "${table}" SET latitude = $1, longitude = $2, gps_source = $3 WHERE id = $4`,
          [local.latitude, local.longitude, local.gps_source, renderRow.id]
        );
      }
      updated++;
    }

    process.stdout.write(`\r  ${Math.min(i + BATCH, renderRows.length)}/${renderRows.length} processed — ${updated} matched`);
  }

  console.log(`\n  Done: ${updated} updated on Render, ${notFound} not matched in local`);
  return { updated, notFound };
}

async function main() {
  if (DRY_RUN) console.log("DRY RUN — no writes.\n");

  const local  = new Client({ connectionString: LOCAL_URL });
  const render = new Client({
    connectionString: RENDER_URL + (RENDER_URL.includes("?") ? "&" : "?") + "sslmode=require"
  });

  await local.connect();  console.log("Connected to local DB.");
  await render.connect(); console.log("Connected to Render DB.");

  const tables = [];
  if (TABLE_FILTER === "both" || TABLE_FILTER === "facility") {
    tables.push({ table: "Facility", nameCol: "name",          districtCol: "district", townCol: "town" });
  }
  if (TABLE_FILTER === "both" || TABLE_FILTER === "pharmacy") {
    tables.push({ table: "Pharmacy", nameCol: "pharmacy_name", districtCol: "district", townCol: "town" });
  }

  let totalUpdated = 0, totalNotFound = 0;
  for (const t of tables) {
    const { updated, notFound } = await syncTable(local, render, t);
    totalUpdated   += updated;
    totalNotFound  += notFound;
  }

  await local.end();
  await render.end();

  console.log(`\n${"═".repeat(50)}`);
  console.log(`TOTAL: ${totalUpdated} records updated on Render`);
  console.log(`       ${totalNotFound} local records had no name+district match on Render`);
  console.log(`${"═".repeat(50)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
