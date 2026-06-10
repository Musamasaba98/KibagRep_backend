import express from 'express';
import { protect, requireRole } from '../middleware/auth.middleware.js';
import {
  generateReport, getMySummary,
  getVisitTrend, getProductDetailing, getAnomalies,
  getNationalOverview, getTerritoryCoverage, getTierCoverage,
  exportReport,
} from '../controllers/report.controller.js';

const router = express.Router();

router.use(protect);

router.get('/my-summary', getMySummary);

const managerRoles = ["Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"];
router.get('/visit-trend',       requireRole(managerRoles), getVisitTrend);
router.get('/product-detailing', requireRole(managerRoles), getProductDetailing);
router.get('/anomalies',         requireRole(managerRoles), getAnomalies);

const countryRoles = ["COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN"];
router.get('/national-overview',   requireRole(countryRoles), getNationalOverview);
router.get('/territory-coverage',  requireRole(countryRoles), getTerritoryCoverage);
router.get('/tier-coverage',       requireRole(countryRoles), getTierCoverage);

router.get('/export', requireRole(["SALES_ADMIN", "COUNTRY_MGR", "SUPER_ADMIN"]), exportReport);

router.get(
  '/generate-report',
  requireRole(["Supervisor", "Manager", "COUNTRY_MGR", "SALES_ADMIN", "SUPER_ADMIN", "MedicalRep"]),
  generateReport
);

export default router;
