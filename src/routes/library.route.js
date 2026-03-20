import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { getLibrary, addLiteratureItem, removeLiteratureItem } from "../controllers/library.controller.js";

const router = express.Router();

router.use(protect);

router.get("/", getLibrary);
router.post("/", requireRole("SALES_ADMIN", "Manager", "Supervisor", "COUNTRY_MGR", "SUPER_ADMIN"), addLiteratureItem);
router.delete("/:id", requireRole("SALES_ADMIN", "Manager", "COUNTRY_MGR", "SUPER_ADMIN"), removeLiteratureItem);

export default router;
