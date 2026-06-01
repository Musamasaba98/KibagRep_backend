import express from "express";
import {
  createDoctor, deleteDoctor, getAllDoctor, getDoctor, updateDoctor,
  searchDoctors, setDoctorTier,
  addDoctorFacility, setFacilityPrimary, removeDoctorFacility,
} from "../controllers/doctor.controller.js";
import {
  recommendDoctor, reportNewClinician, getRecommendations,
  approveRecommendation, rejectRecommendation, forwardToKibag, incrementUnplannedVisit,
} from "../controllers/recommendation.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { SetDoctorTierSchema } from "../schemas/index.js";

const router = express.Router();

// All doctor routes require authentication
router.use(protect);

// ── Static routes (before /:id) ───────────────────────────────────────────────
router.get("/search",                   searchDoctors);
router.get("/recommendations",          getRecommendations);
router.post("/recommend",               recommendDoctor);
router.post("/report-clinician",        reportNewClinician);
router.put("/recommendations/:id/approve", approveRecommendation);
router.put("/recommendations/:id/reject",  rejectRecommendation);
router.put("/recommendations/:id/forward", forwardToKibag);
router.post("/recommendations/:id/visit",  incrementUnplannedVisit);

// ── Doctor CRUD ───────────────────────────────────────────────────────────────
// Read — any authenticated user
router.get("/",     getAllDoctor);
router.get("/:id",  getDoctor);

// Write — SUPER_ADMIN only (master HCP data)
router.post(  "/",    requireRole("SUPER_ADMIN"), createDoctor);
router.put(   "/:id", requireRole("SUPER_ADMIN"), updateDoctor);
router.delete("/:id", requireRole("SUPER_ADMIN"), deleteDoctor);

// ── Per-doctor facility assignment (SUPER_ADMIN only) ─────────────────────────
router.post(  "/:id/facilities",              requireRole("SUPER_ADMIN"), addDoctorFacility);
router.put(   "/:id/facilities/:facilityId",  requireRole("SUPER_ADMIN"), setFacilityPrimary);
router.delete("/:id/facilities/:facilityId",  requireRole("SUPER_ADMIN"), removeDoctorFacility);

// ── Company tier (Supervisor / Manager / SALES_ADMIN) ─────────────────────────
router.put("/:id/tier", validate(SetDoctorTierSchema), setDoctorTier);

export default router;
