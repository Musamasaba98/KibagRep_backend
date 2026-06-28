import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { getCampaigns, createCampaign, updateCampaign, deleteCampaign, getActiveCampaigns } from "../controllers/campaign.controller.js";

const router = express.Router();

router.use(protect);

// Read-only for all company staff — used by reps to see active campaigns
router.get("/active", getActiveCampaigns);

// Full management — Country Manager and Sales Admin
router.get(   "/",    requireRole("COUNTRY_MGR", "SALES_ADMIN", "Manager", "SUPER_ADMIN"), getCampaigns);
router.post(  "/",    requireRole("COUNTRY_MGR", "SALES_ADMIN", "Manager", "SUPER_ADMIN"), createCampaign);
router.put(   "/:id", requireRole("COUNTRY_MGR", "SALES_ADMIN", "Manager", "SUPER_ADMIN"), updateCampaign);
router.delete("/:id", requireRole("COUNTRY_MGR", "SALES_ADMIN", "Manager", "SUPER_ADMIN"), deleteCampaign);

export default router;
