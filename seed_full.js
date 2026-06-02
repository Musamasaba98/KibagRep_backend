/**
 * KibagRep Full Realistic Seed — Veeram Healthcare Limited
 * Mirrors real pharma field force structure in Uganda.
 *
 * Run: node seed_full.js
 * Safe to re-run — skips existing records.
 */
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcrypt";

const { Client } = pg;
const PASSWORD = "Test1234!";

// ── Company ───────────────────────────────────────────────────────────────────

const COMPANY = {
  name: "Veeram Healthcare Limited",
  location: "Plot 7, Nakasero Road, Kampala",
  latitude: 0.3180,
  longitude: 32.5831,
};

// ── Users (5 reps + supervisor + manager + country mgr + sales admin) ─────────

const USERS = [
  // 3 Kampala reps
  { username: "rep_nakato",   firstname: "Nakato",   lastname: "Sarah",    email: "rep@kibagrep.dev",          role: "MedicalRep",  gender: "FEMALE", contact: "0700000001" },
  { username: "rep_ssali",    firstname: "Ssali",    lastname: "Ronald",   email: "rep2@kibagrep.dev",         role: "MedicalRep",  gender: "MALE",   contact: "0700000011" },
  { username: "rep_nambi",    firstname: "Nambi",    lastname: "Patricia", email: "rep3@kibagrep.dev",         role: "MedicalRep",  gender: "FEMALE", contact: "0700000012" },
  // 2 upcountry reps
  { username: "rep_okello",   firstname: "Okello",   lastname: "Denis",    email: "rep4@kibagrep.dev",         role: "MedicalRep",  gender: "MALE",   contact: "0700000013" },
  { username: "rep_tumusiime",firstname: "Tumusiime", lastname: "Grace",   email: "rep5@kibagrep.dev",         role: "MedicalRep",  gender: "FEMALE", contact: "0700000014" },
  // Leadership
  { username: "sup_mugisha",  firstname: "Mugisha",  lastname: "Brian",    email: "supervisor@kibagrep.dev",   role: "Supervisor",  gender: "MALE",   contact: "0700000002" },
  { username: "mgr_kayiira",  firstname: "Kayiira",  lastname: "Moses",    email: "manager@kibagrep.dev",      role: "Manager",     gender: "MALE",   contact: "0700000003" },
  { username: "cm_nalwanga",  firstname: "Nalwanga", lastname: "Agnes",    email: "country@kibagrep.dev",      role: "COUNTRY_MGR", gender: "FEMALE", contact: "0700000004" },
  { username: "sa_tumwine",   firstname: "Tumwine",  lastname: "Patrick",  email: "salesadmin@kibagrep.dev",   role: "SALES_ADMIN", gender: "MALE",   contact: "0700000005" },
  { username: "super_admin",  firstname: "KibagRep", lastname: "Admin",    email: "admin@kibagrep.dev",        role: "SUPER_ADMIN", gender: "MALE",   contact: "0700000006" },
];

// ── Products (GI + respiratory + multi-vitamin line) ──────────────────────────

const PRODUCTS = [
  { name: "Neutraflux 40mg",    classification: "GROWTH",    price: 12500 },
  { name: "Rabeflux 20mg",      classification: "CASH_COW",  price: 9800  },
  { name: "Aminorich Syrup",    classification: "GROWTH",    price: 18000 },
  { name: "Stednac 10mg",       classification: "NEW_LAUNCH", price: 22000 },
  { name: "Ciprolab 500mg",     classification: "CASH_COW",  price: 7500  },
  { name: "Metazone 500mg",     classification: "CASH_COW",  price: 6200  },
  { name: "Omecap 20mg",        classification: "GROWTH",    price: 8900  },
  { name: "Amoxicare 500mg",    classification: "CASH_COW",  price: 5500  },
];

// ── Territories ───────────────────────────────────────────────────────────────

