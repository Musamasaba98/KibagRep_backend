import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

const FACILITY_SELECT = {
  id: true, name: true, location: true, town: true,
  district: true, region: true, facility_type: true, ownership: true,
};

// GET /api/company-facility — company's curated facility list
export const getCompanyFacilities = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: "Not linked to a company" });

  const { q, facility_type, ownership, page, limit } = req.query;
  const take = limit ? parseInt(limit) : undefined;
  const skip = page && limit ? (parseInt(page) - 1) * parseInt(limit) : undefined;

  const where = {
    company_id: companyId,
    ...(q?.trim() ? {
      facility: {
        OR: [
          { name:     { contains: q.trim(), mode: "insensitive" } },
          { district: { contains: q.trim(), mode: "insensitive" } },
          { region:   { contains: q.trim(), mode: "insensitive" } },
          { location: { contains: q.trim(), mode: "insensitive" } },
        ],
      },
    } : {}),
    ...(facility_type ? { facility: { facility_type } } : {}),
    ...(ownership     ? { facility: { ownership } }     : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.companyFacility.findMany({
      where,
      include: {
        facility: {
          select: {
            ...FACILITY_SELECT,
            company_tiers: { where: { company_id: companyId }, select: { tier: true } },
          },
        },
      },
      orderBy: { facility: { name: "asc" } },
      ...(take !== undefined ? { take } : {}),
      ...(skip !== undefined ? { skip } : {}),
    }),
    prisma.companyFacility.count({ where }),
  ]);

  res.json({ success: true, data: rows, total });
});

// POST /api/company-facility — add a facility to company list
export const addCompanyFacility = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: "Not linked to a company" });

  const { facility_id, notes } = req.body;
  if (!facility_id) return res.status(400).json({ success: false, error: "facility_id is required" });

  const row = await prisma.companyFacility.upsert({
    where:  { company_id_facility_id: { company_id: companyId, facility_id } },
    create: { company_id: companyId, facility_id, notes: notes ?? null, added_by: req.user.id },
    update: { notes: notes ?? null },
    include: { facility: { select: FACILITY_SELECT } },
  });

  res.status(201).json({ success: true, data: row });
});

// PUT /api/company-facility/:facilityId — update notes
export const updateCompanyFacility = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  const { facilityId } = req.params;
  const { notes } = req.body;

  const existing = await prisma.companyFacility.findUnique({
    where: { company_id_facility_id: { company_id: companyId, facility_id: facilityId } },
  });
  if (!existing) return res.status(404).json({ success: false, error: "Facility not on your company list" });

  const updated = await prisma.companyFacility.update({
    where: { company_id_facility_id: { company_id: companyId, facility_id: facilityId } },
    data:  { notes: notes ?? null },
    include: { facility: { select: FACILITY_SELECT } },
  });

  res.json({ success: true, data: updated });
});

// DELETE /api/company-facility/:facilityId — remove from company list
export const removeCompanyFacility = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  const { facilityId } = req.params;

  const existing = await prisma.companyFacility.findUnique({
    where: { company_id_facility_id: { company_id: companyId, facility_id: facilityId } },
  });
  if (!existing) return res.status(404).json({ success: false, error: "Facility not on your company list" });

  await prisma.companyFacility.delete({
    where: { company_id_facility_id: { company_id: companyId, facility_id: facilityId } },
  });

  res.json({ success: true });
});
