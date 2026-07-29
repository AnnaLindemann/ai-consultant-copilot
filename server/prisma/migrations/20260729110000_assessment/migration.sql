-- Phase 3: the Assessment is engagement state owned by the Engagement aggregate.
CREATE TYPE "AssessmentReviewState" AS ENUM ('ai_draft', 'consultant_edited', 'accepted');

ALTER TABLE "Engagement" ADD COLUMN "assessment" JSONB;
ALTER TABLE "Engagement" ADD COLUMN "assessmentReviewState" "AssessmentReviewState";

-- Analysis Runs now record which stage they supported (architecture.md §8).
-- Runs recorded before this column existed all came from the analysis endpoint.
ALTER TABLE "AnalysisRun" ADD COLUMN "stage" TEXT;
UPDATE "AnalysisRun" SET "stage" = 'analysis' WHERE "stage" IS NULL;
ALTER TABLE "AnalysisRun" ALTER COLUMN "stage" SET NOT NULL;
