/*
  Warnings:

  - You are about to drop the column `stockTrackingDate` on the `PharmacyActivity` table. All the data in the column will be lost.
  - You are about to drop the column `stockTrackingPharmacy_id` on the `PharmacyActivity` table. All the data in the column will be lost.
  - You are about to drop the column `stockTrackingProduct_id` on the `PharmacyActivity` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[license_number]` on the table `Doctor` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TourEntryType" AS ENUM ('CLINICIAN', 'PHARMACY');

-- CreateEnum
CREATE TYPE "TourSlot" AS ENUM ('MORNING', 'EVENING');

-- CreateEnum
CREATE TYPE "TourPlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FORWARDED_TO_KIBAG');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('VISITED', 'MISSED', 'RESCHEDULED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DispenseStatus" AS ENUM ('PENDING', 'VERIFIED', 'FLAGGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('AUTO_CLEAN', 'MANUAL_QA', 'AI_FLAGGED');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('AIRTIME', 'MOBILE_MONEY', 'LOYALTY_POINTS', 'PROCUREMENT_DISCOUNT');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PharmacyType" AS ENUM ('INDEPENDENT', 'CHAIN', 'HOSPITAL_INTERNAL', 'DISPENSING_CLINIC', 'COMMUNITY_HEALTH');

-- CreateEnum
CREATE TYPE "DosageForm" AS ENUM ('TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS', 'INHALER', 'SUPPOSITORY', 'PATCH', 'POWDER', 'OTHER');

-- CreateEnum
CREATE TYPE "BrandOrGeneric" AS ENUM ('BRAND', 'GENERIC', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PrescribingLevel" AS ENUM ('CONSULTANT', 'SPECIALIST', 'MEDICAL_OFFICER', 'RESIDENT', 'CLINICAL_OFFICER', 'NURSE_PRACTITIONER', 'PHARMACIST', 'DISPENSER');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SALES_ADMIN';

-- DropForeignKey
ALTER TABLE "DoctorActivity" DROP CONSTRAINT "DoctorActivity_focused_product_id_fkey";

-- DropForeignKey
ALTER TABLE "PharmacyActivity" DROP CONSTRAINT "PharmacyActivity_stockTrackingPharmacy_id_stockTrackingPro_fkey";

-- AlterTable
ALTER TABLE "CallCycleItem" ADD COLUMN     "precall_note" TEXT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "DailyReport" ADD COLUMN     "jfw_observer_id" TEXT;

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "license_number" TEXT,
ADD COLUMN     "prescribing_level" "PrescribingLevel";

-- AlterTable
ALTER TABLE "DoctorActivity" ADD COLUMN     "miss_reason" TEXT,
ADD COLUMN     "visit_status" "VisitStatus" NOT NULL DEFAULT 'VISITED',
ALTER COLUMN "focused_product_id" DROP NOT NULL,
ALTER COLUMN "samples_given" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Facility" ADD COLUMN     "facility_type" TEXT,
ADD COLUMN     "town" TEXT;

-- AlterTable
ALTER TABLE "Pharmacy" ADD COLUMN     "contact" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "pharmacy_type" "PharmacyType",
ADD COLUMN     "town" TEXT;

-- AlterTable
ALTER TABLE "PharmacyActivity" DROP COLUMN "stockTrackingDate",
DROP COLUMN "stockTrackingPharmacy_id",
DROP COLUMN "stockTrackingProduct_id",
ADD COLUMN     "gps_lat" DOUBLE PRECISION,
ADD COLUMN     "gps_lng" DOUBLE PRECISION,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "stock_noted" JSONB;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "generic_name" TEXT,
ADD COLUMN     "pending_unit_price" DOUBLE PRECISION,
ADD COLUMN     "price_proposed_by" TEXT,
ADD COLUMN     "unit_price" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "territory_id" TEXT;

-- CreateTable
CREATE TABLE "TourPlan" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "TourPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "TourPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourPlanDay" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "morning_area" TEXT,
    "evening_area" TEXT,
    "notes" TEXT,
    "is_off_day" BOOLEAN NOT NULL DEFAULT false,
    "daily_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transport" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "airtime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accommodation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "other_costs" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "TourPlanDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourPlanEntry" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "entry_type" "TourEntryType" NOT NULL DEFAULT 'CLINICIAN',
    "doctor_id" TEXT,
    "cycle_item_id" TEXT,
    "pharmacy_id" TEXT,
    "pharmacy_name" TEXT,
    "facility_id" TEXT,
    "notes" TEXT,
    "slot" "TourSlot" NOT NULL DEFAULT 'MORNING',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TourPlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Territory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "region" TEXT,
    "company_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerritoryFacility" (
    "territory_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,

    CONSTRAINT "TerritoryFacility_pkey" PRIMARY KEY ("territory_id","facility_id")
);

-- CreateTable
CREATE TABLE "DoctorFacility" (
    "doctor_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DoctorFacility_pkey" PRIMARY KEY ("doctor_id","facility_id")
);

-- CreateTable
CREATE TABLE "CompanyDoctor" (
    "company_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "added_by" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyDoctor_pkey" PRIMARY KEY ("company_id","doctor_id")
);

-- CreateTable
CREATE TABLE "DoctorRecommendation" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "doctor_id" TEXT,
    "clinician_name" TEXT,
    "clinician_cadre" "HcpCadre",
    "clinician_location" TEXT,
    "clinician_contact" TEXT,
    "unplanned_visit_count" INTEGER NOT NULL DEFAULT 0,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "DoctorRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugCatalog" (
    "id" TEXT NOT NULL,
    "inn_name" TEXT NOT NULL,
    "brand_names" TEXT[],
    "atc_code" TEXT,
    "atc_class" TEXT,
    "dosage_form" "DosageForm",
    "strength" TEXT,
    "is_rx_only" BOOLEAN NOT NULL DEFAULT true,
    "is_controlled" BOOLEAN NOT NULL DEFAULT false,
    "therapeutic_class" TEXT,
    "manufacturer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "DrugCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugCatalogProductMap" (
    "drug_catalog_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DrugCatalogProductMap_pkey" PRIMARY KEY ("drug_catalog_id","product_id")
);

-- CreateTable
CREATE TABLE "DispenserProfile" (
    "id" TEXT NOT NULL,
    "pharmacy_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "total_events" INTEGER NOT NULL DEFAULT 0,
    "verified_events" INTEGER NOT NULL DEFAULT 0,
    "flagged_events" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "DispenserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispenseEvent" (
    "id" TEXT NOT NULL,
    "pharmacy_id" TEXT NOT NULL,
    "dispenser_id" TEXT,
    "doctor_id" TEXT,
    "doctor_name_raw" TEXT,
    "prescribing_level_raw" TEXT,
    "facility_id" TEXT,
    "facility_name_raw" TEXT,
    "dispense_date" TIMESTAMP(3) NOT NULL,
    "prescription_date" TIMESTAMP(3),
    "status" "DispenseStatus" NOT NULL DEFAULT 'PENDING',
    "verification_method" "VerificationMethod",
    "verified_at" TIMESTAMP(3),
    "verified_by_user_id" TEXT,
    "rejection_reason" TEXT,
    "anomaly_score" DOUBLE PRECISION,
    "anomaly_flags" TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "DispenseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispenseItem" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "drug_catalog_id" TEXT,
    "drug_name_raw" TEXT,
    "qty_prescribed" INTEGER,
    "qty_dispensed" INTEGER NOT NULL,
    "is_partial" BOOLEAN NOT NULL DEFAULT false,
    "dosage_form" "DosageForm",
    "strength_raw" TEXT,
    "brand_or_generic" "BrandOrGeneric" NOT NULL DEFAULT 'UNKNOWN',
    "unit_price_ugx" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionImage" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_key" TEXT NOT NULL,
    "file_size_kb" INTEGER,
    "phash" TEXT,
    "phash_flagged" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewer_id" TEXT,

    CONSTRAINT "PrescriptionImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionHashIndex" (
    "phash" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "pharmacy_id" TEXT NOT NULL,
    "dispense_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionHashIndex_pkey" PRIMARY KEY ("phash")
);

-- CreateTable
CREATE TABLE "DispenseReward" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "pharmacy_id" TEXT NOT NULL,
    "dispenser_id" TEXT,
    "reward_type" "RewardType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "ext_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispenseReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyDailyStats" (
    "id" TEXT NOT NULL,
    "pharmacy_id" TEXT NOT NULL,
    "stat_date" DATE NOT NULL,
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "unique_doctors" INTEGER NOT NULL DEFAULT 0,
    "verified_count" INTEGER NOT NULL DEFAULT 0,
    "flagged_count" INTEGER NOT NULL DEFAULT 0,
    "reward_total_ugx" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rolling_7d_avg" DOUBLE PRECISION,
    "rolling_7d_stddev" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyDailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "target_value" INTEGER NOT NULL DEFAULT 0,
    "target_units" INTEGER NOT NULL DEFAULT 0,
    "set_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorIntel" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "doctor_id" TEXT,
    "pharmacy_id" TEXT,
    "competitor_company" TEXT NOT NULL,
    "competitor_brand" TEXT NOT NULL,
    "competitor_sku" TEXT,
    "is_listed" BOOLEAN NOT NULL DEFAULT false,
    "price_to_trade" DOUBLE PRECISION,
    "price_to_consumer" DOUBLE PRECISION,
    "stock_quantity" INTEGER,
    "notes" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorIntel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductLiterature" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "product_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_url" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size_kb" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductLiterature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTarget" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "target_units" INTEGER NOT NULL DEFAULT 0,
    "set_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TourPlan_user_id_month_year_key" ON "TourPlan"("user_id", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "TourPlanDay_plan_id_day_number_key" ON "TourPlanDay"("plan_id", "day_number");

-- CreateIndex
CREATE INDEX "DrugCatalog_inn_name_idx" ON "DrugCatalog"("inn_name");

-- CreateIndex
CREATE INDEX "DrugCatalog_atc_code_idx" ON "DrugCatalog"("atc_code");

-- CreateIndex
CREATE INDEX "DrugCatalog_atc_class_idx" ON "DrugCatalog"("atc_class");

-- CreateIndex
CREATE INDEX "DrugCatalogProductMap_drug_catalog_id_idx" ON "DrugCatalogProductMap"("drug_catalog_id");

-- CreateIndex
CREATE INDEX "DrugCatalogProductMap_product_id_idx" ON "DrugCatalogProductMap"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "DispenserProfile_phone_key" ON "DispenserProfile"("phone");

-- CreateIndex
CREATE INDEX "DispenserProfile_pharmacy_id_idx" ON "DispenserProfile"("pharmacy_id");

-- CreateIndex
CREATE INDEX "DispenserProfile_phone_idx" ON "DispenserProfile"("phone");

-- CreateIndex
CREATE INDEX "DispenseEvent_pharmacy_id_dispense_date_idx" ON "DispenseEvent"("pharmacy_id", "dispense_date");

-- CreateIndex
CREATE INDEX "DispenseEvent_doctor_id_dispense_date_idx" ON "DispenseEvent"("doctor_id", "dispense_date");

-- CreateIndex
CREATE INDEX "DispenseEvent_facility_id_dispense_date_idx" ON "DispenseEvent"("facility_id", "dispense_date");

-- CreateIndex
CREATE INDEX "DispenseEvent_status_created_at_idx" ON "DispenseEvent"("status", "created_at");

-- CreateIndex
CREATE INDEX "DispenseEvent_dispense_date_idx" ON "DispenseEvent"("dispense_date");

-- CreateIndex
CREATE INDEX "DispenseEvent_anomaly_score_idx" ON "DispenseEvent"("anomaly_score");

-- CreateIndex
CREATE INDEX "DispenseItem_event_id_idx" ON "DispenseItem"("event_id");

-- CreateIndex
CREATE INDEX "DispenseItem_drug_catalog_id_idx" ON "DispenseItem"("drug_catalog_id");

-- CreateIndex
CREATE INDEX "DispenseItem_event_id_drug_catalog_id_idx" ON "DispenseItem"("event_id", "drug_catalog_id");

-- CreateIndex
CREATE INDEX "PrescriptionImage_event_id_idx" ON "PrescriptionImage"("event_id");

-- CreateIndex
CREATE INDEX "PrescriptionImage_phash_idx" ON "PrescriptionImage"("phash");

-- CreateIndex
CREATE INDEX "PrescriptionHashIndex_pharmacy_id_idx" ON "PrescriptionHashIndex"("pharmacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "DispenseReward_event_id_key" ON "DispenseReward"("event_id");

-- CreateIndex
CREATE INDEX "DispenseReward_pharmacy_id_status_idx" ON "DispenseReward"("pharmacy_id", "status");

-- CreateIndex
CREATE INDEX "DispenseReward_status_created_at_idx" ON "DispenseReward"("status", "created_at");

-- CreateIndex
CREATE INDEX "PharmacyDailyStats_pharmacy_id_stat_date_idx" ON "PharmacyDailyStats"("pharmacy_id", "stat_date");

-- CreateIndex
CREATE INDEX "PharmacyDailyStats_stat_date_idx" ON "PharmacyDailyStats"("stat_date");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyDailyStats_pharmacy_id_stat_date_key" ON "PharmacyDailyStats"("pharmacy_id", "stat_date");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_user_id_month_year_key" ON "SalesTarget"("user_id", "month", "year");

-- CreateIndex
CREATE INDEX "CompetitorIntel_company_id_observed_at_idx" ON "CompetitorIntel"("company_id", "observed_at");

-- CreateIndex
CREATE INDEX "CompetitorIntel_competitor_company_observed_at_idx" ON "CompetitorIntel"("competitor_company", "observed_at");

-- CreateIndex
CREATE INDEX "ProductLiterature_company_id_is_active_idx" ON "ProductLiterature"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "ProductLiterature_product_id_idx" ON "ProductLiterature"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTarget_user_id_product_id_month_year_key" ON "ProductTarget"("user_id", "product_id", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_license_number_key" ON "Doctor"("license_number");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorActivity" ADD CONSTRAINT "DoctorActivity_focused_product_id_fkey" FOREIGN KEY ("focused_product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPlan" ADD CONSTRAINT "TourPlan_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPlanDay" ADD CONSTRAINT "TourPlanDay_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "TourPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPlanEntry" ADD CONSTRAINT "TourPlanEntry_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "TourPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPlanEntry" ADD CONSTRAINT "TourPlanEntry_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPlanEntry" ADD CONSTRAINT "TourPlanEntry_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPlanEntry" ADD CONSTRAINT "TourPlanEntry_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Territory" ADD CONSTRAINT "Territory_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerritoryFacility" ADD CONSTRAINT "TerritoryFacility_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "Territory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerritoryFacility" ADD CONSTRAINT "TerritoryFacility_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorFacility" ADD CONSTRAINT "DoctorFacility_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorFacility" ADD CONSTRAINT "DoctorFacility_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDoctor" ADD CONSTRAINT "CompanyDoctor_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDoctor" ADD CONSTRAINT "CompanyDoctor_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorRecommendation" ADD CONSTRAINT "DoctorRecommendation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorRecommendation" ADD CONSTRAINT "DoctorRecommendation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorRecommendation" ADD CONSTRAINT "DoctorRecommendation_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugCatalogProductMap" ADD CONSTRAINT "DrugCatalogProductMap_drug_catalog_id_fkey" FOREIGN KEY ("drug_catalog_id") REFERENCES "DrugCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugCatalogProductMap" ADD CONSTRAINT "DrugCatalogProductMap_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugCatalogProductMap" ADD CONSTRAINT "DrugCatalogProductMap_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenserProfile" ADD CONSTRAINT "DispenserProfile_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseEvent" ADD CONSTRAINT "DispenseEvent_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseEvent" ADD CONSTRAINT "DispenseEvent_dispenser_id_fkey" FOREIGN KEY ("dispenser_id") REFERENCES "DispenserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseEvent" ADD CONSTRAINT "DispenseEvent_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseEvent" ADD CONSTRAINT "DispenseEvent_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "DispenseEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_drug_catalog_id_fkey" FOREIGN KEY ("drug_catalog_id") REFERENCES "DrugCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionImage" ADD CONSTRAINT "PrescriptionImage_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "DispenseEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseReward" ADD CONSTRAINT "DispenseReward_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "DispenseEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseReward" ADD CONSTRAINT "DispenseReward_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseReward" ADD CONSTRAINT "DispenseReward_dispenser_id_fkey" FOREIGN KEY ("dispenser_id") REFERENCES "DispenserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDailyStats" ADD CONSTRAINT "PharmacyDailyStats_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorIntel" ADD CONSTRAINT "CompetitorIntel_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorIntel" ADD CONSTRAINT "CompetitorIntel_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorIntel" ADD CONSTRAINT "CompetitorIntel_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorIntel" ADD CONSTRAINT "CompetitorIntel_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLiterature" ADD CONSTRAINT "ProductLiterature_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLiterature" ADD CONSTRAINT "ProductLiterature_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTarget" ADD CONSTRAINT "ProductTarget_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTarget" ADD CONSTRAINT "ProductTarget_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
