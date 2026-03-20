import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getMyTarget, getTeamTargets, setTarget,
  getProductTeamTargets, setProductTarget, setBulkProductTargets,
  updateProductPrice, approveProductPrice, rejectProductPrice, getProductPrices,
} from "../controllers/target.controller.js";

const router = express.Router();

router.use(protect);

// Rep: see own current-month target
router.get("/my", getMyTarget);

// Supervisor+: see all reps' targets for a given month
router.get(
  "/team",
  requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]),
  getTeamTargets
);

// Supervisor+: set/upsert a target
router.post(
  "/",
  requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]),
  setTarget
);

// Per-product targets
const supervisorPlus = requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]);
const managerPlus = requireRole(["Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]);
const cmOnly = requireRole(["COUNTRY_MGR", "SUPER_ADMIN"]);

router.get("/product-team", supervisorPlus, getProductTeamTargets);
router.post("/product", supervisorPlus, setProductTarget);
router.post("/product-bulk", supervisorPlus, setBulkProductTargets);

// Product pricing — Manager/Admin proposes, CM approves
router.get("/product-prices", managerPlus, getProductPrices);
router.put("/product-price/:id", managerPlus, updateProductPrice);
router.put("/product-price/:id/approve", cmOnly, approveProductPrice);
router.put("/product-price/:id/reject", cmOnly, rejectProductPrice);

export default router;
