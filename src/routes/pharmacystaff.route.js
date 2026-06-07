import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  suggestStaff,
  getStaffByPharmacy,
  getPendingSupervisor,
  getPendingAdmin,
  getApprovedStaff,
  supervisorApprove,
  adminApprove,
  rejectStaff,
  linkToPharmacy,
} from "../controllers/pharmacystaff.controller.js";

const router = express.Router();

router.use(protect);

// Rep — suggest + read
router.post("/",                          suggestStaff);
router.get("/pharmacy/:pharmacyId",       getStaffByPharmacy);

// Supervisor — pending queue + approve/reject
router.get("/pending-supervisor",         requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), getPendingSupervisor);
router.put("/:id/supervisor-approve",     requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), supervisorApprove);

// Admin — final queue + final approve
router.get("/pending-admin",              requireRole(["SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"]), getPendingAdmin);
router.put("/:id/admin-approve",          requireRole(["SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"]), adminApprove);
router.get("/",                           requireRole(["SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"]), getApprovedStaff);

// Either level can reject; any auth can link
router.put("/:id/reject",                 requireRole(["Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"]), rejectStaff);
router.post("/:id/link",                  linkToPharmacy);

export default router;
