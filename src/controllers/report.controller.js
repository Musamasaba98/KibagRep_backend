import asyncHandler from "express-async-handler";
import { createWorkbook } from "../utils/excel.util.js";
import {
  createWorksheet,
  generateFeedbackSection,
  generatePharmacyCoverageSection,
} from "../utils/worksheet.util.js";
import prisma from "../config/prisma.config.js";

// ── GET /api/report/visit-trend?days=30 ──────────────────────────────────────
// Returns daily visit totals for the last N days (company-wide).
export const getVisitTrend = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const days  = Math.min(parseInt(req.query.days) || 30, 90);
  const since = new Date(Date.now() - days * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  const companyUserIds = (
    await prisma.user.findMany({ where: { company_id }, select: { id: true } })
  ).map((u) => u.id);

  const [docGroups, pharmGroups] = await Promise.all([
    prisma.doctorActivity.groupBy({
      by: ["date"],
      where: { user_id: { in: companyUserIds }, date: { gte: since } },
      _count: { id: true },
      orderBy: { date: "asc" },
    }),
    prisma.pharmacyActivity.groupBy({
      by: ["date"],
      where: { user_id: { in: companyUserIds }, date: { gte: since } },
      _count: { id: true },
      orderBy: { date: "asc" },
    }),
  ]);

  // Merge into daily map
  const map = {};
  docGroups.forEach((g) => {
    const key = new Date(g.date).toISOString().slice(0, 10);
    map[key] = { date: key, doctor_visits: g._count.id, pharmacy_visits: 0 };
  });
  pharmGroups.forEach((g) => {
    const key = new Date(g.date).toISOString().slice(0, 10);
    if (!map[key]) map[key] = { date: key, doctor_visits: 0, pharmacy_visits: 0 };
    map[key].pharmacy_visits = g._count.id;
  });

  const data = Object.values(map)
    .map((d) => ({ ...d, total: d.doctor_visits + d.pharmacy_visits }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({ success: true, data });
});

// ── GET /api/report/product-detailing?month=&year= ───────────────────────────
// Top products by detailing frequency company-wide this month.
export const getProductDetailing = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const now   = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year  = parseInt(req.query.year)  || now.getFullYear();

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd   = new Date(Date.UTC(year, month, 1));

  const companyUserIds = (
    await prisma.user.findMany({ where: { company_id }, select: { id: true } })
  ).map((u) => u.id);

  // Count activities where product appears in products_detailed
  const acts = await prisma.doctorActivity.findMany({
    where: { user_id: { in: companyUserIds }, date: { gte: periodStart, lt: periodEnd } },
    select: {
      focused_product_id: true,
      products_detailed:  { select: { id: true, product_name: true } },
    },
  });

  const freq = {};   // productId → { product_name, detailed, as_focus }
  acts.forEach((act) => {
    (act.products_detailed ?? []).forEach((p) => {
      if (!freq[p.id]) freq[p.id] = { product_id: p.id, product_name: p.product_name, detailed: 0, as_focus: 0 };
      freq[p.id].detailed++;
    });
    if (act.focused_product_id && freq[act.focused_product_id]) {
      freq[act.focused_product_id].as_focus++;
    }
  });

  const data = Object.values(freq).sort((a, b) => b.detailed - a.detailed);
  res.json({ success: true, data });
});

