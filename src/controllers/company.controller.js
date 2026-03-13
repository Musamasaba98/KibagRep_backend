import {
  createOne,
  deleteOne,
  getAll,
  getOne,
  updateOne,
} from "./factory.controller.js";
import prisma from "../config/prisma.config.js";
import asyncHandler from "express-async-handler";

export const createCompany = createOne("company");
export const getCompany = getOne("company");
export const getAllCompany = getAll("company");
export const deleteCompany = deleteOne("company");
export const updateCompany = updateOne("company");


// GET /api/company/:id/users — list users in a specific company (SUPER_ADMIN)
export const getCompanyUsersById = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { company_id: req.params.id },
    select: {
      id: true, username: true, firstname: true, lastname: true, role: true, email: true,
      team: { select: { id: true, team_name: true } },
    },
    orderBy: { date_of_joining: 'asc' },
  });
  res.json({ success: true, data: users });
});

// GET /api/company/mine — get current user's company with user count
export const getMyCompany = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.json({ success: true, data: null });
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      _count: { select: { users: true, products: true } },
    },
  });
  res.json({ success: true, data: company });
});

// GET /api/company/stats — platform-level counts (SUPER_ADMIN)
export const getPlatformStats = asyncHandler(async (req, res) => {
  const [companies, totalUsers, totalReps, unassigned] = await Promise.all([
    prisma.company.count(),
    prisma.user.count(),
    prisma.user.count({ where: { role: 'MedicalRep' } }),
    prisma.user.count({ where: { company_id: null } }),
  ]);
  res.json({ success: true, data: { companies, totalUsers, totalReps, unassigned } });
});

// PATCH /api/company/:id/toggle-active — flip is_active (SUPER_ADMIN)
export const toggleCompanyActive = asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id }, select: { is_active: true } });
  if (!company) { res.status(404); throw new Error('Company not found'); }
  const updated = await prisma.company.update({
    where: { id: req.params.id },
    data: { is_active: !company.is_active },
    select: { id: true, company_name: true, is_active: true },
  });
  res.json({ success: true, data: updated });
});
