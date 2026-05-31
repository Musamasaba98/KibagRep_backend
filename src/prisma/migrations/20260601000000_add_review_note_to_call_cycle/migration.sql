-- Add review_note to CallCycle so supervisors' rejection reasons are persisted
ALTER TABLE "CallCycle" ADD COLUMN "review_note" TEXT;
