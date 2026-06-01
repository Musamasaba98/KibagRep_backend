import express from "express";
import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createFacility, deleteFacility, getAllFacility, getFacility, updateFacility,
} from "../controllers/facility.controller.js";

const router = express.Router();

// ── All facility routes require authentication ────────────────────────────────
router.use(protect);

// Read — any authenticated user (reps, supervisors, managers all need facility data)
router.get("/", getAllFacility);
router.get("/search", asyncHandler(async (req, res) => {
  const q = (req.query.q ?? "").toString().trim().toLowerCase();
  const facilities = await prisma.facility.findMany({
    where: q ? {
      OR: [
        { name:     { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
        { town:     { contains: q, mode: "insensitive" } },
      ],
    } : undefined,
    select: {
      id: true, name: true, location: true, town: true, latitude: true, longitude: true,
      working_doctors: {
        include: { doctor: { select: { id: true, doctor_name: true, cadre: true } } },
        take: 5,
      },
    },
    orderBy: { name: "asc" },
    take: 30,
  });
  res.json({ success: true, data: facilities });
}));
router.get("/:id", getFacility);

// Write — SUPER_ADMIN only (facility GPS drives anomaly detection platform-wide)
router.post(  "/",    requireRole("SUPER_ADMIN"), createFacility);
router.put(   "/:id", requireRole("SUPER_ADMIN"), updateFacility);
router.delete("/:id", requireRole("SUPER_ADMIN"), deleteFacility);

export default router;
