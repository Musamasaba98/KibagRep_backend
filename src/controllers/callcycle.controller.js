import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// ── Rep endpoints ─────────────────────────────────────────────────────────────

// GET /api/cycle/current?month=&year= — get or create cycle for given month (defaults to current month)
export const getCurrentCycle = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const companyId = req.user.company_id;
  const now = new Date();
  const month = req.query.month ? parseInt(req.query.month) : now.getMonth() + 1;
  const year  = req.query.year  ? parseInt(req.query.year)  : now.getFullYear();

  const doctorSelect = {
    id: true, doctor_name: true, town: true, location: true, speciality: true,
    facility: {
      select: {
        territory_links: {
          where: { territory: { company_id: companyId } },
          select: { territory: { select: { territory_type: true } } },
          take: 1,
        },
      },
    },
    ...(companyId ? {
      company_tiers: {
        where: { company_id: companyId },
        select: { tier: true, visit_frequency: true, notes: true },
        take: 1,
      },
    } : {}),
  };

  let cycle = await prisma.callCycle.findUnique({
    where: { user_id_month_year: { user_id: userId, month, year } },
    include: {
      items: {
        include: { doctor: { select: doctorSelect } },
        orderBy: [{ tier: "asc" }, { visits_done: "asc" }],
      },
    },
  });

  if (!cycle) {
    cycle = await prisma.callCycle.create({
      data: { user_id: userId, month, year },
      include: {
        items: { include: { doctor: { select: doctorSelect } } },
      },
    });
  }

  // Flatten company_tier and territory_type onto each item for the frontend
  const data = {
    ...cycle,
    items: cycle.items.map((item) => {
      const companyTier = item.doctor.company_tiers?.[0] ?? null;
      const territoryType = item.doctor.facility?.territory_links?.[0]?.territory?.territory_type ?? null;
      return {
        ...item,
        tier: companyTier?.tier ?? item.tier,
        doctor: {
          id: item.doctor.id,
          doctor_name: item.doctor.doctor_name,
          town: item.doctor.town,
          location: item.doctor.location,
          speciality: item.doctor.speciality,
        },
        company_tier: companyTier,
        territory_type: territoryType,
      };
    }),
  };

  res.status(200).json({ success: true, data });
});

// POST /api/cycle/current/items — add a doctor to the current cycle
export const addCycleItem = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const companyId = req.user.company_id;
  const { doctor_id, tier: tierOverride, list_type: listTypeOverride, frequency } = req.body;

  if (!doctor_id) {
    res.status(400);
    throw new Error("doctor_id is required");
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Find or create cycle
  let cycle = await prisma.callCycle.findUnique({
    where: { user_id_month_year: { user_id: userId, month, year } },
  });

  if (!cycle) {
    cycle = await prisma.callCycle.create({ data: { user_id: userId, month, year } });
  }

  if (cycle.status === "LOCKED" || cycle.status === "APPROVED") {
    res.status(403);
    throw new Error("Cycle is approved — contact your supervisor to make changes");
  }

  // Derive tier from the company's classification for this doctor (fallback: B)
  let tier = tierOverride ?? "B";
  if (!tierOverride && companyId) {
    const companyTier = await prisma.doctorCompanyTier.findUnique({
      where: { doctor_id_company_id: { doctor_id, company_id: companyId } },
    });
    if (companyTier) tier = companyTier.tier;
  }

  // Derive list_type from the territory type of the doctor's facility
  // TOWN → KBL, UPCOUNTRY → BL, REGIONAL → BL (badge hidden in UI)
  let list_type = listTypeOverride ?? "BL";
  if (!listTypeOverride && companyId) {
    const doctor = await prisma.doctor.findUnique({
      where: { id: doctor_id },
      select: { facility_id: true },
    });
    if (doctor?.facility_id) {
      const link = await prisma.territoryFacility.findFirst({
        where: {
          facility_id: doctor.facility_id,
          territory: { company_id: companyId },
        },
        select: { territory: { select: { territory_type: true } } },
      });
      if (link) {
        list_type = link.territory.territory_type === "TOWN" ? "KBL" : "BL";
      }
    }
  }

  const freqMap = { A: 4, B: 2, C: 1 };
  const item = await prisma.callCycleItem.create({
    data: {
      cycle_id: cycle.id,
      doctor_id,
      tier,
      list_type,
      frequency: frequency ?? freqMap[tier] ?? 2,
    },
    include: {
      doctor: { select: { id: true, doctor_name: true, town: true, speciality: true } },
    },
  });

  res.status(201).json({ success: true, data: item });
});

// DELETE /api/cycle/current/items/:itemId — remove a doctor from the cycle
export const removeCycleItem = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { itemId } = req.params;

  const item = await prisma.callCycleItem.findUnique({
    where: { id: itemId },
    include: { cycle: true },
  });

  if (!item) {
    res.status(404);
    throw new Error("Item not found");
  }
  if (item.cycle.user_id !== userId) {
    res.status(403);
    throw new Error("Not your cycle");
  }
  if (item.cycle.status === "LOCKED" || item.cycle.status === "APPROVED") {
    res.status(403);
    throw new Error("Cycle is approved — contact your supervisor");
  }

  await prisma.callCycleItem.delete({ where: { id: itemId } });
  res.status(200).json({ success: true });
});

