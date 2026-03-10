import express from "express";
import { createDoctorActivity, getTodayActivities, getActivityHistory, getCompanyFeed, logNca } from "../controllers/doctoractivity.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { CreateActivitySchema, LogNcaSchema } from "../schemas/index.js";

const router = express.Router();

router.use(protect);

router.get("/today", getTodayActivities);
router.get("/history", getActivityHistory);
router.get("/company-feed", getCompanyFeed);
router.post("/add-doctor-activity", validate(CreateActivitySchema), createDoctorActivity);
router.post("/add-nca", validate(LogNcaSchema), logNca);

export default router;
