-- Phase 4, revised: prioritized Opportunities become immutable, versioned
-- snapshots, and Assessment findings gain a stable identity for them to cite
-- (roadmap Phase 4; architecture.md §4.3 on append-only versions).
--
-- Four things happen here, in order:
--   1. Assessment findings are given identities, backfilled for stored ones.
--   2. The Engagement gains an Assessment revision counter.
--   3. The OpportunityVersion table is created.
--   4. The single-payload Opportunity columns are dropped.

-- 1. Stable finding identity ------------------------------------------------
--
-- A finding's identity must not depend on its title, because a title is
-- editable text and everything downstream cites the finding. Stored
-- assessments predate the identifier, so every finding that lacks one is given
-- one here — once, in place — rather than at read time, which would mint a
-- different identity on every read and defeat the point.
UPDATE "Engagement" AS e
SET "assessment" = jsonb_set(
      e."assessment",
      '{dimensions}',
      (
        SELECT jsonb_object_agg(
                 dimension.key,
                 dimension.value || jsonb_build_object(
                   'findings',
                   COALESCE(
                     (
                       SELECT jsonb_agg(
                                CASE
                                  WHEN finding.value ? 'id' THEN finding.value
                                  ELSE finding.value
                                       || jsonb_build_object('id', gen_random_uuid()::text)
                                END
                                ORDER BY finding.ordinality
                              )
                         FROM jsonb_array_elements(dimension.value -> 'findings')
                              WITH ORDINALITY AS finding(value, ordinality)
                     ),
                     '[]'::jsonb
                   )
                 )
               )
          FROM jsonb_each(e."assessment" -> 'dimensions') AS dimension(key, value)
      )
    )
WHERE e."assessment" IS NOT NULL
  AND e."assessment" -> 'dimensions' IS NOT NULL;

-- 2. Assessment revision counter --------------------------------------------
--
-- A plain number a reader can refer to. Whether a derived stage has gone stale
-- is decided by the fingerprint that stage recorded, not by this counter.
ALTER TABLE "Engagement" ADD COLUMN "assessmentRevision" INTEGER NOT NULL DEFAULT 0;
UPDATE "Engagement" SET "assessmentRevision" = 1 WHERE "assessment" IS NOT NULL;

-- 3. Versioned Opportunity snapshots ----------------------------------------
CREATE TYPE "OpportunityVersionStatus" AS ENUM ('active', 'superseded');

CREATE TABLE "OpportunityVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "OpportunityVersionStatus" NOT NULL DEFAULT 'active',
    "content" JSONB NOT NULL,
    "reviewState" "OpportunityReviewState" NOT NULL DEFAULT 'ai_draft',
    "sourceAssessmentRevision" INTEGER NOT NULL,
    "sourceAssessmentFingerprint" TEXT NOT NULL,
    "analysisRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OpportunityVersion_pkey" PRIMARY KEY ("id")
);

-- Version numbers are unique per engagement. This is also what makes two
-- regenerations racing each other fail loudly rather than both appearing to
-- succeed: the loser violates this constraint and is reported as a conflict.
CREATE UNIQUE INDEX "OpportunityVersion_engagementId_versionNumber_key"
    ON "OpportunityVersion"("engagementId", "versionNumber");

-- At most one active version per engagement, enforced by the database rather
-- than only by the transaction that supersedes-then-inserts. Prisma's schema
-- language cannot express a partial unique index, so it is stated here.
CREATE UNIQUE INDEX "OpportunityVersion_engagementId_active_key"
    ON "OpportunityVersion"("engagementId")
    WHERE "status" = 'active';

CREATE INDEX "OpportunityVersion_engagementId_status_idx"
    ON "OpportunityVersion"("engagementId", "status");
CREATE INDEX "OpportunityVersion_workspaceId_idx"
    ON "OpportunityVersion"("workspaceId");
CREATE INDEX "OpportunityVersion_createdAt_idx"
    ON "OpportunityVersion"("createdAt");

ALTER TABLE "OpportunityVersion"
    ADD CONSTRAINT "OpportunityVersion_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpportunityVersion"
    ADD CONSTRAINT "OpportunityVersion_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpportunityVersion"
    ADD CONSTRAINT "OpportunityVersion_analysisRunId_fkey"
    FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OpportunityVersion"
    ADD CONSTRAINT "OpportunityVersion_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OpportunityVersion"
    ADD CONSTRAINT "OpportunityVersion_lastModifiedByUserId_fkey"
    FOREIGN KEY ("lastModifiedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. The single-payload columns go ------------------------------------------
--
-- They held the in-flight, unreleased shape of this same stage. That shape
-- cited findings by title and carried no success criteria, so there is nothing
-- in it that could be lifted into a valid version: a citation by title has no
-- stable finding id to become. The columns are dropped rather than migrated,
-- and no engagement loses anything it had before Phase 4 began.
ALTER TABLE "Engagement" DROP COLUMN "opportunities";
ALTER TABLE "Engagement" DROP COLUMN "opportunitiesReviewState";
