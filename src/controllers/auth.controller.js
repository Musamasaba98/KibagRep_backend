import prisma from "../config/prisma.config.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import exclude from "../utils/prisma.exclude.js";

const JWT_SECRET = () => process.env.JWT_SECRET;
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + "_refresh";

const signAccessToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, company_id: user.company_id },
    JWT_SECRET(),
    { expiresIn: "1h" }
  );

const signRefreshToken = (user) =>
  jwt.sign(
    { id: user.id, type: "refresh" },
    REFRESH_SECRET(),
    { expiresIn: "30d" }
  );

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  const user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  const token = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const userWithoutPassword = exclude(user, ["password"]);

  res.status(200).json({
    success: true,
    token,
    refreshToken,
    must_reset_password: user.must_reset_password ?? false,
    data: userWithoutPassword,
  });
});

// PUT /api/auth/change-password — used on first login when must_reset_password is true
export const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    res.status(400); throw new Error("current_password and new_password are required");
  }
  if (new_password.length < 8) {
    res.status(400); throw new Error("New password must be at least 8 characters");
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const match = await bcrypt.compare(current_password, user.password);
  if (!match) { res.status(401); throw new Error("Current password is incorrect"); }

  const hashed = await bcrypt.hash(new_password, 10);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: hashed, must_reset_password: false },
  });
  res.json({ success: true, message: "Password updated" });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400);
    throw new Error("Refresh token is required");
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, REFRESH_SECRET());
  } catch {
    res.status(401);
    throw new Error("Invalid or expired refresh token");
  }

  if (payload.type !== "refresh") {
    res.status(401);
    throw new Error("Invalid token type");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user) {
    res.status(401);
    throw new Error("User not found");
  }

  const token = signAccessToken(user);
  res.status(200).json({ success: true, token });
});

export const logout = asyncHandler(async (req, res) => {
  // Stateless JWT — client discards both tokens.
  // Future: maintain a server-side denylist if revocation is required.
  res.status(200).json({ success: true, message: "Logged out" });
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  res.status(200).json({ success: true, data: exclude(user, ["password"]) });
});
