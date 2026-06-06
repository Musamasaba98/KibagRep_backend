/**
 * One-time import: NDA licensed outlets → Pharmacy table
 * Run: node scripts/import_nda_pharmacies.js
 *
 * The NDA page uses DataTables which loads data via AJAX.
 * We hit the underlying DataTables API to get all records at once.
 */

import { load } from "cheerio";
import "dotenv/config";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const NDA_URL = "https://www.nda.or.ug/licensed-outlets/";

// Maps NDA PremiseType / PremiseCatgory → PharmacyType enum
function mapType(premiseType = "", category = "") {
  const t = premiseType.toLowerCase();
  const c = category.toLowerCase();
  if (t.includes("dispensing clinic") || t.includes("dispensary")) return "DISPENSING_CLINIC";
  if (t.includes("hospital")) return "HOSPITAL_INTERNAL";
  if (t.includes("community")) return "COMMUNITY_HEALTH";
  if (t.includes("chain")) return "CHAIN";
  if (c.includes("veterinary")) return "INDEPENDENT"; // vet stores — keep as INDEPENDENT
  return "INDEPENDENT";
}

function clean(val) {
  if (!val) return "";
  return val.replace(/\s+/g, " ").trim();
}

// Extract rows from raw HTML returned by a DataTables draw request
async function fetchAllRows() {
  // First, fetch the page to find the AJAX URL and any token
  console.log("Fetching NDA page to discover DataTables config...");

  const pageRes = await fetch(NDA_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; KibagRep/1.0)" },
  });
  const html = await pageRes.text();
  const $ = load(html);

  // Try to find an embedded DataTables AJAX source URL in script tags
  let ajaxUrl = null;
  $("script").each((_, el) => {
    const src = $(el).html() || "";
    const match = src.match(/["']([^"']*\/api\/[^"']+|[^"']*DataTables[^"']*|[^"']*ajax[^"']*\.php[^"']*)["']/i);
    if (match) ajaxUrl = match[1];
  });

  console.log("Discovered AJAX URL:", ajaxUrl ?? "(none — will parse static table)");

  // --- Strategy A: try DataTables AJAX endpoint ---
  if (ajaxUrl) {
    const base = new URL(ajaxUrl.startsWith("http") ? ajaxUrl : ajaxUrl, NDA_URL).href;
    const params = new URLSearchParams({
      draw: "1",
      start: "0",
      length: "100000",
      "search[value]": "",
      "search[regex]": "false",
    });
    try {
      const apiRes = await fetch(`${base}?${params}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const json = await apiRes.json();
      if (json.data && Array.isArray(json.data)) {
        console.log(`DataTables API returned ${json.data.length} records`);
        return { source: "api", data: json.data };
      }
    } catch {
      console.log("DataTables API fetch failed, falling back to HTML parse");
    }
  }

  // --- Strategy B: parse static HTML table ---
  const rows = [];
  $("table tbody tr").each((_, tr) => {
    const cells = $(tr).find("td").map((_, td) => clean($(td).text())).get();
    if (cells.length >= 9) rows.push(cells);
  });

  if (rows.length > 0) {
    console.log(`Found ${rows.length} rows in static HTML table`);
    return { source: "html", data: rows };
  }

  throw new Error(
    "Could not extract data from NDA page — site may require JavaScript rendering.\n" +
    "Try fetching the DataTables AJAX endpoint manually: look in the page source for $.ajax or DataTable({ ajax: '...' })"
  );
}

// NDA HTML table column order (0-indexed):
// 0: PremiseName, 1: PremiseNo, 2: PremiseType, 3: tpin_no,
// 4: physical_address, 5: street, 6: psu_no, 7: PremiseCatgory,
// 8: districtName, 9: region
function parseHtmlRow(cells) {
  return {
    name: clean(cells[0]),
    premiseType: clean(cells[2]),
    category: clean(cells[7]),
    address: clean(cells[4]),
    street: clean(cells[5]),
    district: clean(cells[8]),
    region: clean(cells[9]),
  };
}

// DataTables JSON API — columns may come as an object or array depending on server config
function parseApiRow(row) {
  if (Array.isArray(row)) return parseHtmlRow(row);
  // Named keys from the NDA DataTables server
  return {
    name: clean(row.PremiseName || row.premise_name || row[0] || ""),
    premiseType: clean(row.PremiseType || row.premise_type || row[2] || ""),
    category: clean(row.PremiseCatgory || row.premise_category || row[7] || ""),
    address: clean(row.physical_address || row[4] || ""),
    street: clean(row.street || row[5] || ""),
    district: clean(row.districtName || row.district_name || row[8] || ""),
    region: clean(row.region || row[9] || ""),
  };
}

async function main() {
  // Load existing pharmacy names to avoid duplicates
  const existing = await prisma.pharmacy.findMany({ select: { pharmacy_name: true } });
  const existingNames = new Set(existing.map((p) => p.pharmacy_name.toLowerCase().trim()));
  console.log(`Found ${existingNames.size} existing pharmacies — will skip duplicates.`);

  let result;
  try {
    result = await fetchAllRows();
  } catch (err) {
    console.error("❌", err.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  const { source, data } = result;

  // Build Prisma records
  const records = [];
  for (const raw of data) {
    const row = source === "api" ? parseApiRow(raw) : parseHtmlRow(raw);
    if (!row.name) continue;

    const location = [row.address, row.street].filter(Boolean).join(", ") || row.district || "Uganda";

    records.push({
      pharmacy_name: row.name,
      location,
      town: row.district || null,
      district: row.district || null,
      region: row.region || null,
      pharmacy_type: mapType(row.premiseType, row.category),
      is_active: true,
    });
  }

  // Filter out names already in DB
  const newRecords = records.filter(
    (r) => !existingNames.has(r.pharmacy_name.toLowerCase().trim())
  );

  if (newRecords.length === 0) {
    console.log("All records already exist in the database. Nothing to import.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nInserting ${newRecords.length} new pharmacies (${records.length - newRecords.length} skipped as duplicates)...`);
  const records_to_insert = newRecords;

  // Insert in batches of 500
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < records_to_insert.length; i += BATCH) {
    const batch = records_to_insert.slice(i, i + BATCH);
    const res = await prisma.pharmacy.createMany({ data: batch });
    inserted += res.count;
    process.stdout.write(`  ${inserted}/${records_to_insert.length}\r`);
  }

  console.log(`\n✅ Done — ${inserted} pharmacies imported.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
