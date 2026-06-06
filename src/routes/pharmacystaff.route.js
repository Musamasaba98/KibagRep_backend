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
router.get("/pending-supervisor",         requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), getPendingSupervisor);
router.put("/:id/supervisor-approve",     requireRole(["Supervisor", "Manager"]), supervisorApprove);

// Super Admin — final queue + final approve
router.get("/pending-admin",              requireRole(["SUPER_ADMIN"]), getPendingAdmin);
router.put("/:id/admin-approve",          requireRole(["SUPER_ADMIN"]), adminApprove);
router.get("/",                           requireRole(["SUPER_ADMIN", "COUNTRY_MGR"]), getApprovedStaff);

// Either level can reject; any auth can link
router.put("/:id/reject",                 requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), rejectStaff);
router.post("/:id/link",                  linkToPharmacy);

export default router;
