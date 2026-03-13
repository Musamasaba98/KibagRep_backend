/**
 * KibagRep Dev Seed Script — uses pg directly (no Prisma init complexity)
 * Run: node seed.js
 * Safe to re-run — skips existing records.
 */
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcrypt";

const { Client } = pg;
const PASSWORD = "Test1234!";

// ── Data ─────────────────────────────────────────────────────────────────────

const users = [
  { username: "rep_nakato",    firstname: "Nakato",   lastname: "Sarah",   email: "rep@kibagrep.dev",          role: "MedicalRep",  gender: "FEMALE", contact: "0700000001" },
  { username: "sup_mugisha",   firstname: "Mugisha",  lastname: "Brian",   email: "supervisor@kibagrep.dev",   role: "Supervisor",  gender: "MALE",   contact: "0700000002" },
  { username: "mgr_kayiira",   firstname: "Kayiira",  lastname: "Moses",   email: "manager@kibagrep.dev",      role: "Manager",     gender: "MALE",   contact: "0700000003" },
  { username: "cm_nalwanga",   firstname: "Nalwanga", lastname: "Agnes",   email: "country@kibagrep.dev",      role: "COUNTRY_MGR", gender: "FEMALE", contact: "0700000004" },
  { username: "sa_tumwine",    firstname: "Tumwine",  lastname: "Patrick", email: "salesadmin@kibagrep.dev",   role: "SALES_ADMIN", gender: "MALE",   contact: "0700000005" },
  { username: "super_admin",   firstname: "KibagRep", lastname: "Admin",   email: "admin@kibagrep.dev",        role: "SUPER_ADMIN", gender: "MALE",   contact: "0700000006" },
];

const doctors = [
  { doctor_name: "Dr. James Kato",          speciality: ["Internal Medicine", "General Practice"],  location: "Mulago National Referral Hospital",    town: "Kampala",    contact: "0701100001" },
  { doctor_name: "Dr. Grace Namukasa",       speciality: ["Obstetrics & Gynaecology"],               location: "Nsambya Hospital",                     town: "Kampala",    contact: "0701100002" },
  { doctor_name: "Dr. Robert Ssemwogerere", speciality: ["Cardiology", "Internal Medicine"],         location: "International Hospital Kampala",       town: "Kampala",    contact: "0701100003" },
  { doctor_name: "Dr. Prossy Namutebi",     speciality: ["Paediatrics"],                             location: "Mengo Hospital",                       town: "Kampala",    contact: "0701100004" },
  { doctor_name: "Dr. Denis Ochieng",       speciality: ["General Surgery"],                         location: "Lacor Hospital",                       town: "Gulu",       contact: "0701100005" },
  { doctor_name: "Dr. Fatuma Nakigozi",     speciality: ["Dermatology", "General Practice"],         location: "Jinja Regional Referral Hospital",     town: "Jinja",      contact: "0701100006" },
  { doctor_name: "Dr. Samuel Byaruhanga",   speciality: ["Ophthalmology"],                           location: "Ruharo Mission Hospital",              town: "Mbarara",    contact: "0701100007" },
  { doctor_name: "Dr. Agnes Tumwesigye",    speciality: ["Endocrinology", "Internal Medicine"],      location: "Mbarara University Teaching Hospital", town: "Mbarara",    contact: "0701100008" },
  { doctor_name: "Dr. Ibrahim Ssekandi",    speciality: ["Neurology"],                               location: "Case Medical Centre",                  town: "Kampala",    contact: "0701100009" },
  { doctor_name: "Dr. Lydia Atuhaire",      speciality: ["Oncology", "Internal Medicine"],           location: "Uganda Cancer Institute",              town: "Kampala",    contact: "0701100010" },
  { doctor_name: "Dr. Moses Mwesigwa",      speciality: ["Orthopaedics"],                            location: "Fortportal Regional Referral Hospital",town: "Fort Portal", contact: "0701100011" },
  { doctor_name: "Dr. Christine Auma",      speciality: ["General Practice"],                        location: "St. Mary's Hospital Lacor",            town: "Gulu",       contact: "0701100012" },
];

