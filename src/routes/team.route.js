import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createTeam, deleteTeam, getAllTeam, getTeam, updateTeam,
  getCompanyTeams, createCompanyTeam, renameCompanyTeam, deleteCompanyTeam,
  addTeamProduct, removeTeamProduct,
} from "../controllers/team.controller.js";

const router = express.Router();

const MANAGE_ROLES = ["SUPER_ADMIN","SALES_ADMIN","Manager"];
const VIEW_ROLES   = ["SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR","Manager","Supervisor"];

// Company-scoped (before /:id)
router.get("/company",                       protect, requireRole(...VIEW_ROLES),   getCompanyTeams);
router.post("/company",                      protect, requireRole(...MANAGE_ROLES), createCompanyTeam);
router.put("/company/:id",                   protect, requireRole(...MANAGE_ROLES), renameCompanyTeam);
router.delete("/company/:id",                protect, requireRole(...MANAGE_ROLES), deleteCompanyTeam);
router.post("/company/:id/products",         protect, requireRole(...MANAGE_ROLES), addTeamProduct);
router.delete("/company/:id/products/:productId", protect, requireRole(...MANAGE_ROLES), removeTeamProduct);

// Raw CRUD (SUPER_ADMIN only)
router.get("/", protect, requireRole("SUPER_ADMIN"), getAllTeam);
router.post("/", protect, requireRole("SUPER_ADMIN"), createTeam);
router.get("/:id", protect, requireRole("SUPER_ADMIN","SALES_ADMIN"), getTeam);
router.put("/:id", protect, requireRole("SUPER_ADMIN","SALES_ADMIN"), updateTeam);
router.delete("/:id", protect, requireRole("SUPER_ADMIN"), deleteTeam);

export default router;
