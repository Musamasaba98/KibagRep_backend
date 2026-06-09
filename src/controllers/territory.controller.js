import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";

// ─── Shared include shape ─────────────────────────────────────────────────────

const TERRITORY_INCLUDE = {
  facilities: {
    include: {
      facility: {
        select: {
          id: true, name: true, location: true, town: true,
          latitude: true, longitude: true, description: true,
          working_doctors: {
            include: {
              doctor: { select: { id: true, doctor_name: true, cadre: true, speciality: true } },
            },
          },
        },
      },
    },
  },
  pharmacies: {
    include: {
      pharmacy: {
        select: {
          id: true, pharmacy_name: true, location: true, town: true,
          district: true, region: true, pharmacy_type: true,
          contact: true, latitude: true, longitude: true,
        },
      },
    },
  },
  reps: {
    include: {
      user: {
        select: { id: true, firstname: true, lastname: true, role: true, contact: true },
      },
    },
  },
  teams: {
    include: {
      team: { select: { id: true, team_name: true, supervisor_id: true } },
    },
  },
};

// ─── GET /api/territory ───────────────────────────────────────────────────────
export const getTerritories = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: "No company assigned" });

  const raw = await prisma.territory.findMany({
    where: { company_id: companyId },
    include: TERRITORY_INCLUDE,
    orderBy: { name: "asc" },
  });

  res.json({ success: true, data: raw.map(normalise) });
});

// ─── GET /api/territory/my ────────────────────────────────────────────────────
// Returns all territories directly assigned to the rep OR assigned to their team
export const getMyTerritory = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Direct rep assignments
  const directAssignments = await prisma.userTerritory.findMany({
    where: { user_id: userId },
    include: { territory: { include: TERRITORY_INCLUDE } },
  });

  // Team-based assignments — find the rep's team(s), then their territories
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { team_id: true },
  });

  let teamTerritories = [];
  if (user?.team_id) {
    const teamLinks = await prisma.territoryTeam.findMany({
      where: { team_id: user.team_id },
      include: { territory: { include: TERRITORY_INCLUDE } },
    });
    teamTerritories = teamLinks.map(tt => tt.territory);
  }

  // Merge, deduplicate by territory id
  const directTerritories = directAssignments.map(a => a.territory);
  const all = [...directTerritories, ...teamTerritories];
  const seen = new Set();
  const territories = all.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });

  res.json({ success: true, data: territories.map(normalise) });
});

// ─── POST /api/territory ──────────────────────────────────────────────────────
export const createTerritory = asyncHandler(async (req, res) => {
  const { name, description, region, territory_type } = req.body;
  const companyId = req.user.company_id;

  if (!name?.trim()) return res.status(400).json({ success: false, error: "name is required" });
  if (!companyId)     return res.status(400).json({ success: false, error: "No company assigned" });

  const territory = await prisma.territory.create({
    data: {
      name: name.trim(),
      description: description ?? null,
      region: region ?? null,
      territory_type: territory_type ?? "TOWN",
      company_id: companyId,
    },
    include: TERRITORY_INCLUDE,
  });

  res.status(201).json({ success: true, data: normalise(territory) });
});

// ─── PUT /api/territory/:id ───────────────────────────────────────────────────
export const updateTerritory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, region, territory_type } = req.body;
  const companyId = req.user.company_id;

  const existing = await prisma.territory.findUnique({ where: { id } });
  if (!existing || existing.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  const territory = await prisma.territory.update({
    where: { id },
    data: {
      name:           name?.trim()   ?? existing.name,
      description:    description    ?? existing.description,
      region:         region         ?? existing.region,
      territory_type: territory_type ?? existing.territory_type,
    },
    include: TERRITORY_INCLUDE,
  });

  res.json({ success: true, data: normalise(territory) });
});

// ─── DELETE /api/territory/:id ────────────────────────────────────────────────
export const deleteTerritory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const companyId = req.user.company_id;

  const existing = await prisma.territory.findUnique({ where: { id } });
  if (!existing || existing.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  // Junction rows cascade-delete via FK, but deleteMany is explicit
  await prisma.userTerritory.deleteMany({ where: { territory_id: id } });
  await prisma.territoryFacility.deleteMany({ where: { territory_id: id } });
  await prisma.territoryPharmacy.deleteMany({ where: { territory_id: id } });
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
          id: true, name: true, location: true, town: true,
          latitude: true, longitude: true,
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

// ─── POST /api/territory/:id/pharmacies ──────────────────────────────────────
export const addPharmacy = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { pharmacy_id } = req.body;
  const companyId = req.user.company_id;

  const territory = await prisma.territory.findUnique({ where: { id } });
  if (!territory || territory.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  const link = await prisma.territoryPharmacy.upsert({
    where: { territory_id_pharmacy_id: { territory_id: id, pharmacy_id } },
    create: { territory_id: id, pharmacy_id },
    update: {},
    include: {
      pharmacy: {
        select: {
          id: true, pharmacy_name: true, location: true, town: true,
          district: true, region: true, pharmacy_type: true,
          contact: true, latitude: true, longitude: true,
        },
      },
    },
  });

  res.status(201).json({ success: true, data: link });
});