const facilities = [
  { name: "Mulago National Referral Hospital", location: "Mulago Hill, Kampala",       description: "Uganda's largest public referral hospital",        latitude: 0.3376,  longitude: 32.5772 },
  { name: "Nsambya Hospital",                  location: "Nsambya, Kampala",           description: "Catholic mission hospital in southern Kampala",     latitude: 0.3042,  longitude: 32.5838 },
  { name: "International Hospital Kampala",    location: "Plot 4686 Namuwongo, Kampala", description: "Private specialist hospital",                    latitude: 0.3120,  longitude: 32.6021 },
  { name: "Mengo Hospital",                    location: "Mengo Hill, Kampala",        description: "Church of Uganda mission hospital",                 latitude: 0.3049,  longitude: 32.5614 },
  { name: "Lacor Hospital",                    location: "Gulu",                       description: "St. Mary's Hospital Lacor — northern Uganda",       latitude: 2.7891,  longitude: 32.2913 },
  { name: "Ruharo Mission Hospital",           location: "Mbarara",                    description: "Church of Uganda hospital in western Uganda",       latitude: -0.6061, longitude: 30.6580 },
];

const pharmacies = [
  { pharmacy_name: "Quality Chemist",     location: "Kampala Road, Kampala",   description: "High-volume pharmacy on Kampala Road" },
  { pharmacy_name: "Ntinda Pharmacy",     location: "Ntinda, Kampala",         description: "Residential suburb pharmacy" },
  { pharmacy_name: "City Pharmacy",       location: "Ben Kiwanuka St, Kampala", description: "Central Kampala wholesale and retail" },
  { pharmacy_name: "Kisementi Chemist",   location: "Kisementi, Kampala",      description: "Upscale residential pharmacy" },
  { pharmacy_name: "Nateete Drug Shop",   location: "Nateete, Kampala",        description: "High-density suburb dispensary" },
  { pharmacy_name: "Gulu Health Pharmacy",location: "Gulu Town",               description: "Northern Uganda regional pharmacy" },
  { pharmacy_name: "Mbarara Chemist",     location: "Mbarara Town",            description: "Western Uganda pharmacy" },
];

