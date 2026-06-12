import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { getMyBalance, getMyHistory, getProductsForRep, getTeamBalances, getTeamSummary, issueSamples, issueSamplesBatch, giveSamples } from "../controllers/samplebalance.controller.js";

const router = express.Router();

router.use(protect);

router.get("/my", getMyBalance);
router.get("/history", getMyHistory);
router.get("/products-for-rep/:userId", requireRole("SALES_ADMIN","COUNTRY_MGR","Manager","Supervisor","SUPER_ADMIN"), getProductsForRep);
router.get("/team", requireRole("Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"), getTeamBalances);
router.get("/team-summary", requireRole("Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"), getTeamSummary);
router.post("/issue", requireRole("SALES_ADMIN","COUNTRY_MGR","Manager","Supervisor","SUPER_ADMIN"), issueSamples);
router.post("/issue-batch", requireRole("SALES_ADMIN","COUNTRY_MGR","Manager","Supervisor","SUPER_ADMIN"), issueSamplesBatch);
router.post("/give", giveSamples);

export default router;
