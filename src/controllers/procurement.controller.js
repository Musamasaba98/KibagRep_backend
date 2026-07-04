import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";

const ORDER_INCLUDE = {
  items: {
    include: {
      product: { select: { id: true, product_name: true, unit_price: true } },
    },
  },
  pharmacy: { select: { id: true, pharmacy_name: true, town: true, contact: true } },
  facility: { select: { id: true, name: true, town: true } },
  user:     { select: { id: true, firstname: true, lastname: true, team_id: true } },
};

// ─── POST /api/orders — rep creates a PROPOSED order ─────────────────────────
export const createOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { pharmacy_id, facility_id, items, notes, expected_delivery } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "Order must have at least one item" });
  }

  const productIds = items.map(i => i.product_id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, unit_price: true },
  });
  const priceMap = Object.fromEntries(products.map(p => [p.id, p.unit_price ?? 0]));

  let total_value = 0;
  const itemData = items.map(i => {
    const up = i.unit_price ?? priceMap[i.product_id] ?? 0;
    total_value += (i.quantity ?? 0) * up;
    return {
      product_id: i.product_id,
      quantity:   Number(i.quantity) || 0,
      unit_price: up,
      notes:      i.notes ?? null,
    };
  });

  const order = await prisma.procurementOrder.create({
    data: {
      user_id:           userId,
      pharmacy_id:       pharmacy_id ?? null,
      facility_id:       facility_id ?? null,
      notes:             notes ?? null,
      expected_delivery: expected_delivery ? new Date(expected_delivery) : null,
      total_value,
      items: { create: itemData },
    },
    include: ORDER_INCLUDE,
  });

  res.status(201).json({ success: true, data: order });
});

// ─── GET /api/orders — rep's own orders with optional status + month filter ───
export const listMyOrders = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const m = parseInt(req.query.month) || now.getMonth() + 1;
  const y = parseInt(req.query.year)  || now.getFullYear();
  const status = req.query.status;

  const start = new Date(y, m - 1, 1);
  const end   = new Date(y, m,     1);

  const orders = await prisma.procurementOrder.findMany({
    where: {
      user_id:    userId,
      order_date: { gte: start, lt: end },
      ...(status ? { status } : {}),
    },
    include: ORDER_INCLUDE,
    orderBy: { order_date: "desc" },
  });

  res.json({ success: true, data: orders });
});

// ─── PUT /api/orders/:id — rep edits a PROPOSED or REJECTED order ─────────────
export const updateOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { pharmacy_id, facility_id, items, notes } = req.body;

  const order = await prisma.procurementOrder.findUnique({ where: { id } });
  if (!order || order.user_id !== userId) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }
  if (order.status !== "PROPOSED" && order.status !== "REJECTED") {
    return res.status(403).json({ success: false, error: "Only PROPOSED or REJECTED orders can be edited" });
  }

  const productIds = (items ?? []).map(i => i.product_id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, unit_price: true },
  });
  const priceMap = Object.fromEntries(products.map(p => [p.id, p.unit_price ?? 0]));

  let total_value = 0;
  const itemData = (items ?? []).map(i => {
    const up = i.unit_price ?? priceMap[i.product_id] ?? 0;
    total_value += (i.quantity ?? 0) * up;
    return { product_id: i.product_id, quantity: Number(i.quantity) || 0, unit_price: up, notes: i.notes ?? null };
  });

  const [, updated] = await prisma.$transaction([
    prisma.procurementItem.deleteMany({ where: { order_id: id } }),
    prisma.procurementOrder.update({
      where: { id },
      data: {
        pharmacy_id:      pharmacy_id ?? null,
        facility_id:      facility_id ?? null,
        notes:            notes ?? null,
        status:           "PROPOSED",
        total_value,
        rejection_reason: null,
        items: { create: itemData },
      },
      include: ORDER_INCLUDE,
    }),
  ]);

  res.json({ success: true, data: updated });
});

// ─── POST /api/orders/submit — rep sends batch of PROPOSED orders ─────────────
export const submitOrders = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { order_ids } = req.body;

  if (!Array.isArray(order_ids) || order_ids.length === 0) {
    return res.status(400).json({ success: false, error: "order_ids required" });
  }

  const existing = await prisma.procurementOrder.findMany({
    where: { id: { in: order_ids }, user_id: userId, status: "PROPOSED" },
  });
  if (existing.length !== order_ids.length) {
    return res.status(400).json({ success: false, error: "Some orders not found or not PROPOSED" });
  }

  await prisma.procurementOrder.updateMany({
    where: { id: { in: order_ids } },
    data:  { status: "SUBMITTED" },
  });

  res.json({ success: true, data: { submitted: existing.length } });
});

// ─── GET /api/orders/inbox — supervisor's SUBMITTED order queue ───────────────
export const getInbox = asyncHandler(async (req, res) => {
  const { company_id, role, id: supervisorId } = req.user;
  const now = new Date();
  const m = parseInt(req.query.month) || now.getMonth() + 1;
  const y = parseInt(req.query.year)  || now.getFullYear();

  const start = new Date(y, m - 1, 1);
  const end   = new Date(y, m,     1);

  // Supervisors see only their team's reps; managers/admins see all
  let userFilter = { company_id };
  if (role === "Supervisor") {
    const myTeams = await prisma.team.findMany({
      where: { users: { some: { id: supervisorId } } },
      select: { id: true },
    });
    if (myTeams.length > 0) {
      userFilter = { company_id, team_id: { in: myTeams.map(t => t.id) } };
    }
  }

  const orders = await prisma.procurementOrder.findMany({
    where: {
      status:     "SUBMITTED",
      order_date: { gte: start, lt: end },
      user:       userFilter,
    },
    include: ORDER_INCLUDE,
    orderBy: { order_date: "asc" },
  });

  res.json({ success: true, data: orders });
});

// ─── POST /api/orders/:id/approve ────────────────────────────────────────────
export const approveOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await prisma.procurementOrder.findUnique({
    where: { id },
    include: { user: { select: { company_id: true } } },
  });
  if (!order) return res.status(404).json({ success: false, error: "Order not found" });
  if (order.user.company_id !== req.user.company_id) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }
  if (order.status !== "SUBMITTED") {
    return res.status(400).json({ success: false, error: "Only SUBMITTED orders can be approved" });
  }

  const updated = await prisma.procurementOrder.update({
    where: { id },
    data:  { status: "APPROVED" },
    include: ORDER_INCLUDE,
  });

  res.json({ success: true, data: updated });
});

// ─── POST /api/orders/:id/reject ─────────────────────────────────────────────
export const rejectOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason?.trim()) {
    return res.status(400).json({ success: false, error: "Rejection reason is required" });
  }

  const order = await prisma.procurementOrder.findUnique({
    where: { id },
    include: { user: { select: { company_id: true } } },
  });
  if (!order) return res.status(404).json({ success: false, error: "Order not found" });
  if (order.user.company_id !== req.user.company_id) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }
  if (order.status !== "SUBMITTED") {
    return res.status(400).json({ success: false, error: "Only SUBMITTED orders can be rejected" });
  }

  const updated = await prisma.procurementOrder.update({
    where: { id },
    data:  { status: "REJECTED", rejection_reason: reason.trim() },
    include: ORDER_INCLUDE,
  });

  res.json({ success: true, data: updated });
});
