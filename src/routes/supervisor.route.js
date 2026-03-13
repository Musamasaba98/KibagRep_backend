import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { getTeamPerformance, getTeamMap } from "../controllers/supervisor.controller.js";

const router = express.Router();

router.use(protect);
router.use(requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]));

router.get("/team-performance", getTeamPerformance);
router.get("/team-map", getTeamMap);

export default router;
