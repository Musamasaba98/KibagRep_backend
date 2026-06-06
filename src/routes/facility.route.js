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
router.get("/", asyncHandler(async (req, res) => {
  const { page, limit, search, type, ownership } = req.query;

  if (!page && !limit) {
    // No pagination params → return all (used by dropdowns in TourPlan, Events, Territory)
    const data = await prisma.facility.findMany({
      select: { id: true, name: true, location: true, town: true, facility_type: true, latitude: true, longitude: true },
      orderBy: { name: "asc" },
    });
    return res.json({ status: "success", results: data.length, data });
  }

  // Paginated browse for admin views
  const pg = Math.max(1, parseInt(page) || 1);
  const lm = Math.min(100, parseInt(limit) || 50);
  const q  = (search ?? "").toString().trim();
  const where = {};
  if (q) where.OR = [
    { name:     { contains: q, mode: "insensitive" } },
    { district: { contains: q, mode: "insensitive" } },
    { region:   { contains: q, mode: "insensitive" } },
  ];
  if (type)      where.facility_type = type;
  if (ownership) where.ownership     = ownership;

  const [total, data] = await Promise.all([
    prisma.facility.count({ where }),
    prisma.facility.findMany({
      where,
      select: { id: true, name: true, facility_type: true, town: true, district: true, region: true, ownership: true, latitude: true, longitude: true },
      orderBy: { name: "asc" },
      skip: (pg - 1) * lm,
      take: lm,
    }),
  ]);

  res.json({ status: "success", data, total, page: pg, pages: Math.ceil(total / lm) });
}));
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
