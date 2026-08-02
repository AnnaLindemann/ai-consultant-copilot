-- Phase 7 — Implementation Roadmap.
--
-- The roadmap follows the same lifecycle as Opportunities and Recommendations:
-- generation creates a new active version, previous versions are superseded but
-- remain readable, and consultant edits are guarded by a revision token.

CREATE TYPE "RoadmapReviewState" AS ENUM ('ai_draft', 'consultant_edited', 'accepted');
CREATE TYPE "RoadmapVersionStatus" AS ENUM ('active', 'superseded');

CREATE TABLE "ImplementationRoadmapVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "RoadmapVersionStatus" NOT NULL DEFAULT 'active',
    "content" JSONB NOT NULL,
    "reviewState" "RoadmapReviewState" NOT NULL DEFAULT 'ai_draft',
    "sourceRecommendationVersionId" TEXT NOT NULL,
    "sourceRecommendationVersionNumber" INTEGER NOT NULL,
    "sourceRecommendationFingerprint" TEXT NOT NULL,
    "analysisRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ImplementationRoadmapVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImplementationRoadmapVersion_engagementId_versionNumber_key"
    ON "ImplementationRoadmapVersion"("engagementId", "versionNumber");

CREATE UNIQUE INDEX "ImplementationRoadmapVersion_engagementId_active_key"
    ON "ImplementationRoadmapVersion"("engagementId")
    WHERE "status" = 'active';

CREATE INDEX "ImplementationRoadmapVersion_engagementId_status_idx"
    ON "ImplementationRoadmapVersion"("engagementId", "status");
CREATE INDEX "ImplementationRoadmapVersion_workspaceId_idx"
    ON "ImplementationRoadmapVersion"("workspaceId");
CREATE INDEX "ImplementationRoadmapVersion_sourceRecommendationVersionId_idx"
    ON "ImplementationRoadmapVersion"("sourceRecommendationVersionId");
CREATE INDEX "ImplementationRoadmapVersion_createdAt_idx"
    ON "ImplementationRoadmapVersion"("createdAt");

ALTER TABLE "ImplementationRoadmapVersion"
    ADD CONSTRAINT "ImplementationRoadmapVersion_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImplementationRoadmapVersion"
    ADD CONSTRAINT "ImplementationRoadmapVersion_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImplementationRoadmapVersion"
    ADD CONSTRAINT "ImplementationRoadmapVersion_sourceRecommendationVersionId_fkey"
    FOREIGN KEY ("sourceRecommendationVersionId") REFERENCES "RecommendationVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImplementationRoadmapVersion"
    ADD CONSTRAINT "ImplementationRoadmapVersion_analysisRunId_fkey"
    FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImplementationRoadmapVersion"
    ADD CONSTRAINT "ImplementationRoadmapVersion_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImplementationRoadmapVersion"
    ADD CONSTRAINT "ImplementationRoadmapVersion_lastModifiedByUserId_fkey"
    FOREIGN KEY ("lastModifiedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
