-- Phase 8 architectural corrections: exact source snapshots, immutable PDF
-- artifacts, durable publication recipients, and append-only notification
-- attempts. All additions are nullable or new tables so existing Phase 7/early
-- Phase 8 rows can be backfilled safely by application reads where needed.

ALTER TYPE "DocumentPublicationStatus" ADD VALUE IF NOT EXISTS 'superseded';

CREATE TYPE "DocumentNotificationOutcome" AS ENUM ('sent', 'failed');

ALTER TABLE "ConsultantReportVersion"
    ADD COLUMN "sourceSnapshot" JSONB;

UPDATE "ConsultantReportVersion"
SET "sourceSnapshot" = jsonb_build_object(
    'fingerprint', md5(concat_ws(
        ':',
        "sourceDiscoveryFingerprint",
        "sourceAssessmentRevision"::text,
        "sourceAssessmentFingerprint",
        "sourceOpportunityVersionId",
        "sourceOpportunityVersionNumber"::text,
        "sourceOpportunityFingerprint",
        "sourceRecommendationVersionId",
        "sourceRecommendationVersionNumber"::text,
        "sourceRecommendationFingerprint",
        "sourceRoadmapVersionId",
        "sourceRoadmapVersionNumber"::text,
        "sourceRoadmapFingerprint"
    )),
    'discoveryFingerprint', "sourceDiscoveryFingerprint",
    'assessmentRevision', "sourceAssessmentRevision",
    'assessmentFingerprint', "sourceAssessmentFingerprint",
    'opportunityVersionId', "sourceOpportunityVersionId",
    'opportunityVersionNumber', "sourceOpportunityVersionNumber",
    'opportunityFingerprint', "sourceOpportunityFingerprint",
    'opportunityVersions', jsonb_build_array(jsonb_build_object(
        'id', "sourceOpportunityVersionId",
        'versionNumber', "sourceOpportunityVersionNumber",
        'fingerprint', "sourceOpportunityFingerprint"
    )),
    'recommendationVersionId', "sourceRecommendationVersionId",
    'recommendationVersionNumber', "sourceRecommendationVersionNumber",
    'recommendationFingerprint', "sourceRecommendationFingerprint",
    'recommendationVersions', jsonb_build_array(jsonb_build_object(
        'id', "sourceRecommendationVersionId",
        'versionNumber', "sourceRecommendationVersionNumber",
        'fingerprint', "sourceRecommendationFingerprint"
    )),
    'recommendationDispositions', jsonb_build_array(),
    'roadmapVersionId', "sourceRoadmapVersionId",
    'roadmapVersionNumber', "sourceRoadmapVersionNumber",
    'roadmapFingerprint', "sourceRoadmapFingerprint",
    'gaps', jsonb_build_array(),
    'followUpTemplates', jsonb_build_array()
)
WHERE "sourceSnapshot" IS NULL;

ALTER TABLE "ConsultantReportVersion"
    ALTER COLUMN "sourceSnapshot" SET NOT NULL;

CREATE TABLE "ReportPdfArtifact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "reportVersionId" TEXT NOT NULL,
    "rendererVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "pdfHash" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "ReportPdfArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportPdfArtifact_reportVersionId_rendererVersion_key"
    ON "ReportPdfArtifact"("reportVersionId", "rendererVersion");
CREATE INDEX "ReportPdfArtifact_workspaceId_idx" ON "ReportPdfArtifact"("workspaceId");
CREATE INDEX "ReportPdfArtifact_engagementId_idx" ON "ReportPdfArtifact"("engagementId");
CREATE INDEX "ReportPdfArtifact_reportVersionId_idx" ON "ReportPdfArtifact"("reportVersionId");
CREATE INDEX "ReportPdfArtifact_pdfHash_idx" ON "ReportPdfArtifact"("pdfHash");
CREATE INDEX "ReportPdfArtifact_createdAt_idx" ON "ReportPdfArtifact"("createdAt");

ALTER TABLE "ReportPdfArtifact"
    ADD CONSTRAINT "ReportPdfArtifact_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportPdfArtifact"
    ADD CONSTRAINT "ReportPdfArtifact_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportPdfArtifact"
    ADD CONSTRAINT "ReportPdfArtifact_reportVersionId_fkey"
    FOREIGN KEY ("reportVersionId") REFERENCES "ConsultantReportVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentPublication"
    ADD COLUMN "pdfArtifactId" TEXT,
    ADD COLUMN "clientUserId" TEXT,
    ADD COLUMN "title" TEXT,
    ADD COLUMN "managerMessage" TEXT;

CREATE INDEX "DocumentPublication_pdfArtifactId_idx" ON "DocumentPublication"("pdfArtifactId");
CREATE INDEX "DocumentPublication_clientUserId_idx" ON "DocumentPublication"("clientUserId");

ALTER TABLE "DocumentPublication"
    ADD CONSTRAINT "DocumentPublication_pdfArtifactId_fkey"
    FOREIGN KEY ("pdfArtifactId") REFERENCES "ReportPdfArtifact"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentPublication"
    ADD CONSTRAINT "DocumentPublication_clientUserId_fkey"
    FOREIGN KEY ("clientUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DocumentNotificationAttempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "outcome" "DocumentNotificationOutcome" NOT NULL,
    "errorCategory" TEXT,
    "providerMessageId" TEXT,

    CONSTRAINT "DocumentNotificationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentNotificationAttempt_publicationId_requestKey_key"
    ON "DocumentNotificationAttempt"("publicationId", "requestKey");
CREATE INDEX "DocumentNotificationAttempt_workspaceId_idx"
    ON "DocumentNotificationAttempt"("workspaceId");
CREATE INDEX "DocumentNotificationAttempt_engagementId_idx"
    ON "DocumentNotificationAttempt"("engagementId");
CREATE INDEX "DocumentNotificationAttempt_publicationId_idx"
    ON "DocumentNotificationAttempt"("publicationId");
CREATE INDEX "DocumentNotificationAttempt_outcome_idx"
    ON "DocumentNotificationAttempt"("outcome");
CREATE INDEX "DocumentNotificationAttempt_createdAt_idx"
    ON "DocumentNotificationAttempt"("createdAt");

ALTER TABLE "DocumentNotificationAttempt"
    ADD CONSTRAINT "DocumentNotificationAttempt_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentNotificationAttempt"
    ADD CONSTRAINT "DocumentNotificationAttempt_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentNotificationAttempt"
    ADD CONSTRAINT "DocumentNotificationAttempt_publicationId_fkey"
    FOREIGN KEY ("publicationId") REFERENCES "DocumentPublication"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
