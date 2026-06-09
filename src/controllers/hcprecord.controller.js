import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

// GET /api/hcp-records
// Query params: q, council, licence_status, page, limit
export const listHcpRecords = asyncHandler(async (req, res) => {
  const {
    q          = "",
    council    = "",
    licence_status = "",
    page       = "1",
    limit      = "30",
  } = req.query;

  const take = Math.min(parseInt(limit) || 30, 100);
  const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

  const where = {
    ...(q.trim().length >= 1 && {
      OR: [
        { name:            { contains: q.trim(), mode: "insensitive" } },
        { registration_no: { contains: q.trim(), mode: "insensitive" } },
      ],
    }),
    ...(council        && { council:        { contains: council,        mode: "insensitive" } }),
    ...(licence_status && { licence_status: { equals:   licence_status, mode: "insensitive" } }),
  };

  const [records, total] = await Promise.all([
    prisma.hcpRecord.findMany({
      where,
      skip,
      take,
      orderBy: { name: "asc" },
      select: {
        id:                  true,
        portal_id:           true,
        name:                true,
        council:             true,
        registration_no:     true,
        registration_status: true,
        registration_date:   true,
        license_number:      true,
        license_expiry:      true,
        licence_status:      true,
        doctor_id:           true,
        doctor:              { select: { id: true, doctor_name: true, cadre: true } },
      },
    }),
    prisma.hcpRecord.count({ where }),
  ]);

  res.json({
    success: true,
    data: records,
    meta: { total, page: parseInt(page), limit: take, pages: Math.ceil(total / take) },
  });
});

// PUT /api/hcp-records/:id — link or unlink a registry record to a master directory doctor
export const linkHcpRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { doctor_id } = req.body; // null to unlink

  if (doctor_id) {
    const conflict = await prisma.hcpRecord.findUnique({ where: { doctor_id } });
    if (conflict && conflict.id !== id) {
      res.status(409);
      throw new Error("This doctor is already linked to another registry record.");
    }
  }

  const updated = await prisma.hcpRecord.update({
    where: { id },
    data: { doctor_id: doctor_id ?? null },
    select: {
      id:        true,
      doctor_id: true,
      doctor:    { select: { id: true, doctor_name: true, cadre: true } },
    },
  });

  res.json({ success: true, data: updated });
});

// GET /api/hcp-records/stats  — council + licence breakdown for dashboard
export const hcpStats = asyncHandler(async (req, res) => {
  const [byCouncil, byLicence] = await Promise.all([
    prisma.hcpRecord.groupBy({
      by: ["council"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.hcpRecord.groupBy({
      by: ["council", "licence_status"],
      _count: { id: true },
    }),
  ]);

  res.json({
    success: true,
    data: { byCouncil, byLicence },
  });
});
