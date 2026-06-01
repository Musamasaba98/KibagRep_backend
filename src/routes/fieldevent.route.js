import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getFieldEvents,
  createFieldEvent,
  updateFieldEvent,
  deleteFieldEvent,
} from "../controllers/fieldevent.controller.js";

const router = express.Router();

router.use(protect);

router.get("/",    getFieldEvents);
router.post("/",   createFieldEvent);
router.put("/:id", updateFieldEvent);
router.delete("/:id", deleteFieldEvent);

export default router;
