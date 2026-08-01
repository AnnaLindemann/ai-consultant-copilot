-- Phase 6 — Solution Matching & Grounded Recommendations.
--
-- Three things happen here, in order:
--   1. Opportunities are given a stable identity, backfilled for stored ones.
--   2. The Analysis Run gains the Technology Knowledge Base grounding it
--      records, alongside the Consulting Knowledge Base codes it already keeps.
--   3. The RecommendationVersion table is created.

-- 1. Stable Opportunity identity --------------------------------------------
--
-- A Recommendation addresses an Opportunity, so what identifies an Opportunity
-- must not be its title (editable text) or its priority rank (re-ordered by
-- hand). Stored Opportunity versions predate the identifier, so every
-- opportunity that lacks one is given one here — once, in place — rather than at
-- read time, which would mint a different identity on every read and defeat the
-- point. This mirrors exactly what the Phase 4 migration did for Assessment
-- findings.
--
-- Superseded versions are backfilled too. They are preserved records and are
-- never rewritten in *content*; adding the identity their content always
-- implicitly had is what keeps them readable against the current contract,
-- which is the same reason the finding backfill touched stored assessments.
UPDATE "OpportunityVersion" AS v
SET "content" = jsonb_set(
      v."content",
      '{opportunities}',
      COALESCE(
        (
          SELECT jsonb_agg(
                   CASE
                     WHEN opportunity.value ? 'id' THEN opportunity.value
                     ELSE opportunity.value
                          || jsonb_build_object('id', gen_random_uuid()::text)
                   END
                   ORDER BY opportunity.ordinality
                 )
            FROM jsonb_array_elements(v."content" -> 'opportunities')
                 WITH ORDINALITY AS opportunity(value, ordinality)
        ),
        '[]'::jsonb
      )
    )
WHERE v."content" -> 'opportunities' IS NOT NULL;

-- 2. Technology grounding on the Analysis Run --------------------------------
--
-- An additive field on the existing mechanism, not a new one (architecture.md
-- §8). It is kept separate from "knowledgeEntryCodes" because the two knowledge
-- bases are independent subsystems that are named specifically rather than
-- merged into an undifferentiated "knowledge base".
ALTER TABLE "AnalysisRun" ADD COLUMN "technologyProfileCodes" JSONB;

-- 3. Versioned Recommendation snapshots --------------------------------------
CREATE TYPE "RecommendationReviewState" AS ENUM ('ai_draft', 'consultant_edited', 'accepted');
CREATE TYPE "RecommendationVersionStatus" AS ENUM ('active', 'superseded');

CREATE TABLE "RecommendationVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "RecommendationVersionStatus" NOT NULL DEFAULT 'active',
    "content" JSONB NOT NULL,
    "reviewState" "RecommendationReviewState" NOT NULL DEFAULT 'ai_draft',
    "sourceOpportunityVersionId" TEXT NOT NULL,
    "sourceOpportunityVersionNumber" INTEGER NOT NULL,
    "sourceOpportunityFingerprint" TEXT NOT NULL,
    "analysisRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecommendationVersion_pkey" PRIMARY KEY ("id")
);

-- Version numbers are unique per engagement. This is also what makes two
-- generations racing each other fail loudly rather than both appearing to
-- succeed: the loser violates this constraint and is reported as a conflict.
CREATE UNIQUE INDEX "RecommendationVersion_engagementId_versionNumber_key"
    ON "RecommendationVersion"("engagementId", "versionNumber");

-- At most one active version per engagement, enforced by the database rather
-- than only by the transaction that supersedes-then-inserts. Prisma's schema
-- language cannot express a partial unique index, so it is stated here.
CREATE UNIQUE INDEX "RecommendationVersion_engagementId_active_key"
    ON "RecommendationVersion"("engagementId")
    WHERE "status" = 'active';

CREATE INDEX "RecommendationVersion_engagementId_status_idx"
    ON "RecommendationVersion"("engagementId", "status");
CREATE INDEX "RecommendationVersion_workspaceId_idx"
    ON "RecommendationVersion"("workspaceId");
CREATE INDEX "RecommendationVersion_sourceOpportunityVersionId_idx"
    ON "RecommendationVersion"("sourceOpportunityVersionId");
CREATE INDEX "RecommendationVersion_createdAt_idx"
    ON "RecommendationVersion"("createdAt");

ALTER TABLE "RecommendationVersion"
    ADD CONSTRAINT "RecommendationVersion_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecommendationVersion"
    ADD CONSTRAINT "RecommendationVersion_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- The Opportunity version a recommendation set was matched against. Opportunity
-- versions are never deleted on their own — they are preserved records — so this
-- cascade only ever fires with the engagement that owns both.
ALTER TABLE "RecommendationVersion"
    ADD CONSTRAINT "RecommendationVersion_sourceOpportunityVersionId_fkey"
    FOREIGN KEY ("sourceOpportunityVersionId") REFERENCES "OpportunityVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecommendationVersion"
    ADD CONSTRAINT "RecommendationVersion_analysisRunId_fkey"
    FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecommendationVersion"
    ADD CONSTRAINT "RecommendationVersion_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecommendationVersion"
    ADD CONSTRAINT "RecommendationVersion_lastModifiedByUserId_fkey"
    FOREIGN KEY ("lastModifiedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
