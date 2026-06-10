import express from 'express';
import { protect, requireRole } from '../middleware/auth.middleware.js';
import {
  generateReport, getMySummary,
  getVisitTrend, getProductDetailing, getAnomalies,
} from '../controllers/report.controller.js';

const router = express.Router();

router.use(protect);

router.get('/my-summary', getMySummary);

const managerRoles = ["Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"];
router.get('/visit-trend',       requireRole(managerRoles), getVisitTrend);
router.get('/product-detailing', requireRole(managerRoles), getProductDetailing);
router.get('/anomalies',         requireRole(managerRoles), getAnomalies);

router.get(
  '/generate-report',
  requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN", "MedicalRep"]),
  generateReport
);

export default router;
