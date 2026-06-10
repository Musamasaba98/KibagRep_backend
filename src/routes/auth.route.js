import express from "express";
import { login, refresh, logout, getMe, changePassword } from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { LoginSchema, ChangePasswordSchema } from "../schemas/index.js";

const router = express.Router();

router.post("/login",           validate(LoginSchema), login);
router.post("/refresh",         refresh);
router.post("/logout",          protect, logout);
router.get("/me",               protect, getMe);
router.put("/change-password",  protect, validate(ChangePasswordSchema), changePassword);

export default router;
