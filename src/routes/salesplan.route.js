import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { getMyPlan, upsertLines, submitPlan, approvePlan, revertPlan, listPlans, getPlanAchievement } from "../controllers/salesplan.controller.js";

const router = express.Router();
router.use(protect);

const supervisorPlus = requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]);

router.get("/mine",                   getMyPlan);
router.get("/",                       supervisorPlus, listPlans);
router.get("/:planId/achievement",    getPlanAchievement);
router.put("/:planId/lines",          upsertLines);
router.post("/:planId/submit",        submitPlan);
router.post("/:planId/approve",       supervisorPlus, approvePlan);
router.post("/:planId/revert",        supervisorPlus, revertPlan);

export default router;
