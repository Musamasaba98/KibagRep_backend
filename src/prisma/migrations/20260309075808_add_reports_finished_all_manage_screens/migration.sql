/*
  Warnings:

  - You are about to drop the column `doctor_activity_id` on the `Product` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "DoctorActivity_focused_product_id_key";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "doctor_activity_id";
