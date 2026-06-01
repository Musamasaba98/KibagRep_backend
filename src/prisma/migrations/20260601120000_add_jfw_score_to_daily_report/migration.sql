-- Add JFW coaching score fields to DailyReport
-- Filled by the JFW observer (supervisor) after the joint field day
ALTER TABLE "DailyReport"
  ADD COLUMN "jfw_score"     JSONB,
  ADD COLUMN "jfw_overall"   DOUBLE PRECISION,
  ADD COLUMN "jfw_notes"     TEXT,
  ADD COLUMN "jfw_scored_by" TEXT,
  ADD COLUMN "jfw_scored_at" TIMESTAMP(3);
