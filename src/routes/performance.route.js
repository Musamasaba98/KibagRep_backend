import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getRepPerformance, getTeamPerformance, getOverview,
  createReview, listReviews, exportPerformance,
} from "../controllers/performance.controller.js";

const router = express.Router();
router.use(protect);

const supervisorPlus = requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]);
const managerPlus    = requireRole(["Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]);

router.get("/rep/:userId",       getRepPerformance);
router.get("/team/:teamId",      supervisorPlus, getTeamPerformance);
router.get("/overview",          managerPlus,    getOverview);
router.get("/export",            supervisorPlus, exportPerformance);
router.post("/reviews",          supervisorPlus, createReview);
router.get("/reviews",           supervisorPlus, listReviews);

export default router;
