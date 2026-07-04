import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";
import ExcelJS from "exceljs";

const RAG_GREEN = parseFloat(process.env.RAG_GREEN ?? "90");
const RAG_AMBER = parseFloat(process.env.RAG_AMBER ?? "60");

function rag(pct) {
  if (pct >= RAG_GREEN) return "GREEN";
  if (pct >= RAG_AMBER) return "AMBER";
  return "RED";
}

// Build achieved/booked sums for a rep in a given month from ProcurementItem → ProcurementOrder
async function getActuals(userId, month, year) {
  const startDate = new Date(year, month - 1, 1);
  const endDate   = new Date(year, month,     1);

  // Achievement = APPROVED orders (supervisor has signed off; physical delivery may lag)
  const deliveredOrders = await prisma.procurementOrder.findMany({
    where: {
      user_id:    userId,
      status:     { in: ["APPROVED", "DELIVERED"] },
      order_date: { gte: startDate, lt: endDate },
    },
    include: {
      items: { include: { product: { select: { id: true, product_name: true, unit_price: true } } } },
      pharmacy:  { select: { id: true, pharmacy_name: true, town: true } },
      facility:  { select: { id: true, name: true, town: true } },
    },
  });

  // Booked = orders in the pipeline (placed but not yet approved)
  const bookedOrders = await prisma.procurementOrder.findMany({
    where: {
      user_id:    userId,
      status:     { in: ["PROPOSED", "SUBMITTED"] },
      order_date: { gte: startDate, lt: endDate },
    },
    include: {
      items: { include: { product: { select: { id: true, unit_price: true } } } },
    },
  });

  // Aggregate
  let achieved_value = 0, achieved_units = 0;
  let booked_value   = 0, booked_units   = 0;

  // key: "product_id|pharmacy_id|facility_id"
  const achievedByLine = {};

  for (const order of deliveredOrders) {
    for (const item of order.items) {
      const up = item.unit_price ?? item.product.unit_price ?? 0;
      achieved_units += item.quantity;
      achieved_value += item.quantity * up;

      const lineKey = `${item.product_id}|${order.pharmacy_id ?? ""}|${order.facility_id ?? ""}`;
      if (!achievedByLine[lineKey]) {
        achievedByLine[lineKey] = {
          product: item.product,
          pharmacy: order.pharmacy,
          facility: order.facility,
          achieved_units: 0,
          achieved_value: 0,
        };
      }
      achievedByLine[lineKey].achieved_units += item.quantity;
      achievedByLine[lineKey].achieved_value += item.quantity * up;
    }
  }

  for (const order of bookedOrders) {
    for (const item of order.items) {
      const up = item.unit_price ?? item.product.unit_price ?? 0;
      booked_units += item.quantity;
      booked_value += item.quantity * up;
    }
  }

  return { achieved_value, achieved_units, booked_value, booked_units, achievedByLine };
}

