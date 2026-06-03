import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// ── Rep: POST /api/late-requests ──────────────────────────────────────────────
// Rep creates a late-submission request when they missed the cycle (25th) or
// tour-plan (5th) deadline. Supervisor must approve before they can submit.
export const createLateRequest = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { type, month, year, note } = req.body;

  if (!type || !month || !year || !note?.trim()) {
    res.status(400);
    throw new Error("type, month, year and note are required");
  }
  if (!["CYCLE", "TOUR_PLAN"].includes(type)) {
    res.status(400);
    throw new Error("type must be CYCLE or TOUR_PLAN");
  }

  // Upsert — rep can update their note while still PENDING
  const existing = await prisma.lateSubmissionRequest.findUnique({
    where: { user_id_type_month_year: { user_id: userId, type, month: parseInt(month), year: parseInt(year) } },
  });
  if (existing && existing.status === "APPROVED") {
    return res.status(400).json({ success: false, error: "Already approved — you can now submit." });
  }
  if (existing && existing.status === "REJECTED") {
    // Allow re-request after rejection — reset to PENDING with new note
    const updated = await prisma.lateSubmissionRequest.update({
      where: { id: existing.id },
      data: { note: note.trim(), status: "PENDING", reviewed_by: null, reviewed_at: null, review_note: null },
    });
    return res.status(200).json({ success: true, data: updated });
  }
  if (existing) {
    const updated = await prisma.lateSubmissionRequest.update({
      where: { id: existing.id },
      data: { note: note.trim() },
    });
    return res.status(200).json({ success: true, data: updated });
  }

  const request = await prisma.lateSubmissionRequest.create({
    data: { user_id: userId, type, month: parseInt(month), year: parseInt(year), note: note.trim() },
  });
  res.status(201).json({ success: true, data: request });
});

// ── Rep: GET /api/late-requests/my ───────────────────────────────────────────
export const getMyLateRequests = asyncHandler(async (req, res) => {
  const requests = await prisma.lateSubmissionRequest.findMany({
    where: { user_id: req.user.id },
    orderBy: { created_at: "desc" },
  });
  res.json({ success: true, data: requests });
});

// ── Supervisor: GET /api/late-requests/pending ────────────────────────────────
export const getPendingLateRequests = asyncHandler(async (req, res) => {
  const supervisor = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { company_id: true },
  });
  const repIds = supervisor?.company_id
    ? (await prisma.user.findMany({ where: { company_id: supervisor.company_id }, select: { id: true } })).map((u) => u.id)
    : [];

  const requests = await prisma.lateSubmissionRequest.findMany({
    where: { user_id: { in: repIds }, status: "PENDING" },
    include: { user: { select: { id: true, firstname: true, lastname: true } } },
    orderBy: { created_at: "asc" },
  });
  res.json({ success: true, data: requests });
});

// ── Supervisor: PUT /api/late-requests/:id/approve ────────────────────────────
export const approveLateRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updated = await prisma.lateSubmissionRequest.update({
    where: { id },
    data: { status: "APPROVED", reviewed_by: req.user.id, reviewed_at: new Date() },
  });
  res.json({ success: true, data: updated });
});

// ── Supervisor: PUT /api/late-requests/:id/reject ─────────────────────────────
export const rejectLateRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const updated = await prisma.lateSubmissionRequest.update({
    where: { id },
    data: { status: "REJECTED", reviewed_by: req.user.id, reviewed_at: new Date(), review_note: note ?? null },
  });
  res.json({ success: true, data: updated });
});
