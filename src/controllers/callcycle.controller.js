import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// ── Rep endpoints ─────────────────────────────────────────────────────────────

// GET /api/cycle/current — get or create this month's cycle for the logged-in rep
export const getCurrentCycle = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  let cycle = await prisma.callCycle.findUnique({
    where: { user_id_month_year: { user_id: userId, month, year } },
    include: {
      items: {
        include: {
          doctor: { select: { id: true, doctor_name: true, town: true, location: true, speciality: true } },
        },
        orderBy: [{ tier: "asc" }, { visits_done: "asc" }],
      },
    },
  });

  if (!cycle) {
    cycle = await prisma.callCycle.create({
      data: { user_id: userId, month, year },
      include: {
        items: {
          include: {
            doctor: { select: { id: true, doctor_name: true, town: true, location: true, speciality: true } },
          },
        },
      },
    });
  }

  res.status(200).json({ success: true, data: cycle });
});

// POST /api/cycle/current/items — add a doctor to the current cycle
export const addCycleItem = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { doctor_id, tier = "B", frequency } = req.body;

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

  if (cycle.status === "LOCKED") {
    res.status(403);
    throw new Error("Cycle is locked — contact your supervisor to make changes");
  }

  const freqMap = { A: 4, B: 2, C: 1 };
  const item = await prisma.callCycleItem.create({
    data: {
      cycle_id: cycle.id,
      doctor_id,
      tier,
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
  if (item.cycle.status === "LOCKED") {
    res.status(403);
    throw new Error("Cycle is locked — contact your supervisor");
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

  const updated = await prisma.callCycle.update({
    where: { id },
    data: { status: "SUBMITTED" },
  });

  res.status(200).json({ success: true, data: updated });
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

  const cycles = await prisma.callCycle.findMany({
    where: { user_id: { in: userIds }, status: "SUBMITTED" },
    include: {
      user: { select: { id: true, firstname: true, lastname: true, role: true } },
      items: {
        include: {
          doctor: { select: { id: true, doctor_name: true, town: true } },
        },
      },
    },
    orderBy: { created_at: "desc" },
  });

  res.status(200).json({ success: true, data: cycles });
});

// PUT /api/cycle/:id/approve — supervisor approves and locks the cycle
export const approveCycle = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const cycle = await prisma.callCycle.findUnique({ where: { id } });
  if (!cycle) { res.status(404); throw new Error("Cycle not found"); }
  if (cycle.status !== "SUBMITTED") { res.status(400); throw new Error("Only SUBMITTED cycles can be approved"); }

  const updated = await prisma.callCycle.update({
    where: { id },
    data: {
      status: "LOCKED",
      approved_by: req.user.id,
      approved_at: new Date(),
      locked_at: new Date(),
    },
  });

  res.status(200).json({ success: true, data: updated });
});

// PUT /api/cycle/:id/reject — supervisor rejects cycle back to DRAFT
export const rejectCycle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  const cycle = await prisma.callCycle.findUnique({ where: { id } });
  if (!cycle) { res.status(404); throw new Error("Cycle not found"); }
  if (cycle.status !== "SUBMITTED") { res.status(400); throw new Error("Only SUBMITTED cycles can be rejected"); }

  const updated = await prisma.callCycle.update({
    where: { id },
    data: { status: "DRAFT" },
  });

  res.status(200).json({ success: true, data: updated, note: note ?? null });
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
