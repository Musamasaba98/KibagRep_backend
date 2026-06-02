-- AlterTable
ALTER TABLE "FieldEvent" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "StockPlacementTarget" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "pharmacy_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "target_units" INTEGER NOT NULL DEFAULT 0,
    "set_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockPlacementTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockPlacementTarget_company_id_month_year_idx" ON "StockPlacementTarget"("company_id", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "StockPlacementTarget_company_id_pharmacy_id_product_id_mont_key" ON "StockPlacementTarget"("company_id", "pharmacy_id", "product_id", "month", "year");

-- AddForeignKey
ALTER TABLE "StockPlacementTarget" ADD CONSTRAINT "StockPlacementTarget_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPlacementTarget" ADD CONSTRAINT "StockPlacementTarget_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPlacementTarget" ADD CONSTRAINT "StockPlacementTarget_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