// ── GET /api/report/anomalies?days=7 ─────────────────────────────────────────
// Per-rep NCA count and GPS anomaly count for the last N days.
export const getAnomalies = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const days  = Math.min(parseInt(req.query.days) || 14, 60);
  const since = new Date(Date.now() - days * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  const reps = await prisma.user.findMany({
    where: { company_id, role: "MedicalRep" },
    select: { id: true, firstname: true, lastname: true },
    orderBy: { firstname: "asc" },
  });

  const repIds = reps.map((r) => r.id);

  const [ncaGroups, gpsGroups, lastNca] = await Promise.all([
    prisma.doctorActivity.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds }, date: { gte: since }, nca_reason: { not: null } },
      _count: { id: true },
    }),
    prisma.doctorActivity.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds }, date: { gte: since }, gps_anomaly: true },
      _count: { id: true },
    }),
    prisma.doctorActivity.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds }, nca_reason: { not: null } },
      _max: { date: true },
    }),
  ]);

  const ncaMap  = Object.fromEntries(ncaGroups.map((g) => [g.user_id, g._count.id]));
  const gpsMap  = Object.fromEntries(gpsGroups.map((g) => [g.user_id, g._count.id]));
  const lastMap = Object.fromEntries(lastNca.map((g) => [g.user_id, g._max.date]));

  const data = reps
    .map((rep) => ({
      user: rep,
      nca_count:    ncaMap[rep.id]  ?? 0,
      gps_count:    gpsMap[rep.id]  ?? 0,
      last_nca_date: lastMap[rep.id] ?? null,
    }))
    .filter((r) => r.nca_count > 0 || r.gps_count > 0)
    .sort((a, b) => (b.nca_count + b.gps_count) - (a.nca_count + a.gps_count));

  res.json({ success: true, data, days });
});

// ── GET /api/report/national-overview ────────────────────────────────────────
// Company-wide KPI snapshot for Country Manager.
export const getNationalOverview = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const now   = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year  = parseInt(req.query.year)  || now.getFullYear();

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd   = new Date(Date.UTC(year, month, 1));

  const reps = await prisma.user.findMany({
    where: { company_id, role: "MedicalRep" },
    select: { id: true },
  });
  const repIds = reps.map((r) => r.id);

  const [doctorVisits, pharmVisits, samplesAgg, uniqueDoctors, reports] = await Promise.all([
    prisma.doctorActivity.count({
      where: { user_id: { in: repIds }, date: { gte: periodStart, lt: periodEnd }, nca_reason: null },
    }),
    prisma.pharmacyActivity.count({
      where: { user_id: { in: repIds }, date: { gte: periodStart, lt: periodEnd } },
    }),
    prisma.doctorActivity.aggregate({
      where: { user_id: { in: repIds }, date: { gte: periodStart, lt: periodEnd } },
      _sum: { samples_given: true },
    }),
    prisma.doctorActivity.findMany({
      where: { user_id: { in: repIds }, date: { gte: periodStart, lt: periodEnd }, nca_reason: null },
      select: { doctor_id: true },
      distinct: ["doctor_id"],
    }),
    prisma.dailyReport.groupBy({
      by: ["status"],
      where: { user_id: { in: repIds }, report_date: { gte: periodStart, lt: periodEnd } },
      _count: { id: true },
    }),
  ]);

  const reportMap = Object.fromEntries(reports.map((r) => [r.status, r._count.id]));
  const submitted = (reportMap["SUBMITTED"] ?? 0) + (reportMap["APPROVED"] ?? 0);

  // Working days elapsed so far in the month
  const today = now < periodEnd ? now : new Date(periodEnd.getTime() - 1);
  let workingDays = 0;
  const cur = new Date(periodStart);
  while (cur <= today) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) workingDays++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  res.json({
    success: true,
    data: {
      month, year,
      total_reps: repIds.length,
      doctor_visits: doctorVisits,
      pharmacy_visits: pharmVisits,
      total_visits: doctorVisits + pharmVisits,
      unique_doctors_visited: uniqueDoctors.length,
      samples_given: samplesAgg._sum.samples_given ?? 0,
      reports_submitted: submitted,
      working_days: workingDays,
    },
  });
});

