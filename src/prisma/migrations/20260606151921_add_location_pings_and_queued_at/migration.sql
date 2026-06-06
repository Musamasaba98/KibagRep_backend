-- AlterTable
ALTER TABLE "DoctorActivity" ADD COLUMN     "queued_at" TIMESTAMP(3),
ADD COLUMN     "timing_anomaly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PharmacyActivity" ADD COLUMN     "queued_at" TIMESTAMP(3),
ADD COLUMN     "timing_anomaly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationPing_user_id_recorded_at_idx" ON "LocationPing"("user_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
