import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";
import { getUgandaPublicHolidays } from "../utils/holidays.js";

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

// ─── Helper: compute day_type for a calendar day given company Saturday policy ─
function localISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function computeDayType(date, saturdayPolicy, holidaySet) {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  const iso = localISO(date);

  if (dow === 0) return "SUNDAY";
  if (holidaySet.has(iso)) return "PUBLIC_HOLIDAY";
  if (dow === 6) {
    if (saturdayPolicy === "OFF")      return "SATURDAY_OFF";
    if (saturdayPolicy === "HALF_DAY") return "SATURDAY_HALF";
    if (saturdayPolicy === "MEETING")  return "SATURDAY_MEETING";
    return "FIELD"; // FULL_DAY
  }
  return "FIELD";
}

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
    // Fetch company Saturday policy to auto-fill day types
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: { select: { saturday_default: true } } },
    });
    const satPolicy = user?.company?.saturday_default ?? "OFF";
    const holidaySet = getUgandaPublicHolidays(year);

    // Build all day records for the month with correct day_type
    const daysInMonth = new Date(year, month, 0).getDate();
    const dayRows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      dayRows.push({
        day_number: d,
        day_type: computeDayType(date, satPolicy, holidaySet),
      });
    }

    plan = await prisma.tourPlan.create({
      data: {
        user_id: userId,
        month,
        year,
        days: { createMany: { data: dayRows } },
      },
      include: PLAN_INCLUDE,
    });
  }

  // Backfill days for plans that were created before auto-fill was introduced
  if (plan.days.length === 0) {
    const user2 = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: { select: { saturday_default: true } } },
    });
    const satPolicy2 = user2?.company?.saturday_default ?? "OFF";
    const holidaySet2 = getUgandaPublicHolidays(year);
    const daysInMonth2 = new Date(year, month, 0).getDate();
    const backfillRows = [];
    for (let d = 1; d <= daysInMonth2; d++) {
      backfillRows.push({
        plan_id: plan.id,
        day_number: d,
        day_type: computeDayType(new Date(year, month - 1, d), satPolicy2, holidaySet2),
      });
    }
    await prisma.tourPlanDay.createMany({ data: backfillRows, skipDuplicates: true });
    plan = await prisma.tourPlan.findUnique({
      where: { user_id_month_year: { user_id: userId, month, year } },
      include: PLAN_INCLUDE,
    });
  }

  // Fetch current cycle so frontend knows which doctors to plan + their frequencies
  const cycle = await prisma.callCycle.findUnique({
    where: { user_id_month_year: { user_id: userId, month, year } },
    include: {
      items: {
        include: {
          doctor: {
            select: {
              id: true, doctor_name: true, town: true, cadre: true,
              work_facilities: {
                where: { is_primary: true },
                select: { facility: { select: { id: true, name: true, town: true } } },
              },
            },
          },
        },
        orderBy: { doctor: { doctor_name: "asc" } },
      },
    },
  });

  res.json({ success: true, data: { plan, cycle: cycle ?? null } });
});

// ─── PUT /api/tour-plan/:id/day ───────────────────────────────────────────────
// Upsert day-level metadata (area, day_type, expenses).
export const updateTourPlanDay = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { day_number, morning_area, evening_area, notes, day_type,
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

  const isOffDay = day_type
    ? !["FIELD", "OFFICE_DAY", "SATURDAY_HALF", "SATURDAY_MEETING"].includes(day_type)
    : false;

  const day = await prisma.tourPlanDay.upsert({
    where: { plan_id_day_number: { plan_id: id, day_number } },
    create: {
      plan_id: id, day_number,
      morning_area: morning_area ?? null, evening_area: evening_area ?? null,
      notes: notes ?? null,
      day_type: day_type ?? "FIELD",
      is_off_day: isOffDay,
      daily_allowance: daily_allowance ?? 0, transport: transport ?? 0,
      airtime: airtime ?? 0, accommodation: accommodation ?? 0, other_costs: other_costs ?? 0,
    },
    update: {
      morning_area: morning_area ?? null, evening_area: evening_area ?? null,
      notes: notes ?? null,
      ...(day_type !== undefined && { day_type, is_off_day: isOffDay }),
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
  const userId = req.user.id;

  const plan = await prisma.tourPlan.findUnique({ where: { id } });
  if (!plan || plan.user_id !== userId) {
    return res.status(404).json({ success: false, error: "Plan not found" });
  }
  if (plan.status !== "DRAFT") {
    return res.status(400).json({ success: false, error: "Only DRAFT plans can be submitted" });
  }

  // Gate: rep must have an approved call cycle for this same month/year
  const approvedCycle = await prisma.callCycle.findFirst({
    where: { user_id: userId, month: plan.month, year: plan.year, status: { in: ["APPROVED", "LOCKED"] } },
  });
  if (!approvedCycle) {
    return res.status(403).json({
      success: false,
      error: "CYCLE_NOT_APPROVED",
      message: "Your call cycle for this month must be approved before you can submit the tour plan.",
    });
  }

  // Deadline: 5th of the plan's own month
  const deadline = new Date(plan.year, plan.month - 1, 5, 23, 59, 59);
  const now = new Date();
  if (now > deadline) {
    const lateReq = await prisma.lateSubmissionRequest.findUnique({
      where: { user_id_type_month_year: { user_id: userId, type: "TOUR_PLAN", month: plan.month, year: plan.year } },
    });
    if (!lateReq || lateReq.status !== "APPROVED") {
      const monthName = new Date(plan.year, plan.month - 1).toLocaleString("default", { month: "long" });
      return res.status(403).json({
        success: false,
        error: "LATE_SUBMISSION_REQUIRED",
        message: `The deadline to submit this tour plan was the 5th of ${monthName}. Please submit a late-submission request and wait for supervisor approval.`,
      });
    }
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
  const plan = await prisma.tourPlan.findUnique({
    where:   { id },
    include: { user: { select: { company_id: true } } },
  });
  if (!plan) { res.status(404); throw new Error("Tour plan not found"); }
  if (plan.user.company_id !== req.user.company_id) { res.status(403); throw new Error("Access denied"); }

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

  const plan = await prisma.tourPlan.findUnique({
    where:   { id },
    include: { user: { select: { company_id: true } } },
  });
  if (!plan) { res.status(404); throw new Error("Tour plan not found"); }
  if (plan.user.company_id !== req.user.company_id) { res.status(403); throw new Error("Access denied"); }

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
