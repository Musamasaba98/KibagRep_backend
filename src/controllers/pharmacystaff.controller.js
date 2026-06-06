import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

const STAFF_INCLUDE = {
  suggested_by:           { select: { id: true, firstname: true, lastname: true } },
  supervisor_approved_by: { select: { id: true, firstname: true, lastname: true } },
  admin_approved_by:      { select: { id: true, firstname: true, lastname: true } },
  pharmacy_links: {
    include: { pharmacy: { select: { id: true, pharmacy_name: true, town: true } } },
  },
};

// Helper: get all user ids in requester's company
async function companyUserIds(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { company_id: true } });
  if (!user?.company_id) return [];
  const users = await prisma.user.findMany({ where: { company_id: user.company_id }, select: { id: true } });
  return users.map((u) => u.id);
}

// ── Rep: POST /api/pharmacy-staff ─────────────────────────────────────────────
// Suggest a new staff member and immediately link them to a pharmacy.
export const suggestStaff = asyncHandler(async (req, res) => {
  const { name, role, phone, notes, pharmacy_id } = req.body;
  if (!name?.trim() || !role || !pharmacy_id) {
    res.status(400); throw new Error("name, role and pharmacy_id are required");
  }

  const staff = await prisma.pharmacyStaff.create({
    data: {
      name:            name.trim(),
      role,
      phone:           phone?.trim() || null,
      notes:           notes?.trim() || null,
      suggested_by_id: req.user.id,
      pharmacy_links:  { create: { pharmacy_id, is_primary: false } },
    },
    include: STAFF_INCLUDE,
  });

  res.status(201).json({ success: true, data: staff });
});

// ── Rep/Supervisor: GET /api/pharmacy-staff/pharmacy/:pharmacyId ──────────────
// Get APPROVED staff linked to a specific pharmacy (for visit modal).
export const getStaffByPharmacy = asyncHandler(async (req, res) => {
  const { pharmacyId } = req.params;
  const links = await prisma.pharmacyStaffLink.findMany({
    where: { pharmacy_id: pharmacyId, staff: { status: "APPROVED" } },
    include: { staff: true },
    orderBy: { staff: { name: "asc" } },
  });
  res.json({ success: true, data: links.map((l) => l.staff) });
});

// ── Supervisor: GET /api/pharmacy-staff/pending-supervisor ────────────────────
// Returns SUGGESTED staff from reps in the supervisor's company.
export const getPendingSupervisor = asyncHandler(async (req, res) => {
  const userIds = await companyUserIds(req.user.id);
  const staff = await prisma.pharmacyStaff.findMany({
    where:   { status: "SUGGESTED", suggested_by_id: { in: userIds } },
    include: STAFF_INCLUDE,
    orderBy: { created_at: "asc" },
  });
  res.json({ success: true, data: staff });
});

// ── Super Admin: GET /api/pharmacy-staff/pending-admin ────────────────────────
// Returns SUPERVISOR_APPROVED staff waiting for final sign-off.
export const getPendingAdmin = asyncHandler(async (req, res) => {
  const staff = await prisma.pharmacyStaff.findMany({
    where:   { status: "SUPERVISOR_APPROVED" },
    include: STAFF_INCLUDE,
    orderBy: { supervisor_approved_at: "asc" },
  });
  res.json({ success: true, data: staff });
});

// ── Super Admin: GET /api/pharmacy-staff ─────────────────────────────────────
// Full approved master list (for admin reference).
export const getApprovedStaff = asyncHandler(async (req, res) => {
  const { pharmacy_id, role } = req.query;
  const staff = await prisma.pharmacyStaff.findMany({
    where: {
      status: "APPROVED",
      ...(role ? { role } : {}),
      ...(pharmacy_id ? { pharmacy_links: { some: { pharmacy_id } } } : {}),
    },
    include: STAFF_INCLUDE,
    orderBy: { name: "asc" },
  });
  res.json({ success: true, data: staff });
});

// ── Supervisor: PUT /api/pharmacy-staff/:id/supervisor-approve ────────────────
export const supervisorApprove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const record = await prisma.pharmacyStaff.findUnique({ where: { id }, include: { suggested_by: { select: { company_id: true } } } });
  if (!record) { res.status(404); throw new Error("Staff record not found"); }
  if (record.status !== "SUGGESTED") { res.status(400); throw new Error("Only SUGGESTED records can be supervisor-approved"); }

  const reqUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { company_id: true } });
  if (record.suggested_by.company_id !== reqUser.company_id) { res.status(403); throw new Error("Access denied"); }

  const updated = await prisma.pharmacyStaff.update({
    where: { id },
    data:  { status: "SUPERVISOR_APPROVED", supervisor_approved_by_id: req.user.id, supervisor_approved_at: new Date() },
    include: STAFF_INCLUDE,
  });
  res.json({ success: true, data: updated });
});

// ── Super Admin: PUT /api/pharmacy-staff/:id/admin-approve ───────────────────
export const adminApprove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const record = await prisma.pharmacyStaff.findUnique({ where: { id } });
  if (!record) { res.status(404); throw new Error("Staff record not found"); }
  if (record.status !== "SUPERVISOR_APPROVED") { res.status(400); throw new Error("Must be supervisor-approved first"); }

  const updated = await prisma.pharmacyStaff.update({
    where: { id },
    data:  { status: "APPROVED", admin_approved_by_id: req.user.id, admin_approved_at: new Date() },
    include: STAFF_INCLUDE,
  });
  res.json({ success: true, data: updated });
});

// ── Supervisor or Super Admin: PUT /api/pharmacy-staff/:id/reject ─────────────
export const rejectStaff = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const record = await prisma.pharmacyStaff.findUnique({ where: { id }, include: { suggested_by: { select: { company_id: true } } } });
  if (!record) { res.status(404); throw new Error("Staff record not found"); }
  if (record.status === "APPROVED") { res.status(400); throw new Error("Cannot reject an already-approved record"); }

  const reqUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { company_id: true, role: true } });
  const isSuperAdmin = reqUser.role === "SUPER_ADMIN";
  if (!isSuperAdmin && record.suggested_by.company_id !== reqUser.company_id) { res.status(403); throw new Error("Access denied"); }

  const updated = await prisma.pharmacyStaff.update({
    where: { id },
    data:  { status: "REJECTED", review_note: note ?? null },
    include: STAFF_INCLUDE,
  });
  res.json({ success: true, data: updated });
});

// ── Any auth: POST /api/pharmacy-staff/:id/link ───────────────────────────────
// Link an already-approved staff member to another pharmacy.
export const linkToPharmacy = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { pharmacy_id, is_primary } = req.body;
  if (!pharmacy_id) { res.status(400); throw new Error("pharmacy_id is required"); }

  const record = await prisma.pharmacyStaff.findUnique({ where: { id } });
  if (!record) { res.status(404); throw new Error("Staff record not found"); }
  if (record.status !== "APPROVED") { res.status(400); throw new Error("Only APPROVED staff can be linked to pharmacies"); }

  const link = await prisma.pharmacyStaffLink.upsert({
    where:  { staff_id_pharmacy_id: { staff_id: id, pharmacy_id } },
    create: { staff_id: id, pharmacy_id, is_primary: is_primary ?? false },
    update: { is_primary: is_primary ?? false },
  });
  res.json({ success: true, data: link });
});