const products = [
  "Amoxil 500mg",
  "Coartem 80/480mg",
  "Metformin 500mg",
  "Amlodipine 10mg",
  "Omeprazole 20mg",
  "Ciprofloxacin 500mg",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertOne(client, table, checkSql, checkParams, insertSql, insertParams, label) {
  const exists = await client.query(checkSql, checkParams);
  if (exists.rows.length > 0) {
    console.log(`  skip  ${label}`);
    return exists.rows[0];
  }
  const result = await client.query(insertSql, insertParams);
  console.log(`  ok    ${label}`);
  return result.rows[0];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ── 1. Users ──────────────────────────────────────────────────────────────
  console.log("\n── Users ─────────────────────────────────────────────");
  const hashed = await bcrypt.hash(PASSWORD, 10);
  const userIds = {};
  for (const u of users) {
    const row = await upsertOne(
      client,
      "User",
      `SELECT id FROM "User" WHERE email = $1`, [u.email],
      `INSERT INTO "User" (id, username, firstname, lastname, email, role, gender, contact, password, date_of_joining)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id`,
      [u.username, u.firstname, u.lastname, u.email, u.role, u.gender, u.contact, hashed],
      `${u.role} ${u.email}`
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "User" WHERE email = $1`, [u.email])).rows[0].id;
    userIds[u.role] = id;
  }

  // ── 2. Doctors ────────────────────────────────────────────────────────────
  console.log("\n── Doctors ───────────────────────────────────────────");
  const doctorIds = [];
  for (const d of doctors) {
    const row = await upsertOne(
      client,
      "Doctor",
      `SELECT id FROM "Doctor" WHERE doctor_name = $1 AND town = $2`, [d.doctor_name, d.town],
      `INSERT INTO "Doctor" (id, doctor_name, speciality, location, town, contact, date_of_joining)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW()) RETURNING id`,
      [d.doctor_name, d.speciality, d.location, d.town, d.contact],
      `${d.doctor_name} (${d.town})`
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "Doctor" WHERE doctor_name = $1 AND town = $2`, [d.doctor_name, d.town])).rows[0].id;
    doctorIds.push(id);
  }

  // ── 3. Facilities ─────────────────────────────────────────────────────────
  console.log("\n── Facilities ────────────────────────────────────────");
  const facilityIds = [];
  for (const f of facilities) {
    const row = await upsertOne(
      client,
      "Facility",
      `SELECT id FROM "Facility" WHERE name = $1`, [f.name],
      `INSERT INTO "Facility" (id, name, location, description, latitude, longitude)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5) RETURNING id`,
      [f.name, f.location, f.description, f.latitude, f.longitude],
      f.name
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "Facility" WHERE name = $1`, [f.name])).rows[0].id;
    facilityIds.push(id);
  }

  // ── 4. Pharmacies ─────────────────────────────────────────────────────────
  console.log("\n── Pharmacies ────────────────────────────────────────");
  const pharmacyIds = [];
  for (const p of pharmacies) {
    const row = await upsertOne(
      client,
      "Pharmacy",
      `SELECT id FROM "Pharmacy" WHERE pharmacy_name = $1`, [p.pharmacy_name],
      `INSERT INTO "Pharmacy" (id, pharmacy_name, location, description)
       VALUES (gen_random_uuid()::text, $1, $2, $3) RETURNING id`,
      [p.pharmacy_name, p.location, p.description],
      p.pharmacy_name
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "Pharmacy" WHERE pharmacy_name = $1`, [p.pharmacy_name])).rows[0].id;
    pharmacyIds.push(id);
  }

  // ── 5. Company ────────────────────────────────────────────────────────────
  console.log("\n── Company ───────────────────────────────────────────");
  const companyRow = await upsertOne(
    client,
    "Company",
    `SELECT id FROM "Company" WHERE company_name = $1`, ["Novex Pharma Uganda Ltd"],
    `INSERT INTO "Company" (id, company_name, location, latitude, longitude, date_of_joining)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW()) RETURNING id`,
    ["Novex Pharma Uganda Ltd", "Plot 12, Nakasero Hill, Kampala", 0.3163, 32.5822],
    "Novex Pharma Uganda Ltd"
  );
  const companyId = companyRow?.id ?? (await client.query(`SELECT id FROM "Company" WHERE company_name = $1`, ["Novex Pharma Uganda Ltd"])).rows[0].id;

  // Update users with company_id
  await client.query(`UPDATE "User" SET company_id = $1 WHERE company_id IS NULL AND role IN ('MedicalRep','Supervisor','Manager','COUNTRY_MGR','SALES_ADMIN')`, [companyId]);
  console.log("  ok    Linked users → company");

  // ── 6. Org Roles (Supervisor / Manager / MedicalRep records) ─────────────
  console.log("\n── Org Roles ─────────────────────────────────────────");

  const supRow = await upsertOne(
    client,
    "Supervisor",
    `SELECT id FROM "Supervisor" WHERE supervisor_name = $1`, ["Mugisha Brian"],
    `INSERT INTO "Supervisor" (id, supervisor_name, date_of_joining) VALUES (gen_random_uuid()::text, $1, NOW()) RETURNING id`,
    ["Mugisha Brian"],
    "Supervisor: Mugisha Brian"
  );
  const supervisorId = supRow?.id ?? (await client.query(`SELECT id FROM "Supervisor" WHERE supervisor_name = $1`, ["Mugisha Brian"])).rows[0].id;

  const mgrRow = await upsertOne(
    client,
    "Manager",
    `SELECT id FROM "Manager" WHERE manager_name = $1`, ["Kayiira Moses"],
    `INSERT INTO "Manager" (id, manager_name, date_of_joining) VALUES (gen_random_uuid()::text, $1, NOW()) RETURNING id`,
    ["Kayiira Moses"],
    "Manager: Kayiira Moses"
  );
  const managerId = mgrRow?.id ?? (await client.query(`SELECT id FROM "Manager" WHERE manager_name = $1`, ["Kayiira Moses"])).rows[0].id;

  const repRow = await upsertOne(
    client,
    "MedicalRep",
    `SELECT id FROM "MedicalRep" WHERE medical_rep_name = $1`, ["Nakato Sarah"],
    `INSERT INTO "MedicalRep" (id, medical_rep_name, date_of_joining) VALUES (gen_random_uuid()::text, $1, NOW()) RETURNING id`,
    ["Nakato Sarah"],
    "MedicalRep: Nakato Sarah"
  );
  const medRepId = repRow?.id ?? (await client.query(`SELECT id FROM "MedicalRep" WHERE medical_rep_name = $1`, ["Nakato Sarah"])).rows[0].id;

  // ── 7. Profiles (link User ↔ Org Role) ───────────────────────────────────
  console.log("\n── Org Profiles ──────────────────────────────────────");

  await upsertOne(
    client, "SupervisorProfile",
    `SELECT id FROM "SupervisorProfile" WHERE "userUser_id" = $1`, [userIds["Supervisor"]],
    `INSERT INTO "SupervisorProfile" (id, "userUser_id", supervisor_id) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id`,
    [userIds["Supervisor"], supervisorId],
    `SupervisorProfile for sup_mugisha`
  );

  await upsertOne(
    client, "ManagerProfile",
    `SELECT id FROM "ManagerProfile" WHERE "userUser_id" = $1`, [userIds["Manager"]],
    `INSERT INTO "ManagerProfile" (id, "userUser_id", "managerManager_id") VALUES (gen_random_uuid()::text, $1, $2) RETURNING id`,
    [userIds["Manager"], managerId],
    `ManagerProfile for mgr_kayiira`
  );

  await upsertOne(
    client, "MedicalRepProfile",
    `SELECT id FROM "MedicalRepProfile" WHERE "userUser_id" = $1`, [userIds["MedicalRep"]],
    `INSERT INTO "MedicalRepProfile" (id, "userUser_id", "medicalRepMedical_rep_id") VALUES (gen_random_uuid()::text, $1, $2) RETURNING id`,
    [userIds["MedicalRep"], medRepId],
    `MedicalRepProfile for rep_nakato`
  );

  // ── 8. Team ───────────────────────────────────────────────────────────────
  console.log("\n── Team ──────────────────────────────────────────────");
  const teamRow = await upsertOne(
    client, "Team",
    `SELECT id FROM "Team" WHERE team_name = $1`, ["Kampala Central Team"],
    `INSERT INTO "Team" (id, team_name, date_of_creation) VALUES (gen_random_uuid()::text, $1, NOW()) RETURNING id`,
    ["Kampala Central Team"],
    "Kampala Central Team"
  );
  const teamId = teamRow?.id ?? (await client.query(`SELECT id FROM "Team" WHERE team_name = $1`, ["Kampala Central Team"])).rows[0].id;

  // Link rep to team
  await client.query(`UPDATE "User" SET team_id = $1 WHERE id = $2 AND team_id IS NULL`, [teamId, userIds["MedicalRep"]]);
  console.log("  ok    Linked rep_nakato → team");

  // ── 9. Products ───────────────────────────────────────────────────────────
  console.log("\n── Products ──────────────────────────────────────────");
  const productIds = [];
  for (const name of products) {
    const row = await upsertOne(
      client, "Product",
      `SELECT id FROM "Product" WHERE product_name = $1 AND company_id = $2`, [name, companyId],
      `INSERT INTO "Product" (id, product_name, company_id) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id`,
      [name, companyId],
      name
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "Product" WHERE product_name = $1 AND company_id = $2`, [name, companyId])).rows[0].id;
    productIds.push(id);
  }

  // ── 10. TeamProduct ───────────────────────────────────────────────────────
  console.log("\n── TeamProduct ───────────────────────────────────────");
  for (const pid of productIds) {
    await upsertOne(
      client, "TeamProduct",
      `SELECT 1 FROM "TeamProduct" WHERE team_id = $1 AND product_id = $2`, [teamId, pid],
      `INSERT INTO "TeamProduct" (team_id, product_id) VALUES ($1, $2) RETURNING team_id`,
      [teamId, pid],
      `team ↔ product ${pid.slice(0,8)}`
    );
  }

  // ── 11. Doctor Profiles (Profile model) ──────────────────────────────────
  console.log("\n── Doctor Profiles ───────────────────────────────────");
  const profileIds = [];
  for (let i = 0; i < 3; i++) {
    const row = await upsertOne(
      client, "Profile",
      `SELECT id FROM "Profile" WHERE doctor_id = $1`, [doctorIds[i]],
      `INSERT INTO "Profile" (id, doctor_id, gender, date_of_joining) VALUES (gen_random_uuid()::text, $1, $2, NOW()) RETURNING id`,
      [doctorIds[i], i % 2 === 0 ? "MALE" : "FEMALE"],
      `Profile for ${doctors[i].doctor_name}`
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "Profile" WHERE doctor_id = $1`, [doctorIds[i]])).rows[0].id;
    profileIds.push(id);
  }

  // ── 12. Stock Tracking ────────────────────────────────────────────────────
  console.log("\n── Stock Tracking ────────────────────────────────────");
  // Fixed dates for idempotency
  const stockDates = [
    "2026-03-01T08:00:00Z",
    "2026-03-03T08:00:00Z",
    "2026-03-05T08:00:00Z",
  ];
  const stockEntries = [
    { pharmacy_id: pharmacyIds[0], product_id: productIds[0], quantity: 120, date: stockDates[0] },
    { pharmacy_id: pharmacyIds[1], product_id: productIds[1], quantity: 85,  date: stockDates[1] },
    { pharmacy_id: pharmacyIds[2], product_id: productIds[2], quantity: 60,  date: stockDates[2] },
    { pharmacy_id: pharmacyIds[0], product_id: productIds[3], quantity: 45,  date: stockDates[0] },
    { pharmacy_id: pharmacyIds[3], product_id: productIds[4], quantity: 200, date: stockDates[1] },
  ];
  for (const s of stockEntries) {
    await upsertOne(
      client, "StockTracking",
      `SELECT 1 FROM "StockTracking" WHERE pharmacy_id=$1 AND product_id=$2 AND date=$3`, [s.pharmacy_id, s.product_id, s.date],
      `INSERT INTO "StockTracking" (pharmacy_id, product_id, quantity, date) VALUES ($1,$2,$3,$4) RETURNING pharmacy_id`,
      [s.pharmacy_id, s.product_id, s.quantity, s.date],
      `stock ${s.pharmacy_id.slice(0,6)} / ${s.product_id.slice(0,6)}`
    );
  }

  // ── 13. Sample Distributions ──────────────────────────────────────────────
  console.log("\n── Sample Distributions ──────────────────────────────");
  const sampleEntries = [
    { user_id: userIds["MedicalRep"], doctor_id: doctorIds[0], product_id: productIds[0], samples_given: 6, date: "2026-03-02T10:00:00Z" },
    { user_id: userIds["MedicalRep"], doctor_id: doctorIds[1], product_id: productIds[1], samples_given: 4, date: "2026-03-04T11:00:00Z" },
    { user_id: userIds["MedicalRep"], doctor_id: doctorIds[2], product_id: productIds[2], samples_given: 8, date: "2026-03-06T09:30:00Z" },
    { user_id: userIds["MedicalRep"], doctor_id: doctorIds[3], product_id: productIds[3], samples_given: 3, date: "2026-03-07T14:00:00Z" },
  ];
  for (const s of sampleEntries) {
    await upsertOne(
      client, "SampleDistribution",
      `SELECT 1 FROM "SampleDistribution" WHERE user_id=$1 AND doctor_id=$2 AND product_id=$3 AND date=$4`,
      [s.user_id, s.doctor_id, s.product_id, s.date],
      `INSERT INTO "SampleDistribution" (user_id, doctor_id, product_id, samples_given, date) VALUES ($1,$2,$3,$4,$5) RETURNING user_id`,
      [s.user_id, s.doctor_id, s.product_id, s.samples_given, s.date],
      `sample → ${doctors.find((d, i) => doctorIds[i] === s.doctor_id)?.doctor_name ?? s.doctor_id.slice(0,8)}`
    );
  }

  // ── 14. Doctor Activities ─────────────────────────────────────────────────
  // focused_product_id is UNIQUE in DB — each product can only be the focused product once
  console.log("\n── Doctor Activities ─────────────────────────────────");
  const activityEntries = [
    { user_id: userIds["MedicalRep"], doctor_id: doctorIds[0], focused_product_id: productIds[0], samples_given: 6, date: "2026-03-02T10:00:00Z", detailed: [productIds[1], productIds[2]] },
    { user_id: userIds["MedicalRep"], doctor_id: doctorIds[1], focused_product_id: productIds[3], samples_given: 4, date: "2026-03-04T11:00:00Z", detailed: [productIds[0]] },
    { user_id: userIds["MedicalRep"], doctor_id: doctorIds[2], focused_product_id: productIds[4], samples_given: 8, date: "2026-03-06T09:30:00Z", detailed: [productIds[5]] },
  ];
  const activityIds = [];
  for (const a of activityEntries) {
    // Check by focused_product_id since it's unique
    const exists = await client.query(`SELECT id FROM "DoctorActivity" WHERE focused_product_id = $1`, [a.focused_product_id]);
    if (exists.rows.length > 0) {
      console.log(`  skip  DoctorActivity (focused: ${a.focused_product_id.slice(0,8)})`);
      activityIds.push(exists.rows[0].id);
      continue;
    }
    const result = await client.query(
      `INSERT INTO "DoctorActivity" (id, user_id, doctor_id, focused_product_id, samples_given, date)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5) RETURNING id`,
      [a.user_id, a.doctor_id, a.focused_product_id, a.samples_given, a.date]
    );
    const actId = result.rows[0].id;
    activityIds.push(actId);
    console.log(`  ok    DoctorActivity visit → ${doctors.find((d, i) => doctorIds[i] === a.doctor_id)?.doctor_name ?? a.doctor_id.slice(0,8)}`);

    // Insert into _productsDetailed junction for products_detailed
    for (const pid of a.detailed) {
      const jExists = await client.query(`SELECT 1 FROM "_productsDetailed" WHERE "A"=$1 AND "B"=$2`, [actId, pid]);
      if (jExists.rows.length === 0) {
        await client.query(`INSERT INTO "_productsDetailed" ("A","B") VALUES ($1,$2)`, [actId, pid]);
      }
    }
  }

  // ── 15. Pharmacy Activities ───────────────────────────────────────────────
  console.log("\n── Pharmacy Activities ───────────────────────────────");
  const pharmacyActivities = [
    { user_id: userIds["MedicalRep"], pharmacy_id: pharmacyIds[0], stock: stockEntries[0], products_in_stock: [productIds[0], productIds[3]], date: "2026-03-01T10:30:00Z" },
    { user_id: userIds["MedicalRep"], pharmacy_id: pharmacyIds[1], stock: stockEntries[1], products_in_stock: [productIds[1]], date: "2026-03-03T10:30:00Z" },
    { user_id: userIds["MedicalRep"], pharmacy_id: pharmacyIds[2], stock: stockEntries[2], products_in_stock: [productIds[2]], date: "2026-03-05T10:30:00Z" },
  ];
  for (const pa of pharmacyActivities) {
    const exists = await client.query(
      `SELECT id FROM "PharmacyActivity" WHERE user_id=$1 AND pharmacy_id=$2 AND "stockTrackingDate"=$3`,
      [pa.user_id, pa.pharmacy_id, pa.stock.date]
    );
    if (exists.rows.length > 0) {
      console.log(`  skip  PharmacyActivity ${pa.pharmacy_id.slice(0,8)}`);
      // Link products_in_stock via junction table
      for (const pid of pa.products_in_stock) {
        const jpEx = await client.query(`SELECT 1 FROM "_PharmacyActivityToProduct" WHERE "A"=$1 AND "B"=$2`, [exists.rows[0].id, pid]);
        if (jpEx.rows.length === 0) await client.query(`INSERT INTO "_PharmacyActivityToProduct" ("A","B") VALUES ($1,$2)`, [exists.rows[0].id, pid]);
      }
      continue;
    }
    const result = await client.query(
      `INSERT INTO "PharmacyActivity" (id, user_id, pharmacy_id, date, "stockTrackingPharmacy_id", "stockTrackingProduct_id", "stockTrackingDate")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6) RETURNING id`,
      [pa.user_id, pa.pharmacy_id, pa.date, pa.stock.pharmacy_id, pa.stock.product_id, pa.stock.date]
    );
    const paId = result.rows[0].id;
    console.log(`  ok    PharmacyActivity → ${pharmacies.find((p, i) => pharmacyIds[i] === pa.pharmacy_id)?.pharmacy_name ?? pa.pharmacy_id.slice(0,8)}`);

    // Link products_in_stock via junction table
    for (const pid of pa.products_in_stock) {
      const jpEx = await client.query(`SELECT 1 FROM "_PharmacyActivityToProduct" WHERE "A"=$1 AND "B"=$2`, [paId, pid]);
      if (jpEx.rows.length === 0) await client.query(`INSERT INTO "_PharmacyActivityToProduct" ("A","B") VALUES ($1,$2)`, [paId, pid]);
    }
  }

  // ── 16. Daily Plans ───────────────────────────────────────────────────────
  console.log("\n── Daily Plans ───────────────────────────────────────");
  const dailyPlans = [
    { date: "2026-03-02T00:00:00Z", activities: "Visit Dr. James Kato at Mulago. Detail Amoxil 500mg. Distribute 6 samples." },
    { date: "2026-03-04T00:00:00Z", activities: "Visit Dr. Grace Namukasa at Nsambya. Focus on Coartem 80/480mg." },
    { date: "2026-03-06T00:00:00Z", activities: "Visit Dr. Robert Ssemwogerere at IHK. Detail Metformin 500mg." },
    { date: "2026-03-07T00:00:00Z", activities: "Visit Quality Chemist and Ntinda Pharmacy. Stock check." },
  ];
  for (const dp of dailyPlans) {
    await upsertOne(
      client, "DailyPlan",
      `SELECT 1 FROM "DailyPlan" WHERE user_id=$1 AND date=$2`, [userIds["MedicalRep"], dp.date],
      `INSERT INTO "DailyPlan" (user_id, date, activities) VALUES ($1,$2,$3) RETURNING user_id`,
      [userIds["MedicalRep"], dp.date, dp.activities],
      `DailyPlan ${dp.date.slice(0,10)}`
    );
  }

  // ── 17. Monthly Plans ─────────────────────────────────────────────────────
  console.log("\n── Monthly Plans ─────────────────────────────────────");
  await upsertOne(
    client, "MonthlyPlan",
    `SELECT id FROM "MonthlyPlan" WHERE user_id=$1 AND date=$2`, [userIds["MedicalRep"], "2026-03-01T00:00:00Z"],
    `INSERT INTO "MonthlyPlan" (id, user_id, date, activities) VALUES (gen_random_uuid()::text, $1,$2,$3) RETURNING id`,
    [userIds["MedicalRep"], "2026-03-01T00:00:00Z",
     "March targets: 80 doctor visits, 30 pharmacy calls, distribute 120 Amoxil samples, 60 Coartem samples. Focus areas: Kampala Central, Nsambya, Mengo."],
    "MonthlyPlan March 2026 (rep_nakato)"
  );

  // ── 17b. CompanyDoctor — add all seeded doctors to Novex's approved list ──
  console.log("\n── CompanyDoctor ─────────────────────────────────────");
  for (const doctorId of doctorIds) {
    await upsertOne(
      client, "CompanyDoctor",
      `SELECT 1 FROM "CompanyDoctor" WHERE company_id=$1 AND doctor_id=$2`, [companyId, doctorId],
      `INSERT INTO "CompanyDoctor" (company_id, doctor_id, added_at) VALUES ($1,$2,NOW()) RETURNING company_id`,
      [companyId, doctorId],
      `CompanyDoctor → ${doctorId.slice(0,8)}`
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  await client.end();

  console.log(`
─────────────────────────────────────────────────────
 Seed complete. Login credentials (all accounts):
   Password: ${PASSWORD}

   rep@kibagrep.dev        → MedicalRep
   supervisor@kibagrep.dev → Supervisor
   manager@kibagrep.dev    → Manager
   country@kibagrep.dev    → COUNTRY_MGR
   salesadmin@kibagrep.dev → SALES_ADMIN
   admin@kibagrep.dev      → SUPER_ADMIN
─────────────────────────────────────────────────────`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