const TERRITORIES = [
  { name: "Kampala Central",      type: "TOWN",      region: "Central",  description: "Nakasero, Kololo, City Centre, Nakivubo" },
  { name: "Kampala North",        type: "TOWN",      region: "Central",  description: "Mulago, Wandegeya, Kamwokya, Makerere" },
  { name: "Kampala South",        type: "TOWN",      region: "Central",  description: "Nsambya, Makindye, Ggaba, Kabalagala" },
  { name: "Eastern Uganda",       type: "UPCOUNTRY", region: "Eastern",  description: "Mbale, Jinja, Tororo, Busia, Iganga" },
  { name: "Western Uganda",       type: "UPCOUNTRY", region: "Western",  description: "Mbarara, Fort Portal, Kasese, Kabale" },
  { name: "Central Block",        type: "UPCOUNTRY", region: "Central",  description: "Mubende, Luwero, Masaka, Kayunga, Mityana" },
];

// ── Facilities (GPS-accurate Uganda locations) ────────────────────────────────

const FACILITIES = [
  { name: "Mulago National Referral Hospital",   location: "Mulago Hill, Kampala",         latitude:  0.3376, longitude: 32.5772 },
  { name: "Nsambya Hospital",                    location: "Nsambya, Kampala",             latitude:  0.3042, longitude: 32.5838 },
  { name: "International Hospital Kampala",      location: "Namuwongo, Kampala",           latitude:  0.3120, longitude: 32.6021 },
  { name: "Mengo Hospital",                      location: "Mengo Hill, Kampala",          latitude:  0.3049, longitude: 32.5614 },
  { name: "Nakasero Hospital",                   location: "Nakasero, Kampala",            latitude:  0.3213, longitude: 32.5863 },
  { name: "Case Medical Centre",                 location: "Nakasero, Kampala",            latitude:  0.3195, longitude: 32.5841 },
  { name: "Kibuli Muslim Hospital",              location: "Kibuli, Kampala",              latitude:  0.3033, longitude: 32.5927 },
  { name: "Jinja Regional Referral Hospital",    location: "Jinja",                        latitude:  0.4478, longitude: 33.2027 },
  { name: "Mbale Regional Referral Hospital",    location: "Mbale",                        latitude:  1.0734, longitude: 34.1772 },
  { name: "Mbarara University Teaching Hospital",location: "Mbarara",                      latitude: -0.6061, longitude: 30.6580 },
  { name: "Fort Portal Regional Referral Hospital",location: "Fort Portal",               latitude:  0.6710, longitude: 30.2745 },
  { name: "Lacor Hospital",                      location: "Gulu",                         latitude:  2.7891, longitude: 32.2913 },
  { name: "Masaka Regional Referral Hospital",   location: "Masaka",                       latitude: -0.3376, longitude: 31.7383 },
  { name: "Lira Regional Referral Hospital",     location: "Lira",                         latitude:  2.2499, longitude: 32.8997 },
];

// ── Doctors (35 Uganda HCPs) ──────────────────────────────────────────────────

