import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getPublicPlanConfigs,
  getAllPlanConfigs,
  updatePlanConfig,
  getCompanyPlan,
  updateCompanyPlan,
  getMyCompanyPlanStatus,
  getAllCompaniesWithPlan,
} from "../controllers/plan.controller.js";

const router = Router();

const SUPER_ADMIN = ["SUPER_ADMIN"];

// Public — used by pricing page (no auth required)
router.get("/public", getPublicPlanConfigs);

// Authenticated — any logged-in user can check their own company's plan status
router.get("/status", protect, getMyCompanyPlanStatus);

// SUPER_ADMIN — plan config management
router.get("/config",            protect, requireRole(...SUPER_ADMIN), getAllPlanConfigs);
router.put("/config/:plan",      protect, requireRole(...SUPER_ADMIN), updatePlanConfig);

// SUPER_ADMIN — company subscription management
router.get("/companies",         protect, requireRole(...SUPER_ADMIN), getAllCompaniesWithPlan);
router.get("/company/:id",       protect, requireRole(...SUPER_ADMIN), getCompanyPlan);
router.put("/company/:id",       protect, requireRole(...SUPER_ADMIN), updateCompanyPlan);

export default router;
