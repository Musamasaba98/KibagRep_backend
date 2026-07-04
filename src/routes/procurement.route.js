import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createOrder, listMyOrders, updateOrder, submitOrders,
  getInbox, approveOrder, rejectOrder,
} from "../controllers/procurement.controller.js";

const router = express.Router();
router.use(protect);

const supervisorPlus = requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"]);

// Note: /submit and /inbox must be declared BEFORE /:id to avoid Express
// matching the literal strings "submit"/"inbox" as id params.
router.get("/",             listMyOrders);
router.post("/",            createOrder);
router.post("/submit",      submitOrders);
router.get("/inbox",        supervisorPlus, getInbox);
router.put("/:id",          updateOrder);
router.post("/:id/approve", supervisorPlus, approveOrder);
router.post("/:id/reject",  supervisorPlus, rejectOrder);

export default router;