// POST /api/cycle/:id/submit — rep submits cycle for supervisor approval
export const submitCycle = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const cycle = await prisma.callCycle.findUnique({ where: { id } });
  if (!cycle) { res.status(404); throw new Error("Cycle not found"); }
  if (cycle.user_id !== userId) { res.status(403); throw new Error("Not your cycle"); }
  if (cycle.status !== "DRAFT") { res.status(400); throw new Error(`Cycle is already ${cycle.status}`); }

  // Deadline: 25th of the month BEFORE the cycle's month
  // e.g. July cycle → deadline = June 25
  const deadlineMonth = cycle.month === 1 ? 12 : cycle.month - 1;
  const deadlineYear  = cycle.month === 1 ? cycle.year - 1 : cycle.year;
  const deadline = new Date(deadlineYear, deadlineMonth - 1, 25, 23, 59, 59);
  const now = new Date();

  if (now > deadline) {
    // Check for an approved late request for this cycle month/year
    const lateReq = await prisma.lateSubmissionRequest.findUnique({
      where: { user_id_type_month_year: { user_id: userId, type: "CYCLE", month: cycle.month, year: cycle.year } },
    });
    if (!lateReq || lateReq.status !== "APPROVED") {
      return res.status(403).json({
        success: false,
        error: "LATE_SUBMISSION_REQUIRED",
        message: `The deadline to submit this cycle was the 25th of ${new Date(deadlineYear, deadlineMonth - 1).toLocaleString("default", { month: "long" })}. Please submit a late-submission request and wait for supervisor approval.`,
      });
    }
  }

  const updated = await prisma.callCycle.update({
    where: { id },
    data: { status: "SUBMITTED" },
  });

  res.status(200).json({ success: true, data: updated });
});

// POST /api/cycle/carry-forward — copy last approved cycle into next month DRAFT
export const carryForwardCycle = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  // Target: next month's cycle
  const rawNext = now.getMonth() + 2; // getMonth is 0-indexed, +1 = current, +2 = next
  const nextMonth = rawNext > 12 ? 1 : rawNext;
  const nextYear  = rawNext > 12 ? now.getFullYear() + 1 : now.getFullYear();

  // Find most recent approved/locked cycle to copy from
  const source = await prisma.callCycle.findFirst({
    where: { user_id: userId, status: { in: ["APPROVED", "LOCKED"] } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: { items: true },
  });
  if (!source || source.items.length === 0) {
    res.status(404);
    throw new Error("No approved cycle found to carry forward from");
  }

  // Get or create next month's DRAFT cycle
  let target = await prisma.callCycle.findUnique({
    where: { user_id_month_year: { user_id: userId, month: nextMonth, year: nextYear } },
    include: { items: true },
  });
  if (!target) {
    target = await prisma.callCycle.create({
      data: { user_id: userId, month: nextMonth, year: nextYear },
      include: { items: true },
    });
  }
  if (target.status !== "DRAFT") {
    res.status(400);
    throw new Error("Cannot carry forward — next month's cycle is already submitted or approved");
  }

  // Add items not already in the target
  const existing = new Set(target.items.map((i) => i.doctor_id));
  const toAdd = source.items.filter((i) => !existing.has(i.doctor_id));
  if (toAdd.length > 0) {
    await prisma.callCycleItem.createMany({
      data: toAdd.map((i) => ({
        cycle_id: target.id,
        doctor_id: i.doctor_id,
        tier: i.tier,
        list_type: i.list_type,
        frequency: i.frequency,
      })),
      skipDuplicates: true,
    });
  }

  const updated = await prisma.callCycle.findUnique({
    where: { id: target.id },
    include: {
      items: {
        include: { doctor: { select: { id: true, doctor_name: true, town: true, location: true, speciality: true } } },
        orderBy: [{ tier: "asc" }, { visits_done: "asc" }],
      },
    },
  });
  res.status(200).json({ success: true, data: updated, carried: toAdd.length });
});

// ── Supervisor endpoints ───────────────────────────────────────────────────────

