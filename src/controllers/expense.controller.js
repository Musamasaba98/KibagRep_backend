import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";
import { writeAudit } from "../utils/audit.js";
import { sendMail } from "../utils/mailer.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function recalcTotal(claimId) {
  const agg = await prisma.expenseItem.aggregate({
    where: { claim_id: claimId },
    _sum: { amount: true },
  });
  await prisma.expenseClaim.update({
    where: { id: claimId },
    data: { total_amount: agg._sum.amount ?? 0 },
  });
}

// ─── GET /api/expense/my ───────────────────────────────────────────────────

export const getMyClaims = asyncHandler(async (req, res) => {
  const claims = await prisma.expenseClaim.findMany({
    where: { user_id: req.user.id },
    include: { items: true },
    orderBy: { created_at: "desc" },
    take: 24,
  });
  res.json({ success: true, data: claims });
});

// ─── GET /api/expense/:id ─────────────────────────────────────────────────

export const getClaim = asyncHandler(async (req, res) => {
  const claim = await prisma.expenseClaim.findFirst({
    where: { id: req.params.id, user_id: req.user.id },
    include: { items: true },
  });
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found");
  }
  res.json({ success: true, data: claim });
});

// ─── POST /api/expense/create ─────────────────────────────────────────────

export const createClaim = asyncHandler(async (req, res) => {
  const period = req.body.period || currentPeriod();

  const existing = await prisma.expenseClaim.findFirst({
    where: { user_id: req.user.id, period },
  });
  if (existing) {
    return res.json({ success: true, data: existing });
  }

  const claim = await prisma.expenseClaim.create({
    data: { user_id: req.user.id, period },
    include: { items: true },
  });
  res.status(201).json({ success: true, data: claim });
});

// ─── POST /api/expense/:id/items ─────────────────────────────────────────

export const addItem = asyncHandler(async (req, res) => {
  const claim = await prisma.expenseClaim.findFirst({
    where: { id: req.params.id, user_id: req.user.id },
  });
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found");
  }
  if (claim.status !== "DRAFT") {
    res.status(400);
    throw new Error("Cannot modify a submitted claim");
  }

  const { category, description, amount, date } = req.body;

  const item = await prisma.expenseItem.create({
    data: {
      claim_id: claim.id,
      category,
      description,
      amount,
      date: new Date(date),
    },
  });

  await recalcTotal(claim.id);
  res.status(201).json({ success: true, data: item });
});

// ─── DELETE /api/expense/:id/items/:itemId ────────────────────────────────

export const removeItem = asyncHandler(async (req, res) => {
  const claim = await prisma.expenseClaim.findFirst({
    where: { id: req.params.id, user_id: req.user.id },
  });
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found");
  }
  if (claim.status !== "DRAFT") {
    res.status(400);
    throw new Error("Cannot modify a submitted claim");
  }

  await prisma.expenseItem.deleteMany({
    where: { id: req.params.itemId, claim_id: claim.id },
  });

  await recalcTotal(claim.id);
  res.json({ success: true });
});

// ─── PUT /api/expense/:id/submit ─────────────────────────────────────────

export const submitClaim = asyncHandler(async (req, res) => {
  const claim = await prisma.expenseClaim.findFirst({
    where: { id: req.params.id, user_id: req.user.id },
    include: { items: true },
  });
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found");
  }
  if (claim.status !== "DRAFT") {
    res.status(400);
    throw new Error(`Claim is already ${claim.status}`);
  }
  if (claim.items.length === 0) {
    res.status(400);
    throw new Error("Cannot submit a claim with no items");
  }

  const updated = await prisma.expenseClaim.update({
    where: { id: claim.id },
    data: { status: "SUBMITTED", submitted_at: new Date() },
    include: { items: true },
  });

  // Notify supervisors
  const supervisors = await prisma.user.findMany({
    where: {
      company_id: req.user.company_id,
      role: { in: ["Supervisor", "Manager", "SUPER_ADMIN"] },
    },
    select: { email: true },
  });
  const repName = `${req.user.firstname} ${req.user.lastname}`;
  for (const sv of supervisors) {
    await sendMail({
      to: sv.email,
      subject: `Expense claim submitted — ${repName} (${claim.period})`,
      html: `<p>${repName} submitted an expense claim for <strong>${claim.period}</strong> totalling <strong>UGX ${claim.total_amount.toLocaleString()}</strong>.</p>`,
    });
  }

  await writeAudit({ actorId: req.user.id, action: "expense.submitted", entityType: "ExpenseClaim", entityId: claim.id });
  res.json({ success: true, data: updated });
});

// ─── GET /api/expense/pending (supervisor) ────────────────────────────────

export const getPendingClaims = asyncHandler(async (req, res) => {
  const claims = await prisma.expenseClaim.findMany({
    where: {
      status: "SUBMITTED",
      user: { company_id: req.user.company_id },
    },
    include: {
      items: true,
      user: { select: { id: true, firstname: true, lastname: true, email: true } },
    },
    orderBy: { submitted_at: "asc" },
  });
  res.json({ success: true, data: claims });
});

// ─── PUT /api/expense/:id/approve (supervisor) ───────────────────────────

export const approveClaim = asyncHandler(async (req, res) => {
  const claim = await prisma.expenseClaim.findFirst({
    where: { id: req.params.id, user: { company_id: req.user.company_id } },
    include: { user: { select: { email: true, firstname: true, lastname: true } } },
  });
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found");
  }
  if (claim.status !== "SUBMITTED") {
    res.status(400);
    throw new Error(`Claim is ${claim.status}, not SUBMITTED`);
  }

  const updated = await prisma.expenseClaim.update({
    where: { id: claim.id },
    data: { status: "APPROVED", approved_by: req.user.id, approved_at: new Date() },
  });

  await sendMail({
    to: claim.user.email,
    subject: `Expense claim approved (${claim.period})`,
    html: `<p>Your expense claim for <strong>${claim.period}</strong> has been <strong>approved</strong>.</p>`,
  });

  await writeAudit({ actorId: req.user.id, action: "expense.approved", entityType: "ExpenseClaim", entityId: claim.id });
  res.json({ success: true, data: updated });
});

// ─── PUT /api/expense/:id/reject (supervisor) ────────────────────────────

export const rejectClaim = asyncHandler(async (req, res) => {
  const claim = await prisma.expenseClaim.findFirst({
    where: { id: req.params.id, user: { company_id: req.user.company_id } },
    include: { user: { select: { email: true, firstname: true, lastname: true } } },
  });
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found");
  }
  if (claim.status !== "SUBMITTED") {
    res.status(400);
    throw new Error(`Claim is ${claim.status}, not SUBMITTED`);
  }

  const { note } = req.body;
  const updated = await prisma.expenseClaim.update({
    where: { id: claim.id },
    data: { status: "DRAFT", review_note: note || null },
  });

  await sendMail({
    to: claim.user.email,
    subject: `Expense claim returned (${claim.period})`,
    html: `<p>Your expense claim for <strong>${claim.period}</strong> was returned for revision.</p>${note ? `<p><strong>Note:</strong> ${note}</p>` : ""}`,
  });

  await writeAudit({ actorId: req.user.id, action: "expense.rejected", entityType: "ExpenseClaim", entityId: claim.id });
  res.json({ success: true, data: updated });
});
