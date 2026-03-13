import prisma from "../config/prisma.config.js";
import exclude from "../utils/prisma.exclude.js";
import asyncHandler from "express-async-handler";
import bcrypt from "bcrypt";

// Role hierarchy — who can assign what roles
const ROLE_CAN_ASSIGN = {
  SUPER_ADMIN:  ["SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR","Manager","Supervisor","MedicalRep","USER"],
  COUNTRY_MGR:  ["SALES_ADMIN","Manager","Supervisor","MedicalRep"],
  SALES_ADMIN:  ["Manager","Supervisor","MedicalRep"],
  Manager:      ["Supervisor","MedicalRep"],
  Supervisor:   ["MedicalRep"],
};

export const signup = asyncHandler(async (req, res, next) => {
  const {
    username,
    firstname,
    lastname,
    password,
    email,
    role,
    contact,
    gender,
    // companyId,
    // teamId,
  } = req.body;
  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username: username }, { email: email }],
      },
    });

    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, error: "Username or email already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        username,
        firstname,
        lastname,
        email,
        role,
        contact,
        gender,
        password: hashedPassword,
        // company: { connect: { id: companyId } },
        // team: { connect: { id: teamId } },
      },
    });
    const userWithoutPassword = exclude(newUser, ["password"]);
    res.status(201).json({ success: true, data: userWithoutPassword });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: error.message });
  }
});

// PUT /api/user/me — update own profile (name, contact)
export const updateMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { firstname, lastname, contact } = req.body;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(firstname && { firstname }),
      ...(lastname  && { lastname }),
      ...(contact   && { contact }),
    },
    select: { id: true, firstname: true, lastname: true, email: true, contact: true, role: true },
  });
  res.json({ success: true, data: updated });
});

// GET /api/user/search?q=... — find users by username (for adding to a company)
export const searchByUsername = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  if (q.length < 2) return res.status(400).json({ success: false, error: "Provide at least 2 characters" });
  const users = await prisma.user.findMany({
    where: { username: { contains: q, mode: "insensitive" } },
    select: { id: true, username: true, firstname: true, lastname: true, role: true, company_id: true, company: { select: { company_name: true } } },
    take: 10,
  });
  res.json({ success: true, data: users });
});

// GET /api/user/company/users — list all users in the current user's company
export const getCompanyUsers = asyncHandler(async (req, res) => {
  const companyId = req.user.company_id;
  if (!companyId) return res.status(400).json({ success: false, error: "You are not linked to a company" });
  const users = await prisma.user.findMany({
    where: { company_id: companyId },
    select: {
      id: true, username: true, firstname: true, lastname: true,
      role: true, email: true, contact: true,
      team: { select: { id: true, team_name: true } },
      date_of_joining: true,
    },
    orderBy: { date_of_joining: "asc" },
  });
  res.json({ success: true, data: users });
});

// POST /api/user/company/add — add an existing user to the current company by userId
export const addUserToCompany = asyncHandler(async (req, res) => {
  const { userId, role, team_id, company_id: targetCompanyId } = req.body;
  const actor = req.user;
  const allowed = ROLE_CAN_ASSIGN[actor.role] ?? [];
  if (!allowed.includes(role)) {
    return res.status(403).json({ success: false, error: `Your role cannot assign: ${role}` });
  }
  // SUPER_ADMIN can pass any company_id; others use their own
  const companyId = actor.role === "SUPER_ADMIN" ? (targetCompanyId || actor.company_id) : actor.company_id;
  if (!companyId) {
    return res.status(400).json({ success: false, error: "No company specified" });
  }
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return res.status(404).json({ success: false, error: "User not found" });
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { company_id: companyId, role, ...(team_id ? { team_id } : {}) },
    select: { id: true, username: true, firstname: true, lastname: true, role: true, company_id: true },
  });
  res.json({ success: true, data: updated });
});

