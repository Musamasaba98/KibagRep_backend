import express from "express";
import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";
import { protect } from "../middleware/auth.middleware.js";
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

router.route("/").post(createPharmacy);
router.route("/").get(getAllPharmacy);
router.route("/:id").get(getPharmacy);
router.route("/:id").put(updatePharmacy);
router.route("/:id").delete(deletePharmacy);

export default router;
