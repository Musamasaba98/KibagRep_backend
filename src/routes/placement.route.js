import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getPlacementTargets,
  upsertPlacementTarget,
  bulkUpsertPlacementTargets,
} from "../controllers/placement.controller.js";

const router = express.Router();

router.use(protect);

router.get("/",       requireRole(["SALES_ADMIN", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), getPlacementTargets);
router.post("/",      requireRole(["SALES_ADMIN", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), upsertPlacementTarget);
router.post("/bulk",  requireRole(["SALES_ADMIN", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), bulkUpsertPlacementTargets);

export default router;