// ─── GET /api/performance/rep/:userId?month=&year= ────────────────────────────
export const getRepPerformance = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const now   = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year  = parseInt(req.query.year)  || now.getFullYear();

  // Access control: rep sees self; supervisor/manager sees own company
  if (req.user.role === "MedicalRep" && req.user.id !== userId) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }

  const [target, plan, actuals] = await Promise.all([
    prisma.salesTarget.findUnique({
      where: { user_id_month_year: { user_id: userId, month, year } },
    }),
    prisma.salesPlan.findUnique({
      where: { user_id_month_year: { user_id: userId, month, year } },
      include: {
        lines: {
          include: {
            product:  { select: { id: true, product_name: true, unit_price: true } },
            pharmacy: { select: { id: true, pharmacy_name: true, town: true } },
            facility: { select: { id: true, name: true, town: true } },
          },
        },
      },
    }),
    getActuals(userId, month, year),
  ]);

  const { achieved_value, achieved_units, booked_value, booked_units, achievedByLine } = actuals;

  const achievement_pct = target?.target_value
    ? Math.round((achieved_value / target.target_value) * 100 * 10) / 10
    : null;

  // Enrich plan lines with actuals
  const plan_lines = (plan?.lines ?? []).map(l => {
    const lineKey = `${l.product_id}|${l.pharmacy_id ?? ""}|${l.facility_id ?? ""}`;
    const ach = achievedByLine[lineKey];
    const pct = l.target_units > 0 && ach
      ? Math.round((ach.achieved_units / l.target_units) * 100 * 10) / 10
      : 0;
    return {
      ...l,
      achieved_units: ach?.achieved_units ?? 0,
      achieved_value: ach?.achieved_value ?? 0,
      pct,
      rag: rag(pct),
    };
  });

  // Unplanned sales: achieved lines NOT covered by any plan line
  const plannedKeys = new Set((plan?.lines ?? []).map(l =>
    `${l.product_id}|${l.pharmacy_id ?? ""}|${l.facility_id ?? ""}`
  ));
  const unplanned_sales = Object.entries(achievedByLine)
    .filter(([key]) => !plannedKeys.has(key))
    .map(([, v]) => v);

  // Coverage: plan total vs rep target
  const plan_total_value = (plan?.lines ?? []).reduce((s, l) => s + l.target_value, 0);
  const coverage_pct = target?.target_value
    ? Math.round((plan_total_value / target.target_value) * 100)
    : null;

  res.json({
    success: true,
    data: {
      month, year,
      target:  target ?? null,
      achieved: { value: achieved_value, units: achieved_units },
      booked:   { value: booked_value,   units: booked_units   },
      achievement_pct,
      rag: achievement_pct != null ? rag(achievement_pct) : null,
      plan_status:   plan?.status ?? null,
      coverage_pct,
      plan_lines,
      unplanned_sales,
    },
  });
});

// ─── GET /api/performance/team/:teamId?month=&year= ───────────────────────────
export const getTeamPerformance = asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const now   = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year  = parseInt(req.query.year)  || now.getFullYear();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      targets: { where: { month, year } },
      users:   { where: { role: "MedicalRep" }, select: { id: true, firstname: true, lastname: true } },
    },
  });
  if (!team) return res.status(404).json({ success: false, error: "Team not found" });

  const teamTarget = team.targets[0] ?? null;

  // Fetch per-rep data in parallel
  const repRows = await Promise.all(
    team.users.map(async (u) => {
      const [target, plan, actuals, review] = await Promise.all([
        prisma.salesTarget.findUnique({
          where: { user_id_month_year: { user_id: u.id, month, year } },
        }),
        prisma.salesPlan.findUnique({
          where: { user_id_month_year: { user_id: u.id, month, year } },
          select: { id: true, status: true },
        }),
        getActuals(u.id, month, year),
        prisma.performanceReview.findUnique({
          where: { user_id_month_year: { user_id: u.id, month, year } },
          select: { id: true, outcome: true },
        }),
      ]);

      const pct = target?.target_value
        ? Math.round((actuals.achieved_value / target.target_value) * 100 * 10) / 10
        : null;

      const ragStatus = pct != null ? rag(pct) : null;
      const review_required = pct != null && pct < RAG_AMBER && !review;

      return {
        user:           u,
        target:         target ?? null,
        achieved_value: actuals.achieved_value,
        achieved_units: actuals.achieved_units,
        booked_value:   actuals.booked_value,
        achievement_pct: pct,
        rag:            ragStatus,
        plan_status:    plan?.status ?? null,
        plan_id:        plan?.id     ?? null,
        review_status:  review?.outcome ?? null,
        review_required,
      };
    })
  );

  // Sort worst-first (nulls last)
  repRows.sort((a, b) => {
    if (a.achievement_pct == null) return 1;
    if (b.achievement_pct == null) return -1;
    return a.achievement_pct - b.achievement_pct;
  });

  const team_achieved = repRows.reduce((s, r) => s + r.achieved_value, 0);
  const team_pct = teamTarget?.target_value
    ? Math.round((team_achieved / teamTarget.target_value) * 100 * 10) / 10
    : null;

  res.json({
    success: true,
    data: {
      month, year,
      team: { id: team.id, team_name: team.team_name },
      team_target: teamTarget,
      team_achieved,
      team_achievement_pct: team_pct,
      team_rag: team_pct != null ? rag(team_pct) : null,
      reps: repRows,
    },
  });
});

