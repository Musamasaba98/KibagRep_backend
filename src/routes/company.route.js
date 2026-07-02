import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { CreateCompanySchema, CompanySettingsSchema } from "../schemas/index.js";
import {
  createCompany,
  deleteCompany,
  getAllCompany,
  getCompany,
  updateCompany,
  getMyCompany,
  getCompanyUsersById,
  getPlatformStats,
  toggleCompanyActive,
  updateCompanySettings,
} from "../controllers/company.controller.js";

const router = express.Router();

// Static paths before /:id
router.get("/mine", protect, getMyCompany);
router.put("/settings", protect, requireRole("SALES_ADMIN","Manager","COUNTRY_MGR","SUPER_ADMIN"), validate(CompanySettingsSchema), updateCompanySettings);
router.get("/stats", protect, requireRole("SUPER_ADMIN"), getPlatformStats);

router.get("/", protect, requireRole("SUPER_ADMIN"), getAllCompany);
router.post("/", protect, requireRole("SUPER_ADMIN"), validate(CreateCompanySchema), createCompany);
router.get("/:id/users", protect, requireRole("SUPER_ADMIN"), getCompanyUsersById);
router.put("/:id/toggle-active", protect, requireRole("SUPER_ADMIN"), toggleCompanyActive);
router.get("/:id", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR"), getCompany);
router.put("/:id", protect, requireRole("SUPER_ADMIN","SALES_ADMIN"), updateCompany);
router.delete("/:id", protect, requireRole("SUPER_ADMIN"), deleteCompany);

export default router;
