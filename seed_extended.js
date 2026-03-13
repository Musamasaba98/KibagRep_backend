/**
 * KibagRep Extended Seed — adds call cycle, tour plan, today's entries,
 * visit history, sample balances, and company doctor list.
 * Run: node seed_extended.js
 * Requires base seed (seed.js) to have been run first.
 */
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to DB\n");

  // ── Fetch existing IDs ──────────────────────────────────────────────────────
  const repUser    = await client.query(`SELECT id FROM "User" WHERE email = $1`, ["rep@kibagrep.dev"]);
  const company    = await client.query(`SELECT id FROM "Company" WHERE company_name = $1`, ["Novex Pharma Uganda Ltd"]);
  const doctors    = await client.query(`SELECT id, doctor_name, town FROM "Doctor" ORDER BY doctor_name`);
  const pharmacies = await client.query(`SELECT id, pharmacy_name FROM "Pharmacy" ORDER BY pharmacy_name`);
  const products   = await client.query(`SELECT id, product_name FROM "Product" WHERE company_id = $1 ORDER BY product_name`, [company.rows[0].id]);

  const repId      = repUser.rows[0].id;
  const companyId  = company.rows[0].id;
  const doctorRows = doctors.rows;
  const pharmRows  = pharmacies.rows;
  const prodRows   = products.rows;

  console.log(`Rep ID: ${repId}`);
  console.log(`Company: ${companyId}`);
  console.log(`Doctors: ${doctorRows.length}, Pharmacies: ${pharmRows.length}, Products: ${prodRows.length}\n`);

  // ── 1. Update pharmacies with lat/lng and town ──────────────────────────────
  console.log("── Pharmacy GPS + town ───────────────────────────────");
  const pharmGPS = [
    { name: "Quality Chemist",      lat: 0.3163, lng: 32.5821, town: "Kampala" },
    { name: "Ntinda Pharmacy",      lat: 0.3467, lng: 32.6189, town: "Kampala" },
    { name: "City Pharmacy",        lat: 0.3109, lng: 32.5815, town: "Kampala" },
    { name: "Kisementi Chemist",    lat: 0.3352, lng: 32.5894, town: "Kampala" },
    { name: "Nateete Drug Shop",    lat: 0.2968, lng: 32.5483, town: "Kampala" },
    { name: "Gulu Health Pharmacy", lat: 2.7748, lng: 32.2992, town: "Gulu"    },
    { name: "Mbarara Chemist",      lat: -0.6091, lng: 30.6573, town: "Mbarara"},
  ];
  for (const p of pharmGPS) {
    await client.query(
      `UPDATE "Pharmacy" SET latitude=$1, longitude=$2, town=$3 WHERE pharmacy_name=$4`,
      [p.lat, p.lng, p.town, p.name]
    );
    console.log(`  ok    ${p.name}`);
  }

  // ── 2. Company Doctor List (CompanyDoctor) ──────────────────────────────────
  console.log("\n── Company Doctor List ───────────────────────────────");
  const kampalaDocIds = doctorRows.filter(d => d.town === "Kampala").map(d => d.id);
  for (const docId of kampalaDocIds) {
    const exists = await client.query(
      `SELECT 1 FROM "CompanyDoctor" WHERE company_id=$1 AND doctor_id=$2`, [companyId, docId]
    );
    if (exists.rows.length === 0) {
      await client.query(
        `INSERT INTO "CompanyDoctor" (company_id, doctor_id, added_by) VALUES ($1,$2,$3)`,
        [companyId, docId, repId]
      );
      const doc = doctorRows.find(d => d.id === docId);
      console.log(`  ok    ${doc.doctor_name}`);
    } else {
      const doc = doctorRows.find(d => d.id === docId);
      console.log(`  skip  ${doc.doctor_name}`);
    }
  }

  // ── 3. Sample Balances ──────────────────────────────────────────────────────
  console.log("\n── Sample Balances ───────────────────────────────────");
  const sampleBalances = [
    { product_name: "Amoxil 500mg",    issued: 120, given: 47 },
    { product_name: "Omeprazole 20mg", issued: 60,  given: 18 },
    { product_name: "Ciprofloxacin 500mg", issued: 80, given: 29 },
  ];
  for (const sb of sampleBalances) {
    const prod = prodRows.find(p => p.product_name === sb.product_name);
    if (!prod) { console.log(`  skip  (no product: ${sb.product_name})`); continue; }
    const exists = await client.query(
      `SELECT id FROM "SampleBalance" WHERE user_id=$1 AND product_id=$2`, [repId, prod.id]
    );
    if (exists.rows.length === 0) {
      await client.query(
        `INSERT INTO "SampleBalance" (id, user_id, product_id, issued, given, updated_at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW())`,
        [repId, prod.id, sb.issued, sb.given]
      );
      console.log(`  ok    ${sb.product_name}: ${sb.issued} issued / ${sb.given} given`);
    } else {
      await client.query(
        `UPDATE "SampleBalance" SET issued=$1, given=$2, updated_at=NOW() WHERE id=$3`,
        [sb.issued, sb.given, exists.rows[0].id]
      );
      console.log(`  upd   ${sb.product_name}`);
    }
  }

  // ── 4. More Visit History (March 1–10) ─────────────────────────────────────
  console.log("\n── Visit History (March 1–10) ────────────────────────");
  const kampalaDoc = kampalaDocIds;
  const prod0 = prodRows[0]?.id;
  const prod1 = prodRows[1]?.id;
  const prod2 = prodRows[2]?.id;
  const prod3 = prodRows[3]?.id;
  const prod4 = prodRows[4]?.id;
  const prod5 = prodRows[5]?.id;

  const moreVisits = [
    { doctor_id: kampalaDoc[0], product_id: prod1, samples: 4, date: "2026-03-01T09:00:00Z" },
    { doctor_id: kampalaDoc[1], product_id: prod2, samples: 6, date: "2026-03-01T11:00:00Z" },
    { doctor_id: kampalaDoc[2], product_id: prod3, samples: 3, date: "2026-03-03T08:30:00Z" },
    { doctor_id: kampalaDoc[3], product_id: prod4, samples: 5, date: "2026-03-03T10:30:00Z" },
    { doctor_id: kampalaDoc[0], product_id: prod5, samples: 2, date: "2026-03-05T09:15:00Z" },
    { doctor_id: kampalaDoc[2], product_id: prod0, samples: 8, date: "2026-03-07T08:45:00Z" },
    { doctor_id: kampalaDoc[4], product_id: prod1, samples: 4, date: "2026-03-07T11:00:00Z" },
    { doctor_id: kampalaDoc[3], product_id: prod2, samples: 3, date: "2026-03-08T09:30:00Z" },
    { doctor_id: kampalaDoc[1], product_id: prod3, samples: 6, date: "2026-03-10T10:00:00Z" },
    { doctor_id: kampalaDoc[5], product_id: prod4, samples: 4, date: "2026-03-10T11:30:00Z" },
  ];

  for (const v of moreVisits) {
    if (!v.doctor_id || !v.product_id) continue;
    const exists = await client.query(
      `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
      [repId, v.doctor_id, v.date]
    );
    if (exists.rows.length > 0) {
      console.log(`  skip  visit ${v.date}`);
      continue;
    }
    const actId = (await client.query(
      `INSERT INTO "DoctorActivity" (id, user_id, doctor_id, focused_product_id, samples_given, date)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5) RETURNING id`,
      [repId, v.doctor_id, v.product_id, v.samples, v.date]
    )).rows[0].id;
    // Update cycle item visits_done (will set in step 5)
    console.log(`  ok    visit ${v.date.split('T')[0]}`);
  }

  // ── 5. Call Cycle (March 2026, LOCKED) ─────────────────────────────────────
  console.log("\n── Call Cycle March 2026 ─────────────────────────────");
  const month = 3, year = 2026;

  const existingCycle = await client.query(
    `SELECT id FROM "CallCycle" WHERE user_id=$1 AND month=$2 AND year=$3`,
    [repId, month, year]
  );
  let cycleId;
  if (existingCycle.rows.length > 0) {
    cycleId = existingCycle.rows[0].id;
    console.log(`  skip  CallCycle exists: ${cycleId}`);
  } else {
    const row = await client.query(
      `INSERT INTO "CallCycle" (id, user_id, month, year, status, approved_at, locked_at, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'LOCKED', NOW(), NOW(), NOW()) RETURNING id`,
      [repId, month, year]
    );
    cycleId = row.rows[0].id;
    console.log(`  ok    CallCycle LOCKED: ${cycleId}`);
  }

  // Tier config: A=4 visits/month, B=2 visits/month, C=1 visit/month
  const cycleItems = [
    { doctor_idx: 0, tier: "A", frequency: 4 },
    { doctor_idx: 1, tier: "A", frequency: 4 },
    { doctor_idx: 2, tier: "B", frequency: 2 },
    { doctor_idx: 3, tier: "B", frequency: 2 },
    { doctor_idx: 4, tier: "B", frequency: 2 },
    { doctor_idx: 5, tier: "C", frequency: 1 },
    { doctor_idx: 6, tier: "C", frequency: 1 },
    { doctor_idx: 7, tier: "A", frequency: 4 },
    { doctor_idx: 8, tier: "B", frequency: 2 },
    { doctor_idx: 9, tier: "C", frequency: 1 },
  ];

  const cycleItemIds = {};
  for (const ci of cycleItems) {
    const docId = kampalaDoc[ci.doctor_idx];
    if (!docId) continue;
    const exists = await client.query(
      `SELECT id FROM "CallCycleItem" WHERE cycle_id=$1 AND doctor_id=$2`, [cycleId, docId]
    );
    let itemId;
    if (exists.rows.length > 0) {
      itemId = exists.rows[0].id;
    } else {
      // Count actual visits for this doctor this month
      const visitCount = await client.query(
        `SELECT COUNT(*) FROM "DoctorActivity"
         WHERE user_id=$1 AND doctor_id=$2
         AND date >= '2026-03-01' AND date < '2026-04-01'`,
        [repId, docId]
      );
      const done = parseInt(visitCount.rows[0].count);
      const row = await client.query(
        `INSERT INTO "CallCycleItem" (id, cycle_id, doctor_id, tier, frequency, visits_done)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5) RETURNING id`,
        [cycleId, docId, ci.tier, ci.frequency, Math.min(done, ci.frequency)]
      );
      itemId = row.rows[0].id;
      const doc = doctorRows.find(d => d.id === docId);
      console.log(`  ok    Tier ${ci.tier}: ${doc?.doctor_name} (${done}/${ci.frequency} done)`);
    }
    cycleItemIds[docId] = itemId;
  }

  // ── 6. Tour Plan (March 2026, APPROVED) ────────────────────────────────────
  console.log("\n── Tour Plan March 2026 ──────────────────────────────");
  const existingPlan = await client.query(
    `SELECT id FROM "TourPlan" WHERE user_id=$1 AND month=$2 AND year=$3`,
    [repId, month, year]
  );
  let planId;
  if (existingPlan.rows.length > 0) {
    planId = existingPlan.rows[0].id;
    // Update to APPROVED if DRAFT
    await client.query(`UPDATE "TourPlan" SET status='APPROVED', reviewed_at=NOW() WHERE id=$1`, [planId]);
    console.log(`  upd   TourPlan → APPROVED: ${planId}`);
  } else {
    const row = await client.query(
      `INSERT INTO "TourPlan" (id, user_id, month, year, status, reviewed_at, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'APPROVED', NOW(), NOW()) RETURNING id`,
      [repId, month, year]
    );
    planId = row.rows[0].id;
    console.log(`  ok    TourPlan APPROVED: ${planId}`);
  }

  // ── 7. Tour Plan Days ───────────────────────────────────────────────────────
  console.log("\n── Tour Plan Days ────────────────────────────────────");
  const today = 11; // March 11, 2026
  const planDays = [
    { day: 1,  morning: "Mulago, Wandegeya",       evening: "Namirembe Road Pharmacies",    allow: 25000, transport: 8000,  airtime: 5000 },
    { day: 3,  morning: "Nsambya, Mengo Hill",      evening: "Ben Kiwanuka Pharmacies",       allow: 25000, transport: 10000, airtime: 5000 },
    { day: 5,  morning: "Mulago, Kibuli",            evening: "Ntinda Pharmacies",             allow: 25000, transport: 8000,  airtime: 5000 },
    { day: 7,  morning: "IHK, Case Medical",        evening: "Kisementi Chemists",            allow: 25000, transport: 12000, airtime: 5000 },
    { day: 8,  morning: "Mengo, Nsambya",           evening: "Nateete Pharmacies",            allow: 25000, transport: 9000,  airtime: 5000 },
    { day: today, morning: "Mulago, Kibuli, Mwana", evening: "Quality Chemist, City Pharmacy", allow: 30000, transport: 10000, airtime: 5000 },
    { day: 13, morning: "Mulago MOPD, Wandegeya",  evening: "Namirembe Road",                allow: 25000, transport: 8000,  airtime: 5000 },
    { day: 15, morning: "IHK, Case Medical",        evening: "Ntinda, Kisementi",             allow: 25000, transport: 12000, airtime: 5000 },
    { day: 18, morning: "Mulago ENT, Kibuli",       evening: "Nateete Drug Shop",             allow: 25000, transport: 9000,  airtime: 5000 },
    { day: 20, morning: "Nsambya, Mengo",           evening: "Quality, City Pharmacy",        allow: 25000, transport: 8000,  airtime: 5000 },
    { day: 22, morning: "Mulago, IHK",              evening: "Ntinda, Kisementi",             allow: 25000, transport: 11000, airtime: 5000 },
    { day: 25, morning: "Mulago MOPD, Kibuli",      evening: "Namirembe Road Pharmacies",    allow: 25000, transport: 8000,  airtime: 5000 },
    { day: 27, morning: "Case Medical, IHK",        evening: "Ben Kiwanuka",                  allow: 25000, transport: 12000, airtime: 5000 },
    { day: 29, morning: "Mulago, Wandegeya",        evening: "Quality, City, Nateete",        allow: 25000, transport: 9000,  airtime: 5000 },
  ];

  for (const d of planDays) {
    const exists = await client.query(
      `SELECT id FROM "TourPlanDay" WHERE plan_id=$1 AND day_number=$2`, [planId, d.day]
    );
    if (exists.rows.length > 0) {
      console.log(`  skip  Day ${d.day}`);
    } else {
      await client.query(
        `INSERT INTO "TourPlanDay" (id, plan_id, day_number, morning_area, evening_area, daily_allowance, transport, airtime, accommodation, other_costs, is_off_day)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, 0, 0, false)`,
        [planId, d.day, d.morning, d.evening, d.allow, d.transport, d.airtime]
      );
      console.log(`  ok    Day ${d.day}: ${d.morning} / ${d.evening}`);
    }
  }

  // ── 8. Tour Plan Entries for TODAY (March 11) ──────────────────────────────
  console.log("\n── Tour Plan Entries for Today (March 11) ────────────");

  const existingEntries = await client.query(
    `SELECT id FROM "TourPlanEntry" WHERE plan_id=$1 AND day_number=$2`, [planId, today]
  );

  if (existingEntries.rows.length > 0) {
    console.log(`  skip  Entries for day ${today} already exist (${existingEntries.rows.length} entries)`);
  } else {
    // Morning: 4 Kampala doctors
    const morningDocs = [
      { docIdx: 0, ciIdx: 0 }, // Dr. James Kato (Tier A)
      { docIdx: 1, ciIdx: 1 }, // Dr. Grace Namukasa (Tier A)
      { docIdx: 2, ciIdx: 2 }, // Dr. Robert Ssemwogerere (Tier B)
      { docIdx: 7, ciIdx: 7 }, // Dr. Ibrahim Ssekandi (Tier A)
    ];
    for (let i = 0; i < morningDocs.length; i++) {
      const { docIdx, ciIdx } = morningDocs[i];
      const docId = kampalaDoc[docIdx];
      const cycleItemId = cycleItemIds[docId];
      if (!docId) continue;
      await client.query(
        `INSERT INTO "TourPlanEntry" (id, plan_id, day_number, entry_type, slot, doctor_id, cycle_item_id, sort_order)
         VALUES (gen_random_uuid()::text, $1, $2, 'CLINICIAN', 'MORNING', $3, $4, $5)`,
        [planId, today, docId, cycleItemId ?? null, i]
      );
      const doc = doctorRows.find(d => d.id === docId);
      console.log(`  ok    Morning HCP: ${doc?.doctor_name}`);
    }

    // Evening: 3 pharmacies
    const eveningPharms = [
      pharmRows.find(p => p.pharmacy_name === "Quality Chemist"),
      pharmRows.find(p => p.pharmacy_name === "City Pharmacy"),
      pharmRows.find(p => p.pharmacy_name === "Ntinda Pharmacy"),
    ].filter(Boolean);

    for (let i = 0; i < eveningPharms.length; i++) {
      const pharm = eveningPharms[i];
      await client.query(
        `INSERT INTO "TourPlanEntry" (id, plan_id, day_number, entry_type, slot, pharmacy_id, pharmacy_name, sort_order)
         VALUES (gen_random_uuid()::text, $1, $2, 'PHARMACY', 'EVENING', $3, $4, $5)`,
        [planId, today, pharm.id, pharm.pharmacy_name, i]
      );
      console.log(`  ok    Evening Rx: ${pharm.pharmacy_name}`);
    }
  }

  // ── 9. Today's Visit Activities (2 logged so far) ──────────────────────────
  console.log("\n── Today's Activities (March 11) ─────────────────────");
  const todayDate1 = "2026-03-11T08:45:00Z";
  const todayDate2 = "2026-03-11T10:15:00Z";

  for (const [date, docId, prodId, samples] of [
    [todayDate1, kampalaDoc[0], prod0, 4],
    [todayDate2, kampalaDoc[1], prod1, 3],
  ]) {
    const exists = await client.query(
      `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
      [repId, docId, date]
    );
    if (exists.rows.length === 0 && docId && prodId) {
      await client.query(
        `INSERT INTO "DoctorActivity" (id, user_id, doctor_id, focused_product_id, samples_given, date)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
        [repId, docId, prodId, samples, date]
      );
      const doc = doctorRows.find(d => d.id === docId);
      console.log(`  ok    Logged visit → ${doc?.doctor_name} @ ${date}`);
    } else {
      console.log(`  skip  Today's visit ${date}`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n── Done ──────────────────────────────────────────────");
  console.log("Login:  rep@kibagrep.dev  /  Test1234!");
  console.log(`Tour Plan: APPROVED, March 2026, ${planDays.length} planned days`);
  console.log(`Call Cycle: LOCKED, ${cycleItems.length} doctors, Tier A/B/C`);
  console.log("Today: 4 morning HCPs + 3 evening pharmacies in tour plan");
  console.log("       2 visits already logged this morning");

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