// ─── GET /api/performance/overview?month=&year= ───────────────────────────────
export const getOverview = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const now   = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year  = parseInt(req.query.year)  || now.getFullYear();

  const teams = await prisma.team.findMany({
    where: { company_id },
    include: {
      targets: { where: { month, year } },
      users:   { where: { role: "MedicalRep" }, select: { id: true } },
    },
  });

  const rows = await Promise.all(
    teams.map(async (team) => {
      const teamTarget = team.targets[0] ?? null;
      let team_achieved = 0;

      for (const u of team.users) {
        const a = await getActuals(u.id, month, year);
        team_achieved += a.achieved_value;
      }

      const pct = teamTarget?.target_value
        ? Math.round((team_achieved / teamTarget.target_value) * 100 * 10) / 10
        : null;

      return {
        team: { id: team.id, team_name: team.team_name },
        team_target: teamTarget,
        rep_count: team.users.length,
        team_achieved,
        achievement_pct: pct,
        rag: pct != null ? rag(pct) : null,
      };
    })
  );

  rows.sort((a, b) => {
    if (a.achievement_pct == null) return 1;
    if (b.achievement_pct == null) return -1;
    return a.achievement_pct - b.achievement_pct;
  });

  res.json({ success: true, data: { month, year, teams: rows } });
});

// ─── POST /api/performance/reviews ───────────────────────────────────────────
export const createReview = asyncHandler(async (req, res) => {
  const { user_id, month, year, reason, action, outcome } = req.body;

  if (!user_id || !month || !year || !reason) {
    return res.status(400).json({ success: false, error: "user_id, month, year, reason required" });
  }

  const actuals = await getActuals(user_id, Number(month), Number(year));
  const target  = await prisma.salesTarget.findUnique({
    where: { user_id_month_year: { user_id, month: Number(month), year: Number(year) } },
  });

  const achievement_pct = target?.target_value
    ? Math.round((actuals.achieved_value / target.target_value) * 100 * 10) / 10
    : 0;

  const review = await prisma.performanceReview.upsert({
    where: { user_id_month_year: { user_id, month: Number(month), year: Number(year) } },
    update: { reason, action: action ?? null, outcome: outcome ?? "REVIEWED", achievement_pct, reviewer_id: req.user.id },
    create: { user_id, reviewer_id: req.user.id, month: Number(month), year: Number(year), achievement_pct, reason, action: action ?? null, outcome: outcome ?? "REVIEWED" },
  });

  res.status(201).json({ success: true, data: review });
});

// ─── GET /api/performance/config ─────────────────────────────────────────────
export const getConfig = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { rag_green: RAG_GREEN, rag_amber: RAG_AMBER } });
});

// ─── GET /api/performance/reviews?team_id=&month=&year= ──────────────────────
export const listReviews = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const now   = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year  = parseInt(req.query.year)  || now.getFullYear();

  const where = {
    month, year,
    user: { company_id },
    ...(req.query.team_id ? { user: { company_id, team_id: req.query.team_id } } : {}),
  };

  const reviews = await prisma.performanceReview.findMany({
    where,
    include: {
      user:     { select: { id: true, firstname: true, lastname: true } },
      reviewer: { select: { id: true, firstname: true, lastname: true } },
    },
    orderBy: { created_at: "desc" },
  });

  res.json({ success: true, data: reviews });
});

