-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "supervisor_id" TEXT;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
