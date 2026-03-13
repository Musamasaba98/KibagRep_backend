import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";

const TERRITORY_INCLUDE = {
  facilities: {
    include: {
      facility: {
        select: {
          id: true,
          name: true,
          location: true,
          town: true,
          latitude: true,
          longitude: true,
          description: true,
          working_doctors: {
            include: {
              doctor: { select: { id: true, doctor_name: true, cadre: true, speciality: true } },
            },
          },
        },
      },
    },
  },
  reps: {
    select: { id: true, firstname: true, lastname: true, role: true, contact: true },
  },
};

// ─── GET /api/territory ───────────────────────────────────────────────────────
export const getTerritories = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: "No company assigned" });

  const territories = await prisma.territory.findMany({
    where: { company_id: companyId },
    include: TERRITORY_INCLUDE,
    orderBy: { name: "asc" },
  });

  res.json({ success: true, data: territories });
});

// ─── GET /api/territory/my ────────────────────────────────────────────────────
// Rep gets their own assigned territory
export const getMyTerritory = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      territory_id: true,
      territory: { include: TERRITORY_INCLUDE },
    },
  });

  res.json({ success: true, data: user?.territory ?? null });
});

// ─── POST /api/territory ──────────────────────────────────────────────────────
export const createTerritory = asyncHandler(async (req, res) => {
  const { name, description, region } = req.body;
  const companyId = req.user.company_id;

  if (!name?.trim()) return res.status(400).json({ success: false, error: "name is required" });
  if (!companyId)     return res.status(400).json({ success: false, error: "No company assigned" });

  const territory = await prisma.territory.create({
    data: { name: name.trim(), description: description ?? null, region: region ?? null, company_id: companyId },
    include: TERRITORY_INCLUDE,
  });

  res.status(201).json({ success: true, data: territory });
});

// ─── PUT /api/territory/:id ───────────────────────────────────────────────────
export const updateTerritory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, region } = req.body;
  const companyId = req.user.company_id;

  const existing = await prisma.territory.findUnique({ where: { id } });
  if (!existing || existing.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  const territory = await prisma.territory.update({
    where: { id },
    data: {
      name: name?.trim() ?? existing.name,
      description: description ?? existing.description,
      region: region ?? existing.region,
    },
    include: TERRITORY_INCLUDE,
  });

  res.json({ success: true, data: territory });
});

// ─── DELETE /api/territory/:id ────────────────────────────────────────────────
export const deleteTerritory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const companyId = req.user.company_id;

  const existing = await prisma.territory.findUnique({ where: { id } });
  if (!existing || existing.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  // Unassign all reps from this territory first
  await prisma.user.updateMany({ where: { territory_id: id }, data: { territory_id: null } });
  // Delete facility links
  await prisma.territoryFacility.deleteMany({ where: { territory_id: id } });
  // Delete territory
  await prisma.territory.delete({ where: { id } });

  res.json({ success: true });
});

// ─── POST /api/territory/:id/facilities ───────────────────────────────────────
export const addFacility = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { facility_id } = req.body;
  const companyId = req.user.company_id;

  const territory = await prisma.territory.findUnique({ where: { id } });
  if (!territory || territory.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  const link = await prisma.territoryFacility.upsert({
    where: { territory_id_facility_id: { territory_id: id, facility_id } },
    create: { territory_id: id, facility_id },
    update: {},
    include: {
      facility: {
        select: {
          id: true, name: true, location: true, town: true, latitude: true, longitude: true,
          working_doctors: {
            include: { doctor: { select: { id: true, doctor_name: true, cadre: true } } },
          },
        },
      },
    },
  });

  res.status(201).json({ success: true, data: link });
});

// ─── DELETE /api/territory/:id/facilities/:facilityId ────────────────────────
export const removeFacility = asyncHandler(async (req, res) => {
  const { id, facilityId } = req.params;
  const companyId = req.user.company_id;

  const territory = await prisma.territory.findUnique({ where: { id } });
  if (!territory || territory.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  await prisma.territoryFacility.delete({
    where: { territory_id_facility_id: { territory_id: id, facility_id: facilityId } },
  });

  res.json({ success: true });
});

// ─── POST /api/territory/:id/reps ────────────────────────────────────────────
export const assignRep = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  const companyId = req.user.company_id;

  const territory = await prisma.territory.findUnique({ where: { id } });
  if (!territory || territory.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  // Verify the user belongs to the same company
  const user = await prisma.user.findUnique({ where: { id: user_id }, select: { company_id: true } });
  if (!user || user.company_id !== companyId) {
    return res.status(400).json({ success: false, error: "User not in this company" });
  }

  const updated = await prisma.user.update({
    where: { id: user_id },
    data: { territory_id: id },
    select: { id: true, firstname: true, lastname: true, role: true },
  });

  res.json({ success: true, data: updated });
});

// ─── DELETE /api/territory/:id/reps/:userId ───────────────────────────────────
export const unassignRep = asyncHandler(async (req, res) => {
  const { id, userId } = req.params;
  const companyId = req.user.company_id;

  const territory = await prisma.territory.findUnique({ where: { id } });
  if (!territory || territory.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { territory_id: null },
  });

  res.json({ success: true });
});

// ─── POST /api/territory/doctor-facility ─────────────────────────────────────
// Link a doctor to a facility (many-to-many work relationship)
export const linkDoctorFacility = asyncHandler(async (req, res) => {
  const { doctor_id, facility_id, is_primary } = req.body;

  const link = await prisma.doctorFacility.upsert({
    where: { doctor_id_facility_id: { doctor_id, facility_id } },
    create: { doctor_id, facility_id, is_primary: is_primary ?? false },
    update: { is_primary: is_primary ?? false },
    include: {
      doctor: { select: { id: true, doctor_name: true, cadre: true } },
      facility: { select: { id: true, name: true, location: true, town: true } },
    },
  });

  res.status(201).json({ success: true, data: link });
});

// ─── DELETE /api/territory/doctor-facility ────────────────────────────────────
export const unlinkDoctorFacility = asyncHandler(async (req, res) => {
  const { doctor_id, facility_id } = req.body;

  await prisma.doctorFacility.delete({
    where: { doctor_id_facility_id: { doctor_id, facility_id } },
  });

  res.json({ success: true });
});
