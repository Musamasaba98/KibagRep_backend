import express from "express";
import asyncHandler from "express-async-handler";
import prisma from "../config/prisma.config.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  createFacility, deleteFacility, getAllFacility, getFacility, updateFacility,
} from "../controllers/facility.controller.js";

const router = express.Router();

// Search facilities (protected — used in Tour Plan and HCP directory)
router.get("/search", protect, asyncHandler(async (req, res) => {
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

router.route("/").post(createFacility);
router.route("/").get(getAllFacility);
router.route("/:id").get(getFacility);
router.route("/:id").put(updateFacility);
router.route("/:id").delete(deleteFacility);

export default router;
