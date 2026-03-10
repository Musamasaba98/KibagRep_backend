import express from "express";
import {
  createDoctor,
  deleteDoctor,
  getAllDoctor,
  getDoctor,
  updateDoctor,
  searchDoctors,
  setDoctorTier,
} from "../controllers/doctor.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { SetDoctorTierSchema } from "../schemas/index.js";

const router = express.Router();

router.get("/search", protect, searchDoctors);                              // before /:id
router.get("/", protect, getAllDoctor);
router.post("/", createDoctor);
router.get("/:id", getDoctor);
router.put("/:id/tier", protect, validate(SetDoctorTierSchema), setDoctorTier);
router.put("/:id", updateDoctor);
router.delete("/:id", deleteDoctor);

export default router;
