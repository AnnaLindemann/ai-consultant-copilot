-- Phase 2 Extension: the Discovery Profile gains its value & measurement
-- baseline, its review workflow status, and the provenance of its content.
-- Every column is additive; no existing discovery content is touched.
CREATE TYPE "DiscoveryStatus" AS ENUM ('draft', 'submitted', 'returned', 'accepted');
CREATE TYPE "DiscoveryActor" AS ENUM ('consultant', 'client');

ALTER TABLE "Engagement" ADD COLUMN "valueMeasurementBaseline" JSONB;

-- Existing engagements resume exactly where they were: as a draft nobody has
-- submitted for review yet.
ALTER TABLE "Engagement" ADD COLUMN "discoveryStatus" "DiscoveryStatus" NOT NULL DEFAULT 'draft';
ALTER TABLE "Engagement" ADD COLUMN "discoverySubmittedAt" TIMESTAMP(3);
ALTER TABLE "Engagement" ADD COLUMN "discoverySubmittedBy" "DiscoveryActor";
ALTER TABLE "Engagement" ADD COLUMN "discoveryReviewedAt" TIMESTAMP(3);
ALTER TABLE "Engagement" ADD COLUMN "discoveryReturnNotes" TEXT;
ALTER TABLE "Engagement" ADD COLUMN "discoveryContentProvenance" JSONB;

CREATE INDEX "Engagement_discoveryStatus_idx" ON "Engagement"("discoveryStatus");
