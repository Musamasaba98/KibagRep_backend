import express from "express";
import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createPharmacy, deletePharmacy, getAllPharmacy, getPharmacy, updatePharmacy,
} from "../controllers/pharmacy.controller.js";

const router = express.Router();

// Search pharmacies (protected — used in Tour Plan dropdown)
router.get("/search", protect, asyncHandler(async (req, res) => {
  const q = (req.query.q ?? "").toString().trim().toLowerCase();
  const pharmacies = await prisma.pharmacy.findMany({
    where: q ? {
      OR: [
        { pharmacy_name: { contains: q, mode: "insensitive" } },
        { location:      { contains: q, mode: "insensitive" } },
        { town:          { contains: q, mode: "insensitive" } },
      ],
    } : { is_active: true },
    select: { id: true, pharmacy_name: true, location: true, town: true, contact: true, latitude: true, longitude: true },
    orderBy: { pharmacy_name: "asc" },
    take: 30,
  });
  res.json({ success: true, data: pharmacies });
}));

// Shared master data — authenticated but not company-scoped (by design)
router.use(protect);
router.get("/", asyncHandler(async (req, res) => {
  const { page, limit, search, type } = req.query;

  if (!page && !limit) {
    // No pagination params → return all (used by dropdowns)
    const data = await prisma.pharmacy.findMany({
      where: { is_active: true },
      select: { id: true, pharmacy_name: true, location: true, town: true, contact: true },
      orderBy: { pharmacy_name: "asc" },
    });
    return res.json({ status: "success", results: data.length, data });
  }

  const pg = Math.max(1, parseInt(page) || 1);
  const lm = Math.min(100, parseInt(limit) || 50);
  const q  = (search ?? "").toString().trim();
  const where = {};
  if (q) where.OR = [
    { pharmacy_name: { contains: q, mode: "insensitive" } },
    { district:      { contains: q, mode: "insensitive" } },
    { region:        { contains: q, mode: "insensitive" } },
    { location:      { contains: q, mode: "insensitive" } },
  ];
  if (type) where.pharmacy_type = type;

  const [total, data] = await Promise.all([
    prisma.pharmacy.count({ where }),
    prisma.pharmacy.findMany({
      where,
      select: { id: true, pharmacy_name: true, location: true, town: true, district: true, region: true, pharmacy_type: true, contact: true, latitude: true, longitude: true, gps_source: true },
      orderBy: { pharmacy_name: "asc" },
      skip: (pg - 1) * lm,
      take: lm,
    }),
  ]);

  res.json({ status: "success", data, total, page: pg, pages: Math.ceil(total / lm) });
}));
router.route("/:id").get(getPharmacy);
// Write operations restricted to SUPER_ADMIN (platform-wide master list)
router.route("/").post(requireRole("SUPER_ADMIN"), createPharmacy);
router.route("/:id").put(requireRole("SUPER_ADMIN"), updatePharmacy);
router.route("/:id").delete(requireRole("SUPER_ADMIN"), deletePharmacy);

export default router;