// ── GET /api/report/territory-coverage?month=&year= ──────────────────────────
// Per-territory visit counts for the current company.
export const getTerritoryCoverage = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const now   = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year  = parseInt(req.query.year)  || now.getFullYear();

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd   = new Date(Date.UTC(year, month, 1));

  const territories = await prisma.territory.findMany({
    where: { company_id },
    select: {
      id: true, name: true, territory_type: true,
      facilities: {
        select: {
          facility: {
            select: {
              id: true,
              working_doctors: { select: { doctor_id: true } },
            },
          },
        },
      },
      pharmacies: { select: { pharmacy_id: true } },
      reps:        { select: { user_id: true } },
    },
    orderBy: { name: "asc" },
  });

  const data = await Promise.all(territories.map(async (t) => {
    const doctorIds  = t.facilities.flatMap((f) => f.facility.working_doctors.map((d) => d.doctor_id));
    const pharmacyIds = t.pharmacies.map((p) => p.pharmacy_id);

    const [drVisits, phVisits, uniqueDrVisited] = await Promise.all([
      doctorIds.length > 0
        ? prisma.doctorActivity.count({
            where: { doctor_id: { in: doctorIds }, date: { gte: periodStart, lt: periodEnd }, nca_reason: null },
          })
        : 0,
      pharmacyIds.length > 0
        ? prisma.pharmacyActivity.count({
            where: { pharmacy_id: { in: pharmacyIds }, date: { gte: periodStart, lt: periodEnd } },
          })
        : 0,
      doctorIds.length > 0
        ? prisma.doctorActivity.findMany({
            where: { doctor_id: { in: doctorIds }, date: { gte: periodStart, lt: periodEnd }, nca_reason: null },
            select: { doctor_id: true },
            distinct: ["doctor_id"],
          }).then((r) => r.length)
        : 0,
    ]);

    return {
      id: t.id, name: t.name, territory_type: t.territory_type,
      rep_count:     t.reps.length,
      doctor_count:  doctorIds.length,
      pharmacy_count: pharmacyIds.length,
      doctor_visits:  drVisits,
      pharmacy_visits: phVisits,
      unique_doctors_visited: uniqueDrVisited,
      doctor_coverage_pct: doctorIds.length > 0
        ? Math.round((uniqueDrVisited / doctorIds.length) * 100)
        : null,
    };
  }));

  res.json({ success: true, data });
});

// ── GET /api/report/tier-coverage?month=&year= ────────────────────────────────
// A/B/C doctor tier visit rates for the current company.
export const getTierCoverage = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const now   = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year  = parseInt(req.query.year)  || now.getFullYear();

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd   = new Date(Date.UTC(year, month, 1));

  const repIds = (await prisma.user.findMany({
    where: { company_id, role: "MedicalRep" },
    select: { id: true },
  })).map((r) => r.id);

  // Get all doctor tiers for this company
  const tiers = await prisma.doctorCompanyTier.findMany({
    where: { company_id },
    select: { doctor_id: true, tier: true, visit_frequency: true },
  });

  const tierMap = Object.fromEntries(tiers.map((t) => [t.doctor_id, t]));

  // Get all cycle items this month
  const cycles = await prisma.callCycle.findMany({
    where: { user_id: { in: repIds }, month, year },
    select: {
      items: { select: { doctor_id: true, target_visits: true, visits_done: true } },
    },
  });

  const allItems = cycles.flatMap((c) => c.items);

  // Aggregate by tier
  const stats = { A: { planned: 0, done: 0 }, B: { planned: 0, done: 0 }, C: { planned: 0, done: 0 }, UNTIERED: { planned: 0, done: 0 } };
  allItems.forEach((item) => {
    const tier = tierMap[item.doctor_id]?.tier ?? "UNTIERED";
    const key = tier in stats ? tier : "UNTIERED";
    const freq = tierMap[item.doctor_id]?.visit_frequency ?? item.target_visits ?? 1;
    stats[key].planned += freq;
    stats[key].done    += item.visits_done;
  });

  // Also count actual visits (not just cycle-based)
  const actsByTier = { A: 0, B: 0, C: 0, UNTIERED: 0 };
  if (allItems.length > 0) {
    const allDoctorIds = [...new Set(allItems.map((i) => i.doctor_id))];
    const acts = await prisma.doctorActivity.findMany({
      where: { user_id: { in: repIds }, doctor_id: { in: allDoctorIds }, date: { gte: periodStart, lt: periodEnd }, nca_reason: null },
      select: { doctor_id: true },
    });
    acts.forEach((a) => {
      const tier = tierMap[a.doctor_id]?.tier ?? "UNTIERED";
      const key = tier in actsByTier ? tier : "UNTIERED";
      actsByTier[key]++;
    });
  }

  const data = ["A", "B", "C"].map((tier) => ({
    tier,
    planned:    stats[tier].planned,
    done:       stats[tier].done,
    actual_visits: actsByTier[tier] ?? 0,
    coverage_pct: stats[tier].planned > 0
      ? Math.round((stats[tier].done / stats[tier].planned) * 100)
      : null,
  }));

  res.json({ success: true, data });
});

