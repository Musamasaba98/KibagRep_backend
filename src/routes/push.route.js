import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { subscribe, unsubscribe } from "../controllers/push.controller.js";

const router = express.Router();
router.use(protect);
router.post("/subscribe",   subscribe);
router.delete("/subscribe", unsubscribe);

export default router;
