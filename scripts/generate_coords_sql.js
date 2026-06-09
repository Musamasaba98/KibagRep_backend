/**
 * Extracts lat/lng/gps_source from local DB and generates a single bulk
 * UPDATE SQL file per table — run once against Render, no round trips.
 *
 * Run from backend root:
 *   node scripts/generate_coords_sql.js
 *
 * Outputs:
 *   /tmp/update_facility_coords.sql
 *   /tmp/update_pharmacy_coords.sql
 *
 * Then apply to Render:
 *   psql "postgresql://..." -f /tmp/update_facility_coords.sql
 *   psql "postgresql://..." -f /tmp/update_pharmacy_coords.sql
 */

import "dotenv/config";
import fs   from "fs";
import pg   from "pg";

const { Client } = pg;

function esc(s) {
  return (s ?? "").replace(/'/g, "''").trim();
}

async function generateForTable(client, cfg) {
  const { table, nameCol, districtCol, outFile } = cfg;

  const { rows } = await client.query(`
    SELECT ${nameCol}, ${districtCol}, latitude, longitude, gps_source
    FROM "${table}"
    WHERE latitude IS NOT NULL
    ORDER BY ${districtCol}, ${nameCol}
  `);

  console.log(`${table}: ${rows.length} rows with coordinates`);
  if (rows.length === 0) return;

  // Build VALUES list
  const values = rows
    .map(r =>
      `  ($$${esc(r[nameCol])}$$, $$${esc(r[districtCol])}$$, ${r.latitude}, ${r.longitude}, $$${r.gps_source ?? "GEOCODED"}$$)`
    )
    .join(",\n");

  const sql = `-- Bulk coordinate update for ${table} (${rows.length} records)
-- Generated from local DB on ${new Date().toISOString()}
-- Run against Render: psql "$RENDER_DB_URL" -f ${outFile}

UPDATE "${table}" AS t
SET
  latitude   = v.lat,
  longitude  = v.lng,
  gps_source = v.src
FROM (
  VALUES
${values}
) AS v(name, district, lat, lng, src)
WHERE LOWER(TRIM(t.${nameCol}))   = LOWER(TRIM(v.name))
  AND LOWER(TRIM(t.${districtCol})) = LOWER(TRIM(v.district))
  AND (t.latitude IS NULL OR t.gps_source IS NULL);
`;

  fs.writeFileSync(outFile, sql, "utf-8");
  console.log(`  Written to ${outFile}  (${(sql.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to local DB.\n");

  await generateForTable(client, {
    table:       "Facility",
    nameCol:     "name",
    districtCol: "district",
    outFile:     "/tmp/update_facility_coords.sql",
  });

  await generateForTable(client, {
    table:       "Pharmacy",
    nameCol:     "pharmacy_name",
    districtCol: "district",
    outFile:     "/tmp/update_pharmacy_coords.sql",
  });

  await client.end();
  console.log("\nDone. Apply to Render:");
  console.log('  psql "$RENDER_DB_URL" -f /tmp/update_facility_coords.sql');
  console.log('  psql "$RENDER_DB_URL" -f /tmp/update_pharmacy_coords.sql');
}

main().catch(e => { console.error(e); process.exit(1); });
