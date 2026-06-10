import asyncHandler from "express-async-handler";
import { createWorkbook } from "../utils/excel.util.js";

// ── GET /api/report/my-summary?month=&year= ───────────────────────────────
// Returns monthly performance stats for the requesting rep.
export const getMySummary = asyncHandler(async (req, res) => {
  const userId    = req.user.id;
  const now       = new Date();
  const month     = parseInt(req.query.month) || now.getMonth() + 1;
  const year      = parseInt(req.query.year)  || now.getFullYear();

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd   = new Date(Date.UTC(year, month, 1));

  const [
    doctorVisits,
    pharmacyVisits,
    samplesAgg,
    ncaCount,
    reports,
    callCycle,
    sampleBalances,
  ] = await Promise.all([
    prisma.doctorActivity.count({
      where: { user_id: userId, date: { gte: periodStart, lt: periodEnd }, nca_reason: null },
    }),
    prisma.pharmacyActivity.count({
      where: { user_id: userId, date: { gte: periodStart, lt: periodEnd } },
    }),
    prisma.doctorActivity.aggregate({
      where: { user_id: userId, date: { gte: periodStart, lt: periodEnd }, nca_reason: null },
      _sum: { samples_given: true },
    }),
    prisma.doctorActivity.count({
      where: { user_id: userId, date: { gte: periodStart, lt: periodEnd }, nca_reason: { not: null } },
    }),
    prisma.dailyReport.findMany({
      where: { user_id: userId, report_date: { gte: periodStart, lt: periodEnd } },
      select: { status: true },
    }),
    prisma.callCycle.findUnique({
      where: { user_id_month_year: { user_id: userId, month, year } },
      select: {
        status: true,
        items: { select: { visits_done: true, target_visits: true, tier: true } },
      },
    }),
    prisma.sampleBalance.findMany({
      where: { user_id: userId },
      include: { product: { select: { id: true, product_name: true } } },
    }),
  ]);

  // Count working days up to today in this month
  const today = now < periodEnd ? now : new Date(periodEnd.getTime() - 1);
  let workingDays = 0;
  const cursor = new Date(periodStart);
  while (cursor <= today) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) workingDays++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const submitted = reports.filter((r) => r.status !== "DRAFT").length;
  const approved  = reports.filter((r) => r.status === "APPROVED").length;

  // Call cycle coverage
  const cyclePlanned = callCycle?.items.length ?? 0;
  const cycleVisited = callCycle?.items.filter((i) => i.visits_done >= 1).length ?? 0;

  res.json({
    success: true,
    data: {
      month, year,
      doctor_visits: doctorVisits,
      pharmacy_visits: pharmacyVisits,
      total_visits: doctorVisits + pharmacyVisits,
      samples_given: samplesAgg._sum.samples_given ?? 0,
      nca_count: ncaCount,
      working_days: workingDays,
      reports_submitted: submitted,
      reports_approved: approved,
      cycle_planned: cyclePlanned,
      cycle_visited: cycleVisited,
      cycle_status: callCycle?.status ?? null,
      sample_balances: sampleBalances.map((b) => ({
        id: b.id,
        product_id: b.product_id,
        product_name: b.product?.product_name ?? "",
        issued: b.issued,
        given: b.given,
        remaining: b.issued - b.given,
      })),
    },
  });
});
import {
  createWorksheet,
  generateFeedbackSection,
  generatePharmacyCoverageSection,
} from "../utils/worksheet.util.js";
import prisma from "../config/prisma.config.js";

// Derive abbreviation: first uppercase letters, or first 4 consonants
const abbr = (name = "") =>
  name.replace(/[aeiou\s]/gi, "").slice(0, 4).toUpperCase() || name.slice(0, 3).toUpperCase();

const monthName = (m) =>
  ["January","February","March","April","May","June",
   "July","August","September","October","November","December"][m - 1];

const pad2 = (n) => String(n).padStart(2, "0");

