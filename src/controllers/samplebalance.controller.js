import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";
import { writeAudit } from "../utils/audit.js";

// ─── GET /api/sample-balance/my ──────────────────────────────────────────

export const getMyBalance = asyncHandler(async (req, res) => {
  const balances = await prisma.sampleBalance.findMany({
    where: { user_id: req.user.id },
    include: { product: { select: { id: true, product_name: true } } },
  });
  res.json({ success: true, data: balances });
});

// ─── GET /api/sample-balance/team (supervisor) ───────────────────────────

export const getTeamBalances = asyncHandler(async (req, res) => {
  const balances = await prisma.sampleBalance.findMany({
    where: { user: { company_id: req.user.company_id } },
    include: {
      product: { select: { id: true, product_name: true } },
      user: { select: { id: true, firstname: true, lastname: true } },
    },
    orderBy: [{ user_id: "asc" }, { product_id: "asc" }],
  });
  res.json({ success: true, data: balances });
});

// ─── POST /api/sample-balance/issue (admin/manager) ─────────────────────
// Body: { user_id, product_id, quantity }

export const issueSamples = asyncHandler(async (req, res) => {
  const { user_id, product_id, quantity } = req.body;

  if (!user_id || !product_id || !quantity || quantity < 1) {
    res.status(400);
    throw new Error("user_id, product_id, and a positive quantity are required");
  }

  const balance = await prisma.sampleBalance.upsert({
    where: { user_id_product_id: { user_id, product_id } },
    create: { user_id, product_id, issued: quantity },
    update: { issued: { increment: quantity } },
  });

  await writeAudit({
    actorId: req.user.id,
    action: "sample.issued",
    entityType: "SampleBalance",
    entityId: balance.id,
    metadata: { user_id, product_id, quantity },
  });

  res.status(201).json({ success: true, data: balance });
});

// ─── POST /api/sample-balance/give (rep) ────────────────────────────────
// Body: { product_id, quantity }
// Called automatically by createDoctorActivity; can also be called standalone.

export const giveSamples = asyncHandler(async (req, res) => {
  const { product_id, quantity } = req.body;

  if (!product_id || !quantity || quantity < 1) {
    res.status(400);
    throw new Error("product_id and a positive quantity are required");
  }

  const existing = await prisma.sampleBalance.findUnique({
    where: { user_id_product_id: { user_id: req.user.id, product_id } },
  });

  if (!existing) {
    res.status(400);
    throw new Error("No sample balance found for this product — request an issue first");
  }

  const remaining = existing.issued - existing.given;
  if (quantity > remaining) {
    res.status(400);
    throw new Error(`Insufficient balance. Available: ${remaining}, requested: ${quantity}`);
  }

  const balance = await prisma.sampleBalance.update({
    where: { user_id_product_id: { user_id: req.user.id, product_id } },
    data: { given: { increment: quantity } },
  });

  await writeAudit({
    actorId: req.user.id,
    action: "sample.given",
    entityType: "SampleBalance",
    entityId: balance.id,
    metadata: { product_id, quantity },
  });

  res.json({ success: true, data: balance });
});
