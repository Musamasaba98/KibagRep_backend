import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createSampleDistribution,
  deleteSampleDistribution,
  getMyDistributions,
  getTeamDistributions,
  getSampleDistribution,
  updateSampleDistribution,
} from "../controllers/sampledistribution.controller.js";

const router = express.Router();

router.use(protect);

// Rep: view own distributions
router.get("/my", getMyDistributions);

// Supervisor+: view team distributions (company-scoped)
router.get("/team", requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]), getTeamDistributions);

// Rep: log a distribution
router.post("/", createSampleDistribution);

// Single record — ownership enforced inside controller
router.get("/:id",    getSampleDistribution);
router.put("/:id",    updateSampleDistribution);
router.delete("/:id", requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), deleteSampleDistribution);

export default router;
