import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  createProduct, deleteProduct, getAllProduct, getProduct, updateProduct,
  getCompanyProducts, createCompanyProduct,
} from "../controllers/product.controller.js";

const router = express.Router();

// Company-scoped (before /:id)
router.get("/company", protect, getCompanyProducts);
router.post("/company", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR"), createCompanyProduct);

// Protected CRUD
router.get("/", protect, requireRole("SUPER_ADMIN"), getAllProduct);
router.post("/", protect, requireRole("SUPER_ADMIN"), createProduct);
router.get("/:id", protect, getProduct);
router.put("/:id", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR"), updateProduct);
router.delete("/:id", protect, requireRole("SUPER_ADMIN","SALES_ADMIN","COUNTRY_MGR"), deleteProduct);

export default router;
