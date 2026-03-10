/**
 * Seed Uganda doctors from Data/doctors_data.json
 * Run with: node src/scripts/seedDoctors.js
 *
 * Skips doctors that already exist (matched by doctor_name + town).
 * Creates a Facility record per unique facility name + town combo.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import prisma from "../config/prisma.config.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const dataPath = resolve(__dirname, "../../../Data/doctors_data.json");
const { data: rawDoctors } = require(dataPath);

function toTitleCase(str) {
  return (str || "").trim().replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function normaliseContact(contact) {
  if (!contact || contact === "") return null;
  const s = String(contact).replace(/\D/g, "");
  if (s.length < 7) return null;
  return s.startsWith("256") ? `+${s}` : `+256${s.slice(-9)}`;
}

async function seed() {
  console.log(`Seeding ${rawDoctors.length} doctors…`);

  // Cache facilities by "name|town" to avoid duplicate DB lookups
  const facilityCache = new Map();

  async function getOrCreateFacility(name, location) {
    const key = `${name}|${location}`;
    if (facilityCache.has(key)) return facilityCache.get(key);
    let facility = await prisma.facility.findFirst({ where: { name, location } });
    if (!facility) {
      facility = await prisma.facility.create({ data: { name, location } });
    }
    facilityCache.set(key, facility);
    return facility;
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const raw of rawDoctors) {
    const doctor_name = toTitleCase(raw.name);
    if (!doctor_name) { skipped++; continue; }

    const town = toTitleCase(raw.town) || "Unknown";
    const location = toTitleCase(raw.location) || town;
    const speciality = raw.splty ? [toTitleCase(raw.splty)] : [];
    const facilityName = toTitleCase(raw.facility) || "Unknown Facility";
    const contact = normaliseContact(raw.contact);

    try {
      const existing = await prisma.doctor.findFirst({
        where: { doctor_name, town },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      const facility = await getOrCreateFacility(facilityName, location);

      await prisma.doctor.create({
        data: {
          doctor_name,
          town,
          location,
          speciality,
          contact,
          facility: { connect: { id: facility.id } },
        },
      });
      created++;
    } catch (err) {
      console.error(`  Failed [${raw.sno}] ${doctor_name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone — created: ${created}, skipped: ${skipped}, failed: ${failed}`);
  await prisma.$disconnect();
}

seed().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
