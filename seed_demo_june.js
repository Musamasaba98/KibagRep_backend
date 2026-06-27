/**
 * KibagRep Demo Seed — June 2026
 * Seeds a full month of realistic demo data for Novex Pharma Uganda Ltd.
 * Tailored for a live demo on June 27, 2026.
 *
 * Run against online DB:
 *   DATABASE_URL="<render-url>" node seed_demo_june.js
 *
 * Safe to re-run — skips existing records.
 * Requires seed.js to have been run first (company, users, doctors must exist).
 */
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcrypt";

const { Client } = pg;
const PASSWORD = "Test1234!";
const MONTH = 6, YEAR = 2026;

// June 2026: June 1 is Sunday → working days Mon–Fri
const WORKING_DAYS   = [2,3,4,5,6, 9,10,11,12,13, 16,17,18,19,20, 23,24,25,26,27];
const APPROVED_DAYS  = WORKING_DAYS.filter(d => d <= 20);   // 2–20 (15 days)
const PENDING_DAYS   = [23, 24, 25, 26];                    // in approval queue
const TODAY          = 27;

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pad(n) { return String(n).padStart(2, "0"); }
function juneDate(day, time = "00:00:00") {
  return `2026-06-${pad(day)}T${time}Z`;
}

async function exists(client, sql, params) {
  const res = await client.query(sql, params);
  return res.rows.length > 0 ? res.rows[0] : null;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("✓ Connected to DB\n");

  // ── Fetch base records ────────────────────────────────────────────────────
  const company = await client.query(
    `SELECT id FROM "Company" WHERE company_name = $1`, ["Novex Pharma Uganda Ltd"]
  );
  if (!company.rows[0]) {
    console.error("ERROR: Company not found. Run seed.js first.");
    await client.end(); process.exit(1);
  }
  const companyId = company.rows[0].id;

  const fetchUser = async (email) =>
    (await client.query(`SELECT id FROM "User" WHERE email = $1`, [email])).rows[0]?.id;

  let rep1Id  = await fetchUser("rep@kibagrep.dev");
  const supId = await fetchUser("supervisor@kibagrep.dev");
  const mgrId = await fetchUser("manager@kibagrep.dev");

  if (!rep1Id) {
    console.error("ERROR: rep@kibagrep.dev not found. Run seed.js first.");
    await client.end(); process.exit(1);
  }

  // ── Doctors, products, pharmacies — use only the 12 seeded demo doctors ──
  // We query by exact name+town to avoid pulling from the large master HCP list
  const SEED_DOCTORS = [
    { name: "Dr. James Kato",          town: "Kampala" },
    { name: "Dr. Grace Namukasa",       town: "Kampala" },
    { name: "Dr. Robert Ssemwogerere", town: "Kampala" },
    { name: "Dr. Prossy Namutebi",     town: "Kampala" },
    { name: "Dr. Ibrahim Ssekandi",    town: "Kampala" },
    { name: "Dr. Lydia Atuhaire",      town: "Kampala" },
    { name: "Dr. Denis Ochieng",       town: "Gulu"    },
    { name: "Dr. Fatuma Nakigozi",     town: "Jinja"   },
    { name: "Dr. Samuel Byaruhanga",   town: "Mbarara" },
    { name: "Dr. Agnes Tumwesigye",    town: "Mbarara" },
    { name: "Dr. Moses Mwesigwa",      town: "Fort Portal" },
    { name: "Dr. Christine Auma",      town: "Gulu"    },
  ];
  const allDoctors = [];
  for (const d of SEED_DOCTORS) {
    const row = await exists(client,
      `SELECT id, doctor_name, town FROM "Doctor" WHERE doctor_name = $1 AND town = $2`,
      [d.name, d.town]
    );
    if (row) allDoctors.push(row);
    else console.log(`  warn  Doctor not found: ${d.name} (${d.town})`);
  }

  const { rows: allProducts }  = await client.query(`SELECT id, product_name FROM "Product" WHERE company_id = $1`, [companyId]);
  // Use only the 7 known seed pharmacies
  const SEED_PHARMACIES = ["Quality Chemist","Ntinda Pharmacy","City Pharmacy","Kisementi Chemist","Nateete Drug Shop","Gulu Health Pharmacy","Mbarara Chemist"];
  const allPharmacies = [];
  for (const name of SEED_PHARMACIES) {
    const row = await exists(client, `SELECT id, pharmacy_name FROM "Pharmacy" WHERE pharmacy_name = $1`, [name]);
    if (row) allPharmacies.push(row);
  }

  const kampala  = allDoctors.filter(d => d.town === "Kampala");
  const products = allProducts;
  const pharmacies = allPharmacies;

  console.log(`Demo doctors: ${allDoctors.length} (${kampala.length} Kampala)  |  Products: ${products.length}  |  Pharmacies: ${pharmacies.length}\n`);

  // ── 1. Add second rep (Ronald Kiiza) ──────────────────────────────────────
  console.log("── Users ─────────────────────────────────────────────");
  const hashed = await bcrypt.hash(PASSWORD, 10);

  const repsToAdd = [
    { username: "rep_kiiza",   firstname: "Kiiza",   lastname: "Ronald", email: "rep2@kibagrep.dev", contact: "0700000007", gender: "MALE" },
    { username: "rep_nabirye", firstname: "Nabirye", lastname: "Diana",  email: "rep3@kibagrep.dev", contact: "0700000008", gender: "FEMALE" },
  ];

  const rep2Id = await (async () => {
    let row = await exists(client, `SELECT id FROM "User" WHERE email = $1`, ["rep2@kibagrep.dev"]);
    if (row) { console.log("  skip  rep2@kibagrep.dev"); return row.id; }
    const u = repsToAdd[0];
    const res = await client.query(
      `INSERT INTO "User" (id, username, firstname, lastname, email, role, gender, contact, password, company_id, date_of_joining)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,'MedicalRep',$5,$6,$7,$8,NOW()) RETURNING id`,
      [u.username, u.firstname, u.lastname, u.email, u.gender, u.contact, hashed, companyId]
    );
    const newId = res.rows[0].id;
    const medRep = await client.query(
      `INSERT INTO "MedicalRep" (id, medical_rep_name, date_of_joining) VALUES (gen_random_uuid()::text,$1,NOW()) RETURNING id`,
      [`${u.lastname} ${u.firstname}`]
    );
    await client.query(
      `INSERT INTO "MedicalRepProfile" (id, "userUser_id", "medicalRepMedical_rep_id") VALUES (gen_random_uuid()::text,$1,$2)`,
      [newId, medRep.rows[0].id]
    );
    console.log("  ok    rep2@kibagrep.dev (Kiiza Ronald)");
    return newId;
  })();

  const rep3Id = await (async () => {
    let row = await exists(client, `SELECT id FROM "User" WHERE email = $1`, ["rep3@kibagrep.dev"]);
    if (row) { console.log("  skip  rep3@kibagrep.dev"); return row.id; }
    const u = repsToAdd[1];
    const res = await client.query(
      `INSERT INTO "User" (id, username, firstname, lastname, email, role, gender, contact, password, company_id, date_of_joining)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,'MedicalRep',$5,$6,$7,$8,NOW()) RETURNING id`,
      [u.username, u.firstname, u.lastname, u.email, u.gender, u.contact, hashed, companyId]
    );
    const newId = res.rows[0].id;
    const medRep = await client.query(
      `INSERT INTO "MedicalRep" (id, medical_rep_name, date_of_joining) VALUES (gen_random_uuid()::text,$1,NOW()) RETURNING id`,
      [`${u.lastname} ${u.firstname}`]
    );
    await client.query(
      `INSERT INTO "MedicalRepProfile" (id, "userUser_id", "medicalRepMedical_rep_id") VALUES (gen_random_uuid()::text,$1,$2)`,
      [newId, medRep.rows[0].id]
    );
    console.log("  ok    rep3@kibagrep.dev (Nabirye Diana)");
    return newId;
  })();

  const repNames = {
    [rep1Id]: "Sarah Nakato",
    [rep2Id]: "Ronald Kiiza",
    [rep3Id]: "Diana Nabirye",
  };

  // ── 2. Ensure team linked to company, link all reps ───────────────────────
  console.log("\n── Team ──────────────────────────────────────────────");
  let teamRow = await client.query(`SELECT id FROM "Team" WHERE team_name = $1`, ["Kampala Central Team"]);
  let teamId = teamRow.rows[0]?.id;
  if (!teamId) {
    const t = await client.query(
      `INSERT INTO "Team" (id, team_name, company_id, date_of_creation) VALUES (gen_random_uuid()::text,$1,$2,NOW()) RETURNING id`,
      ["Kampala Central Team", companyId]
    );
    teamId = t.rows[0].id;
    console.log("  ok    Created Kampala Central Team");
  } else {
    await client.query(`UPDATE "Team" SET company_id = $1 WHERE id = $2`, [companyId, teamId]);
    console.log("  ok    Team linked to company");
  }
  for (const rid of [rep1Id, rep2Id, rep3Id]) {
    await client.query(`UPDATE "User" SET team_id = $1 WHERE id = $2`, [teamId, rid]);
  }
  console.log(`  ok    3 reps → Kampala Central Team`);

  // ── 3. Ensure all 12 demo doctors on company list (batch, fast) ──────────
  console.log("\n── Company Doctor List ───────────────────────────────");
  if (allDoctors.length > 0) {
    const vals = allDoctors.map((d, i) => `($1, $${i+2}, NOW())`).join(", ");
    const params = [companyId, ...allDoctors.map(d => d.id)];
    const res = await client.query(
      `INSERT INTO "CompanyDoctor" (company_id, doctor_id, added_at) VALUES ${vals}
       ON CONFLICT (company_id, doctor_id) DO NOTHING`,
      params
    );
    console.log(`  ok    ${res.rowCount} new, ${allDoctors.length - res.rowCount} already existed`);
  }

  // ── 4. Doctor Company Tiers (batch) ───────────────────────────────────────
  console.log("\n── Doctor Tiers ──────────────────────────────────────");
  if (kampala.length > 0) {
    const tierAssign = kampala.map((doc, i) => ({ doc, tier: i < 2 ? "A" : i < 4 ? "B" : "C" }));
    const vals = tierAssign.map((_, i) => `($${i*3+1}, $${i*3+2}, $${i*3+3}, NOW())`).join(", ");
    const params = tierAssign.flatMap(({ doc, tier }) => [doc.id, companyId, tier]);
    const res = await client.query(
      `INSERT INTO "DoctorCompanyTier" (doctor_id, company_id, tier, classified_at) VALUES ${vals}
       ON CONFLICT (doctor_id, company_id) DO NOTHING`, params
    );
    console.log(`  ok    ${res.rowCount} tiers set (${kampala.length} Kampala docs)`);
  }

  // ── 5. June Call Cycles ────────────────────────────────────────────────────
  console.log("\n── Call Cycles June 2026 ─────────────────────────────");

  const cycleSpecs = [
    { userId: rep1Id, status: "LOCKED",    approvedAt: juneDate(1,"09:00:00"), lockedAt: juneDate(1,"09:00:00") },
    { userId: rep2Id, status: "SUBMITTED", approvedAt: null,                    lockedAt: null },
    { userId: rep3Id, status: "APPROVED",  approvedAt: juneDate(1,"09:30:00"), lockedAt: null },
  ];

  const cycleIds = {};
  for (const spec of cycleSpecs) {
    let row = await exists(client,
      `SELECT id FROM "CallCycle" WHERE user_id=$1 AND month=$2 AND year=$3`,
      [spec.userId, MONTH, YEAR]
    );
    if (row) {
      cycleIds[spec.userId] = row.id;
      console.log(`  skip  ${repNames[spec.userId]}`);
      continue;
    }
    const res = await client.query(
      `INSERT INTO "CallCycle" (id, user_id, month, year, status, approved_at, locked_at, created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,'2026-05-28T08:00:00Z') RETURNING id`,
      [spec.userId, MONTH, YEAR, spec.status, spec.approvedAt, spec.lockedAt]
    );
    cycleIds[spec.userId] = res.rows[0].id;
    console.log(`  ok    ${repNames[spec.userId]} → ${spec.status}`);
  }

  // Add cycle items: Sarah=6 kampala docs, Ronald=5, Diana=4
  const repDocLists = {
    [rep1Id]: kampala.slice(0, Math.min(6, kampala.length)),
    [rep2Id]: kampala.slice(0, Math.min(5, kampala.length)),
    [rep3Id]: kampala.slice(0, Math.min(4, kampala.length)),
  };
  const tierByIdx = ["A","A","B","B","C","C"];
  const freqByTier = { A:4, B:2, C:1 };

  for (const [userId, docList] of Object.entries(repDocLists)) {
    const cycleId = cycleIds[userId];
    if (!cycleId) continue;
    for (let i = 0; i < docList.length; i++) {
      const doc = docList[i];
      const tier = tierByIdx[i] ?? "C";
      const freq = freqByTier[tier];
      const ex = await exists(client,
        `SELECT id FROM "CallCycleItem" WHERE cycle_id=$1 AND doctor_id=$2`, [cycleId, doc.id]
      );
      if (!ex) {
        const vcRes = await client.query(
          `SELECT COUNT(*) FROM "DoctorActivity"
           WHERE user_id=$1 AND doctor_id=$2 AND date >= '2026-06-01' AND date < '2026-07-01'`,
          [userId, doc.id]
        );
        const done = Math.min(parseInt(vcRes.rows[0].count), freq);
        await client.query(
          `INSERT INTO "CallCycleItem" (id, cycle_id, doctor_id, tier, frequency, visits_done)
           VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5)`,
          [cycleId, doc.id, tier, freq, done]
        );
      }
    }
    console.log(`  ok    items: ${repNames[userId]} (${docList.length} doctors)`);
  }

  // ── 6. June Tour Plans ─────────────────────────────────────────────────────
  console.log("\n── Tour Plans June 2026 ──────────────────────────────");

  const planSpecs = [
    { userId: rep1Id, status: "APPROVED",  reviewedAt: juneDate(1,"08:00:00") },
    { userId: rep2Id, status: "SUBMITTED", reviewedAt: null },
    { userId: rep3Id, status: "APPROVED",  reviewedAt: juneDate(1,"09:00:00") },
  ];

  const planIds = {};
  for (const spec of planSpecs) {
    let row = await exists(client,
      `SELECT id FROM "TourPlan" WHERE user_id=$1 AND month=$2 AND year=$3`,
      [spec.userId, MONTH, YEAR]
    );
    if (row) {
      planIds[spec.userId] = row.id;
      await client.query(`UPDATE "TourPlan" SET status=$1 WHERE id=$2`, [spec.status, row.id]);
      console.log(`  upd   ${repNames[spec.userId]} → ${spec.status}`);
      continue;
    }
    const res = await client.query(
      `INSERT INTO "TourPlan" (id, user_id, month, year, status, reviewed_at, created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,'2026-05-30T10:00:00Z') RETURNING id`,
      [spec.userId, MONTH, YEAR, spec.status, spec.reviewedAt]
    );
    planIds[spec.userId] = res.rows[0].id;
    console.log(`  ok    ${repNames[spec.userId]} → ${spec.status}`);
  }

  // Tour plan days for Sarah
  const sarahPlanId = planIds[rep1Id];
  const morningAreas = [
    "Mulago National Referral, Nsambya Hospital",
    "IHK, Case Medical Centre, Kibuli Hospital",
    "Mengo Hospital, Mulago MOPD, Uganda Cancer Institute",
    "Mulago Casualty, Wandegeya HC IV",
  ];
  const eveningAreas = [
    "Quality Chemist, City Pharmacy (Kampala Road)",
    "Ntinda Pharmacy, Kisementi Chemist",
    "Nateete Drug Shop, Ben Kiwanuka Pharmacies",
    "Quality Chemist, Ntinda Pharmacy",
  ];
  let dayCount = 0;
  for (const day of WORKING_DAYS) {
    const ex = await exists(client,
      `SELECT id FROM "TourPlanDay" WHERE plan_id=$1 AND day_number=$2`, [sarahPlanId, day]
    );
    if (!ex) {
      await client.query(
        `INSERT INTO "TourPlanDay" (id, plan_id, day_number, morning_area, evening_area, daily_allowance, transport, airtime, is_off_day)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,25000,10000,5000,false)`,
        [sarahPlanId, day, morningAreas[day % morningAreas.length], eveningAreas[day % eveningAreas.length]]
      );
      dayCount++;
    }
  }
  console.log(`  ok    ${dayCount} plan days for Sarah`);

  // ── 7. Doctor Activities — Sarah, all working days except today ────────────
  console.log("\n── Doctor Activities June 2026 ───────────────────────");

  const kampalaGPS = [
    { lat: 0.3376, lng: 32.5772 }, // Mulago
    { lat: 0.3042, lng: 32.5838 }, // Nsambya
    { lat: 0.3120, lng: 32.6021 }, // IHK
    { lat: 0.3049, lng: 32.5614 }, // Mengo
    { lat: 0.3163, lng: 32.5895 }, // Case Medical
    { lat: 0.3200, lng: 32.5780 }, // UCI
  ];

  const anomalyDays = new Set([10, 18]); // GPS anomaly on these days (demo)
  let actTotal = 0;

  for (const day of WORKING_DAYS) {
    if (day === TODAY) continue;
    const numVisits = [3, 4, 3, 4, 3][day % 5];
    for (let i = 0; i < Math.min(numVisits, kampala.length); i++) {
      const doc = kampala[i];
      const hourBase = 8 + i * 1.5;
      const hh = pad(Math.floor(hourBase));
      const mm = pad(Math.round((hourBase % 1) * 60));
      const dateStr = juneDate(day, `${hh}:${mm}:00`);
      const prod = products[i % products.length];
      const gps = kampalaGPS[i % kampalaGPS.length];
      const isAnomaly = anomalyDays.has(day) && i === 0;

      const ex = await exists(client,
        `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
        [rep1Id, doc.id, dateStr]
      );
      if (!ex) {
        await client.query(
          `INSERT INTO "DoctorActivity" (id,user_id,doctor_id,focused_product_id,samples_given,date,gps_lat,gps_lng,gps_anomaly,outcome,visit_status)
           VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,'VISITED')`,
          [rep1Id, doc.id, prod.id, rnd(2,8), dateStr,
           isAnomaly ? gps.lat + 5.0 : gps.lat,   // clearly anomalous
           isAnomaly ? gps.lng + 5.0 : gps.lng,
           isAnomaly,
           "Good engagement. Doctor reviewed product details and requested follow-up samples."]
        );
        actTotal++;
      }
    }
  }
  console.log(`  ok    Sarah: ${actTotal} activities across ${WORKING_DAYS.length - 1} days`);

  // Ronald: visits every other working day
  let act2Total = 0;
  for (const day of WORKING_DAYS.filter(d => d < TODAY && d % 3 !== 0)) {
    const doc = kampala[day % kampala.length];
    const prod = products[day % products.length];
    const dateStr = juneDate(day, "09:30:00");
    const ex = await exists(client,
      `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
      [rep2Id, doc.id, dateStr]
    );
    if (!ex) {
      await client.query(
        `INSERT INTO "DoctorActivity" (id,user_id,doctor_id,focused_product_id,samples_given,date,gps_lat,gps_lng,gps_anomaly,visit_status)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,false,'VISITED')`,
        [rep2Id, doc.id, prod.id, rnd(2,6), dateStr,
         0.311 + Math.random()*0.02, 32.59 + Math.random()*0.02]
      );
      act2Total++;
    }
  }
  console.log(`  ok    Ronald: ${act2Total} activities`);

  // Diana: lighter schedule
  let act3Total = 0;
  for (const day of WORKING_DAYS.filter(d => d < TODAY && d % 4 === 0)) {
    const doc = kampala[(day + 2) % kampala.length];
    const prod = products[day % products.length];
    const dateStr = juneDate(day, "10:00:00");
    const ex = await exists(client,
      `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
      [rep3Id, doc.id, dateStr]
    );
    if (!ex) {
      await client.query(
        `INSERT INTO "DoctorActivity" (id,user_id,doctor_id,focused_product_id,samples_given,date,gps_lat,gps_lng,gps_anomaly,visit_status)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,false,'VISITED')`,
        [rep3Id, doc.id, prod.id, rnd(2,5), dateStr, 0.320, 32.582]
      );
      act3Total++;
    }
  }
  console.log(`  ok    Diana: ${act3Total} activities`);

  // ── 8. Today's visits — Sarah already logged 3 HCPs this morning ──────────
  console.log("\n── Today's Activities (June 27) ──────────────────────");
  const todayVisits = [
    { docIdx: 0, time: "08:30:00", prodIdx: 0, samples: 6 },
    { docIdx: 1, time: "10:00:00", prodIdx: 1, samples: 4 },
    { docIdx: 2, time: "11:30:00", prodIdx: 2, samples: 3 },
  ];
  for (const v of todayVisits) {
    const doc  = kampala[v.docIdx];
    const prod = products[v.prodIdx];
    const dateStr = juneDate(TODAY, v.time);
    const ex = await exists(client,
      `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
      [rep1Id, doc.id, dateStr]
    );
    if (!ex) {
      await client.query(
        `INSERT INTO "DoctorActivity" (id,user_id,doctor_id,focused_product_id,samples_given,date,gps_lat,gps_lng,visit_status)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,'VISITED')`,
        [rep1Id, doc.id, prod.id, v.samples, dateStr, kampalaGPS[v.docIdx].lat, kampalaGPS[v.docIdx].lng]
      );
      console.log(`  ok    ${doc.doctor_name} @ ${v.time}`);
    } else {
      console.log(`  skip  ${doc.doctor_name} @ ${v.time}`);
    }
  }

  // ── 9. Daily Reports ───────────────────────────────────────────────────────
  console.log("\n── Daily Reports June 2026 ───────────────────────────");

  const summaries = [
    "Visited {n} HCPs in Kampala Central. Strong interest in Amoxil 500mg from Dr. Kato. Pharmacies restocked.",
    "Completed {n} doctor calls at Nsambya and IHK. Detailed Ciprofloxacin and Omeprazole lines. Good reception.",
    "Field day: {n} clinic visits around Mengo/Mulago. Distributed samples and left product literature.",
    "Productive day — {n} HCPs visited. Follow-ups booked for next week. Pharmacy stock levels checked.",
    "{n} visits completed. Managed objections on Coartem pricing. Doctor agreed to prescribe Amoxil first-line.",
  ];

  let rptApproved = 0, rptPending = 0;

  // Sarah's reports
  for (const day of WORKING_DAYS) {
    if (day === TODAY) continue;
    const dateStr = juneDate(day);
    const isApproved = APPROVED_DAYS.includes(day);
    const status = isApproved ? "APPROVED" : "SUBMITTED";
    const numVisits = [3,4,3,4,3][day % 5];
    const summary = summaries[day % summaries.length].replace("{n}", numVisits);

    const ex = await exists(client,
      `SELECT id FROM "DailyReport" WHERE user_id=$1 AND report_date=$2`, [rep1Id, dateStr]
    );
    if (ex) {
      await client.query(`UPDATE "DailyReport" SET status=$1 WHERE id=$2`, [status, ex.id]);
    } else {
      await client.query(
        `INSERT INTO "DailyReport" (id,user_id,report_date,summary,visits_count,samples_count,status,reviewed_by,reviewed_at,created_at,updated_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$2,NOW())`,
        [rep1Id, dateStr, summary, numVisits, numVisits * rnd(2,5),
         status,
         isApproved ? supId : null,
         isApproved ? juneDate(Math.min(day + 1, 30), "08:00:00") : null]
      );
      if (isApproved) rptApproved++; else rptPending++;
    }
  }
  console.log(`  ok    Sarah: ${rptApproved} approved, ${rptPending} submitted/pending`);

  // Ronald's reports
  let rpt2 = 0;
  for (const day of [2,3,6,9,10,13,16,17,20,23,24,25,26]) {
    const dateStr = juneDate(day);
    const status = day <= 20 ? "APPROVED" : "SUBMITTED";
    const ex = await exists(client,
      `SELECT id FROM "DailyReport" WHERE user_id=$1 AND report_date=$2`, [rep2Id, dateStr]
    );
    if (!ex) {
      await client.query(
        `INSERT INTO "DailyReport" (id,user_id,report_date,summary,visits_count,samples_count,status,reviewed_by,reviewed_at,created_at,updated_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$2,NOW())`,
        [rep2Id, dateStr,
         `Covered ${rnd(2,4)} HCPs today. Amoxil detailing focus. Noted competitor (Ciproflox brand) stocked at Ntinda Pharmacy.`,
         rnd(2,4), rnd(5,15), status,
         status === "APPROVED" ? supId : null,
         status === "APPROVED" ? juneDate(Math.min(day+1,30),"08:00:00") : null]
      );
      rpt2++;
    }
  }
  console.log(`  ok    Ronald: ${rpt2} reports`);

  // Diana: only approved ones
  let rpt3 = 0;
  for (const day of [4,5,12,19]) {
    const dateStr = juneDate(day);
    const ex = await exists(client,
      `SELECT id FROM "DailyReport" WHERE user_id=$1 AND report_date=$2`, [rep3Id, dateStr]
    );
    if (!ex) {
      await client.query(
        `INSERT INTO "DailyReport" (id,user_id,report_date,summary,visits_count,samples_count,status,reviewed_by,reviewed_at,created_at,updated_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,'APPROVED',$6,$7,$2,NOW())`,
        [rep3Id, dateStr, `${rnd(2,3)} HCP visits completed. Good field day.`, rnd(2,3), rnd(4,10),
         supId, juneDate(Math.min(day+1,30),"09:00:00")]
      );
      rpt3++;
    }
  }
  console.log(`  ok    Diana: ${rpt3} reports`);

  // ── 10. JFW Coaching Days ──────────────────────────────────────────────────
  console.log("\n── JFW Coaching Days ─────────────────────────────────");
  const jfwDays = [{ day:12, score:4.2, note:"Good detailing technique on Amoxil. Improve objection handling at pharmacy. Overall solid." },
                   { day:19, score:3.8, note:"Product knowledge strong. Needs more confidence with specialist doctors. Work on call flow structure." }];
  for (const jfw of jfwDays) {
    const dateStr = juneDate(jfw.day);
    const rpt = await exists(client,
      `SELECT id FROM "DailyReport" WHERE user_id=$1 AND report_date=$2`, [rep1Id, dateStr]
    );
    if (rpt) {
      await client.query(
        `UPDATE "DailyReport" SET jfw_observer_id=$1, jfw_overall=$2, jfw_notes=$3, jfw_scored_by=$4, jfw_scored_at=NOW() WHERE id=$5`,
        [supId, jfw.score, jfw.note, supId, rpt.id]
      );
      console.log(`  ok    JFW June ${jfw.day} (score: ${jfw.score})`);
    }
  }

  // ── 11. Expense Claims ─────────────────────────────────────────────────────
  console.log("\n── Expense Claims ────────────────────────────────────");
  const claimSpecs = [
    { userId: rep1Id, period:"2026-05", status:"APPROVED",  total:580000, approvedBy:mgrId, submittedAt:"2026-05-30T10:00:00Z", approvedAt:"2026-06-02T09:00:00Z" },
    { userId: rep1Id, period:"2026-06", status:"SUBMITTED", total:647000, approvedBy:null,  submittedAt:"2026-06-26T16:00:00Z", approvedAt:null },
    { userId: rep2Id, period:"2026-06", status:"SUBMITTED", total:523000, approvedBy:null,  submittedAt:"2026-06-26T17:30:00Z", approvedAt:null },
    { userId: rep3Id, period:"2026-05", status:"APPROVED",  total:412000, approvedBy:mgrId, submittedAt:"2026-05-29T14:00:00Z", approvedAt:"2026-06-03T08:00:00Z" },
  ];

  for (const c of claimSpecs) {
    const ex = await exists(client,
      `SELECT id FROM "ExpenseClaim" WHERE user_id=$1 AND period=$2`, [c.userId, c.period]
    );
    if (ex) { console.log(`  skip  ${repNames[c.userId]} ${c.period}`); continue; }

    const res = await client.query(
      `INSERT INTO "ExpenseClaim" (id,user_id,period,total_amount,status,approved_by,submitted_at,approved_at,created_at,updated_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING id`,
      [c.userId, c.period, c.total, c.status, c.approvedBy, c.submittedAt, c.approvedAt]
    );
    const claimId = res.rows[0].id;

    const [m, yr] = c.period.split("-");
    const items = [
      { cat:"TRANSPORT",     desc:"Boda boda / taxi — clinic rounds",     amount: Math.round(c.total * 0.30), day:5  },
      { cat:"TRANSPORT",     desc:"Taxi fares — pharmacy evening routes",  amount: Math.round(c.total * 0.22), day:12 },
      { cat:"MEALS",         desc:"Field lunch allowance (20 days)",        amount: Math.round(c.total * 0.20), day:15 },
      { cat:"ACCOMMODATION", desc:"Upcountry overnight — Gulu visit",       amount: Math.round(c.total * 0.16), day:20 },
      { cat:"OTHER",         desc:"Printing — product brochures & PILs",    amount: Math.round(c.total * 0.12), day:22 },
    ];
    for (const item of items) {
      await client.query(
        `INSERT INTO "ExpenseItem" (id,claim_id,category,description,amount,date,created_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,NOW())`,
        [claimId, item.cat, item.desc, item.amount, `${c.period}-${pad(item.day)}`]
      );
    }
    console.log(`  ok    ${repNames[c.userId]} ${c.period} → ${c.status} (${Math.round(c.total/1000)}K UGX)`);
  }

  // ── 12. Doctor Recommendations ────────────────────────────────────────────
  console.log("\n── Doctor Recommendations ────────────────────────────");
  const recSpecs = [
    { userId: rep1Id, clinician_name:"Dr. Paul Ssebunya",  cadre:"Doctor",     location:"Kibuli Hospital, Kampala",       status:"PENDING"  },
    { userId: rep1Id, clinician_name:"Nurse Joyce Akello", cadre:"Nurse",      location:"Kisenyi HC IV, Kampala",         status:"PENDING"  },
    { userId: rep2Id, clinician_name:"Dr. Michael Otim",   cadre:"Doctor",     location:"Gulu Independent Hospital",      status:"PENDING"  },
    { userId: rep1Id, clinician_name:"Dr. Irene Atugonza", cadre:"Clinician",  location:"Masaka Regional Hospital",       status:"APPROVED" },
    { userId: rep3Id, clinician_name:"Pharm. Ben Kasozi",  cadre:"Pharmacist", location:"Ntinda Community Pharmacy",      status:"PENDING"  },
  ];

  for (const r of recSpecs) {
    const ex = await exists(client,
      `SELECT 1 FROM "DoctorRecommendation" WHERE user_id=$1 AND clinician_name=$2`,
      [r.userId, r.clinician_name]
    );
    if (ex) { console.log(`  skip  ${r.clinician_name}`); continue; }
    await client.query(
      `INSERT INTO "DoctorRecommendation" (id,company_id,user_id,clinician_name,clinician_cadre,clinician_location,status,created_at,updated_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [companyId, r.userId, r.clinician_name, r.cadre, r.location, r.status]
    );
    console.log(`  ok    ${r.clinician_name} → ${r.status}`);
  }

  // ── 13. Sample Balances (June 2026) ───────────────────────────────────────
  console.log("\n── Sample Balances ───────────────────────────────────");
  const sampleSpecs = [
    { userId: rep1Id, prodIdx:0, issued:150, given:73  }, // Amoxil
    { userId: rep1Id, prodIdx:1, issued:80,  given:29  }, // Coartem
    { userId: rep1Id, prodIdx:4, issued:80,  given:34  }, // Omeprazole
    { userId: rep1Id, prodIdx:5, issued:100, given:42  }, // Ciprofloxacin
    { userId: rep2Id, prodIdx:0, issued:120, given:51  }, // Amoxil
    { userId: rep2Id, prodIdx:3, issued:60,  given:22  }, // Amlodipine
    { userId: rep3Id, prodIdx:0, issued:80,  given:31  }, // Amoxil
  ];

  for (const sb of sampleSpecs) {
    const prod = products[sb.prodIdx];
    if (!prod) continue;
    const ex = await exists(client,
      `SELECT id FROM "SampleBalance" WHERE user_id=$1 AND product_id=$2 AND month=$3 AND year=$4`,
      [sb.userId, prod.id, MONTH, YEAR]
    );
    if (ex) {
      await client.query(`UPDATE "SampleBalance" SET issued=$1, given=$2, updated_at=NOW() WHERE id=$3`, [sb.issued, sb.given, ex.id]);
      console.log(`  upd   ${repNames[sb.userId]} — ${prod.product_name}`);
    } else {
      await client.query(
        `INSERT INTO "SampleBalance" (id,user_id,product_id,month,year,issued,given,updated_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,NOW())`,
        [sb.userId, prod.id, MONTH, YEAR, sb.issued, sb.given]
      );
      console.log(`  ok    ${repNames[sb.userId]} — ${prod.product_name}: ${sb.issued} issued / ${sb.given} given`);
    }
  }

  // ── 14. Update Call Cycle visits_done from actual activities ──────────────
  console.log("\n── Sync cycle visits_done ────────────────────────────");
  for (const [userId, cycleId] of Object.entries(cycleIds)) {
    const items = await client.query(`SELECT id, doctor_id, frequency FROM "CallCycleItem" WHERE cycle_id=$1`, [cycleId]);
    for (const item of items.rows) {
      const vcRes = await client.query(
        `SELECT COUNT(*) FROM "DoctorActivity"
         WHERE user_id=$1 AND doctor_id=$2 AND date >= '2026-06-01' AND date < '2026-07-01'`,
        [userId, item.doctor_id]
      );
      const done = Math.min(parseInt(vcRes.rows[0].count), item.frequency);
      await client.query(`UPDATE "CallCycleItem" SET visits_done=$1 WHERE id=$2`, [done, item.id]);
    }
    console.log(`  ok    ${repNames[userId]} cycle synced`);
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  const totalActs = actTotal + act2Total + act3Total;
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║        DEMO SEED COMPLETE — Novex Pharma Uganda Ltd           ║
║        Demo date: June 27, 2026                               ║
╠═══════════════════════════════════════════════════════════════╣
║  LOGIN CREDENTIALS  (password: ${PASSWORD})                   ║
║                                                               ║
║  Sarah Nakato    rep@kibagrep.dev          MedicalRep  ← YOU  ║
║  Ronald Kiiza    rep2@kibagrep.dev         MedicalRep         ║
║  Diana Nabirye   rep3@kibagrep.dev         MedicalRep         ║
║  Brian Mugisha   supervisor@kibagrep.dev   Supervisor         ║
║  Moses Kayiira   manager@kibagrep.dev      Manager            ║
╠═══════════════════════════════════════════════════════════════╣
║  APPROVAL QUEUE (manager sees):                               ║
║   • ${rptPending} daily reports PENDING (Sarah, June 23–26)              ║
║   • 4 daily reports PENDING (Ronald, June 23–26)              ║
║   • 1 call cycle SUBMITTED (Ronald — awaiting approval)       ║
║   • 1 tour plan SUBMITTED (Ronald — awaiting approval)        ║
║   • 2 expense claims SUBMITTED (Sarah + Ronald, June)         ║
║   • 4 doctor recommendations PENDING                          ║
║                                                               ║
║  ACTIVITY FEED:                                               ║
║   • ${totalActs} total visits across the team this month           ║
║   • 3 visits logged by Sarah ALREADY TODAY (08:30–11:30)     ║
║   • 2 GPS anomalies (June 10, 18) — visible in analytics     ║
║   • 2 JFW coaching days (June 12, 19 — Brian observed Sarah) ║
║   • ${rptApproved} approved daily reports visible in calendar/analytics   ║
╚═══════════════════════════════════════════════════════════════╝`);

  await client.end();
}

main().catch((e) => { console.error("\n❌ Error:", e.message, "\n", e); process.exit(1); });
