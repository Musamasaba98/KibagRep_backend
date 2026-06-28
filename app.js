import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from 'dotenv'
import authRouter from "./src/routes/auth.route.js";
import reportRouter from "./src/routes/report.route.js";
import companyRouter from "./src/routes/company.route.js";
import doctorRouter from "./src/routes/doctor.route.js";
import facilityRouter from "./src/routes/facility.route.js";
import pharmacyRouter from "./src/routes/pharmacy.route.js";
import productRouter from "./src/routes/product.route.js";
import teamRouter from "./src/routes/team.route.js";
import sampleDistributionRouter from "./src/routes/sampledistribution.route.js";
import stockTrackingRouter from "./src/routes/stocktracking.route.js";
import userRouter from "./src/routes/user.route.js";
import pharmacyActivityRouter from "./src/routes/pharmacyactivity.route.js";
import doctorActivityRouter from "./src/routes/doctoractivity.route.js";
import callCycleRouter from "./src/routes/callcycle.route.js";
import dailyReportRouter from "./src/routes/dailyreport.route.js";
import expenseRouter from "./src/routes/expense.route.js";
import sampleBalanceRouter from "./src/routes/samplebalance.route.js";
import tourPlanRouter from "./src/routes/tourplan.route.js";
import territoryRouter from "./src/routes/territory.route.js";
import supervisorRouter from "./src/routes/supervisor.route.js";
import targetRouter from "./src/routes/target.route.js";
import competitorRouter from "./src/routes/competitor.route.js";
import libraryRouter from "./src/routes/library.route.js";
import fieldEventRouter from "./src/routes/fieldevent.route.js";
import placementRouter from "./src/routes/placement.route.js";
import campaignRouter from "./src/routes/campaign.route.js";
import lateRequestRouter from "./src/routes/laterequest.route.js";
import pushRouter from "./src/routes/push.route.js";
import locationRouter from "./src/routes/location.route.js";
import pharmacyStaffRouter from "./src/routes/pharmacystaff.route.js";
import facilityStaffRouter from "./src/routes/facilitystaff.route.js";
import companyPharmacyRouter from "./src/routes/companyPharmacy.route.js";
import companyFacilityRouter from "./src/routes/companyFacility.route.js";
import hcpRecordRouter      from "./src/routes/hcprecord.route.js";
import planRouter           from "./src/routes/plan.route.js";
import { notFound, errorHandler } from "./src/middleware/error.middleware.js";

const app = express();
dotenv.config();

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },  // allow images/fonts from CDN
  contentSecurityPolicy: false,                           // CSP handled by frontend
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigin = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
app.use(cors({ origin: allowedOrigin, credentials: true }));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Auth endpoints: tighter — 10 attempts per 15 min per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many attempts. Try again in 15 minutes." },
  skip: () => process.env.NODE_ENV === "test",
});

// General API: 200 requests per 15 min per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please slow down." },
  skip: () => process.env.NODE_ENV === "test",
});

app.use("/api", apiLimiter);

app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

// Auth (public) — tighter rate limit on login/signup/reset
app.use("/api/auth", authLimiter, authRouter);

// User management
app.use("/api/user", userRouter);

// Master data
app.use("/api/company", companyRouter);
app.use("/api/doctor", doctorRouter);
app.use("/api/facility", facilityRouter);
app.use("/api/pharmacy", pharmacyRouter);
app.use("/api/product", productRouter);
app.use("/api/team", teamRouter);

// Activity tracking
app.use("/api/sample", sampleDistributionRouter);
app.use("/api/stock", stockTrackingRouter);
app.use("/api/field-pharmacy", pharmacyActivityRouter);
app.use("/api/field-doctor", doctorActivityRouter);

// Call cycles
app.use("/api/cycle", callCycleRouter);
app.use("/api/late-requests", lateRequestRouter);
app.use("/api/push", pushRouter);

// Daily reports
app.use("/api/daily-report", dailyReportRouter);

// Expense claims
app.use("/api/expense", expenseRouter);

// Sample balance
app.use("/api/sample-balance", sampleBalanceRouter);

// Tour plans (STP)
app.use("/api/tour-plan", tourPlanRouter);

// Supervisor team intelligence
app.use("/api/supervisor", supervisorRouter);

// Territory management
app.use("/api/territory", territoryRouter);

// Sales targets (set by management, visible to reps)
app.use("/api/target", targetRouter);

// Competitor intelligence
app.use("/api/competitor", competitorRouter);

// E-detailing library
app.use("/api/library", libraryRouter);

// Field events (OPD breakfasts, CME, product launches, etc.)
app.use("/api/field-events", fieldEventRouter);

// Stock placement targets (monthly units per SKU per outlet)
app.use("/api/placement", placementRouter);

// Marketing campaigns
app.use("/api/campaign", campaignRouter);
app.use("/api/location", locationRouter);
app.use("/api/pharmacy-staff",   pharmacyStaffRouter);
app.use("/api/facility-staff",   facilityStaffRouter);
app.use("/api/company-pharmacy", companyPharmacyRouter);
app.use("/api/company-facility", companyFacilityRouter);
app.use("/api/hcp-records",     hcpRecordRouter);
app.use("/api/plan",            planRouter);

// Legacy report generator
app.use("/api/report", reportRouter);

// Error handling (Sentry must be before custom handlers)
Sentry.setupExpressErrorHandler(app);
app.use(notFound);
app.use(errorHandler);

export default app;
