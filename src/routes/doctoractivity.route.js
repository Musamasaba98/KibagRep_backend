import express from "express";
import {
  createDoctorActivity,
  getTodayActivities,
  getActivityHistory,
  getCompanyFeed,
  logNca,
  logMissedVisit,
  getBacklog,
  getMtdStats,
} from "../controllers/doctoractivity.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { CreateActivitySchema, LogNcaSchema, LogMissedSchema } from "../schemas/index.js";

const router = express.Router();

router.use(protect);

router.get("/today", getTodayActivities);
router.get("/history", getActivityHistory);
router.get("/company-feed", getCompanyFeed);
router.get("/backlog", getBacklog);
router.get("/mtd-stats", getMtdStats);
router.post("/add-doctor-activity", validate(CreateActivitySchema), createDoctorActivity);
router.post("/add-nca", validate(LogNcaSchema), logNca);
router.post("/log-missed", validate(LogMissedSchema), logMissedVisit);

export default router;