// PUT /api/user/company/:userId — update role or team for a company member
export const updateCompanyUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role, team_id } = req.body;
  const actor = req.user;
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || (target.company_id !== actor.company_id && actor.role !== "SUPER_ADMIN")) {
    return res.status(404).json({ success: false, error: "User not in your company" });
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(role !== undefined ? { role } : {}),
      ...(team_id !== undefined ? { team_id: team_id || null } : {}),
    },
    select: { id: true, username: true, firstname: true, lastname: true, role: true, team: { select: { id: true, team_name: true } } },
  });
  res.json({ success: true, data: updated });
});

// DELETE /api/user/company/:userId — remove user from company
export const removeUserFromCompany = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const actor = req.user;
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || (target.company_id !== actor.company_id && actor.role !== "SUPER_ADMIN")) {
    return res.status(404).json({ success: false, error: "User not in your company" });
  }
  await prisma.user.update({ where: { id: userId }, data: { company_id: null, team_id: null } });
  res.json({ success: true, message: "User removed from company" });
});

// PUT /api/user/change-password
export const changePassword = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    res.status(400); throw new Error("current_password and new_password are required");
  }
  if (new_password.length < 8) {
    res.status(400); throw new Error("New password must be at least 8 characters");
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  const { default: bcrypt } = await import("bcrypt");
  const match = await bcrypt.compare(current_password, user.password);
  if (!match) { res.status(401); throw new Error("Current password is incorrect"); }
  const hashed = await bcrypt.hash(new_password, 10);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  res.json({ success: true, message: "Password updated successfully" });
});

// GET /api/user/unassigned — users with no company (SUPER_ADMIN)
export const getUnassignedUsers = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { company_id: null },
    select: { id: true, username: true, firstname: true, lastname: true, role: true, email: true, date_of_joining: true },
    orderBy: { date_of_joining: 'desc' },
    take: 50,
  });
  res.json({ success: true, data: users });
});

// In-memory reset tokens: { token -> { userId, expiry } }
const resetTokens = new Map();

// POST /api/user/forgot-password — generate a reset token
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) { res.status(400); throw new Error('Email is required'); }
  const user = await prisma.user.findFirst({ where: { email }, select: { id: true, email: true, firstname: true } });
  // Always respond success so we don't leak whether email exists
  if (user) {
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    resetTokens.set(token, { userId: user.id, expiry: Date.now() + 60 * 60 * 1000 }); // 1 hour
    console.log('[PASSWORD RESET] Token for', user.email, ':', token);
    res.json({ success: true, message: 'If that email is registered, a reset link has been generated.', _dev_token: token });
  } else {
    res.json({ success: true, message: 'If that email is registered, a reset link has been generated.' });
  }
});

// POST /api/user/reset-password — verify token + set new password
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) { res.status(400); throw new Error('token and new_password are required'); }
  if (new_password.length < 6) { res.status(400); throw new Error('Password must be at least 6 characters'); }
  const record = resetTokens.get(token);
  if (!record || record.expiry < Date.now()) { res.status(400); throw new Error('Invalid or expired reset token'); }
  const { default: bcrypt } = await import('bcrypt');
  const hashed = await bcrypt.hash(new_password, 10);
  await prisma.user.update({ where: { id: record.userId }, data: { password: hashed } });
  resetTokens.delete(token);
  res.json({ success: true, message: 'Password reset successfully' });
});

// POST /api/user/admin-reset-password — SALES_ADMIN/SUPER_ADMIN resets a user's password
export const adminResetPassword = asyncHandler(async (req, res) => {
  const { userId, new_password } = req.body;
  if (!userId || !new_password) { res.status(400); throw new Error('userId and new_password are required'); }
  if (new_password.length < 6) { res.status(400); throw new Error('Password must be at least 6 characters'); }
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, company_id: true } });
  if (!target) { res.status(404); throw new Error('User not found'); }
  const actor = req.user;
  if (actor.role !== 'SUPER_ADMIN' && target.company_id !== actor.company_id) {
    res.status(403); throw new Error('Access denied');
  }
  const { default: bcrypt } = await import('bcrypt');
  const hashed = await bcrypt.hash(new_password, 10);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  res.json({ success: true, message: 'Password reset successfully' });
});
