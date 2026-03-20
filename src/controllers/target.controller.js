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

// GET /api/target/product-team?month=&year= — per-product targets for all reps in company
export const getProductTeamTargets = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const now = new Date();
  const month = parseInt(req.query.month) || now.getMonth() + 1;
  const year = parseInt(req.query.year) || now.getFullYear();

  const reps = await prisma.user.findMany({
    where: { company_id, role: "MedicalRep" },
    select: { id: true, firstname: true, lastname: true },
    orderBy: { firstname: "asc" },
  });

  const products = await prisma.product.findMany({
    where: { company_id },
    select: { id: true, product_name: true, unit_price: true },
    orderBy: { product_name: "asc" },
  });

  const existingTargets = await prisma.productTarget.findMany({
    where: { user_id: { in: reps.map((r) => r.id) }, month, year },
  });

  // Map: "user_id:product_id" -> target
  const targetMap = Object.fromEntries(
    existingTargets.map((t) => [`${t.user_id}:${t.product_id}`, t])
  );

  const data = reps.map((rep) => ({
    user: rep,
    product_targets: products.map((p) => ({
      product: p,
      target: targetMap[`${rep.id}:${p.id}`] ?? null,
    })),
    month,
    year,
  }));

  res.json({ success: true, data, products });
});

// POST /api/target/product — upsert a product target for a single rep
export const setProductTarget = asyncHandler(async (req, res) => {
  const { user_id, product_id, month, year, target_units } = req.body;
  if (!user_id || !product_id || !month || !year) {
    return res.status(400).json({ success: false, message: "user_id, product_id, month, year required" });
  }

  const target = await prisma.productTarget.upsert({
    where: { user_id_product_id_month_year: { user_id, product_id, month: Number(month), year: Number(year) } },
    update: { target_units: Number(target_units) || 0, set_by: req.user.id },
    create: { user_id, product_id, month: Number(month), year: Number(year), target_units: Number(target_units) || 0, set_by: req.user.id },
  });

  res.json({ success: true, data: target });
});

// POST /api/target/product-bulk — set same product targets for ALL reps
export const setBulkProductTargets = asyncHandler(async (req, res) => {
  const { items, month, year } = req.body;
  // items: [{ product_id, target_units }]
  // applies to all MedicalReps in the company
  if (!items || !month || !year) {
    return res.status(400).json({ success: false, message: "items, month, year required" });
  }

  const { company_id } = req.user;
  const reps = await prisma.user.findMany({
    where: { company_id, role: "MedicalRep" },
    select: { id: true },
  });

  const upserts = [];
  for (const rep of reps) {
    for (const item of items) {
      upserts.push(
        prisma.productTarget.upsert({
          where: { user_id_product_id_month_year: { user_id: rep.id, product_id: item.product_id, month: Number(month), year: Number(year) } },
          update: { target_units: Number(item.target_units) || 0, set_by: req.user.id },
          create: { user_id: rep.id, product_id: item.product_id, month: Number(month), year: Number(year), target_units: Number(item.target_units) || 0, set_by: req.user.id },
        })
      );
    }
  }

  await prisma.$transaction(upserts);
  res.json({ success: true, message: `Targets set for ${reps.length} reps` });
});

// PUT /api/target/product-price/:id — update product unit price (role-aware)
// COUNTRY_MGR / SUPER_ADMIN → sets unit_price directly
// Manager / SALES_ADMIN → puts in pending_unit_price for CM approval
export const updateProductPrice = asyncHandler(async (req, res) => {
  const { unit_price } = req.body;
  const { role, id: userId } = req.user;
  const isCM = role === "COUNTRY_MGR" || role === "SUPER_ADMIN";

  const data = isCM
    ? { unit_price: parseFloat(unit_price) || 0, pending_unit_price: null, price_proposed_by: null }
    : { pending_unit_price: parseFloat(unit_price) || 0, price_proposed_by: userId };

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ success: true, data: product, pending: !isCM });
});

// PUT /api/target/product-price/:id/approve — CM approves pending price
export const approveProductPrice = asyncHandler(async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product?.pending_unit_price) {
    return res.status(400).json({ success: false, message: "No pending price to approve" });
  }
  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: { unit_price: product.pending_unit_price, pending_unit_price: null, price_proposed_by: null },
  });
  res.json({ success: true, data: updated });
});

// PUT /api/target/product-price/:id/reject — CM rejects pending price
export const rejectProductPrice = asyncHandler(async (req, res) => {
  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: { pending_unit_price: null, price_proposed_by: null },
  });
  res.json({ success: true, data: updated });
});

// GET /api/target/product-prices — get company products with pending prices (CM view)
export const getProductPrices = asyncHandler(async (req, res) => {
  const { company_id } = req.user;
  const products = await prisma.product.findMany({
    where: { company_id },
    select: { id: true, product_name: true, unit_price: true, pending_unit_price: true, price_proposed_by: true },
    orderBy: { product_name: "asc" },
  });
  res.json({ success: true, data: products });
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
