import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

const PHARMACY_SELECT = {
  id: true, pharmacy_name: true, location: true, town: true,
  district: true, region: true, pharmacy_type: true, contact: true,
};

// GET /api/company-pharmacy — company's curated pharmacy list
export const getCompanyPharmacies = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: "Not linked to a company" });

  const { q, tier, page, limit } = req.query;
  const take = limit ? parseInt(limit) : undefined;
  const skip = page && limit ? (parseInt(page) - 1) * parseInt(limit) : undefined;

  const where = {
    company_id: companyId,
    ...(tier ? { tier } : {}),
    ...(q?.trim() ? {
      pharmacy: {
        OR: [
          { pharmacy_name: { contains: q.trim(), mode: "insensitive" } },
          { location:      { contains: q.trim(), mode: "insensitive" } },
          { district:      { contains: q.trim(), mode: "insensitive" } },
          { region:        { contains: q.trim(), mode: "insensitive" } },
        ],
      },
    } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.companyPharmacy.findMany({
      where,
      include: { pharmacy: { select: PHARMACY_SELECT } },
      orderBy: { pharmacy: { pharmacy_name: "asc" } },
      ...(take !== undefined ? { take } : {}),
      ...(skip !== undefined ? { skip } : {}),
    }),
    prisma.companyPharmacy.count({ where }),
  ]);

  res.json({ success: true, data: rows, total });
});

// POST /api/company-pharmacy — add a pharmacy to company list
export const addCompanyPharmacy = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: "Not linked to a company" });

  const { pharmacy_id, tier, notes } = req.body;
  if (!pharmacy_id) return res.status(400).json({ success: false, error: "pharmacy_id is required" });

  const row = await prisma.companyPharmacy.upsert({
    where:  { company_id_pharmacy_id: { company_id: companyId, pharmacy_id } },
    create: { company_id: companyId, pharmacy_id, tier: tier ?? "B", notes: notes ?? null, added_by: req.user.id },
    update: { tier: tier ?? "B", notes: notes ?? null },
    include: { pharmacy: { select: PHARMACY_SELECT } },
  });

  res.status(201).json({ success: true, data: row });
});

// PUT /api/company-pharmacy/:pharmacyId — update tier or notes
export const updateCompanyPharmacy = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  const { pharmacyId } = req.params;
  const { tier, notes } = req.body;

  const existing = await prisma.companyPharmacy.findUnique({
    where: { company_id_pharmacy_id: { company_id: companyId, pharmacy_id: pharmacyId } },
  });
  if (!existing) return res.status(404).json({ success: false, error: "Pharmacy not on your company list" });

  const updated = await prisma.companyPharmacy.update({
    where: { company_id_pharmacy_id: { company_id: companyId, pharmacy_id: pharmacyId } },
    data:  { ...(tier !== undefined && { tier }), ...(notes !== undefined && { notes }) },
    include: { pharmacy: { select: PHARMACY_SELECT } },
  });

  res.json({ success: true, data: updated });
});

// DELETE /api/company-pharmacy/:pharmacyId — remove from company list
export const removeCompanyPharmacy = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  const { pharmacyId } = req.params;

  const existing = await prisma.companyPharmacy.findUnique({
    where: { company_id_pharmacy_id: { company_id: companyId, pharmacy_id: pharmacyId } },
  });
  if (!existing) return res.status(404).json({ success: false, error: "Pharmacy not on your company list" });

  await prisma.companyPharmacy.delete({
    where: { company_id_pharmacy_id: { company_id: companyId, pharmacy_id: pharmacyId } },
  });

  res.json({ success: true });
});
