-- Add SaasPlan enum and subscription fields to Company
-- Add PlanConfig global settings table

CREATE TYPE "SaasPlan" AS ENUM ('TRIAL', 'STARTER', 'GROWTH', 'ENTERPRISE', 'SUSPENDED');

ALTER TABLE "Company"
  ADD COLUMN "saas_plan"         "SaasPlan" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "trial_ends_at"     TIMESTAMP(3),
  ADD COLUMN "plan_activated_at" TIMESTAMP(3),
  ADD COLUMN "plan_expires_at"   TIMESTAMP(3),
  ADD COLUMN "is_locked"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lock_reason"       TEXT;

-- Set trial_ends_at for all existing companies to 30 days from now
-- (they are legacy/test companies — give them a grace period)
UPDATE "Company" SET "trial_ends_at" = NOW() + INTERVAL '30 days';

CREATE TABLE "PlanConfig" (
  "id"                   TEXT NOT NULL,
  "plan"                 "SaasPlan" NOT NULL,
  "display_name"         TEXT NOT NULL,
  "price_ugx"            INTEGER,
  "show_price"           BOOLEAN NOT NULL DEFAULT true,
  "rep_limit"            INTEGER,
  "setup_fee_ugx"        INTEGER,
  "annual_discount_pct"  INTEGER NOT NULL DEFAULT 17,
  "features"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_active"            BOOLEAN NOT NULL DEFAULT true,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlanConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanConfig_plan_key" ON "PlanConfig"("plan");

-- Seed default plan configs
INSERT INTO "PlanConfig" ("id", "plan", "display_name", "price_ugx", "show_price", "rep_limit", "setup_fee_ugx", "annual_discount_pct", "features", "updated_at") VALUES
  (gen_random_uuid()::text, 'TRIAL',      'Trial',      NULL,   false, NULL, NULL, 0,  ARRAY[
    'Full access to all features for 30 days',
    'GPS-verified visit logging',
    'Call cycle management',
    'Daily report submission & approval',
    'Supervisor approval workflows',
    'Tour plan management',
    'HCP directory access',
    'Expense claims',
    'Onboarding support included'
  ], NOW()),
  (gen_random_uuid()::text, 'STARTER',    'Starter',    60000,  true,  10,   750000,  17, ARRAY[
    'Up to 10 medical reps',
    'GPS-verified visit logging',
    'Call cycle management',
    'Daily report submission & approval',
    'Expense claims',
    'HCP directory access',
    'Excel report download',
    'Email support'
  ], NOW()),
  (gen_random_uuid()::text, 'GROWTH',     'Growth',     50000,  true,  50,   1500000, 17, ARRAY[
    'Up to 50 medical reps',
    'Everything in Starter',
    'Supervisor approval workflows',
    'Joint Field Work (JFW) scoring',
    'Tour plan management',
    'Pharmacy visit + stock tracking',
    'Field events (CME, OPD breakfasts)',
    'GPS anomaly flagging',
    'Priority support'
  ], NOW()),
  (gen_random_uuid()::text, 'ENTERPRISE', 'Enterprise', NULL,   false, NULL, NULL, 0,  ARRAY[
    'Unlimited reps across regions',
    'Everything in Growth',
    'Country Manager dashboard',
    'Multi-company / multi-tenant',
    'Doctor & pharmacy self-service portals',
    'CME and incentive tracking',
    'Onboarding & data migration',
    'Dedicated account manager',
    'SLA-backed uptime guarantee'
  ], NOW()),
  (gen_random_uuid()::text, 'SUSPENDED',  'Suspended',  NULL,   false, NULL, NULL, 0,  ARRAY[]::TEXT[], NOW());
