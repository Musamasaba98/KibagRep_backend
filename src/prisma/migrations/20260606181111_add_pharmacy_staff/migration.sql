-- CreateEnum
CREATE TYPE "PharmacyStaffRole" AS ENUM ('Owner', 'Procurement', 'Dispenser', 'Pharmacist', 'Manager');

-- CreateEnum
CREATE TYPE "PharmacyStaffStatus" AS ENUM ('SUGGESTED', 'SUPERVISOR_APPROVED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PharmacyStaff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "PharmacyStaffRole" NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "status" "PharmacyStaffStatus" NOT NULL DEFAULT 'SUGGESTED',
    "suggested_by_id" TEXT NOT NULL,
    "supervisor_approved_by_id" TEXT,
    "supervisor_approved_at" TIMESTAMP(3),
    "admin_approved_by_id" TEXT,
    "admin_approved_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "PharmacyStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyStaffLink" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "pharmacy_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyStaffLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyActivityStaff" (
    "activity_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,

    CONSTRAINT "PharmacyActivityStaff_pkey" PRIMARY KEY ("activity_id","staff_id")
);

-- CreateIndex
CREATE INDEX "PharmacyStaff_status_idx" ON "PharmacyStaff"("status");

-- CreateIndex
CREATE INDEX "PharmacyStaffLink_pharmacy_id_idx" ON "PharmacyStaffLink"("pharmacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyStaffLink_staff_id_pharmacy_id_key" ON "PharmacyStaffLink"("staff_id", "pharmacy_id");

-- AddForeignKey
ALTER TABLE "PharmacyStaff" ADD CONSTRAINT "PharmacyStaff_suggested_by_id_fkey" FOREIGN KEY ("suggested_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStaff" ADD CONSTRAINT "PharmacyStaff_supervisor_approved_by_id_fkey" FOREIGN KEY ("supervisor_approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStaff" ADD CONSTRAINT "PharmacyStaff_admin_approved_by_id_fkey" FOREIGN KEY ("admin_approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStaffLink" ADD CONSTRAINT "PharmacyStaffLink_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "PharmacyStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStaffLink" ADD CONSTRAINT "PharmacyStaffLink_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyActivityStaff" ADD CONSTRAINT "PharmacyActivityStaff_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "PharmacyActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyActivityStaff" ADD CONSTRAINT "PharmacyActivityStaff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "PharmacyStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
