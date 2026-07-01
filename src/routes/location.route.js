import express from "express";
import { batchPings, getTrail, getMyTrail, getTeamLastSeen } from "../controllers/location.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

// Rep posts their GPS pings (batch, up to 200 at a time)
router.post("/batch", batchPings);

// Rep sees their own trail
router.get("/my-trail", getMyTrail);

// Supervisor / manager / country_mgr: latest ping per rep + online status
router.get("/team-last-seen", requireRole(["Supervisor", "Manager", "SUPER_ADMIN", "COUNTRY_MGR"]), getTeamLastSeen);

// Supervisor / manager / super_admin fetches a rep's trail
router.get("/trail/:userId", requireRole(["Supervisor", "Manager", "SUPER_ADMIN", "COUNTRY_MGR"]), getTrail);

export default router;
