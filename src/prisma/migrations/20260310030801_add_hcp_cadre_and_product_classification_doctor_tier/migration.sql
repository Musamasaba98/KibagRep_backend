-- CreateTable
CREATE TABLE "DoctorCompanyTier" (
    "doctor_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tier" "DoctorTier" NOT NULL,
    "visit_frequency" INTEGER,
    "notes" TEXT,
    "classified_by" TEXT,
    "classified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "DoctorCompanyTier_pkey" PRIMARY KEY ("doctor_id","company_id")
);

-- CreateTable
CREATE TABLE "FacilityCompanyTier" (
    "facility_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tier" "DoctorTier" NOT NULL,
    "notes" TEXT,
    "classified_by" TEXT,
    "classified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "FacilityCompanyTier_pkey" PRIMARY KEY ("facility_id","company_id")
);

-- AddForeignKey
ALTER TABLE "DoctorCompanyTier" ADD CONSTRAINT "DoctorCompanyTier_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorCompanyTier" ADD CONSTRAINT "DoctorCompanyTier_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityCompanyTier" ADD CONSTRAINT "FacilityCompanyTier_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityCompanyTier" ADD CONSTRAINT "FacilityCompanyTier_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
