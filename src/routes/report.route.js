import express from 'express';
import { protect, requireRole } from '../middleware/auth.middleware.js';
import { generateReport } from '../controllers/report.controller.js';

const router = express.Router();

router.use(protect);

router.get(
  '/generate-report',
  requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN", "MedicalRep"]),
  generateReport
);

export default router;