// ── GET /api/report/export ────────────────────────────────────────────────────
// Excel export for Sales Admin. Generates one of 6 report types.
// Query: type, start, end, rep_id (opt), team_id (opt)
export const exportReport = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const { type, start, end, rep_id, team_id } = req.query;

  if (!type || !start || !end) {
    res.status(400); throw new Error("type, start, and end are required");
  }

  const startDate = new Date(start + "T00:00:00Z");
  const endDate   = new Date(end   + "T23:59:59Z");

  // Resolve which rep IDs to include
  let repIds;
  if (rep_id) {
    repIds = [rep_id];
  } else if (team_id) {
    const teamReps = await prisma.teamMember.findMany({
      where: { team_id },
      select: { user_id: true },
    });
    repIds = teamReps.map((r) => r.user_id);
  } else {
    const reps = await prisma.user.findMany({
      where: { company_id, role: "MedicalRep" },
      select: { id: true },
    });
    repIds = reps.map((r) => r.id);
  }

  const wb = new (await import("exceljs")).default.Workbook();
  wb.creator = "KibagRep";
  wb.created = new Date();

  const hStyle = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF16a34a" } }, alignment: { vertical: "middle" } };
  const addSheet = (name, headers) => {
    const ws = wb.addWorksheet(name);
    ws.columns = headers.map((h) => ({ header: h.label, key: h.key, width: h.width ?? 20 }));
    ws.getRow(1).eachCell((cell) => Object.assign(cell, hStyle));
    ws.getRow(1).height = 20;
    return ws;
  };

  if (type === "visits") {
    const acts = await prisma.doctorActivity.findMany({
      where: { user_id: { in: repIds }, date: { gte: startDate, lte: endDate } },
      include: {
        user:            { select: { firstname: true, lastname: true } },
        doctor:          { select: { doctor_name: true, speciality: true, town: true } },
        focused_product: { select: { product_name: true } },
        products_detailed: { select: { product_name: true } },
      },
      orderBy: { date: "asc" },
    });
    const ws = addSheet("Visits", [
      { key: "date", label: "Date", width: 14 },
      { key: "rep",  label: "Rep",  width: 22 },
      { key: "doctor", label: "Doctor", width: 28 },
      { key: "specialty", label: "Specialty", width: 18 },
      { key: "town",  label: "Town",  width: 16 },
      { key: "visit_type", label: "Type", width: 12 },
      { key: "focus_product", label: "Focus Product", width: 22 },
      { key: "products_detailed", label: "Products Detailed", width: 30 },
      { key: "samples", label: "Samples", width: 10 },
      { key: "nca_reason", label: "NCA Reason", width: 28 },
      { key: "gps_flag", label: "GPS Flag", width: 10 },
    ]);
    acts.forEach((a) => ws.addRow({
      date:    a.date ? new Date(a.date).toLocaleDateString("en-GB") : "",
      rep:     `${a.user?.firstname ?? ""} ${a.user?.lastname ?? ""}`.trim(),
      doctor:  a.doctor?.doctor_name ?? "",
      specialty: (a.doctor?.speciality ?? []).join(", "),
      town:    a.doctor?.town ?? "",
      visit_type: a.visit_type ?? "",
      focus_product: a.focused_product?.product_name ?? "",
      products_detailed: (a.products_detailed ?? []).map((p) => p.product_name).join(", "),
      samples: a.samples_given ?? 0,
      nca_reason: a.nca_reason ?? "",
      gps_flag: a.gps_anomaly ? "YES" : "",
    }));

  } else if (type === "samples") {
    const balances = await prisma.sampleBalance.findMany({
      where: { user_id: { in: repIds } },
      include: {
        user:    { select: { firstname: true, lastname: true } },
        product: { select: { product_name: true } },
      },
      orderBy: [{ user_id: "asc" }, { product_id: "asc" }],
    });
    const ws = addSheet("Sample Balances", [
      { key: "rep",       label: "Rep",       width: 22 },
      { key: "product",   label: "Product",   width: 28 },
      { key: "issued",    label: "Issued",    width: 10 },
      { key: "given",     label: "Given",     width: 10 },
      { key: "remaining", label: "Remaining", width: 12 },
    ]);
    balances.forEach((b) => ws.addRow({
      rep:       `${b.user?.firstname ?? ""} ${b.user?.lastname ?? ""}`.trim(),
      product:   b.product?.product_name ?? "",
      issued:    b.issued,
      given:     b.given,
      remaining: b.issued - b.given,
    }));

  } else if (type === "call_cycle") {
    const now2 = new Date();
    const month = now2.getMonth() + 1;
    const year  = now2.getFullYear();
    const cycles = await prisma.callCycle.findMany({
      where: { user_id: { in: repIds }, month, year },
      include: {
        user:  { select: { firstname: true, lastname: true } },
        items: {
          include: { doctor: { select: { doctor_name: true, town: true } } },
        },
      },
    });
    const ws = addSheet("Call Cycle Coverage", [
      { key: "rep",    label: "Rep",    width: 22 },
      { key: "status", label: "Cycle Status", width: 16 },
      { key: "doctor", label: "Doctor", width: 28 },
      { key: "town",   label: "Town",   width: 16 },
      { key: "target", label: "Target", width: 10 },
      { key: "done",   label: "Done",   width: 10 },
      { key: "pct",    label: "Coverage %", width: 12 },
    ]);
    cycles.forEach((c) => {
      c.items.forEach((item) => {
        const pct = item.target_visits > 0 ? Math.round((item.visits_done / item.target_visits) * 100) : 0;
        ws.addRow({
          rep:    `${c.user?.firstname ?? ""} ${c.user?.lastname ?? ""}`.trim(),
          status: c.status,
          doctor: item.doctor?.doctor_name ?? "",
          town:   item.doctor?.town ?? "",
          target: item.target_visits,
          done:   item.visits_done,
          pct:    `${pct}%`,
        });
      });
    });

  } else if (type === "nca") {
    const ncaActs = await prisma.doctorActivity.findMany({
      where: { user_id: { in: repIds }, date: { gte: startDate, lte: endDate }, nca_reason: { not: null } },
      include: {
        user:   { select: { firstname: true, lastname: true } },
        doctor: { select: { doctor_name: true, town: true } },
      },
      orderBy: { date: "asc" },
    });
    const ws = addSheet("NCA Report", [
      { key: "date",       label: "Date",       width: 14 },
      { key: "rep",        label: "Rep",        width: 22 },
      { key: "doctor",     label: "Doctor",     width: 28 },
      { key: "town",       label: "Town",       width: 16 },
      { key: "nca_reason", label: "NCA Reason", width: 40 },
    ]);
    ncaActs.forEach((a) => ws.addRow({
      date:       a.date ? new Date(a.date).toLocaleDateString("en-GB") : "",
      rep:        `${a.user?.firstname ?? ""} ${a.user?.lastname ?? ""}`.trim(),
      doctor:     a.doctor?.doctor_name ?? "",
      town:       a.doctor?.town ?? "",
      nca_reason: a.nca_reason ?? "",
    }));

  } else if (type === "expenses") {
    const claims = await prisma.expenseClaim.findMany({
      where: { user_id: { in: repIds }, created_at: { gte: startDate, lte: endDate } },
      include: {
        user:  { select: { firstname: true, lastname: true } },
        items: true,
      },
      orderBy: { created_at: "asc" },
    });
    const ws = addSheet("Expense Claims", [
      { key: "rep",      label: "Rep",      width: 22 },
      { key: "period",   label: "Period",   width: 12 },
      { key: "category", label: "Category", width: 18 },
      { key: "desc",     label: "Description", width: 30 },
      { key: "amount",   label: "Amount (UGX)", width: 16 },
      { key: "status",   label: "Status",   width: 12 },
    ]);
    claims.forEach((c) => {
      (c.items ?? []).forEach((item) => {
        ws.addRow({
          rep:      `${c.user?.firstname ?? ""} ${c.user?.lastname ?? ""}`.trim(),
          period:   c.period,
          category: item.category,
          desc:     item.description,
          amount:   item.amount,
          status:   c.status,
        });
      });
    });

  } else if (type === "compliance") {
    const allReps = await prisma.user.findMany({
      where: { id: { in: repIds } },
      select: { id: true, firstname: true, lastname: true },
    });
    const reports2 = await prisma.dailyReport.findMany({
      where: { user_id: { in: repIds }, report_date: { gte: startDate, lte: endDate } },
      select: { user_id: true, status: true },
    });
    const repMap = {};
    reports2.forEach((r) => {
      if (!repMap[r.user_id]) repMap[r.user_id] = { total: 0, submitted: 0, approved: 0 };
      repMap[r.user_id].total++;
      if (r.status !== "DRAFT") repMap[r.user_id].submitted++;
      if (r.status === "APPROVED") repMap[r.user_id].approved++;
    });
    const ws = addSheet("Compliance", [
      { key: "rep",       label: "Rep",       width: 22 },
      { key: "total",     label: "Reports",   width: 12 },
      { key: "submitted", label: "Submitted", width: 12 },
      { key: "approved",  label: "Approved",  width: 12 },
      { key: "rate",      label: "Submit Rate %", width: 14 },
    ]);
    allReps.forEach((rep) => {
      const s = repMap[rep.id] ?? { total: 0, submitted: 0, approved: 0 };
      ws.addRow({
        rep:       `${rep.firstname} ${rep.lastname}`.trim(),
        total:     s.total,
        submitted: s.submitted,
        approved:  s.approved,
        rate:      s.total > 0 ? `${Math.round((s.submitted / s.total) * 100)}%` : "—",
      });
    });

  } else {
    res.status(400); throw new Error(`Unknown report type: ${type}`);
  }

  const filename = `kibagrep_${type}_${start}_${end}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

// ── GET /api/report/my-summary?month=&year= ───────────────────────────────
// Returns monthly performance stats for the requesting rep.
export const getMySummary = asyncHandler(async (req, res) => {
  const userId    = req.user.id;
  const now       = new Date();
  const month     = parseInt(req.query.month) || now.getMonth() + 1;
  const year      = parseInt(req.query.year)  || now.getFullYear();

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd   = new Date(Date.UTC(year, month, 1));

  // Determine sample balance product scope: team products if rep is in a team, else all company products
  let sampleBalanceWhere = { user_id: userId };
  if (req.user.team_id) {
    const teamProducts = await prisma.teamProduct.findMany({
      where: { team_id: req.user.team_id },
      select: { product_id: true },
    });
    const teamProductIds = teamProducts.map((tp) => tp.product_id);
    sampleBalanceWhere =
      teamProductIds.length > 0
        ? { user_id: userId, product_id: { in: teamProductIds } }
        : { user_id: userId, product: { company_id: req.user.company_id } };
  } else {
    sampleBalanceWhere = { user_id: userId, product: { company_id: req.user.company_id } };
  }

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
        items: { select: { visits_done: true, frequency: true, tier: true } },
      },
    }),
    prisma.sampleBalance.findMany({
      where: sampleBalanceWhere,
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
