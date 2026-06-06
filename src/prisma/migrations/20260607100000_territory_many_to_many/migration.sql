-- Migration: territory_many_to_many
-- Replace territory_id + secondary_territory_id scalar FKs on User with
-- a proper many-to-many junction (UserTerritory).
-- Also add TerritoryPharmacy junction so routes track their pharmacies.

-- 1. Create UserTerritory junction -----------------------------------------
CREATE TABLE "UserTerritory" (
  "user_id"      TEXT NOT NULL,
  "territory_id" TEXT NOT NULL,
  CONSTRAINT "UserTerritory_pkey" PRIMARY KEY ("user_id", "territory_id")
);

-- Migrate existing data: promote territory_id → UserTerritory rows
INSERT INTO "UserTerritory" ("user_id", "territory_id")
SELECT "id", "territory_id"
FROM "User"
WHERE "territory_id" IS NOT NULL;

-- Migrate secondary_territory_id (skip if same as primary to avoid PK clash)
INSERT INTO "UserTerritory" ("user_id", "territory_id")
SELECT "id", "secondary_territory_id"
FROM "User"
WHERE "secondary_territory_id" IS NOT NULL
  AND ("secondary_territory_id" <> "territory_id" OR "territory_id" IS NULL)
ON CONFLICT DO NOTHING;

-- 2. Add FK constraints to UserTerritory ------------------------------------
ALTER TABLE "UserTerritory"
  ADD CONSTRAINT "UserTerritory_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserTerritory"
  ADD CONSTRAINT "UserTerritory_territory_id_fkey"
    FOREIGN KEY ("territory_id") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Drop old FK columns from User ------------------------------------------
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_territory_id_fkey";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_secondary_territory_id_fkey";
ALTER TABLE "User" DROP COLUMN IF EXISTS "territory_id";
ALTER TABLE "User" DROP COLUMN IF EXISTS "secondary_territory_id";

-- 4. Create TerritoryPharmacy junction --------------------------------------
CREATE TABLE "TerritoryPharmacy" (
  "territory_id" TEXT NOT NULL,
  "pharmacy_id"  TEXT NOT NULL,
  CONSTRAINT "TerritoryPharmacy_pkey" PRIMARY KEY ("territory_id", "pharmacy_id")
);

ALTER TABLE "TerritoryPharmacy"
  ADD CONSTRAINT "TerritoryPharmacy_territory_id_fkey"
    FOREIGN KEY ("territory_id") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerritoryPharmacy"
  ADD CONSTRAINT "TerritoryPharmacy_pharmacy_id_fkey"
    FOREIGN KEY ("pharmacy_id") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
