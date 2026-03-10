import express from "express";
import cors from "cors";
import morgan from "morgan";
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
import { notFound, errorHandler } from "./src/middleware/error.middleware.js";

const app = express();
dotenv.config();
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Auth (public)
app.use("/api/auth", authRouter);

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

// Daily reports
app.use("/api/daily-report", dailyReportRouter);

// Expense claims
app.use("/api/expense", expenseRouter);

// Sample balance
app.use("/api/sample-balance", sampleBalanceRouter);

// Legacy report generator
app.use("/api/report", reportRouter);

// Error handling (must be last)
app.use(notFound);
app.use(errorHandler);

export default app;
