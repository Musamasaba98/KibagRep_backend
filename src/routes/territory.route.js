import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getTerritories,
  getMyTerritory,
  createTerritory,
  updateTerritory,
  deleteTerritory,
  addFacility,
  removeFacility,
  addPharmacy,
  removePharmacy,
  assignRep,
  unassignRep,
  assignTeam,
  unassignTeam,
  linkDoctorFacility,
  unlinkDoctorFacility,
} from "../controllers/territory.controller.js";

const router = express.Router();
router.use(protect);

const MANAGERS = ["Manager", "Supervisor", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"];

// Rep reads own territories
router.get("/my", getMyTerritory);

// All company staff can list territories
router.get("/", getTerritories);

// Management only — create / edit / delete
router.post(  "/",    requireRole(MANAGERS), createTerritory);
router.put(   "/:id", requireRole(MANAGERS), updateTerritory);
router.delete("/:id", requireRole(MANAGERS), deleteTerritory);

// Facility links
router.post(  "/:id/facilities",            requireRole(MANAGERS), addFacility);
router.delete("/:id/facilities/:facilityId",requireRole(MANAGERS), removeFacility);

// Pharmacy links
router.post(  "/:id/pharmacies",             requireRole(MANAGERS), addPharmacy);
router.delete("/:id/pharmacies/:pharmacyId", requireRole(MANAGERS), removePharmacy);

// Rep assignment (many-to-many)
router.post(  "/:id/reps",          requireRole(MANAGERS), assignRep);
router.delete("/:id/reps/:userId",  requireRole(MANAGERS), unassignRep);

// Team assignment (many-to-many)
router.post(  "/:id/teams",         requireRole(MANAGERS), assignTeam);
router.delete("/:id/teams/:teamId", requireRole(MANAGERS), unassignTeam);

// Doctor–Facility M2M (shared HCP layer)
router.post(  "/doctor-facility", requireRole(["SALES_ADMIN", "SUPER_ADMIN"]), linkDoctorFacility);
router.delete("/doctor-facility", requireRole(["SALES_ADMIN", "SUPER_ADMIN"]), unlinkDoctorFacility);

export default router;
