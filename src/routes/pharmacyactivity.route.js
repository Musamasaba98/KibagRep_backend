import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { CreatePharmacyActivitySchema } from "../schemas/index.js";
import { createPharmacyActivity, getPharmacyActivityHistory } from "../controllers/pharmacyactivity.controller.js";

const router = express.Router();

router.use(protect);

router.post("/add-pharmacy-activity", validate(CreatePharmacyActivitySchema), createPharmacyActivity);
router.get("/history", getPharmacyActivityHistory);

export default router;
