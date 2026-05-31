-- AlterTable
ALTER TABLE "PharmacyActivity" ADD COLUMN     "stockTrackingDate" TIMESTAMP(3),
ADD COLUMN     "stockTrackingPharmacy_id" TEXT,
ADD COLUMN     "stockTrackingProduct_id" TEXT;
