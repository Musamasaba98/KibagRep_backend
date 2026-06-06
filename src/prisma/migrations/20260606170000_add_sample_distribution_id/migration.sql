-- Drop the old composite primary key
ALTER TABLE "SampleDistribution" DROP CONSTRAINT "SampleDistribution_pkey";

-- Add id column as nullable first
ALTER TABLE "SampleDistribution" ADD COLUMN "id" TEXT;

-- Populate existing rows with UUIDs
UPDATE "SampleDistribution" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;

-- Make it NOT NULL and set as primary key
ALTER TABLE "SampleDistribution" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "SampleDistribution" ADD CONSTRAINT "SampleDistribution_pkey" PRIMARY KEY ("id");
