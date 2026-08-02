-- Phase 8 — Consultant Report & Follow-up Questions.
-- Report content is versioned and immutable once approved or published. Client
-- visibility is controlled by explicit DocumentPublication rows, so revoking a
-- publication removes visibility without deleting the publication history.

CREATE TYPE "ReportReviewState" AS ENUM ('draft', 'manager_review', 'approved');
CREATE TYPE "ReportVersionStatus" AS ENUM ('active', 'superseded');
CREATE TYPE "DocumentPublicationStatus" AS ENUM ('active', 'revoked');

CREATE TABLE "ConsultantReportVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ReportVersionStatus" NOT NULL DEFAULT 'active',
    "reviewState" "ReportReviewState" NOT NULL DEFAULT 'draft',
    "content" JSONB NOT NULL,
    "sourceDiscoveryFingerprint" TEXT NOT NULL,
    "sourceAssessmentRevision" INTEGER NOT NULL,
    "sourceAssessmentFingerprint" TEXT NOT NULL,
    "sourceOpportunityVersionId" TEXT NOT NULL,
    "sourceOpportunityVersionNumber" INTEGER NOT NULL,
    "sourceOpportunityFingerprint" TEXT NOT NULL,
    "sourceRecommendationVersionId" TEXT NOT NULL,
    "sourceRecommendationVersionNumber" INTEGER NOT NULL,
    "sourceRecommendationFingerprint" TEXT NOT NULL,
    "sourceRoadmapVersionId" TEXT NOT NULL,
    "sourceRoadmapVersionNumber" INTEGER NOT NULL,
    "sourceRoadmapFingerprint" TEXT NOT NULL,
    "analysisRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConsultantReportVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultantReportVersion_engagementId_versionNumber_key"
    ON "ConsultantReportVersion"("engagementId", "versionNumber");
CREATE UNIQUE INDEX "ConsultantReportVersion_engagementId_active_key"
    ON "ConsultantReportVersion"("engagementId")
    WHERE "status" = 'active';
CREATE INDEX "ConsultantReportVersion_engagementId_status_idx"
    ON "ConsultantReportVersion"("engagementId", "status");
CREATE INDEX "ConsultantReportVersion_workspaceId_idx"
    ON "ConsultantReportVersion"("workspaceId");
CREATE INDEX "ConsultantReportVersion_sourceOpportunityVersionId_idx"
    ON "ConsultantReportVersion"("sourceOpportunityVersionId");
CREATE INDEX "ConsultantReportVersion_sourceRecommendationVersionId_idx"
    ON "ConsultantReportVersion"("sourceRecommendationVersionId");
CREATE INDEX "ConsultantReportVersion_sourceRoadmapVersionId_idx"
    ON "ConsultantReportVersion"("sourceRoadmapVersionId");
CREATE INDEX "ConsultantReportVersion_createdAt_idx"
    ON "ConsultantReportVersion"("createdAt");

CREATE TABLE "DocumentPublication" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "reportVersionId" TEXT NOT NULL,
    "status" "DocumentPublicationStatus" NOT NULL DEFAULT 'active',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "emailNotificationAttemptedAt" TIMESTAMP(3),
    "emailNotificationDeliveredAt" TIMESTAMP(3),
    "emailNotificationFailure" TEXT,

    CONSTRAINT "DocumentPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentPublication_engagementId_active_key"
    ON "DocumentPublication"("engagementId")
    WHERE "status" = 'active';
CREATE INDEX "DocumentPublication_workspaceId_idx" ON "DocumentPublication"("workspaceId");
CREATE INDEX "DocumentPublication_engagementId_idx" ON "DocumentPublication"("engagementId");
CREATE INDEX "DocumentPublication_reportVersionId_idx" ON "DocumentPublication"("reportVersionId");
CREATE INDEX "DocumentPublication_status_idx" ON "DocumentPublication"("status");
CREATE INDEX "DocumentPublication_publishedAt_idx" ON "DocumentPublication"("publishedAt");

ALTER TABLE "ConsultantReportVersion"
    ADD CONSTRAINT "ConsultantReportVersion_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultantReportVersion"
    ADD CONSTRAINT "ConsultantReportVersion_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultantReportVersion"
    ADD CONSTRAINT "ConsultantReportVersion_analysisRunId_fkey"
    FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsultantReportVersion"
    ADD CONSTRAINT "ConsultantReportVersion_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsultantReportVersion"
    ADD CONSTRAINT "ConsultantReportVersion_lastModifiedByUserId_fkey"
    FOREIGN KEY ("lastModifiedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentPublication"
    ADD CONSTRAINT "DocumentPublication_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentPublication"
    ADD CONSTRAINT "DocumentPublication_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentPublication"
    ADD CONSTRAINT "DocumentPublication_reportVersionId_fkey"
    FOREIGN KEY ("reportVersionId") REFERENCES "ConsultantReportVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentPublication"
    ADD CONSTRAINT "DocumentPublication_publishedByUserId_fkey"
    FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentPublication"
    ADD CONSTRAINT "DocumentPublication_revokedByUserId_fkey"
    FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
