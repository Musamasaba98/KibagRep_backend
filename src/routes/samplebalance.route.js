import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { getMyBalance, getTeamBalances, issueSamples, giveSamples } from "../controllers/samplebalance.controller.js";

const router = express.Router();

router.use(protect);

router.get("/my", getMyBalance);
router.get("/team", requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), getTeamBalances);
router.post("/issue", requireRole(["Manager", "SUPER_ADMIN"]), issueSamples);
router.post("/give", giveSamples);

export default router;
