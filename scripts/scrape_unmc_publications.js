/**
 * Scrapes the UNMC publications page for recently registered nurses/midwives.
 * Source: https://unmc.ug/publications/
 *
 * The page lists nurses whose certificates are ready for collection.
 * Columns on page: sequential #, REG DATE, NAME, CADRE
 * No registration number is published — we generate a synthetic portal_id.
 *
 * Run from backend root:
 *   node scripts/scrape_unmc_publications.js
 *
 * Safe to re-run — uses ON CONFLICT (portal_id) DO NOTHING.
 */

import "dotenv/config";
import * as cheerio          from "cheerio";
import pg                    from "pg";
import { execSync }          from "child_process";

const { Client } = pg;
const PAGE_URL   = "https://unmc.ug/publications/";
const BATCH      = 200;

const CADRE_FULL = {
  RM:   "Registered Midwife",
  RN:   "Registered Nurse",
  RCN:  "Registered Comprehensive Nurse",
  RMHN: "Registered Mental Health Nurse",
  RPN:  "Registered Paediatric Nurse",
  RPHN: "Registered Public Health Nurse",
  RNT:  "Registered Nurse Tutor",
  RMT:  "Registered Midwife Tutor",
  EN:   "Enrolled Nurse",
  EM:   "Enrolled Midwife",
  ECN:  "Enrolled Comprehensive Nurse",
  EMHN: "Enrolled Mental Health Nurse",
};

function parseDate(raw) {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const mmap = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };

  // "23-Feb-23"
  const m1 = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m1) {
    const month = mmap[m1[2].toLowerCase()];
    if (month === undefined) return null;
    const year = parseInt(m1[3]) < 100 ? 2000 + parseInt(m1[3]) : parseInt(m1[3]);
    const dt = new Date(Date.UTC(year, month, parseInt(m1[1])));
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  // "30/06/2023"
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    const dt = new Date(Date.UTC(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1])));
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  return null;
}

async function main() {
  // ── Fetch and parse page ──────────────────────────────────────────────────
  console.log(`Fetching ${PAGE_URL} …`);
  const html = execSync(
    `curl -s --compressed "${PAGE_URL}"`,
    { maxBuffer: 20 * 1024 * 1024 }
  ).toString("utf-8");

  const $    = cheerio.load(html, { decodeEntities: false });
  const rows = [];
  let   idx  = 0;

  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4) return;

    const date  = $(cells[1]).text().trim();
    const name  = $(cells[2]).text().trim().toUpperCase();
    const cadre = $(cells[3]).text().replace(/[^A-Za-z]/g, "").trim().toUpperCase();

    if (!name || name.length < 2) return;

    idx++;
    rows.push({ idx, date, name, cadre });
  });

  console.log(`Parsed ${rows.length} rows from the HTML table.\n`);
  if (rows.length === 0) {
    console.error("No rows found — check if page structure changed.");
    process.exit(1);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const dates  = rows.map(r => parseDate(r.date)).filter(Boolean).sort();
  console.log(`Date range : ${dates[0]?.slice(0,10) ?? "?"} → ${dates[dates.length-1]?.slice(0,10) ?? "?"}`);

  const byCadre = {};
  rows.forEach(r => { byCadre[r.cadre] = (byCadre[r.cadre] ?? 0) + 1; });
  console.log("Cadres     :", Object.entries(byCadre).sort((a,b)=>b[1]-a[1])
    .map(([k,v])=>`${k}:${v}`).join("  "));

  console.log("\nSample (first 5):");
  rows.slice(0, 5).forEach(r =>
    console.log(`  ${r.idx}. [${r.date}] ${r.name} — ${r.cadre}`)
  );
  console.log();

  // ── Connect to DB ─────────────────────────────────────────────────────────
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to database.");

  const { rows: [{ count: existing }] } = await client.query(
    `SELECT COUNT(*) FROM "HcpRecord" WHERE portal_id LIKE 'UNMC-PUB-%'`
  );
  console.log(`Existing UNMC-PUB records in DB: ${existing}\n`);

  // ── Insert in batches ─────────────────────────────────────────────────────
  let inserted = 0;
  let skipped  = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    let batchInserted = 0;

    // Insert one row at a time — simple and safe
    for (const r of batch) {
      const portalId   = `UNMC-PUB-${String(r.idx).padStart(5, "0")}`;
      const cadreLabel = CADRE_FULL[r.cadre] ?? r.cadre;
      const regDate    = parseDate(r.date);

      const res = await client.query(
        `INSERT INTO "HcpRecord"
           (id, portal_id, name, council, registration_no, registration_status,
            registration_date, license_number, license_expiry, licence_status,
            created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NULL, NULL, $7, now(), now())
         ON CONFLICT (portal_id) DO NOTHING`,
        [portalId, r.name, "Uganda Nurses & Midwives Council", "", cadreLabel, regDate, "Active"]
      );
      batchInserted += res.rowCount ?? 0;
    }

    inserted += batchInserted;
    skipped  += batch.length - batchInserted;

    const done = Math.min(i + BATCH, rows.length);
    process.stdout.write(`\r  Progress: ${done}/${rows.length}  inserted ${inserted}  skipped ${skipped}`);
  }

  await client.end();

  console.log(`\n\nDone.`);
  console.log(`  Inserted : ${inserted}`);
  console.log(`  Skipped  : ${skipped} (already in DB)`);
  console.log(`\nTotal UNMC-PUB records now in local DB: ${parseInt(existing) + inserted}`);
}

main().catch(e => { console.error(e); process.exit(1); });
