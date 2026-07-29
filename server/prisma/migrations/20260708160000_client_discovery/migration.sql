-- Phase 2: explicit gaps are part of the Engagement-owned Discovery Profile.
ALTER TABLE "Engagement" ADD COLUMN "missingInformation" JSONB;
