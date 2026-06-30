/**
 * seed_june30.js — Demo data for June 30 & July 1, 2026
 * Adds today's and tomorrow's field activity for Nakato Sarah + team.
 * Safe to re-run (skips existing rows).
 *
 * Run: DATABASE_URL="<render-url>" node seed_june30.js
 */
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const COMPANY_ID = "dc16426c-7b5e-4326-b3b4-a871e6a20ce8";

// Known user IDs from online DB
const USERS = {
  nakato:    "fa91bba2-c79e-4505-9385-3cdcbc4f85f0", // Nakato Sarah — MedicalRep
  emmanuel:  "04aa8db9-3667-439c-831b-63c9ab0137b1", // Emmanuel Lutaaya — MedicalRep
  nambi:     "ac532598-c832-4aa7-b72b-be9759bf6280", // Nambi Patricia — MedicalRep
  winnie:    "6447867d-a41d-4b10-939c-bcb680cfe1be", // Winnie Kyomuhendo — MedicalRep
  brian_opio:"ad4a7533-6b09-4eff-ae3c-55b4d3e47dc4", // Brian Opio — MedicalRep
  mugisha:   "31b9e665-42f5-490e-89b5-d807a541cd5c", // Mugisha Brian — Supervisor
  ssali:     "dece9370-7ea1-4073-9267-53fdca128878", // Ssali Ronald — Supervisor
  kayiira:   "1f980c9d-bb55-4746-bcf0-80d829b0f562", // Kayiira Moses — Manager
};

const PRODUCTS = [
  { id: "fc92cf25-b0fe-48b2-96b7-f6a77aea8317", name: "Amoxil 500mg" },
  { id: "f16197f1-ae63-4a95-8a65-1e4dd22fef27", name: "Coartem 80/480mg" },
  { id: "7148be48-254a-4ac9-babd-70d1eb7d24d4", name: "Metformin 500mg" },
  { id: "07b4e4cb-0d52-434e-aa56-8ea412846c59", name: "Amlodipine 10mg" },
  { id: "44a2b287-4325-4bca-a2ff-1c4048b1d548", name: "Omeprazole 20mg" },
  { id: "b39d4411-7a8f-4309-b6b9-077f5ee92c40", name: "Ciprofloxacin 500mg" },
];

const PHARMACIES = [
  { id: "87be41a1-64d2-4698-a284-7fb177be183a", name: "Quality Chemist" },
  { id: "19503e4a-afca-47e9-8c4b-016ed1f290ec", name: "Ntinda Pharmacy" },
  { id: "f53d2e72-ea81-4352-8861-23f9e6cd7008", name: "City Pharmacy" },
  { id: "1a6b793f-3cf6-42b4-9f37-b43f70e4103b", name: "Kisementi Chemist" },
  { id: "26124e9b-3b64-4665-b800-b063e7a73058", name: "Nateete Drug Shop" },
];

