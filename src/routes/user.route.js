import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  SignupSchema, ForgotPasswordSchema, ResetPasswordSchema,
  AdminResetPasswordSchema, ChangePasswordSchema,
  UpdateMyProfileSchema, AddUserToCompanySchema,
} from "../schemas/index.js";
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
  getAllPlatformUsers,
  forgotPassword,
  resetPassword,
  adminResetPassword,
} from "../controllers/user.controller.js";

const router = express.Router();

// Public
router.post("/addUser",          validate(SignupSchema), signup);
router.post("/forgot-password",  validate(ForgotPasswordSchema), forgotPassword);
router.post("/reset-password",   validate(ResetPasswordSchema), resetPassword);

// Own profile
router.put("/me",               protect, validate(UpdateMyProfileSchema), updateMyProfile);
router.put("/change-password",  protect, validate(ChangePasswordSchema), changePassword);
router.post("/admin-reset",     protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR"), validate(AdminResetPasswordSchema), adminResetPassword);

// User search (any authenticated user)
router.get("/search",     protect, searchByUsername);
router.get("/all",        protect, requireRole("SUPER_ADMIN"), getAllPlatformUsers);
router.get("/unassigned", protect, requireRole("SUPER_ADMIN"), getUnassignedUsers);

// Company user management
router.get("/company/users",      protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR","Manager","Supervisor"), getCompanyUsers);
router.post("/company/add",       protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR","Manager","Supervisor"), validate(AddUserToCompanySchema), addUserToCompany);
router.put("/company/:userId",    protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR","Manager"), updateCompanyUser);
router.delete("/company/:userId", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR"), removeUserFromCompany);

export default router;
