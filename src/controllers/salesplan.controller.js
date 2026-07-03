import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";

const PLAN_INCLUDE = {
  lines: {
    include: {
      product:  { select: { id: true, product_name: true, unit_price: true } },
      pharmacy: { select: { id: true, pharmacy_name: true, town: true } },
      facility: { select: { id: true, name: true, town: true } },
    },
  },
};

// ─── GET /api/sales-plans/mine?month=&year= ───────────────────────────────────
export const getMyPlan = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year  = parseInt(req.query.year)  || now.getFullYear();

  let plan = await prisma.salesPlan.findUnique({
    where: { user_id_month_year: { user_id: userId, month, year } },
    include: PLAN_INCLUDE,
  });

  if (!plan) {
    plan = await prisma.salesPlan.create({
      data: { user_id: userId, month, year },
      include: PLAN_INCLUDE,
    });
  }

  // Attach rep target so frontend can show coverage bar
  const target = await prisma.salesTarget.findUnique({
    where: { user_id_month_year: { user_id: userId, month, year } },
  });

  res.json({ success: true, data: { plan, target: target ?? null } });
});

// ─── PUT /api/sales-plans/:planId/lines ──────────────────────────────────────
// Replace-all: deletes all existing lines then bulk-creates new set (transactional)
export const upsertLines = asyncHandler(async (req, res) => {
  const { planId } = req.params;
  const { lines } = req.body; // array of { product_id, pharmacy_id?, facility_id?, target_units, target_value? }

  if (!Array.isArray(lines)) {
    return res.status(400).json({ success: false, error: "lines must be an array" });
  }

  const plan = await prisma.salesPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.user_id !== req.user.id) {
    return res.status(404).json({ success: false, error: "Plan not found" });
  }
  if (plan.status === "SUBMITTED" || plan.status === "APPROVED") {
    return res.status(403).json({ success: false, error: "Plan is locked" });
  }

  // Resolve target_value from product unit_price if not supplied
  const productIds = [...new Set(lines.map(l => l.product_id))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, unit_price: true },
  });
  const priceMap = Object.fromEntries(products.map(p => [p.id, p.unit_price]));

  const lineData = lines.map(l => ({
    product_id:   l.product_id,
    pharmacy_id:  l.pharmacy_id  ?? null,
    facility_id:  l.facility_id  ?? null,
    target_units: Number(l.target_units) || 0,
    target_value: l.target_value != null
      ? Number(l.target_value)
      : Math.round((Number(l.target_units) || 0) * (priceMap[l.product_id] ?? 0)),
  }));

  const [, updated] = await prisma.$transaction([
    prisma.salesPlanLine.deleteMany({ where: { plan_id: planId } }),
    prisma.salesPlan.update({
      where: { id: planId },
      data:  { lines: { createMany: { data: lineData } }, updated_at: new Date() },
      include: PLAN_INCLUDE,
    }),
  ]);

  res.json({ success: true, data: updated });
});

// ─── POST /api/sales-plans/:planId/submit ────────────────────────────────────
export const submitPlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;
  const userId = req.user.id;

  const plan = await prisma.salesPlan.findUnique({
    where: { id: planId },
    include: { lines: true },
  });
  if (!plan || plan.user_id !== userId) {
    return res.status(404).json({ success: false, error: "Plan not found" });
  }
  if (plan.status !== "DRAFT") {
    return res.status(400).json({ success: false, error: "Only DRAFT plans can be submitted" });
  }

  const target = await prisma.salesTarget.findUnique({
    where: { user_id_month_year: { user_id: userId, month: plan.month, year: plan.year } },
  });

  const planTotal = plan.lines.reduce((s, l) => s + l.target_value, 0);
  const coverage  = target?.target_value ? planTotal / target.target_value : null;

  const updated = await prisma.salesPlan.update({
    where:   { id: planId },
    data:    { status: "SUBMITTED", submitted_at: new Date() },
    include: PLAN_INCLUDE,
  });

  res.json({ success: true, data: { plan: updated, coverage_pct: coverage ? Math.round(coverage * 100) : null } });
});

// ─── POST /api/sales-plans/:planId/approve ───────────────────────────────────
export const approvePlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  const plan = await prisma.salesPlan.findUnique({
    where: { id: planId },
    include: { user: { select: { company_id: true } } },
  });
  if (!plan) return res.status(404).json({ success: false, error: "Plan not found" });
  if (plan.user.company_id !== req.user.company_id) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }
  if (plan.status !== "SUBMITTED") {
    return res.status(400).json({ success: false, error: "Only SUBMITTED plans can be approved" });
  }

  const updated = await prisma.salesPlan.update({
    where:   { id: planId },
    data:    { status: "APPROVED", approved_by: req.user.id, approved_at: new Date() },
    include: PLAN_INCLUDE,
  });

  res.json({ success: true, data: updated });
});

// ─── POST /api/sales-plans/:planId/revert ────────────────────────────────────
export const revertPlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  const plan = await prisma.salesPlan.findUnique({
    where: { id: planId },
    include: { user: { select: { company_id: true } } },
  });
  if (!plan) return res.status(404).json({ success: false, error: "Plan not found" });
  if (plan.user.company_id !== req.user.company_id) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }

  const updated = await prisma.salesPlan.update({
    where:   { id: planId },
    data:    { status: "DRAFT", submitted_at: null, approved_by: null, approved_at: null },
    include: PLAN_INCLUDE,
  });

  res.json({ success: true, data: updated });
});

// ─── GET /api/sales-plans?team_id=&month=&year=&status= ──────────────────────
export const listPlans = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const now = new Date();
  const month    = parseInt(req.query.month)  || now.getMonth() + 1;
  const year     = parseInt(req.query.year)   || now.getFullYear();
  const statusQ  = req.query.status;
  const team_id  = req.query.team_id;

  const where = {
    month,
    year,
    user: { company_id },
    ...(statusQ  ? { status: statusQ } : {}),
    ...(team_id  ? { user: { company_id, team_id } } : {}),
  };

  const plans = await prisma.salesPlan.findMany({
    where,
    include: {
      ...PLAN_INCLUDE,
      user: { select: { id: true, firstname: true, lastname: true, team_id: true } },
    },
    orderBy: { created_at: "desc" },
  });

  res.json({ success: true, data: plans });
});
