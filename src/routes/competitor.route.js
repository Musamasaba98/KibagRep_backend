import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { logCompetitorIntel, getCompetitorIntel, getCompetitorSummary } from "../controllers/competitor.controller.js";

const router = express.Router();

router.use(protect);

router.get("/",        getCompetitorIntel);
router.get("/summary", getCompetitorSummary);
router.post("/",       logCompetitorIntel);

export default router;
