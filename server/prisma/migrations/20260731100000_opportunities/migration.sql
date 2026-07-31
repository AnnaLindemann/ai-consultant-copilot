-- Phase 4: the prioritized Opportunities are engagement state owned by the
-- Engagement aggregate (roadmap Phase 4; architecture.md §4.2, §6).
--
-- Both statements are additive: an existing engagement gains two empty columns
-- and resumes exactly as it was — with no prioritization yet, which is a valid
-- state for every engagement that has not reached this stage.
CREATE TYPE "OpportunityReviewState" AS ENUM ('ai_draft', 'consultant_edited', 'accepted');

ALTER TABLE "Engagement" ADD COLUMN "opportunities" JSONB;
ALTER TABLE "Engagement" ADD COLUMN "opportunitiesReviewState" "OpportunityReviewState";
