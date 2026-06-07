import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  suggestStaff,
  getStaffByFacility,
  getPendingSupervisor,
  getPendingAdmin,
  getApprovedStaff,
  supervisorApprove,
  adminApprove,
  rejectStaff,
  linkToFacility,
} from "../controllers/facilitystaff.controller.js";

const router = express.Router();

router.use(protect);

router.post("/",                          suggestStaff);
router.get("/facility/:facilityId",       getStaffByFacility);

router.get("/pending-supervisor",         requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), getPendingSupervisor);
router.put("/:id/supervisor-approve",     requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"]), supervisorApprove);

router.get("/pending-admin",              requireRole(["SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"]), getPendingAdmin);
router.put("/:id/admin-approve",          requireRole(["SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"]), adminApprove);
router.get("/",                           requireRole(["SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"]), getApprovedStaff);

router.put("/:id/reject",                 requireRole(["Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"]), rejectStaff);
router.post("/:id/link",                  linkToFacility);

export default router;
