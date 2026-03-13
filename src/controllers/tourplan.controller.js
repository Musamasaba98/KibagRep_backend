import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLAN_INCLUDE = {
  days: { orderBy: { day_number: "asc" } },
  entries: {
    orderBy: [{ day_number: "asc" }, { sort_order: "asc" }],
    include: {
      doctor:   { select: { id: true, doctor_name: true, town: true, cadre: true } },
      pharmacy: { select: { id: true, pharmacy_name: true, location: true, town: true } },
      facility: { select: { id: true, name: true, location: true, town: true } },
    },
  },
};

// ─── GET /api/tour-plan/current ───────────────────────────────────────────────
// Returns the current month's plan (auto-creates DRAFT if none), plus
// the current call cycle so the frontend can show cycle coverage.
export const getCurrentTourPlan = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  let plan = await prisma.tourPlan.findUnique({
    where: { user_id_month_year: { user_id: userId, month, year } },
    include: PLAN_INCLUDE,
  });

  if (!plan) {
    plan = await prisma.tourPlan.create({
      data: { user_id: userId, month, year },
      include: PLAN_INCLUDE,
    });
  }

  // Fetch current cycle so frontend knows which doctors to plan + their frequencies
  const cycle = await prisma.callCycle.findUnique({
    where: { user_id_month_year: { user_id: userId, month, year } },
    include: {
      items: {
        include: {
          doctor: { select: { id: true, doctor_name: true, town: true, cadre: true } },
        },
        orderBy: { doctor: { doctor_name: "asc" } },
      },
    },
  });

  res.json({ success: true, data: { plan, cycle: cycle ?? null } });
});

// ─── PUT /api/tour-plan/:id/day ───────────────────────────────────────────────
// Upsert day-level metadata (area, off-day).
export const updateTourPlanDay = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { day_number, morning_area, evening_area, notes, is_off_day,
          daily_allowance, transport, airtime, accommodation, other_costs } = req.body;

  if (!day_number || day_number < 1 || day_number > 31) {
    return res.status(400).json({ success: false, error: "day_number must be 1–31" });
  }

  const plan = await prisma.tourPlan.findUnique({ where: { id } });
  if (!plan || plan.user_id !== req.user.id) {
    return res.status(404).json({ success: false, error: "Plan not found" });
  }
  if (plan.status === "SUBMITTED" || plan.status === "APPROVED") {
    return res.status(403).json({ success: false, error: "Plan is locked after submission" });
  }

  const day = await prisma.tourPlanDay.upsert({
    where: { plan_id_day_number: { plan_id: id, day_number } },
    create: {
      plan_id: id, day_number,
      morning_area: morning_area ?? null, evening_area: evening_area ?? null,
      notes: notes ?? null, is_off_day: is_off_day ?? false,
      daily_allowance: daily_allowance ?? 0, transport: transport ?? 0,
      airtime: airtime ?? 0, accommodation: accommodation ?? 0, other_costs: other_costs ?? 0,
    },
    update: {
      morning_area: morning_area ?? null, evening_area: evening_area ?? null,
      notes: notes ?? null, is_off_day: is_off_day ?? false,
      daily_allowance: daily_allowance ?? 0, transport: transport ?? 0,
      airtime: airtime ?? 0, accommodation: accommodation ?? 0, other_costs: other_costs ?? 0,
    },
  });

  res.json({ success: true, data: day });
});

// ─── POST /api/tour-plan/:id/entries ─────────────────────────────────────────
// Add a visit entry (clinician from cycle or free-text pharmacy) to a day.
export const addTourPlanEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { day_number, entry_type, doctor_id, cycle_item_id, pharmacy_id, pharmacy_name, facility_id, notes, slot } = req.body;

  if (!day_number || day_number < 1 || day_number > 31) {
    return res.status(400).json({ success: false, error: "day_number must be 1–31" });
  }

  const plan = await prisma.tourPlan.findUnique({ where: { id } });
  if (!plan || plan.user_id !== req.user.id) {
    return res.status(404).json({ success: false, error: "Plan not found" });
  }
  if (plan.status === "SUBMITTED" || plan.status === "APPROVED") {
    return res.status(403).json({ success: false, error: "Plan is locked after submission" });
  }

  // Count existing entries on this day to set sort_order
  const count = await prisma.tourPlanEntry.count({ where: { plan_id: id, day_number } });

  const entry = await prisma.tourPlanEntry.create({
    data: {
      plan_id: id,
      day_number,
      entry_type: entry_type ?? "CLINICIAN",
      slot: slot ?? "MORNING",
      doctor_id: doctor_id ?? null,
      cycle_item_id: cycle_item_id ?? null,
      pharmacy_id:   pharmacy_id ?? null,
      pharmacy_name: pharmacy_name ?? null,
      facility_id:  facility_id ?? null,
      notes: notes ?? null,
      sort_order: count,
    },
    include: {
      doctor:   { select: { id: true, doctor_name: true, town: true, cadre: true } },
      pharmacy: { select: { id: true, pharmacy_name: true, location: true, town: true } },
      facility: { select: { id: true, name: true, location: true, town: true } },
    },
  });

  res.status(201).json({ success: true, data: entry });
});