const DOCTORS = [
  // Kampala Central
  { name: "Dr. James Kato",           speciality: ["Internal Medicine","General Practice"],    location: "Mulago National Referral Hospital",       town: "Kampala" },
  { name: "Dr. Grace Namukasa",       speciality: ["Obstetrics & Gynaecology"],                location: "Nsambya Hospital",                        town: "Kampala" },
  { name: "Dr. Robert Ssemwogerere", speciality: ["Cardiology","Internal Medicine"],           location: "International Hospital Kampala",          town: "Kampala" },
  { name: "Dr. Prossy Namutebi",      speciality: ["Paediatrics"],                             location: "Mengo Hospital",                          town: "Kampala" },
  { name: "Dr. Ibrahim Ssekandi",     speciality: ["Neurology"],                               location: "Case Medical Centre",                     town: "Kampala" },
  { name: "Dr. Lydia Atuhaire",       speciality: ["Oncology","Internal Medicine"],            location: "Nakasero Hospital",                       town: "Kampala" },
  { name: "Dr. Peter Byamugisha",     speciality: ["Gastroenterology","Internal Medicine"],    location: "International Hospital Kampala",          town: "Kampala" },
  { name: "Dr. Annet Nalwadda",       speciality: ["General Practice"],                        location: "Kibuli Muslim Hospital",                  town: "Kampala" },
  { name: "Dr. David Ssentongo",      speciality: ["Surgery","Urology"],                       location: "Mulago National Referral Hospital",       town: "Kampala" },
  { name: "Dr. Josephine Nakalembe", speciality: ["Dermatology","General Practice"],           location: "Nakasero Hospital",                       town: "Kampala" },
  // Kampala North (Mulago zone)
  { name: "Dr. Moses Kaggwa",         speciality: ["Pulmonology","Internal Medicine"],         location: "Mulago National Referral Hospital",       town: "Kampala" },
  { name: "Dr. Florence Nabirye",     speciality: ["Endocrinology","Internal Medicine"],       location: "Mengo Hospital",                          town: "Kampala" },
  { name: "Dr. Samuel Wasswa",        speciality: ["Ophthalmology"],                           location: "Mulago National Referral Hospital",       town: "Kampala" },
  // Kampala South (Nsambya/Makindye)
  { name: "Dr. Harriet Nakazibwe",    speciality: ["Psychiatry"],                              location: "Nsambya Hospital",                        town: "Kampala" },
  { name: "Dr. Charles Muwanguzi",    speciality: ["Orthopaedics","Surgery"],                  location: "Nsambya Hospital",                        town: "Kampala" },
  { name: "Dr. Rebecca Nalubega",     speciality: ["Paediatrics","Neonatology"],               location: "Nsambya Hospital",                        town: "Kampala" },
  // Jinja
  { name: "Dr. Fatuma Nakigozi",      speciality: ["Dermatology","General Practice"],          location: "Jinja Regional Referral Hospital",        town: "Jinja"   },
  { name: "Dr. Alex Ogwang",          speciality: ["Internal Medicine","General Practice"],    location: "Jinja Regional Referral Hospital",        town: "Jinja"   },
  { name: "Dr. Sarah Nabiryo",        speciality: ["Obstetrics & Gynaecology"],                location: "Jinja Regional Referral Hospital",        town: "Jinja"   },
  // Mbale
  { name: "Dr. Brian Wamukota",       speciality: ["General Surgery"],                         location: "Mbale Regional Referral Hospital",        town: "Mbale"   },
  { name: "Dr. Stella Nansubuga",     speciality: ["Internal Medicine"],                       location: "Mbale Regional Referral Hospital",        town: "Mbale"   },
  { name: "Dr. Emmanuel Chebet",      speciality: ["Paediatrics","General Practice"],          location: "Mbale Regional Referral Hospital",        town: "Mbale"   },
  // Mbarara
  { name: "Dr. Agnes Tumwesigye",     speciality: ["Endocrinology","Internal Medicine"],       location: "Mbarara University Teaching Hospital",    town: "Mbarara" },
  { name: "Dr. Francis Katushabe",    speciality: ["Cardiology","Internal Medicine"],          location: "Mbarara University Teaching Hospital",    town: "Mbarara" },
  { name: "Dr. Immaculate Agaba",     speciality: ["Gastroenterology"],                        location: "Mbarara University Teaching Hospital",    town: "Mbarara" },
  // Fort Portal
  { name: "Dr. Moses Mwesigwa",       speciality: ["Orthopaedics"],                            location: "Fort Portal Regional Referral Hospital",  town: "Fort Portal" },
  { name: "Dr. Juliet Kabasinguzi",   speciality: ["Obstetrics & Gynaecology"],                location: "Fort Portal Regional Referral Hospital",  town: "Fort Portal" },
  // Gulu
  { name: "Dr. Denis Ochieng",        speciality: ["General Surgery"],                         location: "Lacor Hospital",                          town: "Gulu"    },
  { name: "Dr. Christine Auma",       speciality: ["General Practice"],                        location: "Lacor Hospital",                          town: "Gulu"    },
  { name: "Dr. Patrick Olweny",       speciality: ["Internal Medicine","HIV/AIDS"],            location: "Lira Regional Referral Hospital",         town: "Lira"    },
  // Masaka
  { name: "Dr. Beatrice Namyalo",     speciality: ["Paediatrics","General Practice"],          location: "Masaka Regional Referral Hospital",       town: "Masaka"  },
  { name: "Dr. Joseph Nkurunungi",    speciality: ["Internal Medicine"],                       location: "Masaka Regional Referral Hospital",       town: "Masaka"  },
  // Mixed / private
  { name: "Dr. Sylvia Nakato",        speciality: ["General Practice","Family Medicine"],      location: "Nakasero Hospital",                       town: "Kampala" },
  { name: "Dr. Paul Kiggundu",        speciality: ["Gastroenterology","Internal Medicine"],    location: "International Hospital Kampala",          town: "Kampala" },
  { name: "Dr. Irene Nakabuye",       speciality: ["Nephrology","Internal Medicine"],          location: "Mulago National Referral Hospital",       town: "Kampala" },
];

