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
import {
  recommendDoctor,
  reportNewClinician,
  getRecommendations,
  approveRecommendation,
  rejectRecommendation,
  forwardToKibag,
  incrementUnplannedVisit,
} from "../controllers/recommendation.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { SetDoctorTierSchema } from "../schemas/index.js";

const router = express.Router();

// Static routes — must come before /:id
router.get("/search", protect, searchDoctors);
router.get("/recommendations", protect, getRecommendations);
router.post("/recommend", protect, recommendDoctor);
router.post("/report-clinician", protect, reportNewClinician);
router.put("/recommendations/:id/approve", protect, approveRecommendation);
router.put("/recommendations/:id/reject", protect, rejectRecommendation);
router.put("/recommendations/:id/forward", protect, forwardToKibag);
router.post("/recommendations/:id/visit", protect, incrementUnplannedVisit);

router.get("/", protect, getAllDoctor);
router.post("/", createDoctor);
router.get("/:id", getDoctor);
router.put("/:id/tier", protect, validate(SetDoctorTierSchema), setDoctorTier);
router.put("/:id", updateDoctor);
router.delete("/:id", deleteDoctor);

export default router;
