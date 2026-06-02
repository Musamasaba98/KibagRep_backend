-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "company_id" TEXT;

-- CreateIndex
CREATE INDEX "Team_company_id_idx" ON "Team"("company_id");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
