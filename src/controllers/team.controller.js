import {
  createOne,
  deleteOne,
  getAll,
  getOne,
  updateOne,
} from "./factory.controller.js";
import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

export const createTeam = createOne("team");
export const getTeam = getOne("team");
export const getAllTeam = getAll("team");
export const deleteTeam = deleteOne("team");
export const updateTeam = updateOne("team");

const TEAM_INCLUDE = (companyId) => ({
  users: {
    where: { company_id: companyId },
    select: {
      id: true, firstname: true, lastname: true, role: true,
      territories: {
        include: {
          territory: { select: { id: true, name: true, territory_type: true, region: true } },
        },
      },
    },
  },
  team_products: {
    include: { product: { select: { id: true, product_name: true, classification: true, unit_price: true } } },
  },
  supervisor: { select: { id: true, firstname: true, lastname: true } },
});

// GET /api/team/company — all teams owned by the current user's company
export const getCompanyTeams = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: "Not linked to a company" });

  const teams = await prisma.team.findMany({
    where: { company_id: companyId },
    include: TEAM_INCLUDE(companyId),
    orderBy: { team_name: "asc" },
  });

  res.json({ success: true, data: teams });
});

// POST /api/team/company — create a new team
export const createCompanyTeam = asyncHandler(async (req, res) => {
  const { team_name, supervisor_id } = req.body;
  const companyId = req.user.company_id;
  if (!team_name?.trim()) return res.status(400).json({ success: false, error: "team_name is required" });
  const team = await prisma.team.create({
    data: {
      team_name: team_name.trim(),
      company_id: companyId,
      ...(supervisor_id ? { supervisor_id } : {}),
    },
    include: TEAM_INCLUDE(companyId),
  });
  res.status(201).json({ success: true, data: team });
});

// PUT /api/team/company/:id — update team name and/or supervisor
export const renameCompanyTeam = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { team_name, supervisor_id } = req.body;
  const companyId = req.user.company_id;

  // Ownership check — prevent cross-tenant mutation
  const existing = await prisma.team.findUnique({ where: { id }, select: { company_id: true } });
  if (!existing) return res.status(404).json({ success: false, error: "Team not found" });
  if (existing.company_id && existing.company_id !== companyId && req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({ success: false, error: "Not your team" });
  }

  const data = {};
  if (team_name?.trim()) data.team_name = team_name.trim();
  if (supervisor_id !== undefined) data.supervisor_id = supervisor_id || null;
  if (Object.keys(data).length === 0) return res.status(400).json({ success: false, error: "Nothing to update" });

  const team = await prisma.team.update({
    where: { id },
    data,
    include: TEAM_INCLUDE(companyId),
  });
  res.json({ success: true, data: team });
});

// DELETE /api/team/company/:id — delete a team (unassigns members first)
export const deleteCompanyTeam = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const companyId = req.user.company_id;

  // Ownership check
  const existing = await prisma.team.findUnique({ where: { id }, select: { company_id: true } });
  if (!existing) return res.status(404).json({ success: false, error: "Team not found" });
  if (existing.company_id && existing.company_id !== companyId && req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({ success: false, error: "Not your team" });
  }

  // Atomic: unassign members, remove product links, delete team
  await prisma.$transaction([
    prisma.user.updateMany({ where: { team_id: id }, data: { team_id: null } }),
    prisma.teamProduct.deleteMany({ where: { team_id: id } }),
    prisma.team.delete({ where: { id } }),
  ]);
  res.json({ success: true });
});

// POST /api/team/company/:id/products — assign a product to a team
export const addTeamProduct = asyncHandler(async (req, res) => {
  const { id: team_id } = req.params;
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ success: false, error: "product_id is required" });

  const link = await prisma.teamProduct.upsert({
    where: { team_id_product_id: { team_id, product_id } },
    update: {},
    create: { team_id, product_id },
    include: { product: { select: { id: true, product_name: true, classification: true, unit_price: true } } },
  });
  res.status(201).json({ success: true, data: link });
});

// DELETE /api/team/company/:id/products/:productId — remove a product from a team
export const removeTeamProduct = asyncHandler(async (req, res) => {
  const { id: team_id, productId: product_id } = req.params;
  await prisma.teamProduct.delete({ where: { team_id_product_id: { team_id, product_id } } });
  res.json({ success: true });
});
