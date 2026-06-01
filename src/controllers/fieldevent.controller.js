import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// ── GET /api/field-events — list events for the caller's company
export const getFieldEvents = asyncHandler(async (req, res) => {
  const { company_id, id: userId, role } = req.user;
  if (!company_id) return res.json({ success: true, data: [] });

  const { status, type, month, year } = req.query;

  const isManager = ["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"].includes(role);

  const where = {
    company_id,
    ...(isManager ? {} : { user_id: userId }),         // reps see only their own
    ...(status ? { status } : {}),
    ...(type   ? { event_type: type } : {}),
  };

  if (month && year) {
    const from = new Date(Number(year), Number(month) - 1, 1);
    const to   = new Date(Number(year), Number(month), 1);
    where.planned_date = { gte: from, lt: to };
  }

  const events = await prisma.fieldEvent.findMany({
    where,
    include: {
      user:     { select: { id: true, firstname: true, lastname: true } },
      doctor:   { select: { id: true, doctor_name: true, town: true, speciality: true } },
      facility: { select: { id: true, name: true, town: true } },
      product:  { select: { id: true, product_name: true } },
    },
    orderBy: [{ planned_date: "asc" }, { created_at: "desc" }],
    take: 200,
  });

  res.json({ success: true, data: events });
});

// ── POST /api/field-events — create an event
export const createFieldEvent = asyncHandler(async (req, res) => {
  const { company_id, id: userId } = req.user;
  if (!company_id) { res.status(400); throw new Error("User not linked to a company"); }

  const {
    event_type, title, doctor_id, facility_id, product_id,
    budget_ugx, planned_date, planned_count, notes,
  } = req.body;

  if (!title) { res.status(400); throw new Error("title is required"); }

  const event = await prisma.fieldEvent.create({
    data: {
      user_id:       userId,
      company_id,
      event_type:    event_type ?? "OPD_BREAKFAST",
      title,
      doctor_id:     doctor_id     ?? null,
      facility_id:   facility_id   ?? null,
      product_id:    product_id    ?? null,
      budget_ugx:    budget_ugx    ?? null,
      planned_date:  planned_date  ? new Date(planned_date) : null,
      planned_count: planned_count ?? 1,
      status: "PLANNED",
      notes: notes ?? null,
    },
    include: {
      doctor:   { select: { id: true, doctor_name: true, town: true } },
      facility: { select: { id: true, name: true, town: true } },
      product:  { select: { id: true, product_name: true } },
    },
  });

  res.status(201).json({ success: true, data: event });
});

// ── PUT /api/field-events/:id — update (also marks execution)
export const updateFieldEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { company_id, id: userId, role } = req.user;

  const event = await prisma.fieldEvent.findUnique({ where: { id } });
  if (!event || event.company_id !== company_id) { res.status(404); throw new Error("Event not found"); }

  const isManager = ["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"].includes(role);
  if (!isManager && event.user_id !== userId) { res.status(403); throw new Error("Not your event"); }

  const {
    event_type, title, doctor_id, facility_id, product_id,
    budget_ugx, planned_date, planned_count,
    executed_date, executed_count, actual_spend, attendees_count,
    status, notes,
  } = req.body;

  const updated = await prisma.fieldEvent.update({
    where: { id },
    data: {
      ...(event_type      !== undefined && { event_type }),
      ...(title           !== undefined && { title }),
      ...(doctor_id       !== undefined && { doctor_id:     doctor_id     ?? null }),
      ...(facility_id     !== undefined && { facility_id:   facility_id   ?? null }),
      ...(product_id      !== undefined && { product_id:    product_id    ?? null }),
      ...(budget_ugx      !== undefined && { budget_ugx:    budget_ugx    ?? null }),
      ...(planned_date    !== undefined && { planned_date:  planned_date  ? new Date(planned_date) : null }),
      ...(planned_count   !== undefined && { planned_count }),
      ...(executed_date   !== undefined && { executed_date: executed_date ? new Date(executed_date) : null }),
      ...(executed_count  !== undefined && { executed_count }),
      ...(actual_spend    !== undefined && { actual_spend:  actual_spend  ?? null }),
      ...(attendees_count !== undefined && { attendees_count: attendees_count ?? null }),
      ...(status          !== undefined && { status }),
      ...(notes           !== undefined && { notes: notes ?? null }),
    },
    include: {
      user:     { select: { id: true, firstname: true, lastname: true } },
      doctor:   { select: { id: true, doctor_name: true, town: true } },
      facility: { select: { id: true, name: true, town: true } },
      product:  { select: { id: true, product_name: true } },
    },
  });

  res.json({ success: true, data: updated });
});

// ── DELETE /api/field-events/:id
export const deleteFieldEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { company_id, id: userId, role } = req.user;

  const event = await prisma.fieldEvent.findUnique({ where: { id } });
  if (!event || event.company_id !== company_id) { res.status(404); throw new Error("Event not found"); }

  const isManager = ["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"].includes(role);
  if (!isManager && event.user_id !== userId) { res.status(403); throw new Error("Not your event"); }
  if (event.status === "EXECUTED") { res.status(400); throw new Error("Cannot delete an executed event"); }

  await prisma.fieldEvent.delete({ where: { id } });
  res.json({ success: true });
});
