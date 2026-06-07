import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

const STAFF_INCLUDE = {
  suggested_by:           { select: { id: true, firstname: true, lastname: true } },
  supervisor_approved_by: { select: { id: true, firstname: true, lastname: true } },
  admin_approved_by:      { select: { id: true, firstname: true, lastname: true } },
  facility_links: {
    include: { facility: { select: { id: true, name: true, town: true, facility_type: true } } },
  },
};

async function companyUserIds(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { company_id: true } });
  if (!user?.company_id) return [];
  const users = await prisma.user.findMany({ where: { company_id: user.company_id }, select: { id: true } });
  return users.map((u) => u.id);
}

// POST /api/facility-staff — rep suggests a facility contact
export const suggestStaff = asyncHandler(async (req, res) => {
  const { name, role, phone, notes, facility_id } = req.body;
  if (!name?.trim() || !role || !facility_id) {
    res.status(400); throw new Error("name, role and facility_id are required");
  }

  const staff = await prisma.facilityStaff.create({
    data: {
      name:            name.trim(),
      role,
      phone:           phone?.trim() || null,
      notes:           notes?.trim() || null,
      suggested_by_id: req.user.id,
      facility_links:  { create: { facility_id, is_primary: false } },
    },
    include: STAFF_INCLUDE,
  });

  res.status(201).json({ success: true, data: staff });
});

// GET /api/facility-staff/facility/:facilityId — approved staff at a facility
export const getStaffByFacility = asyncHandler(async (req, res) => {
  const { facilityId } = req.params;
  const links = await prisma.facilityStaffLink.findMany({
    where:   { facility_id: facilityId, staff: { status: "APPROVED" } },
    include: { staff: true },
    orderBy: { staff: { name: "asc" } },
  });
  res.json({ success: true, data: links.map((l) => l.staff) });
});

// GET /api/facility-staff/pending-supervisor
export const getPendingSupervisor = asyncHandler(async (req, res) => {
  const userIds = await companyUserIds(req.user.id);
  const staff = await prisma.facilityStaff.findMany({
    where:   { status: "SUGGESTED", suggested_by_id: { in: userIds } },
    include: STAFF_INCLUDE,
    orderBy: { created_at: "asc" },
  });
  res.json({ success: true, data: staff });
});

// GET /api/facility-staff/pending-admin
export const getPendingAdmin = asyncHandler(async (req, res) => {
  const staff = await prisma.facilityStaff.findMany({
    where:   { status: "SUPERVISOR_APPROVED" },
    include: STAFF_INCLUDE,
    orderBy: { supervisor_approved_at: "asc" },
  });
  res.json({ success: true, data: staff });
});

// GET /api/facility-staff — approved master list
export const getApprovedStaff = asyncHandler(async (req, res) => {
  const { facility_id, role } = req.query;
  const staff = await prisma.facilityStaff.findMany({
    where: {
      status: "APPROVED",
      ...(role        ? { role } : {}),
      ...(facility_id ? { facility_links: { some: { facility_id } } } : {}),
    },
    include: STAFF_INCLUDE,
    orderBy: { name: "asc" },
  });
  res.json({ success: true, data: staff });
});

// PUT /api/facility-staff/:id/supervisor-approve
export const supervisorApprove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const record = await prisma.facilityStaff.findUnique({ where: { id }, include: { suggested_by: { select: { company_id: true } } } });
  if (!record) { res.status(404); throw new Error("Staff record not found"); }
  if (record.status !== "SUGGESTED") { res.status(400); throw new Error("Only SUGGESTED records can be supervisor-approved"); }

  const reqUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { company_id: true } });
  if (record.suggested_by.company_id !== reqUser.company_id) { res.status(403); throw new Error("Access denied"); }

  const updated = await prisma.facilityStaff.update({
    where: { id },
    data:  { status: "SUPERVISOR_APPROVED", supervisor_approved_by_id: req.user.id, supervisor_approved_at: new Date() },
    include: STAFF_INCLUDE,
  });
  res.json({ success: true, data: updated });
});

// PUT /api/facility-staff/:id/admin-approve
export const adminApprove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const record = await prisma.facilityStaff.findUnique({ where: { id } });
  if (!record) { res.status(404); throw new Error("Staff record not found"); }
  if (record.status !== "SUPERVISOR_APPROVED") { res.status(400); throw new Error("Must be supervisor-approved first"); }

  const updated = await prisma.facilityStaff.update({
    where: { id },
    data:  { status: "APPROVED", admin_approved_by_id: req.user.id, admin_approved_at: new Date() },
    include: STAFF_INCLUDE,
  });
  res.json({ success: true, data: updated });
});

// PUT /api/facility-staff/:id/reject
export const rejectStaff = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const record = await prisma.facilityStaff.findUnique({ where: { id }, include: { suggested_by: { select: { company_id: true } } } });
  if (!record) { res.status(404); throw new Error("Staff record not found"); }
  if (record.status === "APPROVED") { res.status(400); throw new Error("Cannot reject an already-approved record"); }

  const reqUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { company_id: true, role: true } });
  if (reqUser.role !== "SUPER_ADMIN" && record.suggested_by.company_id !== reqUser.company_id) {
    res.status(403); throw new Error("Access denied");
  }

  const updated = await prisma.facilityStaff.update({
    where: { id },
    data:  { status: "REJECTED", review_note: note ?? null },
    include: STAFF_INCLUDE,
  });
  res.json({ success: true, data: updated });
});

// POST /api/facility-staff/:id/link — link approved staff to another facility
export const linkToFacility = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { facility_id, is_primary } = req.body;
  if (!facility_id) { res.status(400); throw new Error("facility_id is required"); }

  const record = await prisma.facilityStaff.findUnique({ where: { id } });
  if (!record) { res.status(404); throw new Error("Staff record not found"); }
  if (record.status !== "APPROVED") { res.status(400); throw new Error("Only APPROVED staff can be linked"); }

  const link = await prisma.facilityStaffLink.upsert({
    where:  { staff_id_facility_id: { staff_id: id, facility_id } },
    create: { staff_id: id, facility_id, is_primary: is_primary ?? false },
    update: { is_primary: is_primary ?? false },
  });
  res.json({ success: true, data: link });
});
