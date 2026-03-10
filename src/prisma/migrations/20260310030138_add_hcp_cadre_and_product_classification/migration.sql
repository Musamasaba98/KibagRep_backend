/*
  Warnings:

  - You are about to drop the column `procurementId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the `Procurement` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PROPOSED', 'SUBMITTED', 'APPROVED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HcpCadre" AS ENUM ('Doctor', 'Nurse', 'Midwife', 'Clinician', 'Pharmacist', 'Other');

-- CreateEnum
CREATE TYPE "ProductClassification" AS ENUM ('CASH_COW', 'NEW_LAUNCH', 'GROWTH', 'DECLINING');

-- DropForeignKey
ALTER TABLE "Procurement" DROP CONSTRAINT "Procurement_facility_id_fkey";

-- DropForeignKey
ALTER TABLE "Procurement" DROP CONSTRAINT "Procurement_pharmacy_id_fkey";

-- DropForeignKey
ALTER TABLE "Procurement" DROP CONSTRAINT "Procurement_profileId_fkey";

-- DropForeignKey
ALTER TABLE "Procurement" DROP CONSTRAINT "Procurement_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_procurementId_fkey";

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "cadre" "HcpCadre" NOT NULL DEFAULT 'Doctor';

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "procurementId",
ADD COLUMN     "classification" "ProductClassification" NOT NULL DEFAULT 'GROWTH';

-- DropTable
DROP TABLE "Procurement";

-- CreateTable
CREATE TABLE "ProcurementContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "contact" TEXT,
    "pharmacy_id" TEXT,
    "facility_id" TEXT,
    "is_key_contact" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ProcurementContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementOrder" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "pharmacy_id" TEXT,
    "facility_id" TEXT,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_delivery" TIMESTAMP(3),
    "status" "OrderStatus" NOT NULL DEFAULT 'PROPOSED',
    "total_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ProcurementOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementItem" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "ProcurementItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProcurementContact" ADD CONSTRAINT "ProcurementContact_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementContact" ADD CONSTRAINT "ProcurementContact_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "ProcurementContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementItem" ADD CONSTRAINT "ProcurementItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ProcurementOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementItem" ADD CONSTRAINT "ProcurementItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
