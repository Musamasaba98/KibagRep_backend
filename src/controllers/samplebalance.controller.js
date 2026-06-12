import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";
import { writeAudit } from "../utils/audit.js";

const nowMonth = () => new Date().getMonth() + 1;
const nowYear  = () => new Date().getFullYear();

// ─── GET /api/sample-balance/my?month=&year= ─────────────────────────────

export const getMyBalance = asyncHandler(async (req, res) => {
  const month = parseInt(req.query.month) || nowMonth();
  const year  = parseInt(req.query.year)  || nowYear();

  const balances = await prisma.sampleBalance.findMany({
    where: { user_id: req.user.id, month, year },
    include: { product: { select: { id: true, product_name: true } } },
  });
  res.json({ success: true, data: balances });
});

// ─── GET /api/sample-balance/history ─────────────────────────────────────
// Returns all monthly records for this rep grouped by month/year.

export const getMyHistory = asyncHandler(async (req, res) => {
  const balances = await prisma.sampleBalance.findMany({
    where: { user_id: req.user.id },
    include: { product: { select: { id: true, product_name: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }, { product_id: "asc" }],
  });
  res.json({ success: true, data: balances });
});

// ─── GET /api/sample-balance/products-for-rep/:userId ───────────────────
// Returns products the rep can be issued: team products if in a team, else company products.

export const getProductsForRep = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const repUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { team_id: true, company_id: true },
  });

  if (!repUser) {
    res.status(404);
    throw new Error("User not found");
  }

  let products = [];
  if (repUser.team_id) {
    const teamProducts = await prisma.teamProduct.findMany({
      where: { team_id: repUser.team_id },
      include: { product: { select: { id: true, product_name: true } } },
    });
    products = teamProducts.map((tp) => tp.product);
  }

  if (products.length === 0) {
    products = await prisma.product.findMany({
      where: { company_id: repUser.company_id },
      select: { id: true, product_name: true },
      orderBy: { product_name: "asc" },
    });
  }

  res.json({ success: true, data: products });
});

// ─── POST /api/sample-balance/issue-batch ───────────────────────────────
// Body: { user_id, allocations: [{ product_id, quantity }], new_month, month?, year? }
// new_month=true → set issued=quantity, given=0 for the target month.
// new_month=false → increment issued (top-up for the same month).

export const issueSamplesBatch = asyncHandler(async (req, res) => {
  const { user_id, allocations, new_month, month, year } = req.body;

  if (!user_id || !Array.isArray(allocations) || allocations.length === 0) {
    res.status(400);
    throw new Error("user_id and at least one allocation are required");
  }

  const m = parseInt(month) || nowMonth();
  const y = parseInt(year)  || nowYear();

  const valid = allocations.filter(
    (a) => a.product_id && Number.isInteger(a.quantity) && a.quantity > 0
  );
  if (valid.length === 0) {
    res.status(400);
    throw new Error("All allocations must have a valid product_id and positive integer quantity");
  }

  const results = await Promise.all(
    valid.map(({ product_id, quantity }) =>
      prisma.sampleBalance.upsert({
        where: { user_id_product_id_month_year: { user_id, product_id, month: m, year: y } },
        create: { user_id, product_id, month: m, year: y, issued: quantity, given: 0 },
        update: new_month
          ? { issued: quantity, given: 0 }
          : { issued: { increment: quantity } },
      })
    )
  );

  await writeAudit({
    actorId: req.user.id,
    action: new_month ? "sample.monthly_allocation" : "sample.top_up",
    entityType: "SampleBalance",
    entityId: user_id,
    metadata: { user_id, allocations: valid, new_month, month: m, year: y },
  });

  res.status(201).json({ success: true, data: results });
});

// ─── GET /api/sample-balance/team?month=&year= ───────────────────────────

export const getTeamBalances = asyncHandler(async (req, res) => {
  const month = parseInt(req.query.month) || nowMonth();
  const year  = parseInt(req.query.year)  || nowYear();

  const balances = await prisma.sampleBalance.findMany({
    where: { user: { company_id: req.user.company_id }, month, year },
    include: {
      product: { select: { id: true, product_name: true } },
      user: { select: { id: true, firstname: true, lastname: true } },
    },
    orderBy: [{ user_id: "asc" }, { product_id: "asc" }],
  });
  res.json({ success: true, data: balances });
});

// ─── POST /api/sample-balance/issue (admin/manager — single product) ─────
// Body: { user_id, product_id, quantity, month?, year? }

export const issueSamples = asyncHandler(async (req, res) => {
  const { user_id, product_id, quantity, month, year } = req.body;

  if (!user_id || !product_id || !quantity || quantity < 1) {
    res.status(400);
    throw new Error("user_id, product_id, and a positive quantity are required");
  }

  const m = parseInt(month) || nowMonth();
  const y = parseInt(year)  || nowYear();

  const balance = await prisma.sampleBalance.upsert({
    where: { user_id_product_id_month_year: { user_id, product_id, month: m, year: y } },
    create: { user_id, product_id, month: m, year: y, issued: quantity },
    update: { issued: { increment: quantity } },
  });

  await writeAudit({
    actorId: req.user.id,
    action: "sample.issued",
    entityType: "SampleBalance",
    entityId: balance.id,
    metadata: { user_id, product_id, quantity, month: m, year: y },
  });

  res.status(201).json({ success: true, data: balance });
});

// ─── POST /api/sample-balance/give (rep) ────────────────────────────────
// Body: { product_id, quantity, month?, year? }

export const giveSamples = asyncHandler(async (req, res) => {
  const { product_id, quantity, month, year } = req.body;

  if (!product_id || !quantity || quantity < 1) {
    res.status(400);
    throw new Error("product_id and a positive quantity are required");
  }

  const m = parseInt(month) || nowMonth();
  const y = parseInt(year)  || nowYear();

  const existing = await prisma.sampleBalance.findUnique({
    where: { user_id_product_id_month_year: { user_id: req.user.id, product_id, month: m, year: y } },
  });

  if (!existing) {
    res.status(400);
    throw new Error("No sample balance found for this product this month — contact your supervisor");
  }

  const remaining = existing.issued - existing.given;
  if (quantity > remaining) {
    res.status(400);
    throw new Error(`Insufficient balance. Available: ${remaining}, requested: ${quantity}`);
  }

  const balance = await prisma.sampleBalance.update({
    where: { user_id_product_id_month_year: { user_id: req.user.id, product_id, month: m, year: y } },
    data: { given: { increment: quantity } },
  });

  await writeAudit({
    actorId: req.user.id,
    action: "sample.given",
    entityType: "SampleBalance",
    entityId: balance.id,
    metadata: { product_id, quantity, month: m, year: y },
  });

  res.json({ success: true, data: balance });
});
