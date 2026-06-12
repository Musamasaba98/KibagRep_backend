-- AlterTable: add month and year to SampleBalance
-- Existing rows get the current month/year so they stay valid
ALTER TABLE "SampleBalance" ADD COLUMN "month" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "SampleBalance" ADD COLUMN "year"  INTEGER NOT NULL DEFAULT 2026;

-- DropIndex: remove old 2-column unique constraint
DROP INDEX "SampleBalance_user_id_product_id_key";

-- CreateIndex: new 4-column unique constraint
CREATE UNIQUE INDEX "SampleBalance_user_id_product_id_month_year_key"
  ON "SampleBalance"("user_id", "product_id", "month", "year");