export const generateReport = asyncHandler(async (req, res) => {
  const requestingUser = req.user;
  const targetUserId   = req.query.user_id || requestingUser.id;
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
  const year  = parseInt(req.query.year)  || new Date().getFullYear();

  const allowedRoles = ["Supervisor","Manager","COUNTRY_MGR","SALES_ADMIN","SUPER_ADMIN"];
  if (targetUserId !== requestingUser.id && !allowedRoles.includes(requestingUser.role)) {
    res.status(403);
    throw new Error("Not authorised to generate reports for other users");
  }

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd   = new Date(Date.UTC(year, month, 1));

  const repUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, firstname: true, lastname: true, company_id: true },
  });
  if (!repUser) { res.status(404); throw new Error("User not found"); }
  // Cross-company report generation is only allowed for SUPER_ADMIN and COUNTRY_MGR
  const crossCompanyRoles = ["SUPER_ADMIN", "COUNTRY_MGR"];
  if (
    targetUserId !== requestingUser.id &&
    repUser.company_id !== requestingUser.company_id &&
    !crossCompanyRoles.includes(requestingUser.role)
  ) {
    res.status(403);
    throw new Error("Cannot generate reports for users outside your company");
  }

  const [doctorActs, pharmacyActs, products] = await Promise.all([
    prisma.doctorActivity.findMany({
      where: { user_id: targetUserId, date: { gte: periodStart, lt: periodEnd } },
      include: {
        doctor:            { select: { id: true, doctor_name: true, speciality: true, location: true, town: true } },
        focused_product:   { select: { id: true, product_name: true } },
        products_detailed: { select: { id: true, product_name: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.pharmacyActivity.findMany({
      where: { user_id: targetUserId, date: { gte: periodStart, lt: periodEnd } },
      include: {
        pharmacy: { select: { id: true, pharmacy_name: true, location: true, town: true, contact: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.product.findMany({
      where: { company_id: repUser.company_id ?? "NONE" },
      select: { id: true, product_name: true },
      orderBy: { product_name: "asc" },
    }),
  ]);

  const repName    = `${repUser.firstname} ${repUser.lastname}`.trim();
  const prodAbbrs  = products.map((p) => abbr(p.product_name));   // e.g. ["ARC","NFX","RFX"]
  const prodIdToIdx = {};
  products.forEach((p, i) => { prodIdToIdx[p.id] = i; });

  // Group by calendar day
  const groupByDay = (acts) => {
    const map = {};
    for (const a of acts) {
      const key = new Date(a.date).toISOString().slice(0, 10);
      (map[key] = map[key] ?? []).push(a);
    }
    return map;
  };
  const doctorByDay   = groupByDay(doctorActs);
  const pharmacyByDay = groupByDay(pharmacyActs);

  const allDays = [...new Set([...Object.keys(doctorByDay), ...Object.keys(pharmacyByDay)])].sort();

  // Veeram main column headers
  const mainHeaders = [
    "S.NO", "CODE", "DOCTOR'S NAME", "SPLTY", "FACILITY",
    "Focus Product", "BRANDS PROMOTED AND SAMPLES/INPUTS ISSUED",
  ];

  const workbook = createWorkbook();
  workbook.creator = repName;
  workbook.created = new Date();

  if (allDays.length === 0) {
    const ws = workbook.addWorksheet("No Data");
    ws.getCell("A1").value = `No activities recorded for ${monthName(month)} ${year}`;
    ws.getCell("A1").font  = { italic: true };
  }

  // Cumulative counters (persist across days)
  const cumSamplesByProduct = {};   // productId → total samples
  let   cumDoctorsMet       = 0;

  for (const dayKey of allDays) {
    const dayDate     = new Date(dayKey + "T00:00:00Z");
    const dayNum      = dayDate.getUTCDate();
    const sheetName   = `${dayNum} ${monthName(month)} ${year}`;
    const dateLabel   = `${pad2(dayNum)}/${pad2(month)}/${year}`;

    const dayDoctorActs   = doctorByDay[dayKey]   ?? [];
    const dayPharmacyActs = pharmacyByDay[dayKey]  ?? [];

    // ── Build doctor data rows (Veeram format) ─────────────────────────────
    // Each row: [sno, code, name, specialty, facility, focus_product, ...per_product_cols]
    // Per product col: sample qty if focused product, "D" if detailed, blank otherwise
    const data = dayDoctorActs.map((act, idx) => {
      const detailedIds = new Set((act.products_detailed ?? []).map((p) => p.id));
      const productCols = products.map((p) => {
        if (act.nca_reason) return "";
        if (p.id === act.focused_product?.id && act.samples_given > 0) return act.samples_given;
        if (detailedIds.has(p.id)) return "D";
        return "";
      });
      return [
        idx + 1,
        act.doctor?.id?.slice(-5) ?? "",
        act.nca_reason
          ? `NCA — ${act.doctor?.doctor_name ?? "Unknown"}`
          : (act.doctor?.doctor_name ?? "Unknown"),
        (act.doctor?.speciality ?? [])[0] ?? "",
        act.doctor?.location ?? "",
        act.focused_product?.product_name ?? "",
        ...productCols,
      ];
    });

    // ── Update cumulative counters ─────────────────────────────────────────
    let todaySamples = 0;
    for (const act of dayDoctorActs) {
      if (!act.nca_reason && act.samples_given > 0) {
        todaySamples += act.samples_given;
        if (act.focused_product?.id) {
          cumSamplesByProduct[act.focused_product.id] =
            (cumSamplesByProduct[act.focused_product.id] ?? 0) + act.samples_given;
        }
      }
      if (!act.nca_reason) cumDoctorsMet++;
    }

    // ── Determine place (first town of the day) ────────────────────────────
    const towns = dayDoctorActs.map((a) => a.doctor?.town).filter(Boolean);
    const place = towns[0] ?? dayPharmacyActs[0]?.pharmacy?.town ?? "";

    // ── Build worksheet ────────────────────────────────────────────────────
    const worksheet = await createWorksheet(
      workbook,
      sheetName,
      { name: repName, date: dateLabel, place },
      mainHeaders,
      prodAbbrs,
      data,
    );

    // ── Feedback section at row 23 ─────────────────────────────────────────
    generateFeedbackSection(worksheet, 23, {
      openingQty:          "",              // not tracked in system yet
      sampledToday:        todaySamples,
      balanceSamples:      "",              // would need sample balance data
      cumulativeDoctors:   cumDoctorsMet,
      cumulativeAvg:       allDays.indexOf(dayKey) > 0
        ? (cumDoctorsMet / (allDays.indexOf(dayKey) + 1)).toFixed(1)
        : cumDoctorsMet,
      cumulativeFocusDrs:  dayDoctorActs.filter((a) => !a.nca_reason && a.focused_product).length,
    });

    // ── Pharmacy coverage at row 30 ────────────────────────────────────────
    // Build pharmacy rows — map stock_noted (productId→qty) to abbr keys
    const pharmacyRows = dayPharmacyActs.map((act) => {
      const stockRaw = act.stock_noted ?? {};   // { productId: qty }
      const stockByAbbr = {};
      products.forEach((p, i) => {
        const qty = stockRaw[p.id] ?? 0;
        if (qty > 0) stockByAbbr[prodAbbrs[i]] = qty;
      });
      return {
        name:    act.pharmacy?.pharmacy_name ?? "",
        contact: act.pharmacy?.contact       ?? "",
        stock:   stockByAbbr,
      };
    });

    generatePharmacyCoverageSection(worksheet, 30, prodAbbrs, pharmacyRows);
  }

  // ── Stream as downloadable Excel ──────────────────────────────────────────
  const filename = `${repName.replace(/\s+/g, "_")}_${monthName(month)}_${year}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});
