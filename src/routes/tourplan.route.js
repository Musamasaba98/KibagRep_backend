import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getCurrentTourPlan,
  getTodayTourPlanEntries,
  updateTourPlanDay,
  addTourPlanEntry,
  removeTourPlanEntry,
  submitTourPlan,
  getPendingTourPlans,
  approveTourPlan,
  rejectTourPlan,
} from "../controllers/tourplan.controller.js";

const router = express.Router();

router.use(protect);

router.get("/current", getCurrentTourPlan);
router.get("/today", getTodayTourPlanEntries);
router.put("/:id/day", updateTourPlanDay);
router.post("/:id/entries", addTourPlanEntry);
router.delete("/:id/entries/:entryId", removeTourPlanEntry);
router.put("/:id/submit", submitTourPlan);
router.get("/pending", requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), getPendingTourPlans);
router.put("/:id/approve", requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), approveTourPlan);
router.put("/:id/reject", requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), rejectTourPlan);

export default router;
