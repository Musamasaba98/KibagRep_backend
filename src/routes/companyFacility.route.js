import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getCompanyFacilities,
  addCompanyFacility,
  updateCompanyFacility,
  removeCompanyFacility,
} from "../controllers/companyFacility.controller.js";

const router = express.Router();
const MANAGERS = ["SALES_ADMIN", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"];

router.use(protect);

router.get("/",                      getCompanyFacilities);
router.post("/",                     requireRole(MANAGERS), addCompanyFacility);
router.put("/:facilityId",           requireRole(MANAGERS), updateCompanyFacility);
router.delete("/:facilityId",        requireRole(MANAGERS), removeCompanyFacility);

export default router;
