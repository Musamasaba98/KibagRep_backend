import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { AddCycleItemSchema, RejectCycleSchema } from "../schemas/index.js";
import {
  getCurrentCycle,
  addCycleItem,
  removeCycleItem,
  submitCycle,
  getPendingCycles,
  approveCycle,
  rejectCycle,
  getCycleAdherence,
  updatePrecallNote,
} from "../controllers/callcycle.controller.js";

const router = express.Router();

// Rep routes
router.get("/current", protect, getCurrentCycle);
router.post("/current/items", protect, validate(AddCycleItemSchema), addCycleItem);
router.delete("/current/items/:itemId", protect, removeCycleItem);
router.patch("/current/items/:itemId/precall", protect, updatePrecallNote);
router.post("/:id/submit", protect, submitCycle);

// Supervisor routes
router.get("/pending", protect, requireRole("Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"), getPendingCycles);
router.put("/:id/approve", protect, requireRole("Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"), approveCycle);
router.put("/:id/reject", protect, requireRole("Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"), validate(RejectCycleSchema), rejectCycle);
router.get("/:id/adherence", protect, requireRole("Supervisor", "Manager", "SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"), getCycleAdherence);

export default router;