// ─── GET /api/performance/export?team_id=&month=&year= ───────────────────────
export const exportPerformance = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const now   = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year  = parseInt(req.query.year)  || now.getFullYear();
  const team_id = req.query.team_id;

  const monthName = new Date(year, month - 1, 1).toLocaleString("default", { month: "long" });

  // Gather all reps
  const reps = await prisma.user.findMany({
    where: {
      company_id,
      role: "MedicalRep",
      ...(team_id ? { team_id } : {}),
    },
    select: { id: true, firstname: true, lastname: true },
    orderBy: [{ firstname: "asc" }, { lastname: "asc" }],
  });

  const workbook = new ExcelJS.Workbook();

  // ── Detail sheet ──
  const detail = workbook.addWorksheet("Detail");
  detail.columns = [
    { header: "Rep",           key: "rep",      width: 22 },
    { header: "Facility/Pharmacy", key: "outlet", width: 28 },
    { header: "Town",          key: "town",     width: 14 },
    { header: "Product",       key: "product",  width: 20 },
    { header: "PLAN units",    key: "plan_u",   width: 12 },
    { header: "ACH units",     key: "ach_u",    width: 12 },
    { header: "PLAN value",    key: "plan_v",   width: 14 },
    { header: "ACH value",     key: "ach_v",    width: 14 },
    { header: "%",             key: "pct",      width: 8  },
  ];

  // Style header row
  detail.getRow(1).font = { bold: true };
  detail.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16a34a" } };
  detail.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  const summaryData = [];

  for (const rep of reps) {
    const repName = `${rep.firstname} ${rep.lastname}`;
    const [target, plan, actuals] = await Promise.all([
      prisma.salesTarget.findUnique({ where: { user_id_month_year: { user_id: rep.id, month, year } } }),
      prisma.salesPlan.findUnique({
        where: { user_id_month_year: { user_id: rep.id, month, year } },
        include: { lines: { include: { product: { select: { id: true, product_name: true } }, pharmacy: { select: { id: true, pharmacy_name: true, town: true } }, facility: { select: { id: true, name: true, town: true } } } } },
      }),
      getActuals(rep.id, month, year),
    ]);

    const { achievedByLine, achieved_value } = actuals;

    for (const line of (plan?.lines ?? [])) {
      const outlet  = line.pharmacy ?? line.facility;
      const lineKey = `${line.product_id}|${line.pharmacy_id ?? ""}|${line.facility_id ?? ""}`;
      const ach     = achievedByLine[lineKey];

      detail.addRow({
        rep:     repName,
        outlet:  outlet ? (line.pharmacy ? outlet.pharmacy_name : outlet.name) : "(unassigned)",
        town:    outlet?.town ?? "",
        product: line.product.product_name,
        plan_u:  line.target_units,
        ach_u:   ach?.achieved_units ?? 0,
        plan_v:  line.target_value,
        ach_v:   Math.round(ach?.achieved_value ?? 0),
        pct:     line.target_units > 0 && ach
          ? `${Math.round((ach.achieved_units / line.target_units) * 100)}%`
          : "0%",
      });
    }

    const pct = target?.target_value
      ? Math.round((achieved_value / target.target_value) * 100)
      : null;

    summaryData.push({
      rep:      repName,
      target_v: target?.target_value ?? 0,
      ach_v:    Math.round(achieved_value),
      pct:      pct != null ? `${pct}%` : "N/A",
      rag:      pct != null ? rag(pct) : "N/A",
    });
  }

  // ── Summary sheet ──
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Rep",           key: "rep",      width: 22 },
    { header: "Target (UGX)", key: "target_v", width: 16 },
    { header: "Achieved (UGX)", key: "ach_v",  width: 16 },
    { header: "%",             key: "pct",      width: 8  },
    { header: "RAG",           key: "rag",      width: 10 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16a34a" } };
  summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const row of summaryData) {
    const r = summary.addRow(row);
    const ragColors = { GREEN: "FF16a34a", AMBER: "FFd97706", RED: "FFdc2626" };
    const col = ragColors[row.rag];
    if (col) r.getCell("rag").fill = { type: "pattern", pattern: "solid", fgColor: { argb: col } };
  }

  const filename = `performance_${monthName}_${year}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});
