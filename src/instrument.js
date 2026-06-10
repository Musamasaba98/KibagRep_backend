// Sentry must be initialised before any other imports.
// Import this file as the very first thing in server.js.
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,               // set in .env and on Render
  environment: process.env.NODE_ENV || "development",
  // Capture 100% of transactions in dev, 20% in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  // Don't send events when DSN is missing (local dev without Sentry)
  enabled: !!process.env.SENTRY_DSN,
});
