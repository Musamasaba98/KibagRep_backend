import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createStockTracking,
  deleteStockTracking,
  getAllStockTracking,
  getStockTracking,
  updateStockTracking,
} from "../controllers/stocktracking.controller.js";

const router = express.Router();

router.use(protect);

router.get("/",    getAllStockTracking);
router.get("/:id", getStockTracking);
router.post("/",   createStockTracking);
router.put("/:id", updateStockTracking);
router.delete("/:id", requireRole(["Supervisor", "Manager", "SUPER_ADMIN"]), deleteStockTracking);

export default router;
