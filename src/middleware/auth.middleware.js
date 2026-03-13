import jwt from "jsonwebtoken";
import prisma from "../config/prisma.config.js";

/**
 * Protects routes — verifies JWT and confirms user exists in DB.
 * Attaches fresh DB user to req.user (no stale token data).
 */
export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, company_id: true, firstname: true, lastname: true },
    });
    if (!user) {
      return res.status(401).json({ success: false, error: "User not found" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(500).json({ success: false, error: "Auth check failed" });
  }
};

/**
 * Restricts access to specific roles.
 * Usage: requireRole("Manager", "Supervisor")
 */
export const requireRole = (...roles) => {
  // Support both requireRole("A","B") and requireRole(["A","B"])
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    next();
  };
};
