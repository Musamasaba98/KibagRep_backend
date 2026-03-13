import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { getMyTarget, getTeamTargets, setTarget } from "../controllers/target.controller.js";

const router = express.Router();

router.use(protect);

// Rep: see own current-month target
router.get("/my", getMyTarget);

// Supervisor+: see all reps' targets for a given month
router.get(
  "/team",
  requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]),
  getTeamTargets
);

// Supervisor+: set/upsert a target
router.post(
  "/",
  requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]),
  setTarget
);

export default router;
