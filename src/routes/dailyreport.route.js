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
  getCompanyObservers,
  getReportActivities,
  getCompanyReports,
  getJfwReports,
} from "../controllers/dailyreport.controller.js";

const router = express.Router();

router.use(protect);

// Rep routes
router.get("/today", getTodayReport);
router.post("/submit", validate(SubmitReportSchema), submitReport);
router.get("/my", getMyReports);
router.get("/observers", getCompanyObservers);

// Supervisor static routes — MUST come before /:id
router.get("/company", requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]), getCompanyReports);
router.get("/jfw", getJfwReports);
router.get("/pending", requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), getPendingReports);

// Dynamic /:id routes
router.get("/:id/activities", requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), getReportActivities);
router.put("/:id/approve", requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), approveReport);
router.put("/:id/reject", requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), validate(RejectReportSchema), rejectReport);

export default router;
