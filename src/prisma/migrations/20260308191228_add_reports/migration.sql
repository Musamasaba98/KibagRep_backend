-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "DoctorTier" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "gps_lat" DOUBLE PRECISION,
ADD COLUMN     "gps_lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "DoctorActivity" ADD COLUMN     "gps_anomaly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gps_lat" DOUBLE PRECISION,
ADD COLUMN     "gps_lng" DOUBLE PRECISION,
ADD COLUMN     "outcome" TEXT;

-- CreateTable
CREATE TABLE "CallCycle" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "CallCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallCycleItem" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "tier" "DoctorTier" NOT NULL DEFAULT 'B',
    "frequency" INTEGER NOT NULL,
    "visits_done" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CallCycleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "report_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT,
    "visits_count" INTEGER NOT NULL DEFAULT 0,
    "samples_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallCycle_user_id_month_year_key" ON "CallCycle"("user_id", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "CallCycleItem_cycle_id_doctor_id_key" ON "CallCycleItem"("cycle_id", "doctor_id");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_user_id_report_date_key" ON "DailyReport"("user_id", "report_date");

-- AddForeignKey
ALTER TABLE "CallCycle" ADD CONSTRAINT "CallCycle_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallCycleItem" ADD CONSTRAINT "CallCycleItem_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "CallCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallCycleItem" ADD CONSTRAINT "CallCycleItem_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
