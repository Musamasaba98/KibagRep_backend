import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { SubmitReportSchema, RejectReportSchema } from "../schemas/index.js";
import {
  getTodayReport,
  submitReport,
  getMyReports,
  getPendingReports,
  approveReport,
  rejectReport,
} from "../controllers/dailyreport.controller.js";

const router = express.Router();

router.use(protect);

// Rep routes
router.get("/today", getTodayReport);
router.post("/submit", validate(SubmitReportSchema), submitReport);
router.get("/my", getMyReports);

// Supervisor routes
router.get("/pending", requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), getPendingReports);
router.put("/:id/approve", requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), approveReport);
router.put("/:id/reject", requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), validate(RejectReportSchema), rejectReport);

export default router;
