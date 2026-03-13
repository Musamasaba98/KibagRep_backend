import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// GET /api/target/my — rep sees their own current-month target
export const getMyTarget = asyncHandler(async (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const target = await prisma.salesTarget.findUnique({
    where: { user_id_month_year: { user_id: req.user.id, month, year } },
  });

  res.json({ success: true, data: target ?? null });
});

// GET /api/target/team?month=3&year=2026 — supervisor sees all reps in company
export const getTeamTargets = asyncHandler(async (req, res) => {
  const { company_id } = req.user;

  const now = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year = parseInt(req.query.year) || now.getFullYear();

  const reps = await prisma.user.findMany({
    where: { company_id, role: "MedicalRep" },
    select: { id: true, firstname: true, lastname: true },
    orderBy: { firstname: "asc" },
  });

  const targets = await prisma.salesTarget.findMany({
    where: { user_id: { in: reps.map((r) => r.id) }, month, year },
  });

  const targetMap = Object.fromEntries(targets.map((t) => [t.user_id, t]));

  const data = reps.map((rep) => ({
    user: rep,
    target: targetMap[rep.id] ?? null,
    month,
    year,
  }));

  res.json({ success: true, data });
});

// POST /api/target — set/upsert a target for a rep (supervisor/manager)
export const setTarget = asyncHandler(async (req, res) => {
  const { user_id, month, year, target_value, target_units } = req.body;

  if (!user_id || !month || !year) {
    return res.status(400).json({ success: false, message: "user_id, month, year required" });
  }

  const target = await prisma.salesTarget.upsert({
    where: { user_id_month_year: { user_id, month: Number(month), year: Number(year) } },
    update: {
      target_value: Number(target_value) || 0,
      target_units: Number(target_units) || 0,
      set_by: req.user.id,
    },
    create: {
      user_id,
      month: Number(month),
      year: Number(year),
      target_value: Number(target_value) || 0,
      target_units: Number(target_units) || 0,
      set_by: req.user.id,
    },
  });

  res.json({ success: true, data: target });
});
