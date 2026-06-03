import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createLateRequest,
  getMyLateRequests,
  getPendingLateRequests,
  approveLateRequest,
  rejectLateRequest,
} from "../controllers/laterequest.controller.js";

const router = express.Router();

router.use(protect);

// Rep routes
router.post("/", createLateRequest);
router.get("/my", getMyLateRequests);

// Supervisor routes
router.get("/pending", requireRole("Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"), getPendingLateRequests);
router.put("/:id/approve", requireRole("Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"), approveLateRequest);
router.put("/:id/reject", requireRole("Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"), rejectLateRequest);

export default router;