// GET /api/cycle/pending — supervisor sees all submitted cycles in their company
export const getPendingCycles = asyncHandler(async (req, res) => {
  const supervisorId = req.user.id;

  // Get company via supervisor's company_id
  const supervisor = await prisma.user.findUnique({
    where: { id: supervisorId },
    select: { company_id: true },
  });

  const companyUsers = supervisor?.company_id
    ? await prisma.user.findMany({
        where: { company_id: supervisor.company_id },
        select: { id: true },
      })
    : [];

  const userIds = companyUsers.map((u) => u.id);

  // Allow filtering by status. Management roles (SALES_ADMIN, COUNTRY_MGR) default to all; others default to SUBMITTED.
  const requestedStatus = req.query.status;
  const mgmtRoles = ["SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN", "Manager"];
  const isMgmt = mgmtRoles.includes(req.user.role);
  const statusFilter = requestedStatus ?? (isMgmt ? undefined : "SUBMITTED");

  const cycles = await prisma.callCycle.findMany({
    where: {
      user_id: { in: userIds },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      user: { select: { id: true, firstname: true, lastname: true, role: true } },
      items: {
        select: {
          id: true,
          tier: true,
          list_type: true,
          frequency: true,
          visits_done: true,
          doctor: { select: { doctor_name: true, speciality: true, location: true, town: true } },
        },
        orderBy: [{ tier: "asc" }],
      },
    },
    orderBy: { created_at: "desc" },
  });

  // Resolve approver names for cycles that have been approved/rejected
  const approverIds = [...new Set(cycles.map((c) => c.approved_by).filter(Boolean))];
  const approvers = approverIds.length
    ? await prisma.user.findMany({
        where: { id: { in: approverIds } },
        select: { id: true, firstname: true, lastname: true, role: true },
      })
    : [];
  const approverMap = Object.fromEntries(approvers.map((u) => [u.id, u]));

  const data = cycles.map((c) => ({
    ...c,
    approved_by_user: c.approved_by ? (approverMap[c.approved_by] ?? null) : null,
  }));

  res.status(200).json({ success: true, data });
});

// PUT /api/cycle/:id/approve — supervisor approves and locks the cycle
export const approveCycle = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const cycle = await prisma.callCycle.findUnique({
    where:   { id },
    include: { user: { select: { company_id: true } } },
  });
  if (!cycle) { res.status(404); throw new Error("Cycle not found"); }
  if (cycle.user.company_id !== req.user.company_id) { res.status(403); throw new Error("Access denied"); }
  if (cycle.status !== "SUBMITTED") { res.status(400); throw new Error("Only SUBMITTED cycles can be approved"); }

  const updated = await prisma.callCycle.update({
    where: { id },
    data: {
      status: "APPROVED",
      approved_by: req.user.id,
      approved_at: new Date(),
      review_note: null,
    },
  });

  res.status(200).json({ success: true, data: updated });
});

// PUT /api/cycle/:id/reject — supervisor rejects cycle back to DRAFT
export const rejectCycle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  const cycle = await prisma.callCycle.findUnique({
    where:   { id },
    include: { user: { select: { company_id: true } } },
  });
  if (!cycle) { res.status(404); throw new Error("Cycle not found"); }
  if (cycle.user.company_id !== req.user.company_id) { res.status(403); throw new Error("Access denied"); }
  if (cycle.status !== "SUBMITTED") { res.status(400); throw new Error("Only SUBMITTED cycles can be rejected"); }

  const updated = await prisma.callCycle.update({
    where: { id },
    data: { status: "DRAFT", review_note: note ?? null },
  });

  res.status(200).json({ success: true, data: updated });
});

// PATCH /api/cycle/current/items/:itemId/precall — set pre-call note for a cycle doctor
export const updatePrecallNote = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { itemId } = req.params;
  const { precall_note } = req.body;

  const item = await prisma.callCycleItem.findUnique({
    where: { id: itemId },
    include: { cycle: true },
  });

  if (!item) { res.status(404); throw new Error("Cycle item not found"); }
  if (item.cycle.user_id !== userId) { res.status(403); throw new Error("Not your cycle"); }

  const updated = await prisma.callCycleItem.update({
    where: { id: itemId },
    data: { precall_note: precall_note ?? null },
  });

  res.status(200).json({ success: true, data: updated });
});

// GET /api/cycle/:id/adherence — doctors under-visited relative to their target frequency
export const getCycleAdherence = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const cycle = await prisma.callCycle.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, firstname: true, lastname: true, company_id: true } },
      items: {
        include: {
          doctor: { select: { id: true, doctor_name: true, town: true, speciality: true } },
        },
      },
    },
  });

  if (!cycle) { res.status(404); throw new Error("Cycle not found"); }

  // Scope check: supervisor must be in the same company as the rep
  if (
    req.user.role !== "SUPER_ADMIN" &&
    cycle.user.company_id !== req.user.company_id
  ) {
    res.status(403);
    throw new Error("Access denied");
  }

  const total = cycle.items.length;
  const underVisited = cycle.items.filter((i) => i.visits_done < i.frequency);
  const adherenceRate = total > 0 ? ((total - underVisited.length) / total) * 100 : 100;

  res.status(200).json({
    success: true,
    data: {
      cycle_id: cycle.id,
      rep: cycle.user,
      month: cycle.month,
      year: cycle.year,
      status: cycle.status,
      total_doctors: total,
      fully_visited: total - underVisited.length,
      under_visited: underVisited.length,
      adherence_rate: Math.round(adherenceRate * 10) / 10,
      gaps: underVisited.map((i) => ({
        item_id: i.id,
        doctor: i.doctor,
        tier: i.tier,
        frequency: i.frequency,
        visits_done: i.visits_done,
        visits_remaining: i.frequency - i.visits_done,
      })),
    },
  });
});
