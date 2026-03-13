import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  signup,
  updateMyProfile,
  changePassword,
  searchByUsername,
  getCompanyUsers,
  addUserToCompany,
  updateCompanyUser,
  removeUserFromCompany,
  getUnassignedUsers,
  forgotPassword,
  resetPassword,
  adminResetPassword,
} from "../controllers/user.controller.js";

const router = express.Router();

// Public
router.post("/addUser", signup);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Own profile
router.put("/me", protect, updateMyProfile);
router.put("/change-password", protect, changePassword);
router.post("/admin-reset", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR"), adminResetPassword);

// User search (any authenticated user)
router.get("/search", protect, searchByUsername);
router.get("/unassigned", protect, requireRole("SUPER_ADMIN"), getUnassignedUsers);

// Company user management
router.get("/company/users", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR","Manager","Supervisor"), getCompanyUsers);
router.post("/company/add", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR","Manager","Supervisor"), addUserToCompany);
router.put("/company/:userId", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR","Manager"), updateCompanyUser);
router.delete("/company/:userId", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR"), removeUserFromCompany);

export default router;
