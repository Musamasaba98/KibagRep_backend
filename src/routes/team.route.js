import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createTeam,
  deleteTeam,
  getAllTeam,
  getTeam,
  updateTeam,
  getCompanyTeams,
  createCompanyTeam,
} from "../controllers/team.controller.js";

const router = express.Router();

// Company-scoped (before /:id)
router.get("/company", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR","Manager","Supervisor"), getCompanyTeams);
router.post("/company", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR","Manager"), createCompanyTeam);

// Raw CRUD (SUPER_ADMIN only)
router.get("/", protect, requireRole("SUPER_ADMIN"), getAllTeam);
router.post("/", protect, requireRole("SUPER_ADMIN"), createTeam);
router.get("/:id", protect, requireRole("SUPER_ADMIN","SALES_ADMIN"), getTeam);
router.put("/:id", protect, requireRole("SUPER_ADMIN","SALES_ADMIN"), updateTeam);
router.delete("/:id", protect, requireRole("SUPER_ADMIN"), deleteTeam);

export default router;