// ── Pharmacies (15 across Uganda) ─────────────────────────────────────────────

const PHARMACIES = [
  { name: "Quality Chemist",          location: "Kampala Road, Kampala",         town: "Kampala",    latitude:  0.3155, longitude: 32.5804 },
  { name: "Ntinda Pharmacy",          location: "Ntinda, Kampala",               town: "Kampala",    latitude:  0.3478, longitude: 32.6132 },
  { name: "City Pharmacy",            location: "Ben Kiwanuka St, Kampala",      town: "Kampala",    latitude:  0.3133, longitude: 32.5762 },
  { name: "Kisementi Chemist",        location: "Kisementi, Kampala",            town: "Kampala",    latitude:  0.3241, longitude: 32.5919 },
  { name: "Nateete Drug Shop",        location: "Nateete, Kampala",              town: "Kampala",    latitude:  0.2985, longitude: 32.5412 },
  { name: "Wandegeya Pharmacy",       location: "Wandegeya, Kampala",            town: "Kampala",    latitude:  0.3398, longitude: 32.5683 },
  { name: "Garden City Pharmacy",     location: "Garden City Mall, Kampala",     town: "Kampala",    latitude:  0.3252, longitude: 32.5879 },
  { name: "Jinja Road Chemist",       location: "Jinja Road, Kampala",           town: "Kampala",    latitude:  0.3210, longitude: 32.6034 },
  { name: "Gulu Health Pharmacy",     location: "Gulu Town",                     town: "Gulu",       latitude:  2.7744, longitude: 32.3041 },
  { name: "Mbarara Chemist",          location: "Mbarara Town",                  town: "Mbarara",    latitude: -0.6074, longitude: 30.6537 },
  { name: "Jinja Pharmacy",           location: "Main Street, Jinja",            town: "Jinja",      latitude:  0.4477, longitude: 33.1999 },
  { name: "Mbale Dispensary",         location: "Republic Street, Mbale",        town: "Mbale",      latitude:  1.0784, longitude: 34.1750 },
  { name: "Fort Portal Chemist",      location: "Fort Portal Town",              town: "Fort Portal",latitude:  0.6726, longitude: 30.2751 },
  { name: "Masaka Pharmacy",          location: "Masaka Town",                   town: "Masaka",     latitude: -0.3367, longitude: 31.7330 },
  { name: "Nakivubo Drug Store",      location: "Nakivubo Place, Kampala",       town: "Kampala",    latitude:  0.3109, longitude: 32.5801 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertOne(client, table, checkSql, checkParams, insertSql, insertParams, label) {
  const exists = await client.query(checkSql, checkParams);
  if (exists.rows.length > 0) {
    process.stdout.write(`  skip  ${label}\n`);
    return exists.rows[0];
  }
  const result = await client.query(insertSql, insertParams);
  process.stdout.write(`  ok    ${label}\n`);
  return result.rows[0];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const hashed = await bcrypt.hash(PASSWORD, 10);

  // ── 1. Users ─────────────────────────────────────────────────────────────
  console.log("\n── Users ─────────────────────────────────────────────");
  const userMap = {};
  for (const u of USERS) {
    const row = await upsertOne(
      client, "User",
      `SELECT id FROM "User" WHERE email = $1`, [u.email],
      `INSERT INTO "User" (id, username, firstname, lastname, email, role, gender, contact, password, date_of_joining)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
      [u.username, u.firstname, u.lastname, u.email, u.role, u.gender, u.contact, hashed],
      `${u.role} — ${u.email}`
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "User" WHERE email=$1`, [u.email])).rows[0].id;
    userMap[u.email] = id;
  }

  // ── 2. Company ───────────────────────────────────────────────────────────
  console.log("\n── Company ───────────────────────────────────────────");
  const coRow = await upsertOne(
    client, "Company",
    `SELECT id FROM "Company" WHERE company_name=$1`, [COMPANY.name],
    `INSERT INTO "Company" (id,company_name,location,latitude,longitude,date_of_joining)
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,NOW()) RETURNING id`,
    [COMPANY.name, COMPANY.location, COMPANY.latitude, COMPANY.longitude],
    COMPANY.name
  );
  const companyId = coRow?.id ?? (await client.query(`SELECT id FROM "Company" WHERE company_name=$1`, [COMPANY.name])).rows[0].id;

  // Link all non-super-admin users to the company
  await client.query(
    `UPDATE "User" SET company_id=$1 WHERE email=ANY($2) AND company_id IS NULL`,
    [companyId, USERS.filter(u => u.role !== "SUPER_ADMIN").map(u => u.email)]
  );
  console.log("  ok    Linked users → Veeram Healthcare Limited");

  // ── 3. Facilities ────────────────────────────────────────────────────────
  console.log("\n── Facilities ────────────────────────────────────────");
  for (const f of FACILITIES) {
    await upsertOne(
      client, "Facility",
      `SELECT id FROM "Facility" WHERE name=$1`, [f.name],
      `INSERT INTO "Facility" (id,name,location,latitude,longitude) VALUES (gen_random_uuid()::text,$1,$2,$3,$4) RETURNING id`,
      [f.name, f.location, f.latitude, f.longitude],
      f.name
    );
  }

  // ── 4. Territories ───────────────────────────────────────────────────────
  console.log("\n── Territories ───────────────────────────────────────");
  const terrMap = {};
  for (const t of TERRITORIES) {
    const row = await upsertOne(
      client, "Territory",
      `SELECT id FROM "Territory" WHERE name=$1 AND company_id=$2`, [t.name, companyId],
      `INSERT INTO "Territory" (id,name,territory_type,region,company_id) VALUES (gen_random_uuid()::text,$1,$2,$3,$4) RETURNING id`,
      [t.name, t.type, t.region, companyId],
      `${t.name} (${t.type})`
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "Territory" WHERE name=$1 AND company_id=$2`, [t.name, companyId])).rows[0].id;
    terrMap[t.name] = id;
  }

  // ── 5. Assign territories to reps ────────────────────────────────────────
  console.log("\n── Territory assignments ─────────────────────────────");
  const repTerritories = [
    // 3 Kampala reps: primary town + secondary Central Block (upcountry week)
    { email: "rep@kibagrep.dev",  primary: "Kampala Central",  secondary: "Central Block" },
    { email: "rep2@kibagrep.dev", primary: "Kampala North",    secondary: "Central Block" },
    { email: "rep3@kibagrep.dev", primary: "Kampala South",    secondary: null            },
    // 2 upcountry reps: no secondary
    { email: "rep4@kibagrep.dev", primary: "Eastern Uganda",   secondary: null            },
    { email: "rep5@kibagrep.dev", primary: "Western Uganda",   secondary: null            },
  ];
  for (const { email, primary, secondary } of repTerritories) {
    const uid = userMap[email];
    const pid = terrMap[primary];
    const sid = secondary ? terrMap[secondary] : null;
    await client.query(
      `UPDATE "User" SET territory_id=$1, secondary_territory_id=$2 WHERE id=$3 AND territory_id IS NULL`,
      [pid, sid, uid]
    );
    console.log(`  ok    ${email} → ${primary}${secondary ? " + " + secondary : ""}`);
  }

  // ── 6. Team C ────────────────────────────────────────────────────────────
  console.log("\n── Team C ────────────────────────────────────────────");
  const teamRow = await upsertOne(
    client, "Team",
    `SELECT id FROM "Team" WHERE team_name=$1 AND company_id=$2`, ["Team C", companyId],
    `INSERT INTO "Team" (id,team_name,company_id,date_of_creation) VALUES (gen_random_uuid()::text,$1,$2,NOW()) RETURNING id`,
    ["Team C", companyId],
    "Team C"
  );
  const teamId = teamRow?.id ?? (await client.query(`SELECT id FROM "Team" WHERE team_name=$1 AND company_id=$2`, ["Team C", companyId])).rows[0].id;

  // Assign all 5 reps + supervisor to Team C
  const teamMembers = USERS.filter(u => u.role === "MedicalRep" || u.role === "Supervisor");
  for (const u of teamMembers) {
    const uid = userMap[u.email];
    await client.query(`UPDATE "User" SET team_id=$1 WHERE id=$2 AND team_id IS NULL`, [teamId, uid]);
  }
  console.log(`  ok    Assigned ${teamMembers.length} members to Team C`);

  // Set Mugisha as team supervisor
  await client.query(`UPDATE "Team" SET supervisor_id=$1 WHERE id=$2 AND supervisor_id IS NULL`, [userMap["supervisor@kibagrep.dev"], teamId]);
  console.log("  ok    Mugisha Brian → Team C lead");

  // ── 7. Products ──────────────────────────────────────────────────────────
  console.log("\n── Products ──────────────────────────────────────────");
  const productIds = [];
  for (const p of PRODUCTS) {
    const row = await upsertOne(
      client, "Product",
      `SELECT id FROM "Product" WHERE product_name=$1 AND company_id=$2`, [p.name, companyId],
      `INSERT INTO "Product" (id,product_name,classification,unit_price,company_id) VALUES (gen_random_uuid()::text,$1,$2,$3,$4) RETURNING id`,
      [p.name, p.classification, p.price, companyId],
      p.name
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "Product" WHERE product_name=$1 AND company_id=$2`, [p.name, companyId])).rows[0].id;
    productIds.push(id);
  }

  // ── 8. TeamProduct (all products → Team C) ───────────────────────────────
  console.log("\n── TeamProduct ───────────────────────────────────────");
  for (const pid of productIds) {
    await upsertOne(
      client, "TeamProduct",
      `SELECT 1 FROM "TeamProduct" WHERE team_id=$1 AND product_id=$2`, [teamId, pid],
      `INSERT INTO "TeamProduct" (team_id,product_id) VALUES ($1,$2) RETURNING team_id`,
      [teamId, pid],
      `Team C ↔ ${pid.slice(0,8)}`
    );
  }

  // ── 9. Doctors ───────────────────────────────────────────────────────────
  console.log("\n── Doctors ───────────────────────────────────────────");
  const doctorIds = [];
  for (const d of DOCTORS) {
    const row = await upsertOne(
      client, "Doctor",
      `SELECT id FROM "Doctor" WHERE doctor_name=$1 AND town=$2`, [d.name, d.town],
      `INSERT INTO "Doctor" (id,doctor_name,speciality,location,town,date_of_joining)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,NOW()) RETURNING id`,
      [d.name, d.speciality, d.location, d.town],
      `${d.name} (${d.town})`
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "Doctor" WHERE doctor_name=$1 AND town=$2`, [d.name, d.town])).rows[0].id;
    doctorIds.push(id);
  }

  // ── 10. CompanyDoctor (add all to Veeram) ────────────────────────────────
  console.log("\n── CompanyDoctor ─────────────────────────────────────");
  for (const did of doctorIds) {
    await upsertOne(
      client, "CompanyDoctor",
      `SELECT 1 FROM "CompanyDoctor" WHERE company_id=$1 AND doctor_id=$2`, [companyId, did],
      `INSERT INTO "CompanyDoctor" (company_id,doctor_id,added_at) VALUES ($1,$2,NOW()) RETURNING company_id`,
      [companyId, did],
      `Veeram ↔ ${did.slice(0,8)}`
    );
  }

  // ── 11. Pharmacies ───────────────────────────────────────────────────────
  console.log("\n── Pharmacies ────────────────────────────────────────");
  const pharmacyIds = [];
  for (const p of PHARMACIES) {
    const row = await upsertOne(
      client, "Pharmacy",
      `SELECT id FROM "Pharmacy" WHERE pharmacy_name=$1`, [p.name],
      `INSERT INTO "Pharmacy" (id,pharmacy_name,location,town,latitude,longitude)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5) RETURNING id`,
      [p.name, p.location, p.town, p.latitude, p.longitude],
      p.name
    );
    const id = row?.id ?? (await client.query(`SELECT id FROM "Pharmacy" WHERE pharmacy_name=$1`, [p.name])).rows[0].id;
    pharmacyIds.push(id);
  }

  // ── 12. Sample Balances (each rep gets initial stock) ────────────────────
  console.log("\n── Sample Balances ───────────────────────────────────");
  const repEmails = USERS.filter(u => u.role === "MedicalRep").map(u => u.email);
  for (const email of repEmails) {
    const uid = userMap[email];
    for (let i = 0; i < 4; i++) {
      const pid = productIds[i];
      await upsertOne(
        client, "SampleBalance",
        `SELECT id FROM "SampleBalance" WHERE user_id=$1 AND product_id=$2`, [uid, pid],
        `INSERT INTO "SampleBalance" (id,user_id,product_id,issued,given,updated_at)
         VALUES (gen_random_uuid()::text,$1,$2,120,0,NOW()) RETURNING id`,
        [uid, pid],
        `SampleBalance ${email.split("@")[0]} / ${PRODUCTS[i].name}`
      );
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  await client.end();

  console.log(`
────────────────────────────────────────────────────────────
  Seed complete — Veeram Healthcare Limited

  Password for all accounts: ${PASSWORD}

  Role            Email
  ─────────────── ─────────────────────────────
  Medical Rep     rep@kibagrep.dev
  Medical Rep     rep2@kibagrep.dev
  Medical Rep     rep3@kibagrep.dev
  Medical Rep     rep4@kibagrep.dev  (Eastern)
  Medical Rep     rep5@kibagrep.dev  (Western)
  Supervisor      supervisor@kibagrep.dev
  Manager         manager@kibagrep.dev
  Country Manager country@kibagrep.dev
  Sales Admin     salesadmin@kibagrep.dev
  Super Admin     admin@kibagrep.dev

  ${DOCTORS.length} doctors · ${PHARMACIES.length} pharmacies · ${PRODUCTS.length} products
  ${TERRITORIES.length} territories · 1 team (Team C)
────────────────────────────────────────────────────────────`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
