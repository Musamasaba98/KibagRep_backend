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

// GET /api/team/company — teams in the current user's company (via users)
export const getCompanyTeams = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: "Not linked to a company" });
  const teams = await prisma.team.findMany({
    where: { users: { some: { company_id: companyId } } },
    include: {
      users: {
        where: { company_id: companyId },
        select: { id: true, firstname: true, lastname: true, role: true },
      },
    },
  });
  res.json({ success: true, data: teams });
});

// POST /api/team/company — create a new team (not yet tied to company — members assigned via user update)
export const createCompanyTeam = asyncHandler(async (req, res) => {
  const { team_name } = req.body;
  if (!team_name) return res.status(400).json({ success: false, error: "team_name is required" });
  const team = await prisma.team.create({ data: { team_name } });
  res.status(201).json({ success: true, data: team });
});
