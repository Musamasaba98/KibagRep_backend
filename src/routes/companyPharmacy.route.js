import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getCompanyPharmacies,
  addCompanyPharmacy,
  updateCompanyPharmacy,
  removeCompanyPharmacy,
} from "../controllers/companyPharmacy.controller.js";

const router = express.Router();
const MANAGERS = ["SALES_ADMIN", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"];

router.use(protect);

router.get("/",                      getCompanyPharmacies);
router.post("/",                     requireRole(MANAGERS), addCompanyPharmacy);
router.put("/:pharmacyId",           requireRole(MANAGERS), updateCompanyPharmacy);
router.delete("/:pharmacyId",        requireRole(MANAGERS), removeCompanyPharmacy);

export default router;
