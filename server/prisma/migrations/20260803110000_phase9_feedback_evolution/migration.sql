-- Phase 9: Client Feedback is bound to the exact active publication and
-- published Consultant ReportVersion the Client saw. Original feedback content
-- and source binding are immutable; Manager lifecycle fields and re-entry
-- outcomes are updated through controlled, audited transitions only.

CREATE TYPE "ClientFeedbackStatus" AS ENUM (
  'submitted',
  'classified',
  'reentry_open',
  'resolved',
  'closed_no_action'
);

CREATE TYPE "ClientFeedbackClassification" AS ENUM (
  'new_fact',
  'fact_correction',
  'changed_condition',
  'disagreement',
  'clarification',
  'request',
  'duplicate',
  'no_engagement_change_required'
);

CREATE TYPE "FeedbackReentryStatus" AS ENUM (
  'open',
  'completed'
);

CREATE TABLE "ClientFeedback" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "engagementId" TEXT NOT NULL,
  "sourcePublicationId" TEXT NOT NULL,
  "sourceReportVersionId" TEXT NOT NULL,
  "sourceReportVersionNumber" INTEGER NOT NULL,
  "sourceReportVersionPublishedAt" TIMESTAMP(3) NOT NULL,
  "submittedByUserId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submissionKey" TEXT NOT NULL,
  "submissionContentHash" TEXT NOT NULL,
  "originalContent" TEXT NOT NULL,
  "status" "ClientFeedbackStatus" NOT NULL DEFAULT 'submitted',
  "classification" "ClientFeedbackClassification",
  "impactedStages" JSONB NOT NULL DEFAULT '[]',
  "managerSummary" TEXT,
  "managerDecision" TEXT,
  "closedNoActionReason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ClientFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackReentry" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "engagementId" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "status" "FeedbackReentryStatus" NOT NULL DEFAULT 'open',
  "impactedStages" JSONB NOT NULL,
  "plan" TEXT NOT NULL,
  "outcomes" JSONB NOT NULL DEFAULT '[]',
  "sourceDiscoveryFingerprint" TEXT NOT NULL,
  "sourceAssessmentRevision" INTEGER NOT NULL,
  "sourceAssessmentFingerprint" TEXT NOT NULL,
  "sourceOpportunityVersionId" TEXT,
  "sourceRecommendationVersionId" TEXT,
  "sourceRoadmapVersionId" TEXT,
  "sourceReportVersionId" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openedByUserId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "completedByUserId" TEXT,
  "completionNote" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "FeedbackReentry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientFeedback_workspaceId_idx" ON "ClientFeedback"("workspaceId");
CREATE INDEX "ClientFeedback_engagementId_idx" ON "ClientFeedback"("engagementId");
CREATE INDEX "ClientFeedback_sourcePublicationId_idx" ON "ClientFeedback"("sourcePublicationId");
CREATE INDEX "ClientFeedback_sourceReportVersionId_idx" ON "ClientFeedback"("sourceReportVersionId");
CREATE INDEX "ClientFeedback_submittedByUserId_idx" ON "ClientFeedback"("submittedByUserId");
CREATE INDEX "ClientFeedback_status_idx" ON "ClientFeedback"("status");
CREATE INDEX "ClientFeedback_submittedAt_idx" ON "ClientFeedback"("submittedAt");
CREATE UNIQUE INDEX "ClientFeedback_publication_submitter_key_unique"
  ON "ClientFeedback"("sourcePublicationId", "submittedByUserId", "submissionKey");

CREATE INDEX "FeedbackReentry_workspaceId_idx" ON "FeedbackReentry"("workspaceId");
CREATE INDEX "FeedbackReentry_engagementId_idx" ON "FeedbackReentry"("engagementId");
CREATE INDEX "FeedbackReentry_feedbackId_idx" ON "FeedbackReentry"("feedbackId");
CREATE INDEX "FeedbackReentry_status_idx" ON "FeedbackReentry"("status");
CREATE INDEX "FeedbackReentry_openedAt_idx" ON "FeedbackReentry"("openedAt");
CREATE INDEX "FeedbackReentry_sourceReportVersionId_idx" ON "FeedbackReentry"("sourceReportVersionId");
CREATE UNIQUE INDEX "FeedbackReentry_one_open_per_feedback"
  ON "FeedbackReentry"("feedbackId")
  WHERE "status" = 'open';

ALTER TABLE "ClientFeedback" ADD CONSTRAINT "ClientFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientFeedback" ADD CONSTRAINT "ClientFeedback_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientFeedback" ADD CONSTRAINT "ClientFeedback_sourcePublicationId_fkey" FOREIGN KEY ("sourcePublicationId") REFERENCES "DocumentPublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientFeedback" ADD CONSTRAINT "ClientFeedback_sourceReportVersionId_fkey" FOREIGN KEY ("sourceReportVersionId") REFERENCES "ConsultantReportVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientFeedback" ADD CONSTRAINT "ClientFeedback_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientFeedback" ADD CONSTRAINT "ClientFeedback_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeedbackReentry" ADD CONSTRAINT "FeedbackReentry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackReentry" ADD CONSTRAINT "FeedbackReentry_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackReentry" ADD CONSTRAINT "FeedbackReentry_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "ClientFeedback"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeedbackReentry" ADD CONSTRAINT "FeedbackReentry_sourceReportVersionId_fkey" FOREIGN KEY ("sourceReportVersionId") REFERENCES "ConsultantReportVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeedbackReentry" ADD CONSTRAINT "FeedbackReentry_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeedbackReentry" ADD CONSTRAINT "FeedbackReentry_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
