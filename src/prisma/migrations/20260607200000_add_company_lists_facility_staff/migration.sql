-- FacilityStaff master list
CREATE TABLE "FacilityStaff" (
  "id"                        TEXT NOT NULL,
  "name"                      TEXT NOT NULL,
  "role"                      TEXT NOT NULL,
  "phone"                     TEXT,
  "notes"                     TEXT,
  "status"                    TEXT NOT NULL DEFAULT 'SUGGESTED',
  "suggested_by_id"           TEXT NOT NULL,
  "supervisor_approved_by_id" TEXT,
  "supervisor_approved_at"    TIMESTAMP(3),
  "admin_approved_by_id"      TEXT,
  "admin_approved_at"         TIMESTAMP(3),
  "review_note"               TEXT,
  "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMP(3),
  CONSTRAINT "FacilityStaff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FacilityStaff_status_idx" ON "FacilityStaff"("status");

-- FacilityStaffLink — one staff member can work at multiple facilities
CREATE TABLE "FacilityStaffLink" (
  "id"          TEXT NOT NULL,
  "staff_id"    TEXT NOT NULL,
  "facility_id" TEXT NOT NULL,
  "is_primary"  BOOLEAN NOT NULL DEFAULT false,
  "linked_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityStaffLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FacilityStaffLink_staff_id_facility_id_key" ON "FacilityStaffLink"("staff_id", "facility_id");
CREATE INDEX "FacilityStaffLink_facility_id_idx" ON "FacilityStaffLink"("facility_id");

-- CompanyPharmacy — company's curated pharmacy list from NDA master
CREATE TABLE "CompanyPharmacy" (
  "company_id"  TEXT NOT NULL,
  "pharmacy_id" TEXT NOT NULL,
  "tier"        TEXT NOT NULL DEFAULT 'B',
  "notes"       TEXT,
  "added_by"    TEXT,
  "added_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyPharmacy_pkey" PRIMARY KEY ("company_id", "pharmacy_id")
);
CREATE INDEX "CompanyPharmacy_company_id_idx" ON "CompanyPharmacy"("company_id");

-- CompanyFacility — company's curated facility list from NHFR master
CREATE TABLE "CompanyFacility" (
  "company_id"  TEXT NOT NULL,
  "facility_id" TEXT NOT NULL,
  "notes"       TEXT,
  "added_by"    TEXT,
  "added_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyFacility_pkey" PRIMARY KEY ("company_id", "facility_id")
);
CREATE INDEX "CompanyFacility_company_id_idx" ON "CompanyFacility"("company_id");

-- FK: FacilityStaff → User
ALTER TABLE "FacilityStaff" ADD CONSTRAINT "FacilityStaff_suggested_by_id_fkey"
  FOREIGN KEY ("suggested_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilityStaff" ADD CONSTRAINT "FacilityStaff_supervisor_approved_by_id_fkey"
  FOREIGN KEY ("supervisor_approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacilityStaff" ADD CONSTRAINT "FacilityStaff_admin_approved_by_id_fkey"
  FOREIGN KEY ("admin_approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: FacilityStaffLink → FacilityStaff + Facility
ALTER TABLE "FacilityStaffLink" ADD CONSTRAINT "FacilityStaffLink_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "FacilityStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilityStaffLink" ADD CONSTRAINT "FacilityStaffLink_facility_id_fkey"
  FOREIGN KEY ("facility_id") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK: CompanyPharmacy → Company + Pharmacy
ALTER TABLE "CompanyPharmacy" ADD CONSTRAINT "CompanyPharmacy_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyPharmacy" ADD CONSTRAINT "CompanyPharmacy_pharmacy_id_fkey"
  FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK: CompanyFacility → Company + Facility
ALTER TABLE "CompanyFacility" ADD CONSTRAINT "CompanyFacility_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyFacility" ADD CONSTRAINT "CompanyFacility_facility_id_fkey"
  FOREIGN KEY ("facility_id") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
