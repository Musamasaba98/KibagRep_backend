/**
 * seed_today.js — Populates today (March 12, 2026) with:
 *  1. Tour plan day + entries for today (4 morning HCPs + 3 evening pharmacies)
 *  2. 3 visit activities for today so the rep has something to report
 *  3. A second rep (rep2@kibagrep.dev) with a SUBMITTED call cycle (for supervisor to review)
 *  4. A SUBMITTED daily report from yesterday (March 11) ready for supervisor approval
 *
 * Run: node seed_today.js
 */
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcrypt";

const { Client } = pg;
const TODAY = 12;
const MONTH = 3;
const YEAR  = 2026;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ── Fetch existing IDs ────────────────────────────────────────────────────
  const repId  = (await client.query(`SELECT id FROM "User" WHERE email=$1`,['rep@kibagrep.dev'])).rows[0].id;
  const supId  = (await client.query(`SELECT id FROM "User" WHERE email=$1`,['supervisor@kibagrep.dev'])).rows[0].id;
  const coId   = (await client.query(`SELECT id FROM "Company" LIMIT 1`)).rows[0].id;
  const planId = (await client.query(`SELECT id FROM "TourPlan" WHERE user_id=$1 AND month=$2 AND year=$3`,[repId,MONTH,YEAR])).rows[0]?.id;
  const cycleId= (await client.query(`SELECT id FROM "CallCycle" WHERE user_id=$1 AND month=$2 AND year=$3`,[repId,MONTH,YEAR])).rows[0]?.id;
  const prods  = (await client.query(`SELECT id,product_name FROM "Product" WHERE company_id=$1 ORDER BY product_name`,[coId])).rows;
  const doctors= (await client.query(`SELECT id,doctor_name,town FROM "Doctor" WHERE doctor_name=ANY($1::text[])`,
    [['Dr. Agnes Tumwesigye','Dr. Denis Ochieng','Dr. Fatuma Nakigozi','Dr. Lydia Atuhaire','Dr. Moses Mwesigwa','Dr. Samuel Byaruhanga']])).rows;
  const kampDocs=(await client.query(`SELECT id,doctor_name,town FROM "Doctor" WHERE doctor_name=ANY($1::text[])`,
    [['Dr. James Kato','Dr. Grace Namukasa','Dr. Robert Ssemwogerere','Dr. Ibrahim Ssekandi','Dr. Prossy Namutebi','Dr. Lydia Atuhaire']])).rows;
  const pharmRows=(await client.query(`SELECT id,pharmacy_name FROM "Pharmacy" WHERE pharmacy_name=ANY($1::text[])`,
    [['Kisementi Chemist','Nateete Drug Shop','City Pharmacy']])).rows;
  const cycleItemsRows=(await client.query(`SELECT id,doctor_id FROM "CallCycleItem" WHERE cycle_id=$1`,[cycleId])).rows;

  const p0=prods[0]?.id, p1=prods[1]?.id, p2=prods[2]?.id, p3=prods[3]?.id, p4=prods[4]?.id, p5=prods[5]?.id;

  console.log(`Rep: ${repId}\nPlan: ${planId}\nCycle: ${cycleId}\nDoctors: ${doctors.length}\nProducts: ${prods.length}`);

  // ── 1. Tour Plan Day 12 ───────────────────────────────────────────────────
  console.log("\n── Tour Plan Day 12 ──────────────────────────────────");
  const dayExists = (await client.query(`SELECT id FROM "TourPlanDay" WHERE plan_id=$1 AND day_number=$2`,[planId,TODAY])).rows[0];
  if (!dayExists && planId) {
    await client.query(
      `INSERT INTO "TourPlanDay" (id,plan_id,day_number,morning_area,evening_area,daily_allowance,transport,airtime,accommodation,other_costs,is_off_day)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,0,0,false)`,
      [planId,TODAY,'IHK, Case Medical, Uganda Cancer Inst.','Kisementi & Nateete Pharmacies',30000,10000,5000]
    );
    console.log("  ok    TourPlanDay 12");
  } else { console.log("  skip  TourPlanDay 12"); }

  // ── 2. Tour Plan Entries for today ───────────────────────────────────────
  console.log("\n── Tour Plan Entries Day 12 ──────────────────────────");
  const existingEntries = (await client.query(`SELECT id FROM "TourPlanEntry" WHERE plan_id=$1 AND day_number=$2`,[planId,TODAY])).rows;
  if (existingEntries.length === 0 && planId) {
    const morningDocs = kampDocs.slice(2, 6); // 4 doctors
    for (let i = 0; i < morningDocs.length; i++) {
      const doc = morningDocs[i];
      if (!doc) continue;
      const ci = cycleItemsRows.find(ci => ci.doctor_id === doc.id);
      await client.query(
        `INSERT INTO "TourPlanEntry" (id,plan_id,day_number,entry_type,slot,doctor_id,cycle_item_id,sort_order)
         VALUES (gen_random_uuid()::text,$1,$2,'CLINICIAN','MORNING',$3,$4,$5)`,
        [planId, TODAY, doc.id, ci?.id ?? null, i]
      );
      console.log(`  ok    Morning: ${doc.doctor_name}`);
    }
    for (let i = 0; i < pharmRows.length; i++) {
      const ph = pharmRows[i];
      await client.query(
        `INSERT INTO "TourPlanEntry" (id,plan_id,day_number,entry_type,slot,pharmacy_id,pharmacy_name,sort_order)
         VALUES (gen_random_uuid()::text,$1,$2,'PHARMACY','EVENING',$3,$4,$5)`,
        [planId, TODAY, ph.id, ph.pharmacy_name, i]
      );
      console.log(`  ok    Evening: ${ph.pharmacy_name}`);
    }
  } else { console.log(`  skip  ${existingEntries.length} entries already exist`); }

  // ── 3. Today's Visit Activities (March 12) ────────────────────────────────
  console.log("\n── Today's Visits (March 12) ─────────────────────────");
  const visits = [
    { date: "2026-03-12T08:30:00Z", doc: kampDocs.find(d=>d.doctor_name==='Dr. Robert Ssemwogerere'), prod: p2, samples: 5, outcome: "Receptive — requested more Ciprofloxacin samples" },
    { date: "2026-03-12T10:00:00Z", doc: kampDocs.find(d=>d.doctor_name==='Dr. Ibrahim Ssekandi'),   prod: p3, samples: 3, outcome: "Good discussion on Metformin dosing" },
    { date: "2026-03-12T11:30:00Z", doc: kampDocs.find(d=>d.doctor_name==='Dr. Prossy Namutebi'),    prod: p1, samples: 4, outcome: "Agreed to trial Coartem for paeds ward" },
  ];

  for (const v of visits) {
    if (!v.doc || !v.prod) { console.log(`  skip  (missing doc or prod)`); continue; }
    const exists = (await client.query(
      `SELECT 1 FROM "DoctorActivity" WHERE user_id=$1 AND doctor_id=$2 AND date=$3`,
      [repId, v.doc.id, v.date]
    )).rows.length > 0;
    if (!exists) {
      await client.query(
        `INSERT INTO "DoctorActivity" (id,user_id,doctor_id,focused_product_id,samples_given,outcome,date)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6)`,
        [repId, v.doc.id, v.prod, v.samples, v.outcome, v.date]
      );
      // Increment cycle item
      if (cycleId) {
        await client.query(
          `UPDATE "CallCycleItem" SET visits_done=visits_done+1 WHERE cycle_id=$1 AND doctor_id=$2`,
          [cycleId, v.doc.id]
        );
      }
      console.log(`  ok    ${v.date.split('T')[1].slice(0,5)} → ${v.doc.doctor_name} (${v.samples} samples)`);
    } else { console.log(`  skip  ${v.doc.doctor_name}`); }
  }

  // ── 4. Submit yesterday's daily report (March 11) ─────────────────────────
  console.log("\n── Submit March 11 Daily Report ──────────────────────");
  const reportDate = new Date("2026-03-11T00:00:00.000Z");
  const existingReport = (await client.query(
    `SELECT id,status FROM "DailyReport" WHERE user_id=$1 AND report_date=$2`,
    [repId, reportDate]
  )).rows[0];

  const visitsOnDate11 = (await client.query(
    `SELECT COUNT(*) FROM "DoctorActivity" WHERE user_id=$1 AND date>='2026-03-11' AND date<'2026-03-12'`,
    [repId]
  )).rows[0].count;

  if (!existingReport) {
    await client.query(
      `INSERT INTO "DailyReport" (id,user_id,report_date,visits_count,samples_count,status,summary,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,'SUBMITTED',$5,NOW())`,
      [repId, reportDate, visitsOnDate11, 7,
       "Mulago cluster completed. 2 of 4 morning calls done. Good response from Dr. Gingo Dorothy on Omeprazole. Evening pharmacy visits at Quality Chemist and City Pharmacy confirmed stock is adequate."]
    );
    console.log(`  ok    March 11 report SUBMITTED (${visitsOnDate11} visits)`);
  } else if (existingReport.status === 'DRAFT') {
    await client.query(
      `UPDATE "DailyReport" SET status='SUBMITTED',summary=$1,visits_count=$2,samples_count=7,submitted_at=NOW() WHERE id=$3`,
      ["Mulago cluster completed. Good response from Dr. Gingo Dorothy on Omeprazole. Evening pharmacy stock confirmed.", visitsOnDate11, existingReport.id]
    );
    console.log(`  upd   March 11 report → SUBMITTED`);
  } else { console.log(`  skip  March 11 report already ${existingReport.status}`); }

  // ── 5. Second rep with SUBMITTED call cycle ───────────────────────────────
  console.log("\n── Second Rep + Pending Call Cycle ───────────────────");
  const hashed = await bcrypt.hash("Test1234!", 10);

  let rep2Id;
  const existRep2 = (await client.query(`SELECT id FROM "User" WHERE email=$1`,['rep2@kibagrep.dev'])).rows[0];
  if (!existRep2) {
    rep2Id = (await client.query(
      `INSERT INTO "User" (id,username,firstname,lastname,email,role,gender,contact,password,company_id,date_of_joining)
       VALUES (gen_random_uuid()::text,'rep_okello','Okello','David','rep2@kibagrep.dev','MedicalRep','MALE','0701200099',$1,$2,NOW()) RETURNING id`,
      [hashed, coId]
    )).rows[0].id;
    console.log(`  ok    Created rep2: rep2@kibagrep.dev / Test1234!`);
  } else {
    rep2Id = existRep2.id;
    console.log(`  skip  rep2 already exists: ${rep2Id}`);
  }

  // MedicalRep org record
  const existMrp = (await client.query(`SELECT id FROM "MedicalRep" WHERE medical_rep_name=$1`,['Okello David'])).rows[0];
  let medRepId2;
  if (!existMrp) {
    medRepId2 = (await client.query(
      `INSERT INTO "MedicalRep" (id,medical_rep_name,date_of_joining) VALUES (gen_random_uuid()::text,'Okello David',NOW()) RETURNING id`
    )).rows[0].id;
    await client.query(
      `INSERT INTO "MedicalRepProfile" (id,"userUser_id","medicalRepMedical_rep_id") VALUES (gen_random_uuid()::text,$1,$2)`,
      [rep2Id, medRepId2]
    );
    console.log(`  ok    MedicalRep + Profile for Okello David`);
  } else {
    medRepId2 = existMrp.id;
    console.log(`  skip  MedicalRep Okello David already exists`);
  }

  // SUBMITTED call cycle for rep2
  const existCycle2 = (await client.query(
    `SELECT id FROM "CallCycle" WHERE user_id=$1 AND month=$2 AND year=$3`,
    [rep2Id, MONTH, YEAR]
  )).rows[0];

  if (!existCycle2) {
    const cycle2Id = (await client.query(
      `INSERT INTO "CallCycle" (id,user_id,month,year,status,created_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,'SUBMITTED',NOW()) RETURNING id`,
      [rep2Id, MONTH, YEAR]
    )).rows[0].id;

    // Add company doctors to rep2's cycle
    const cycleDocs = kampDocs.slice(0, 8);
    const tierMap = ["A","A","B","B","B","C","C","C"];
    const freqMap = [4, 4, 2, 2, 2, 1, 1, 1];
    for (let i = 0; i < cycleDocs.length; i++) {
      const doc = cycleDocs[i];
      if (!doc) continue;
      await client.query(
        `INSERT INTO "CallCycleItem" (id,cycle_id,doctor_id,tier,frequency,visits_done)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,0)`,
        [cycle2Id, doc.id, tierMap[i], freqMap[i]]
      );
    }
    console.log(`  ok    Cycle SUBMITTED for Okello David (${cycleDocs.length} doctors)`);
  } else {
    console.log(`  skip  Cycle already exists for rep2 (${existCycle2.id})`);
  }

  // ── 6. Add rep2 to company doctor list ────────────────────────────────────
  for (const doc of kampDocs.slice(0,6)) {
    const e = (await client.query(
      `SELECT 1 FROM "CompanyDoctor" WHERE company_id=$1 AND doctor_id=$2`,
      [coId, doc.id]
    )).rows.length > 0;
    if (!e) await client.query(
      `INSERT INTO "CompanyDoctor" (company_id,doctor_id,added_by) VALUES ($1,$2,$3)`,
      [coId, doc.id, rep2Id]
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`
── Summary ────────────────────────────────────────────
Today (March 12): 3 visits logged, tour plan entries created
March 11 report: SUBMITTED — supervisor can now approve it
Rep 2 (Okello David): rep2@kibagrep.dev / Test1234!
  └─ Call cycle SUBMITTED — supervisor can review & approve
Login as supervisor@kibagrep.dev to see pending approvals.
────────────────────────────────────────────────────────`);

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
