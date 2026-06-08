-- Migration: add HcpRecord table
-- Stores all 119,244 health professionals from ehealthlicense.go.ug
-- Used for practitioner verification and the doctor profile-claiming flow.

CREATE TABLE "HcpRecord" (
  "id"                  TEXT        NOT NULL,
  "portal_id"           TEXT        NOT NULL,
  "name"                TEXT        NOT NULL,
  "council"             TEXT        NOT NULL,
  "registration_no"     TEXT        NOT NULL DEFAULT '',
  "registration_status" TEXT,
  "registration_date"   TIMESTAMP(3),
  "license_number"      TEXT,
  "license_expiry"      TIMESTAMP(3),
  "licence_status"      TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "doctor_id"           TEXT,

  CONSTRAINT "HcpRecord_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "HcpRecord_portal_id_key" ON "HcpRecord"("portal_id");
CREATE UNIQUE INDEX "HcpRecord_doctor_id_key"  ON "HcpRecord"("doctor_id");

-- Search indexes
CREATE INDEX "HcpRecord_name_idx"            ON "HcpRecord"("name");
CREATE INDEX "HcpRecord_registration_no_idx" ON "HcpRecord"("registration_no");
CREATE INDEX "HcpRecord_council_idx"         ON "HcpRecord"("council");
CREATE INDEX "HcpRecord_licence_status_idx"  ON "HcpRecord"("licence_status");

-- FK to Doctor (nullable — set only when a doctor claims their record)
ALTER TABLE "HcpRecord"
  ADD CONSTRAINT "HcpRecord_doctor_id_fkey"
  FOREIGN KEY ("doctor_id")
  REFERENCES "Doctor"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
