import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { CreateClaimSchema, AddExpenseItemSchema, RejectClaimSchema } from "../schemas/index.js";
import {
  getMyClaims,
  getClaim,
  createClaim,
  addItem,
  removeItem,
  submitClaim,
  getPendingClaims,
  approveClaim,
  rejectClaim,
} from "../controllers/expense.controller.js";

const router = express.Router();

router.use(protect);

// Static routes — must come before /:id
router.get("/my", getMyClaims);
router.post("/create", validate(CreateClaimSchema), createClaim);
router.get("/pending", requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), getPendingClaims);

// Dynamic /:id routes
router.get("/:id", getClaim);
router.post("/:id/items", validate(AddExpenseItemSchema), addItem);
router.delete("/:id/items/:itemId", removeItem);
router.put("/:id/submit", submitClaim);
router.put("/:id/approve", requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), approveClaim);
router.put("/:id/reject", requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), validate(RejectClaimSchema), rejectClaim);

export default router;
