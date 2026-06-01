-- ── New enums ─────────────────────────────────────────────────────────────────
CREATE TYPE "TerritoryType"    AS ENUM ('TOWN', 'UPCOUNTRY', 'REGIONAL');
CREATE TYPE "DoctorListType"   AS ENUM ('KBL', 'BL', 'FOCUS');
CREATE TYPE "FieldEventType"   AS ENUM ('OPD_BREAKFAST', 'CME_EVENT', 'PRODUCT_LAUNCH', 'PHARMACY_WORKSHOP', 'HOSPITAL_ROUND', 'OTHER');
CREATE TYPE "FieldEventStatus" AS ENUM ('PLANNED', 'EXECUTED', 'PARTIALLY_DONE', 'CANCELLED');

-- ── Territory enhancements ────────────────────────────────────────────────────
ALTER TABLE "Territory" ADD COLUMN "territory_type" "TerritoryType" NOT NULL DEFAULT 'TOWN';

-- ── User: optional secondary territory ───────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "secondary_territory_id" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_secondary_territory_id_fkey"
  FOREIGN KEY ("secondary_territory_id") REFERENCES "Territory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── CompanyDoctor: list type ──────────────────────────────────────────────────
ALTER TABLE "CompanyDoctor" ADD COLUMN "list_type" "DoctorListType" NOT NULL DEFAULT 'BL';

-- ── CallCycleItem: list type ──────────────────────────────────────────────────
ALTER TABLE "CallCycleItem" ADD COLUMN "list_type" "DoctorListType" NOT NULL DEFAULT 'BL';

-- ── FieldEvent table ──────────────────────────────────────────────────────────
CREATE TABLE "FieldEvent" (
  "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "user_id"         TEXT        NOT NULL,
  "company_id"      TEXT        NOT NULL,
  "event_type"      "FieldEventType"   NOT NULL DEFAULT 'OPD_BREAKFAST',
  "title"           TEXT        NOT NULL,
  "doctor_id"       TEXT,
  "facility_id"     TEXT,
  "product_id"      TEXT,
  "budget_ugx"      DOUBLE PRECISION,
  "planned_date"    TIMESTAMP(3),
  "planned_count"   INTEGER     NOT NULL DEFAULT 1,
  "executed_date"   TIMESTAMP(3),
  "executed_count"  INTEGER     NOT NULL DEFAULT 0,
  "actual_spend"    DOUBLE PRECISION,
  "attendees_count" INTEGER,
  "status"          "FieldEventStatus" NOT NULL DEFAULT 'PLANNED',
  "notes"           TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3),
  CONSTRAINT "FieldEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FieldEvent_user_id_fkey"     FOREIGN KEY ("user_id")     REFERENCES "User"("id")     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FieldEvent_company_id_fkey"  FOREIGN KEY ("company_id")  REFERENCES "Company"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FieldEvent_doctor_id_fkey"   FOREIGN KEY ("doctor_id")   REFERENCES "Doctor"("id")   ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FieldEvent_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FieldEvent_product_id_fkey"  FOREIGN KEY ("product_id")  REFERENCES "Product"("id")  ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "FieldEvent_company_id_planned_date_idx" ON "FieldEvent"("company_id", "planned_date");
CREATE INDEX "FieldEvent_user_id_status_idx"          ON "FieldEvent"("user_id", "status");
