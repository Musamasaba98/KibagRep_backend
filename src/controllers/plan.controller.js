import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// ─── Public: get all active plan configs (used by pricing page) ───────────────
export const getPublicPlanConfigs = asyncHandler(async (req, res) => {
  const configs = await prisma.planConfig.findMany({
    where: { is_active: true, plan: { not: "SUSPENDED" } },
    orderBy: { created_at: "asc" },
  });
  res.json({ success: true, data: configs });
});

// ─── Admin: get all plan configs including suspended ──────────────────────────
export const getAllPlanConfigs = asyncHandler(async (req, res) => {
  const configs = await prisma.planConfig.findMany({ orderBy: { created_at: "asc" } });
  res.json({ success: true, data: configs });
});

// ─── Admin: update a plan config ─────────────────────────────────────────────
export const updatePlanConfig = asyncHandler(async (req, res) => {
  const { plan } = req.params;
  const {
    display_name, price_ugx, show_price, rep_limit,
    setup_fee_ugx, annual_discount_pct, features, is_active,
  } = req.body;

  const config = await prisma.planConfig.findUnique({ where: { plan } });
  if (!config) return res.status(404).json({ success: false, error: "Plan config not found" });

  const updated = await prisma.planConfig.update({
    where: { plan },
    data: {
      ...(display_name          !== undefined && { display_name }),
      ...(price_ugx             !== undefined && { price_ugx: price_ugx === null ? null : Number(price_ugx) }),
      ...(show_price            !== undefined && { show_price }),
      ...(rep_limit             !== undefined && { rep_limit: rep_limit === null ? null : Number(rep_limit) }),
      ...(setup_fee_ugx         !== undefined && { setup_fee_ugx: setup_fee_ugx === null ? null : Number(setup_fee_ugx) }),
      ...(annual_discount_pct   !== undefined && { annual_discount_pct: Number(annual_discount_pct) }),
      ...(features              !== undefined && { features }),
      ...(is_active             !== undefined && { is_active }),
    },
  });
  res.json({ success: true, data: updated });
});

// ─── Company plan management ──────────────────────────────────────────────────

// GET /api/plan/company/:id — get a company's subscription status
export const getCompanyPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true, company_name: true, saas_plan: true,
      trial_ends_at: true, plan_activated_at: true, plan_expires_at: true,
      is_locked: true, lock_reason: true,
    },
  });
  if (!company) return res.status(404).json({ success: false, error: "Company not found" });

  const now = new Date();
  const trialDaysLeft = company.trial_ends_at
    ? Math.ceil((company.trial_ends_at - now) / (1000 * 60 * 60 * 24))
    : null;

  res.json({ success: true, data: { ...company, trial_days_left: trialDaysLeft } });
});

// PUT /api/plan/company/:id — activate/change plan, extend trial, lock/unlock
export const updateCompanyPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    saas_plan,
    trial_ends_at,      // ISO string — extend trial to this date
    plan_expires_at,    // ISO string — when current paid plan expires
    is_locked,
    lock_reason,
    activate,           // boolean — marks plan_activated_at = now
  } = req.body;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return res.status(404).json({ success: false, error: "Company not found" });

  const updated = await prisma.company.update({
    where: { id },
    data: {
      ...(saas_plan      !== undefined && { saas_plan }),
      ...(trial_ends_at  !== undefined && { trial_ends_at: new Date(trial_ends_at) }),
      ...(plan_expires_at !== undefined && { plan_expires_at: plan_expires_at ? new Date(plan_expires_at) : null }),
      ...(is_locked      !== undefined && { is_locked }),
      ...(lock_reason    !== undefined && { lock_reason }),
      ...(activate       === true      && { plan_activated_at: new Date() }),
    },
    select: {
      id: true, company_name: true, saas_plan: true,
      trial_ends_at: true, plan_activated_at: true, plan_expires_at: true,
      is_locked: true, lock_reason: true,
    },
  });
  res.json({ success: true, data: updated });
});

// GET /api/plan/status — return the calling user's company plan status
// Used by frontend to decide lock screen, trial banner, etc.
export const getMyCompanyPlanStatus = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.json({ success: true, data: { status: "no_company" } });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      saas_plan: true, trial_ends_at: true, plan_activated_at: true,
      plan_expires_at: true, is_locked: true, lock_reason: true,
    },
  });
  if (!company) return res.json({ success: true, data: { status: "no_company" } });

  const now = new Date();

  // Determine effective status
  let status = "active";
  let trial_days_left = null;
  let soft_lock = false;

  if (company.is_locked) {
    status = "hard_locked";
  } else if (company.saas_plan === "TRIAL") {
    if (company.trial_ends_at) {
      const msLeft = company.trial_ends_at - now;
      trial_days_left = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

      if (msLeft < 0) {
        const daysOver = Math.abs(trial_days_left);
        if (daysOver >= 3) {
          status = "hard_locked";
        } else {
          status = "soft_locked";
          soft_lock = true;
        }
      } else if (trial_days_left <= 7) {
        status = "trial_expiring";
      } else {
        status = "trial";
      }
    }
  } else if (company.plan_expires_at && company.plan_expires_at < now) {
    const msOver = now - company.plan_expires_at;
    const daysOver = Math.ceil(msOver / (1000 * 60 * 60 * 24));
    status = daysOver >= 3 ? "hard_locked" : "soft_locked";
    soft_lock = daysOver < 3;
  }

  res.json({
    success: true,
    data: {
      status,
      saas_plan: company.saas_plan,
      trial_days_left,
      soft_lock,
      trial_ends_at: company.trial_ends_at,
      plan_expires_at: company.plan_expires_at,
      lock_reason: company.lock_reason,
    },
  });
});

// GET /api/plan/companies — list all companies with plan info (SUPER_ADMIN)
export const getAllCompaniesWithPlan = asyncHandler(async (req, res) => {
  const companies = await prisma.company.findMany({
    select: {
      id: true, company_name: true, saas_plan: true, is_active: true,
      trial_ends_at: true, plan_activated_at: true, plan_expires_at: true,
      is_locked: true, lock_reason: true, date_of_joining: true,
      _count: { select: { users: true } },
    },
    orderBy: { date_of_joining: "desc" },
  });

  const now = new Date();
  const enriched = companies.map(c => ({
    ...c,
    trial_days_left: c.trial_ends_at
      ? Math.ceil((c.trial_ends_at - now) / (1000 * 60 * 60 * 24))
      : null,
  }));

  res.json({ success: true, data: enriched });
});
