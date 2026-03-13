import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { createPharmacyActivity, getPharmacyActivityHistory } from "../controllers/pharmacyactivity.controller.js";

const router = express.Router();

router.use(protect);

router.route("/add-pharmacy-activity").post(createPharmacyActivity);
router.get("/history", getPharmacyActivityHistory);

export default router;