// ─── DELETE /api/tour-plan/:id/entries/:entryId ───────────────────────────────
export const removeTourPlanEntry = asyncHandler(async (req, res) => {
  const { id, entryId } = req.params;

  const plan = await prisma.tourPlan.findUnique({ where: { id } });
  if (!plan || plan.user_id !== req.user.id) {
    return res.status(404).json({ success: false, error: "Plan not found" });
  }
  if (plan.status === "SUBMITTED" || plan.status === "APPROVED") {
    return res.status(403).json({ success: false, error: "Plan is locked after submission" });
  }

  await prisma.tourPlanEntry.delete({ where: { id: entryId } });
  res.json({ success: true });
});

// ─── PUT /api/tour-plan/:id/submit ───────────────────────────────────────────
export const submitTourPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const plan = await prisma.tourPlan.findUnique({ where: { id } });
  if (!plan || plan.user_id !== req.user.id) {
    return res.status(404).json({ success: false, error: "Plan not found" });
  }
  if (plan.status !== "DRAFT") {
    return res.status(400).json({ success: false, error: "Only DRAFT plans can be submitted" });
  }

  const updated = await prisma.tourPlan.update({
    where: { id },
    data: { status: "SUBMITTED" },
    include: PLAN_INCLUDE,
  });

  res.json({ success: true, data: updated });
});

// ─── GET /api/tour-plan/pending ───────────────────────────────────────────────
export const getPendingTourPlans = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;

  const plans = await prisma.tourPlan.findMany({
    where: { status: "SUBMITTED", user: { company_id: companyId } },
    include: {
      ...PLAN_INCLUDE,
      user: { select: { id: true, firstname: true, lastname: true, role: true } },
    },
    orderBy: { created_at: "desc" },
  });

  res.json({ success: true, data: plans });
});

// ─── PUT /api/tour-plan/:id/approve ──────────────────────────────────────────
export const approveTourPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updated = await prisma.tourPlan.update({
    where: { id },
    data: { status: "APPROVED", reviewed_by: req.user.id, reviewed_at: new Date() },
    include: PLAN_INCLUDE,
  });
  res.json({ success: true, data: updated });
});

// ─── PUT /api/tour-plan/:id/reject ───────────────────────────────────────────
export const rejectTourPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { review_note } = req.body;
  const updated = await prisma.tourPlan.update({
    where: { id },
    data: { status: "REJECTED", reviewed_by: req.user.id, reviewed_at: new Date(), review_note: review_note ?? null },
    include: PLAN_INCLUDE,
  });
  res.json({ success: true, data: updated });
});

// ─── GET /api/tour-plan/today ─────────────────────────────────────────────────
// Returns today's TourPlanEntry records (clinicians + pharmacies planned for
// today) so the sidebar can show the day's call list.
export const getTodayTourPlanEntries = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now    = new Date();
  const month  = now.getMonth() + 1;
  const year   = now.getFullYear();
  const today  = now.getDate();

  const plan = await prisma.tourPlan.findUnique({
    where: { user_id_month_year: { user_id: userId, month, year } },
    include: {
      entries: {
        where: { day_number: today },
        orderBy: [{ slot: "asc" }, { sort_order: "asc" }],
        include: {
          doctor:   { select: { id: true, doctor_name: true, town: true, cadre: true } },
          pharmacy: { select: { id: true, pharmacy_name: true, location: true, town: true } },
        },
      },
    },
  });

  res.json({ success: true, data: plan?.entries ?? [] });
});
