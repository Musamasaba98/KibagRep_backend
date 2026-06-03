-- CreateEnum
CREATE TYPE "LateRequestType" AS ENUM ('CYCLE', 'TOUR_PLAN');

-- CreateEnum
CREATE TYPE "LateRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "LateSubmissionRequest" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "LateRequestType" NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "status" "LateRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LateSubmissionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LateSubmissionRequest_user_id_type_month_year_key" ON "LateSubmissionRequest"("user_id", "type", "month", "year");

-- AddForeignKey
ALTER TABLE "LateSubmissionRequest" ADD CONSTRAINT "LateSubmissionRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
