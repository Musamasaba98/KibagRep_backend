import express from "express";
import { listHcpRecords, hcpStats } from "../controllers/hcprecord.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";

const router = express.Router();

const adminGuard = requireRole("SUPER_ADMIN", "SALES_ADMIN");

router.get("/stats", protect, adminGuard, hcpStats);
router.get("/",      protect, adminGuard, listHcpRecords);

export default router;
