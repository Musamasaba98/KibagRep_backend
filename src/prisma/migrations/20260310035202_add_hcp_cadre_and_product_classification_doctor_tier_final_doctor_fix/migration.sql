/*
  Warnings:

  - You are about to drop the column `pharmacyActivityId` on the `Product` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_pharmacyActivityId_fkey";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "pharmacyActivityId";

-- CreateTable
CREATE TABLE "_PharmacyActivityToProduct" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PharmacyActivityToProduct_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PharmacyActivityToProduct_B_index" ON "_PharmacyActivityToProduct"("B");

-- AddForeignKey
ALTER TABLE "_PharmacyActivityToProduct" ADD CONSTRAINT "_PharmacyActivityToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "PharmacyActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PharmacyActivityToProduct" ADD CONSTRAINT "_PharmacyActivityToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
