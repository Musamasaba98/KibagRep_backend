/**
 * One-time import: Uganda NHFR health facilities → Facility table
 * Run: node scripts/import_nhfr_facilities.js
 *
 * Source: Ministry of Health National Health Facility Registry
 * API: https://nhfr.health.go.ug/api/v1/orgunits?level=6
 * Level 6 = actual health facilities (8,537 records as of 2026)
 */

import "dotenv/config";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const API_BASE = "https://nhfr.health.go.ug/api/v1";
const PAGE_SIZE = 1000;

async function fetchPage(page) {
  const url = `${API_BASE}/orgunits?level=6&pageSize=${PAGE_SIZE}&limit=${PAGE_SIZE}&page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "KibagRep/1.0 (import script)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
  return res.json();
}

function mapRecord(u) {
  const subcounty = u.subcounty?.name ?? null;
  const district = u.district?.name?.replace(/ District$/, "") ?? null;
  const region = u.region?.name ?? null;
  const dlg = u.dlg_municipality?.name ?? null;

  // Build location string from available geographic info
  const locationParts = [subcounty, district].filter(Boolean);
  const location = locationParts.join(", ") || dlg || region || "Uganda";

  return {
    _active: u.status === "active",
    name: u.name,
    location,
    town: subcounty ?? dlg ?? district ?? null,
    district,
    region,
    ownership: u.ownership?.name ?? null,
    facility_type: u.facility_level?.name ?? null,
    description: u.authority?.name ?? null,
  };
}

async function main() {
  // Load existing facility names to skip duplicates
  const existing = await prisma.facility.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((f) => f.name.toLowerCase().trim()));
  console.log(`Found ${existingNames.size} existing facilities — will skip duplicates.`);

  // First call to get total page count
  console.log("Fetching page 1...");
  const first = await fetchPage(1);
  const totalPages = first.pager.pageCount;
  const total = first.pager.total;
  console.log(`Total: ${total} facilities across ${totalPages} pages`);

  const allRecords = [...first.orgunits];

  // Fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    process.stdout.write(`Fetching page ${page}/${totalPages}...\r`);
    const data = await fetchPage(page);
    allRecords.push(...data.orgunits);
    // Small delay to be respectful of the government API
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`\nFetched ${allRecords.length} records from API`);

  // Map, filter inactive, deduplicate against existing
  const mapped = allRecords.map(mapRecord);
  const activeRecords = mapped.filter((r) => r._active);
  const newRecords = activeRecords
    .filter((r) => !existingNames.has(r.name.toLowerCase().trim()))
    .map(({ _active, ...rest }) => rest); // strip internal flag

  const inactive = mapped.length - activeRecords.length;
  const dupes = activeRecords.length - newRecords.length;
  console.log(
    `Inserting ${newRecords.length} new active facilities (${inactive} inactive skipped, ${dupes} duplicates skipped)...`
  );

  // Insert in batches of 500
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < newRecords.length; i += BATCH) {
    const batch = newRecords.slice(i, i + BATCH);
    const res = await prisma.facility.createMany({ data: batch });
    inserted += res.count;
    process.stdout.write(`  ${inserted}/${newRecords.length}\r`);
  }

  console.log(`\n✅ Done — ${inserted} facilities imported.`);

  // Summary breakdown
  const byType = {};
  newRecords.forEach((r) => {
    byType[r.facility_type ?? "Unknown"] = (byType[r.facility_type ?? "Unknown"] || 0) + 1;
  });
  console.log("\nBreakdown by type:");
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
    console.log(`  ${k}: ${v}`)
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