// ─── DELETE /api/territory/:id/pharmacies/:pharmacyId ────────────────────────
export const removePharmacy = asyncHandler(async (req, res) => {
  const { id, pharmacyId } = req.params;
  const companyId = req.user.company_id;

  const territory = await prisma.territory.findUnique({ where: { id } });
  if (!territory || territory.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  await prisma.territoryPharmacy.delete({
    where: { territory_id_pharmacy_id: { territory_id: id, pharmacy_id: pharmacyId } },
  });

  res.json({ success: true });
});

// ─── POST /api/territory/:id/reps ────────────────────────────────────────────
// Assign a rep to a territory (many-to-many — a rep can cover multiple routes)
export const assignRep = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  const companyId = req.user.company_id;

  const territory = await prisma.territory.findUnique({ where: { id } });
  if (!territory || territory.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  const user = await prisma.user.findUnique({
    where: { id: user_id },
    select: { company_id: true, firstname: true, lastname: true, role: true },
  });
  if (!user || user.company_id !== companyId) {
    return res.status(400).json({ success: false, error: "User not in this company" });
  }

  await prisma.userTerritory.upsert({
    where: { user_id_territory_id: { user_id, territory_id: id } },
    create: { user_id, territory_id: id },
    update: {},
  });

  res.json({
    success: true,
    data: { id: user_id, firstname: user.firstname, lastname: user.lastname, role: user.role },
  });
});

// ─── DELETE /api/territory/:id/reps/:userId ───────────────────────────────────
export const unassignRep = asyncHandler(async (req, res) => {
  const { id, userId } = req.params;
  const companyId = req.user.company_id;

  const territory = await prisma.territory.findUnique({ where: { id } });
  if (!territory || territory.company_id !== companyId) {
    return res.status(404).json({ success: false, error: "Territory not found" });
  }

  await prisma.userTerritory.delete({
    where: { user_id_territory_id: { user_id: userId, territory_id: id } },
  });

  res.json({ success: true });
});

// ─── POST /api/territory/doctor-facility ─────────────────────────────────────
export const linkDoctorFacility = asyncHandler(async (req, res) => {
  const { doctor_id, facility_id, is_primary } = req.body;

  const link = await prisma.doctorFacility.upsert({
    where: { doctor_id_facility_id: { doctor_id, facility_id } },
    create: { doctor_id, facility_id, is_primary: is_primary ?? false },
    update: { is_primary: is_primary ?? false },
    include: {
      doctor:   { select: { id: true, doctor_name: true, cadre: true } },
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

// ─── Helper: flatten junction shape for frontend ──────────────────────────────
// Converts reps: [{ user: {...} }] → reps: [{ id, firstname, ... }]
function normalise(t) {
  return {
    ...t,
    reps:  (t.reps  ?? []).map(r => r.user),
    teams: (t.teams ?? []).map(tt => tt.team),
  };
}

// ─── POST /api/territory/:id/teams ───────────────────────────────────────────
export const assignTeam = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { team_id } = req.body;
  const companyId = req.user.company_id;

  if (!team_id) return res.status(400).json({ success: false, error: "team_id required" });

  const [territory, team] = await Promise.all([
    prisma.territory.findUnique({ where: { id } }),
    prisma.team.findUnique({ where: { id: team_id } }),
  ]);

  if (!territory || territory.company_id !== companyId)
    return res.status(404).json({ success: false, error: "Territory not found" });
  if (!team || team.company_id !== companyId)
    return res.status(404).json({ success: false, error: "Team not found" });

  const link = await prisma.territoryTeam.upsert({
    where: { territory_id_team_id: { territory_id: id, team_id } },
    create: { territory_id: id, team_id },
    update: {},
    include: { team: { select: { id: true, team_name: true } } },
  });

  res.status(201).json({ success: true, data: link.team });
});

// ─── DELETE /api/territory/:id/teams/:teamId ─────────────────────────────────
export const unassignTeam = asyncHandler(async (req, res) => {
  const { id, teamId } = req.params;
  const companyId = req.user.company_id;

  const territory = await prisma.territory.findUnique({ where: { id } });
  if (!territory || territory.company_id !== companyId)
    return res.status(404).json({ success: false, error: "Territory not found" });

  await prisma.territoryTeam.delete({
    where: { territory_id_team_id: { territory_id: id, team_id: teamId } },
  });

  res.json({ success: true });
});
