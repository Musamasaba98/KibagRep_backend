/**
 * Bulk-imports health_professionals.csv into the HcpRecord table.
 * Source: ehealthlicense.go.ug scrape — 119,244 records.
 *
 * Run from backend root:
 *   node scripts/import_hcp.js
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING on portal_id.
 */

import "dotenv/config";
import fs from "fs";
import readline from "readline";
import { randomUUID } from "crypto";
import pg from "pg";

const { Client } = pg;

const CSV_PATH = "../Data/health_professionals.csv";
const BATCH_SIZE = 500;

// Parse a date string "YYYY-MM-DD" → ISO string or null
function parseDate(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  // Basic sanity: must look like a date and be a plausible year
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = parseInt(match[1]);
  if (year < 1900 || year > 2100) return null;
  return new Date(s).toISOString();
}

// Map our CSV council names to short labels for logging
function shortCouncil(c) {
  if (c.includes("Medical")) return "UMDPC";
  if (c.includes("Nurses"))  return "UNMC";
  if (c.includes("Allied"))  return "AHPC";
  return c.slice(0, 10);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to database.");

  // Count existing records
  const { rows: [{ count: existing }] } = await client.query(
    'SELECT COUNT(*) FROM "HcpRecord"'
  );
  if (parseInt(existing) > 0) {
    console.log(`Table already has ${parseInt(existing).toLocaleString()} records — new rows will be skipped (ON CONFLICT DO NOTHING).`);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let headers = null;
  let batch   = [];
  let total   = 0;
  let skipped = 0;

  const flush = async () => {
    if (batch.length === 0) return;

    // Build parameterised multi-row INSERT
    const placeholders = [];
    const values       = [];
    let   p            = 1;

    for (const row of batch) {
      placeholders.push(
        `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`
      );
      values.push(
        randomUUID(),
        row.portal_id,
        row.name,
        row.council,
        row.registration_no,
        row.registration_status || null,
        parseDate(row.registration_date),
        row.license_number    || null,
        parseDate(row.license_expiry),
        row.licence_status    || null,
      );
    }

    await client.query(
      `INSERT INTO "HcpRecord"
         (id, portal_id, name, council, registration_no,
          registration_status, registration_date,
          license_number, license_expiry, licence_status)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (portal_id) DO NOTHING`,
      values
    );

    total += batch.length;
    batch  = [];
  };

  console.log(`Reading ${CSV_PATH} …\n`);

  for await (const line of rl) {
    if (!line.trim()) continue;

    // Parse CSV line (simple — our data has no quoted commas)
    const cols = line.split(",");

    if (!headers) {
      headers = cols.map(h => h.trim());
      continue;
    }

    const row = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || "").trim(); });

    // Skip rows with no portal_id or name (malformed)
    if (!row.internal_id || !row.name) { skipped++; continue; }

    batch.push({
      portal_id:           row.internal_id,
      name:                row.name,
      council:             row.council,
      registration_no:     row.registration_no     || "",
      registration_status: row.registration_status || null,
      registration_date:   row.registration_date   || null,
      license_number:      row.license_number      || null,
      license_expiry:      row.license_expiry      || null,
      licence_status:      row.licence_status      || null,
    });

    if (batch.length >= BATCH_SIZE) {
      await flush();
      process.stdout.write(`\r  Inserted: ${total.toLocaleString().padStart(8)}  …`);
    }
  }

  await flush(); // last partial batch
  await client.end();

  console.log(`\n\nDone.`);
  console.log(`  Inserted : ${total.toLocaleString()}`);
  console.log(`  Skipped  : ${skipped.toLocaleString()} (no portal_id or name)`);
  console.log(`\nRun again safely — duplicates are ignored via ON CONFLICT.`);
}

main().catch(err => { console.error(err); process.exit(1); });