// Uganda is UTC+3 — times below are UTC (subtract 3 for Uganda display)
// 06:00 UTC = 09:00 Uganda
// 07:30 UTC = 10:30 Uganda
// 09:00 UTC = 12:00 Uganda
// 11:00 UTC = 14:00 Uganda
// 12:30 UTC = 15:30 Uganda

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function skip(client, sql, params) {
  return (await client.query(sql, params)).rows.length > 0;
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("✓ Connected to online DB\n");

  // ── Get Kampala doctors on company list ──────────────────────────────────
  const docRes = await client.query(`
    SELECT d.id, d.doctor_name, d.town
    FROM "Doctor" d
    JOIN "CompanyDoctor" cd ON cd.doctor_id = d.id
    WHERE cd.company_id = $1 AND d.town = 'Kampala'
    ORDER BY d.doctor_name
    LIMIT 12
  `, [COMPANY_ID]);

  let kampala = docRes.rows;
  if (kampala.length < 4) {
    // Fallback: use doctors from Nakato's existing activity history
    const fb = await client.query(`
      SELECT DISTINCT d.id, d.doctor_name, d.town
      FROM "Doctor" d
      JOIN "DoctorActivity" a ON a.doctor_id = d.id
      WHERE a.user_id = $1
      LIMIT 8
    `, [USERS.nakato]);
    kampala = fb.rows;
    console.log(`  Using ${kampala.length} doctors from existing activity history`);
  } else {
    console.log(`  ${kampala.length} Kampala doctors on company list`);
  }

  if (kampala.length === 0) {
    console.error("ERROR: No doctors found. Run the base seed first.");
    await client.end(); process.exit(1);
  }

  // ── Check if PharmacyActivity table exists ───────────────────────────────
  const pharmActExists = (await client.query(`
    SELECT 1 FROM information_schema.tables WHERE table_name = 'PharmacyActivity'
  `)).rows.length > 0;

  // ─────────────────────────────────────────────────────────────────────────
  // TODAY: JUNE 30, 2026
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════");
  console.log("  TODAY: JUNE 30, 2026 (Monday)");
  console.log("══════════════════════════════════════════════");

  // ── Nakato Sarah — 5 doctor visits today ────────────────────────────────
  console.log("\n── Nakato Sarah — Doctor Visits (June 30) ───");
  const nakatoVisits30 = [
    { time: "06:00:00", docIdx: 0, prodIdx: 0, samples: 6, outcome: "Dr interested in Amoxil as first-line for community-acquired infections. Requested follow-up material." },
    { time: "07:30:00", docIdx: 1, prodIdx: 4, samples: 4, outcome: "Long discussion on Omeprazole dosing. Will trial the 20mg line with 5 new patients." },
    { time: "09:00:00", docIdx: 2, prodIdx: 5, samples: 3, outcome: "Ciprofloxacin detailing — doctor noted competitor brand. Left comparative literature." },
    { time: "11:00:00", docIdx: 3, prodIdx: 1, samples: 5, outcome: "Paeds ward visit. Good reception for Coartem. Asked about new pack sizes." },
    { time: "12:30:00", docIdx: 0, prodIdx: 2, samples: 4, outcome: "Second call — Metformin line for diabetic patients. Doctor agreed to prescribe." },
  ];

  const kampalaGPS = [
    { lat: 0.3376, lng: 32.5772 }, // Mulago
    { lat: 0.3042, lng: 32.5838 }, // Nsambya
    { lat: 0.3120, lng: 32.6021 }, // IHK
    { lat: 0.3049, lng: 32.5614 }, // Mengo
    { lat: 0.3376, lng: 32.5772 }, // Mulago again
  ];

  for (let i = 0; i < nakatoVisits30.length; i++) {
    const v = nakatoVisits30[i];
    const doc = kampala[v.docIdx % kampala.length];
    const prod = PRODUCTS[v.prodIdx];
    const dateStr = `2026-06-30T${v.time}Z`;
    const gps = kampalaGPS[i % kampalaGPS.length];

    if (await skip(client,
      `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
      [USERS.nakato, doc.id, dateStr]
    )) {
      console.log(`  skip  ${doc.doctor_name} @ ${v.time}`);
      continue;
    }
    await client.query(`
      INSERT INTO "DoctorActivity"
        (id, user_id, doctor_id, focused_product_id, samples_given, date, gps_lat, gps_lng, gps_anomaly, outcome, visit_status)
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, false, $8, 'VISITED')
    `, [USERS.nakato, doc.id, prod.id, v.samples, dateStr, gps.lat, gps.lng, v.outcome]);
    console.log(`  ok    ${doc.doctor_name} @ ${v.time.slice(0,5)} UTC — ${prod.name} (${v.samples} samples)`);
  }

  // ── Nakato Sarah — 2 pharmacy visits today ──────────────────────────────
  if (pharmActExists) {
    console.log("\n── Nakato Sarah — Pharmacy Visits (June 30) ─");
    const pharmVisits = [
      { time: "13:30:00", pharmIdx: 0, outcome: "Quality Chemist restocked on Amoxil 500mg. Strong OTC demand. Left Ciprofloxacin samples for counter display.", lat: 0.3163, lng: 32.5821 },
      { time: "14:30:00", pharmIdx: 2, outcome: "City Pharmacy — Omeprazole moving fast. Pharmacist requested double order for July.", lat: 0.3109, lng: 32.5815 },
    ];
    for (const v of pharmVisits) {
      const ph = PHARMACIES[v.pharmIdx];
      const dateStr = `2026-06-30T${v.time}Z`;
      if (await skip(client,
        `SELECT 1 FROM "PharmacyActivity" WHERE user_id=$1 AND pharmacy_id=$2 AND date::date = '2026-06-30'`,
        [USERS.nakato, ph.id]
      )) {
        console.log(`  skip  ${ph.name}`);
        continue;
      }
      await client.query(`
        INSERT INTO "PharmacyActivity" (id, user_id, pharmacy_id, date, gps_lat, gps_lng, outcome, timing_anomaly)
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, false)
      `, [USERS.nakato, ph.id, dateStr, v.lat, v.lng, v.outcome]);
      console.log(`  ok    ${ph.name} @ ${v.time.slice(0,5)} UTC`);
    }
  }

  // ── Emmanuel Lutaaya — 3 visits today ───────────────────────────────────
  console.log("\n── Emmanuel Lutaaya — Visits (June 30) ──────");
  const emmVisits = [
    { time: "06:30:00", docIdx: 4, prodIdx: 0, samples: 5 },
    { time: "08:00:00", docIdx: 5, prodIdx: 3, samples: 3 },
    { time: "10:00:00", docIdx: 6, prodIdx: 5, samples: 4 },
  ];
  for (const v of emmVisits) {
    const doc = kampala[v.docIdx % kampala.length];
    const prod = PRODUCTS[v.prodIdx];
    const dateStr = `2026-06-30T${v.time}Z`;
    if (await skip(client,
      `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
      [USERS.emmanuel, doc.id, dateStr]
    )) { console.log(`  skip  ${doc.doctor_name}`); continue; }
    await client.query(`
      INSERT INTO "DoctorActivity"
        (id, user_id, doctor_id, focused_product_id, samples_given, date, gps_lat, gps_lng, gps_anomaly, visit_status)
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, false, 'VISITED')
    `, [USERS.emmanuel, doc.id, prod.id, v.samples, dateStr, 0.315 + Math.random()*0.02, 32.585 + Math.random()*0.02]);
    console.log(`  ok    ${doc.doctor_name} @ ${v.time.slice(0,5)} UTC`);
  }

  // ── Nambi Patricia — 2 visits today ─────────────────────────────────────
  console.log("\n── Nambi Patricia — Visits (June 30) ────────");
  const nambiVisits = [
    { time: "07:00:00", docIdx: 2, prodIdx: 1, samples: 4 },
    { time: "09:30:00", docIdx: 3, prodIdx: 4, samples: 3 },
  ];
  for (const v of nambiVisits) {
    const doc = kampala[v.docIdx % kampala.length];
    const prod = PRODUCTS[v.prodIdx];
    const dateStr = `2026-06-30T${v.time}Z`;
    if (await skip(client,
      `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
      [USERS.nambi, doc.id, dateStr]
    )) { console.log(`  skip  ${doc.doctor_name}`); continue; }
    await client.query(`
      INSERT INTO "DoctorActivity"
        (id, user_id, doctor_id, focused_product_id, samples_given, date, gps_lat, gps_lng, gps_anomaly, visit_status)
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, false, 'VISITED')
    `, [USERS.nambi, doc.id, prod.id, v.samples, dateStr, 0.310, 32.581]);
    console.log(`  ok    ${doc.doctor_name} @ ${v.time.slice(0,5)} UTC`);
  }

  // ── Daily reports June 28-30 ─────────────────────────────────────────────
  // June 28 = Saturday, June 29 = Sunday (no field work)
  // June 30 = Monday — Nakato's report for today (SUBMITTED)
  console.log("\n── Daily Reports June 28-30 ──────────────────");

  const reports30 = [
    {
      userId: USERS.nakato,
      name: "Nakato Sarah",
      date: "2026-06-30",
      status: "SUBMITTED",
      visits: 5,
      samples: 22,
      summary: "Strong final day of June. Visited 5 HCPs across Kampala — Mulago, Nsambya, IHK and Mengo clusters. Amoxil 500mg generating strong interest as first-line choice. Omeprazole line confirmed for 3 new patient trials. Afternoon pharmacy coverage at Quality Chemist and City Pharmacy — both restocking ahead of July. Month target reached.",
      reviewedBy: null, reviewedAt: null,
    },
    {
      userId: USERS.emmanuel,
      name: "Emmanuel Lutaaya",
      date: "2026-06-30",
      status: "SUBMITTED",
      visits: 3,
      samples: 12,
      summary: "3 doctor calls completed. Amlodipine detailing at Kibuli Hospital — good receptivity. Ciprofloxacin comparison against competitor brand performed well.",
      reviewedBy: null, reviewedAt: null,
    },
    {
      userId: USERS.nambi,
      name: "Nambi Patricia",
      date: "2026-06-30",
      status: "SUBMITTED",
      visits: 2,
      samples: 7,
      summary: "2 HCP visits — Coartem and Omeprazole lines covered. Month end review with team planned for tomorrow.",
      reviewedBy: null, reviewedAt: null,
    },
  ];

  for (const r of reports30) {
    if (await skip(client,
      `SELECT 1 FROM "DailyReport" WHERE user_id=$1 AND report_date=$2`,
      [r.userId, r.date]
    )) { console.log(`  skip  ${r.name} ${r.date}`); continue; }
    await client.query(`
      INSERT INTO "DailyReport"
        (id, user_id, report_date, summary, visits_count, samples_count, status, reviewed_by, reviewed_at, created_at, updated_at)
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    `, [r.userId, r.date, r.summary, r.visits, r.samples, r.status, r.reviewedBy, r.reviewedAt]);
    console.log(`  ok    ${r.name} — ${r.date} → ${r.status} (${r.visits} visits)`);
  }

  // ── Update June cycle visit counts for June 30 ──────────────────────────
  console.log("\n── Sync June cycle visits_done (June 30) ────");
  for (const userId of [USERS.nakato, USERS.emmanuel, USERS.nambi]) {
    const cycle = await client.query(
      `SELECT id FROM "CallCycle" WHERE user_id=$1 AND month=6 AND year=2026`, [userId]
    );
    if (!cycle.rows[0]) { console.log(`  skip  no June cycle for ${userId.slice(0,8)}`); continue; }
    const cycleId = cycle.rows[0].id;
    const items = await client.query(
      `SELECT id, doctor_id, frequency FROM "CallCycleItem" WHERE cycle_id=$1`, [cycleId]
    );
    for (const item of items.rows) {
      const vc = await client.query(
        `SELECT COUNT(*) FROM "DoctorActivity"
         WHERE user_id=$1 AND doctor_id=$2 AND date >= '2026-06-01' AND date < '2026-07-01'`,
        [userId, item.doctor_id]
      );
      const done = Math.min(parseInt(vc.rows[0].count), item.frequency);
      await client.query(`UPDATE "CallCycleItem" SET visits_done=$1 WHERE id=$2`, [done, item.id]);
    }
    console.log(`  ok    synced ${items.rows.length} cycle items`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOMORROW: JULY 1, 2026
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════");
  console.log("  TOMORROW: JULY 1, 2026 (Tuesday)");
  console.log("══════════════════════════════════════════════");

  // ── July 2026 Call Cycles — SUBMITTED (just sent for approval) ───────────
  console.log("\n── July 2026 Call Cycles (SUBMITTED) ────────");
  const julyCycles = [
    { userId: USERS.nakato,    name: "Nakato Sarah",     status: "SUBMITTED" },
    { userId: USERS.emmanuel,  name: "Emmanuel Lutaaya", status: "SUBMITTED" },
    { userId: USERS.nambi,     name: "Nambi Patricia",   status: "APPROVED", approvedAt: "2026-06-30T14:00:00Z" },
  ];

  const julyCycleIds = {};
  for (const spec of julyCycles) {
    if (await skip(client,
      `SELECT 1 FROM "CallCycle" WHERE user_id=$1 AND month=7 AND year=2026`, [spec.userId]
    )) {
      const row = await client.query(
        `SELECT id FROM "CallCycle" WHERE user_id=$1 AND month=7 AND year=2026`, [spec.userId]
      );
      julyCycleIds[spec.userId] = row.rows[0]?.id;
      console.log(`  skip  ${spec.name} July cycle`);
      continue;
    }
    const res = await client.query(`
      INSERT INTO "CallCycle" (id, user_id, month, year, status, approved_at, locked_at, created_at)
      VALUES (gen_random_uuid()::text, $1, 7, 2026, $2, $3, null, '2026-06-29T16:00:00Z') RETURNING id
    `, [spec.userId, spec.status, spec.approvedAt ?? null]);
    julyCycleIds[spec.userId] = res.rows[0].id;
    console.log(`  ok    ${spec.name} → July cycle ${spec.status}`);
  }

  // Add July cycle items for Nakato (7 doctors on cycle)
  const nakatoCycleId = julyCycleIds[USERS.nakato];
  if (nakatoCycleId) {
    const tierMap = ["A","A","B","B","C","C","C"];
    const freqMap = { A: 4, B: 2, C: 1 };
    for (let i = 0; i < Math.min(7, kampala.length); i++) {
      const doc = kampala[i];
      const tier = tierMap[i];
      const freq = freqMap[tier];
      if (await skip(client,
        `SELECT 1 FROM "CallCycleItem" WHERE cycle_id=$1 AND doctor_id=$2`, [nakatoCycleId, doc.id]
      )) continue;
      await client.query(`
        INSERT INTO "CallCycleItem" (id, cycle_id, doctor_id, tier, frequency, visits_done)
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 0)
      `, [nakatoCycleId, doc.id, tier, freq]);
    }
    console.log(`  ok    Nakato July cycle: ${Math.min(7, kampala.length)} doctors`);
  }

  // Emmanuel cycle items
  const emmCycleId = julyCycleIds[USERS.emmanuel];
  if (emmCycleId) {
    for (let i = 0; i < Math.min(5, kampala.length); i++) {
      const doc = kampala[(i + 4) % kampala.length];
      const tier = i < 2 ? "A" : i < 4 ? "B" : "C";
      const freq = tier === "A" ? 4 : tier === "B" ? 2 : 1;
      if (await skip(client,
        `SELECT 1 FROM "CallCycleItem" WHERE cycle_id=$1 AND doctor_id=$2`, [emmCycleId, doc.id]
      )) continue;
      await client.query(`
        INSERT INTO "CallCycleItem" (id, cycle_id, doctor_id, tier, frequency, visits_done)
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 0)
      `, [emmCycleId, doc.id, tier, freq]);
    }
    console.log(`  ok    Emmanuel July cycle: 5 doctors`);
  }

  // ── July 2026 Tour Plans ─────────────────────────────────────────────────
  console.log("\n── July 2026 Tour Plans (SUBMITTED) ─────────");
  const julyPlans = [
    { userId: USERS.nakato,   name: "Nakato Sarah",     status: "SUBMITTED" },
    { userId: USERS.emmanuel, name: "Emmanuel Lutaaya", status: "SUBMITTED" },
  ];
  const planIds = {};
  for (const spec of julyPlans) {
    if (await skip(client,
      `SELECT 1 FROM "TourPlan" WHERE user_id=$1 AND month=7 AND year=2026`, [spec.userId]
    )) {
      const row = await client.query(
        `SELECT id FROM "TourPlan" WHERE user_id=$1 AND month=7 AND year=2026`, [spec.userId]
      );
      planIds[spec.userId] = row.rows[0]?.id;
      console.log(`  skip  ${spec.name} July plan`);
      continue;
    }
    const res = await client.query(`
      INSERT INTO "TourPlan" (id, user_id, month, year, status, reviewed_at, created_at)
      VALUES (gen_random_uuid()::text, $1, 7, 2026, $2, null, '2026-06-29T17:00:00Z') RETURNING id
    `, [spec.userId, spec.status]);
    planIds[spec.userId] = res.rows[0].id;
    console.log(`  ok    ${spec.name} → July plan ${spec.status}`);
  }

  // ── Nakato's July 1 morning visits (2 early calls — day just started) ────
  console.log("\n── Nakato Sarah — First Calls July 1 ────────");
  const july1Visits = [
    { time: "06:00:00", docIdx: 0, prodIdx: 0, samples: 6, outcome: "First call of July — Amoxil 500mg. Dr confirmed as first-line prescriber. Strong start." },
    { time: "07:45:00", docIdx: 1, prodIdx: 4, samples: 4, outcome: "Omeprazole follow-up from June. Prescription confirmed for 10 new patients." },
  ];
  for (const v of july1Visits) {
    const doc = kampala[v.docIdx % kampala.length];
    const prod = PRODUCTS[v.prodIdx];
    const dateStr = `2026-07-01T${v.time}Z`;
    if (await skip(client,
      `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
      [USERS.nakato, doc.id, dateStr]
    )) { console.log(`  skip  ${doc.doctor_name} July 1`); continue; }
    await client.query(`
      INSERT INTO "DoctorActivity"
        (id, user_id, doctor_id, focused_product_id, samples_given, date, gps_lat, gps_lng, gps_anomaly, outcome, visit_status)
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, false, $8, 'VISITED')
    `, [USERS.nakato, doc.id, prod.id, v.samples, dateStr, 0.3376, 32.5772, v.outcome]);
    console.log(`  ok    ${doc.doctor_name} @ ${v.time.slice(0,5)} UTC (July 1)`);
  }

  // ── Sample Balances — update to reflect June 30 state ───────────────────
  console.log("\n── Sample Balances (end of June) ─────────────");
  const balanceSpecs = [
    { userId: USERS.nakato,    prodIdx: 0, issued: 150, given: 95,  name: "Nakato — Amoxil" },
    { userId: USERS.nakato,    prodIdx: 4, issued: 80,  given: 52,  name: "Nakato — Omeprazole" },
    { userId: USERS.nakato,    prodIdx: 5, issued: 100, given: 59,  name: "Nakato — Ciprofloxacin" },
    { userId: USERS.nakato,    prodIdx: 1, issued: 80,  given: 37,  name: "Nakato — Coartem" },
    { userId: USERS.emmanuel,  prodIdx: 0, issued: 120, given: 68,  name: "Emmanuel — Amoxil" },
    { userId: USERS.emmanuel,  prodIdx: 3, issued: 60,  given: 29,  name: "Emmanuel — Amlodipine" },
    { userId: USERS.nambi,     prodIdx: 0, issued: 80,  given: 41,  name: "Nambi — Amoxil" },
    { userId: USERS.nambi,     prodIdx: 4, issued: 60,  given: 24,  name: "Nambi — Omeprazole" },
  ];

  for (const sb of balanceSpecs) {
    const prod = PRODUCTS[sb.prodIdx];
    const ex = await client.query(
      `SELECT id FROM "SampleBalance" WHERE user_id=$1 AND product_id=$2 AND month=6 AND year=2026`,
      [sb.userId, prod.id]
    );
    if (ex.rows[0]) {
      await client.query(
        `UPDATE "SampleBalance" SET issued=$1, given=$2, updated_at=NOW() WHERE id=$3`,
        [sb.issued, sb.given, ex.rows[0].id]
      );
      console.log(`  upd   ${sb.name}: ${sb.issued} issued / ${sb.given} given`);
    } else {
      await client.query(`
        INSERT INTO "SampleBalance" (id, user_id, product_id, month, year, issued, given, updated_at)
        VALUES (gen_random_uuid()::text, $1, $2, 6, 2026, $3, $4, NOW())
      `, [sb.userId, prod.id, sb.issued, sb.given]);
      console.log(`  ok    ${sb.name}: ${sb.issued} issued / ${sb.given} given`);
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║    DEMO SEED COMPLETE — June 30 & July 1, 2026                 ║
╠════════════════════════════════════════════════════════════════╣
║  TODAY (June 30)                                                ║
║   • Nakato Sarah: 5 doctor visits + 2 pharmacy visits          ║
║   • Emmanuel Lutaaya: 3 doctor visits                          ║
║   • Nambi Patricia: 2 doctor visits                            ║
║   • All 3 submitted daily reports (pending supervisor review)  ║
║                                                                 ║
║  TOMORROW (July 1)                                              ║
║   • Nakato's July cycle SUBMITTED — in supervisor queue        ║
║   • Emmanuel's July cycle SUBMITTED                            ║
║   • 2 early morning visits already logged by Nakato            ║
║   • July tour plans submitted for review                       ║
║                                                                 ║
║  LOGIN: rep@kibagrep.dev / Test1234!  (Nakato Sarah)           ║
║         supervisor@kibagrep.dev / Test1234!  (Mugisha Brian)   ║
║         manager@kibagrep.dev / Test1234!  (Kayiira Moses)      ║
║         country@kibagrep.dev / Test1234!  (Nalwanga Agnes)     ║
╚════════════════════════════════════════════════════════════════╝`);

  await client.end();
}

main().catch((e) => { console.error("\n❌ Error:", e.message, "\n", e.stack); process.exit(1); });
