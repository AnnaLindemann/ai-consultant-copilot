-- Phase 10 corrections: privacy processing, real consent, governed provider
-- approvals, DPIA, and honest PII terminology.
--
-- This migration follows `20260804090000_phase10_security_privacy_ai_compliance`
-- and does not rewrite it. It corrects the concepts that phase introduced:
--
--  1. "AI Consent" was never consent in the GDPR sense. It is renamed to an
--     Engagement **AI processing permission**, keeping its values, its
--     attribution and its Audit Trail history intact.
--  2. What makes the processing lawful is recorded explicitly and per
--     engagement: a processing purpose and an Article 6 legal basis. Nothing is
--     back-filled — existing engagements become `not_assessed`, because an
--     invented legal basis is worse than none.
--  3. Where the basis genuinely is consent, a real consent record can be taken
--     and withdrawn.
--  4. "Anonymization" was deterministic placeholder replacement, which is
--     pseudonymization at best. It is renamed to **PII redaction** throughout.
--  5. The free-text approved-provider and approved-model lists become governed,
--     workspace-scoped approvals with a contract status, a region, retention
--     and training decisions and an approving human. Existing list entries are
--     **preserved** as `needs_review` approvals — none is discarded, and none is
--     silently promoted to an approval nobody made.
--  6. A minimal, human-controlled DPIA/DSFA is recorded at workspace level and
--     screened per engagement.

-- --------------------------------------------------------------------------
-- 1. Terminology: the engagement's AI processing permission.
-- --------------------------------------------------------------------------

ALTER TYPE "AiConsent" RENAME TO "AiProcessingPermission";

ALTER TABLE "Engagement" RENAME COLUMN "aiConsent" TO "aiProcessingPermission";
ALTER TABLE "Engagement" RENAME COLUMN "aiConsentNotes" TO "aiProcessingPermissionNotes";
ALTER TABLE "Engagement" RENAME COLUMN "aiConsentUpdatedAt" TO "aiProcessingPermissionUpdatedAt";
ALTER TABLE "Engagement" RENAME COLUMN "aiConsentUpdatedByUserId" TO "aiProcessingPermissionUpdatedByUserId";

ALTER INDEX "Engagement_aiConsent_idx" RENAME TO "Engagement_aiProcessingPermission_idx";
ALTER TABLE "Engagement"
  RENAME CONSTRAINT "Engagement_aiConsentUpdatedByUserId_fkey"
  TO "Engagement_aiProcessingPermissionUpdatedByUserId_fkey";

-- --------------------------------------------------------------------------
-- 2. Terminology: PII redaction rather than anonymization.
-- --------------------------------------------------------------------------

ALTER TYPE "AnonymizationStatus" RENAME TO "PiiRedactionStatus";

ALTER TABLE "AnalysisRun" RENAME COLUMN "anonymizationStatus" TO "piiRedactionStatus";
ALTER TABLE "AnalysisRun" RENAME COLUMN "anonymizationRedactionCount" TO "piiRedactionCount";
ALTER INDEX "AnalysisRun_anonymizationStatus_idx" RENAME TO "AnalysisRun_piiRedactionStatus_idx";

ALTER TABLE "WorkspaceCompliancePolicy"
  RENAME COLUMN "anonymizePersonalDataBeforeAi" TO "redactPersonalDataBeforeAi";

-- --------------------------------------------------------------------------
-- 3. New enumerations.
-- --------------------------------------------------------------------------

CREATE TYPE "LegalBasis" AS ENUM (
  'contract',
  'legitimate_interest',
  'legal_obligation',
  'consent',
  'not_assessed'
);

CREATE TYPE "AiOutputScanOutcome" AS ENUM (
  'not_scanned',
  'clean',
  'personal_data_detected'
);

CREATE TYPE "EngagementDpiaScreening" AS ENUM (
  'not_assessed',
  'within_standard_dpia',
  'additional_not_required',
  'additional_required',
  'additional_completed'
);

CREATE TYPE "WorkspaceDpiaStatus" AS ENUM (
  'not_started',
  'in_progress',
  'approved',
  'not_required'
);

CREATE TYPE "AiModelApprovalStatus" AS ENUM (
  'approved',
  'needs_review',
  'revoked'
);

CREATE TYPE "DpaStatus" AS ENUM (
  'in_place',
  'not_required',
  'pending',
  'not_assessed'
);

CREATE TYPE "PromptRetentionDecision" AS ENUM (
  'not_retained',
  'retained_limited',
  'retained_unknown'
);

CREATE TYPE "TrainingUseDecision" AS ENUM (
  'excluded',
  'permitted',
  'unknown'
);

-- --------------------------------------------------------------------------
-- 4. The engagement's privacy-processing record and DPIA screening.
--
-- Every existing engagement lands on `not_assessed` with a NULL purpose. That
-- is deliberate and is the whole point: the application refuses AI processing
-- of personal data until a human states the purpose and determines the basis.
-- Choosing any other default would have invented a legal basis for work that
-- already exists.
-- --------------------------------------------------------------------------

ALTER TABLE "Engagement"
  ADD COLUMN "processingPurpose" TEXT,
  ADD COLUMN "legalBasis" "LegalBasis" NOT NULL DEFAULT 'not_assessed',
  ADD COLUMN "legalBasisNote" TEXT,
  ADD COLUMN "privacyProcessingConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "privacyProcessingConfirmedByUserId" TEXT,
  ADD COLUMN "dpiaScreening" "EngagementDpiaScreening" NOT NULL DEFAULT 'not_assessed',
  ADD COLUMN "dpiaScreeningNote" TEXT,
  ADD COLUMN "dpiaScreeningUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "dpiaScreeningUpdatedByUserId" TEXT;

CREATE INDEX "Engagement_legalBasis_idx" ON "Engagement"("legalBasis");
CREATE INDEX "Engagement_dpiaScreening_idx" ON "Engagement"("dpiaScreening");

ALTER TABLE "Engagement"
  ADD CONSTRAINT "Engagement_privacyProcessingConfirmedByUserId_fkey"
  FOREIGN KEY ("privacyProcessingConfirmedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Engagement"
  ADD CONSTRAINT "Engagement_dpiaScreeningUpdatedByUserId_fkey"
  FOREIGN KEY ("dpiaScreeningUpdatedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- 5. Real GDPR consent.
--
-- No row is created here. A consent record can only come from a subject who
-- actually consented; manufacturing one during a migration would be the
-- falsification this table exists to make impossible.
-- --------------------------------------------------------------------------

CREATE TABLE "EngagementConsentRecord" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "engagementId" TEXT NOT NULL,
  "consentText" TEXT NOT NULL,
  "consentTextVersion" TEXT NOT NULL,
  "processingPurpose" TEXT NOT NULL,
  "subjectName" TEXT NOT NULL,
  "subjectRole" TEXT,
  "subjectOrganization" TEXT,
  "privacyNoticeVersion" TEXT,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedByUserId" TEXT,
  "withdrawnAt" TIMESTAMP(3),
  "withdrawnByUserId" TEXT,
  "withdrawalNote" TEXT,
  CONSTRAINT "EngagementConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EngagementConsentRecord_workspaceId_idx" ON "EngagementConsentRecord"("workspaceId");
CREATE INDEX "EngagementConsentRecord_engagementId_idx" ON "EngagementConsentRecord"("engagementId");
CREATE INDEX "EngagementConsentRecord_withdrawnAt_idx" ON "EngagementConsentRecord"("withdrawnAt");

ALTER TABLE "EngagementConsentRecord"
  ADD CONSTRAINT "EngagementConsentRecord_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngagementConsentRecord"
  ADD CONSTRAINT "EngagementConsentRecord_engagementId_fkey"
  FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngagementConsentRecord"
  ADD CONSTRAINT "EngagementConsentRecord_recordedByUserId_fkey"
  FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EngagementConsentRecord"
  ADD CONSTRAINT "EngagementConsentRecord_withdrawnByUserId_fkey"
  FOREIGN KEY ("withdrawnByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- 6. Governed, workspace-scoped provider/model approvals.
-- --------------------------------------------------------------------------

CREATE TABLE "WorkspaceAiModelApproval" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "technologyProfileCode" TEXT,
  "reviewedProfileRevision" INTEGER,
  "status" "AiModelApprovalStatus" NOT NULL DEFAULT 'needs_review',
  "statusReason" TEXT,
  "dpaStatus" "DpaStatus" NOT NULL DEFAULT 'not_assessed',
  "dpaReference" TEXT,
  "processingRegion" TEXT,
  "promptRetention" "PromptRetentionDecision" NOT NULL DEFAULT 'retained_unknown',
  "trainingUse" "TrainingUseDecision" NOT NULL DEFAULT 'unknown',
  "thirdCountryTransferMechanism" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  "lastReviewedAt" TIMESTAMP(3),
  CONSTRAINT "WorkspaceAiModelApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceAiModelApproval_workspaceId_provider_model_key"
  ON "WorkspaceAiModelApproval"("workspaceId", "provider", "model");
CREATE INDEX "WorkspaceAiModelApproval_workspaceId_idx"
  ON "WorkspaceAiModelApproval"("workspaceId");
CREATE INDEX "WorkspaceAiModelApproval_workspaceId_status_idx"
  ON "WorkspaceAiModelApproval"("workspaceId", "status");
CREATE INDEX "WorkspaceAiModelApproval_technologyProfileCode_idx"
  ON "WorkspaceAiModelApproval"("technologyProfileCode");

ALTER TABLE "WorkspaceAiModelApproval"
  ADD CONSTRAINT "WorkspaceAiModelApproval_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceAiModelApproval"
  ADD CONSTRAINT "WorkspaceAiModelApproval_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Transition the free-text lists.
--
-- A workspace that had approved provider P and model M had, in effect, approved
-- the pair. Every such pair is preserved as an explicit row — but as
-- `needs_review`, never as `approved`: nobody recorded a contract status, a
-- processing region, a retention decision or a training decision for it, and no
-- human approved it under the governed model. An Administrator reviews it once
-- and it works again. Nothing is discarded, and nothing is invented.
INSERT INTO "WorkspaceAiModelApproval" (
  "id",
  "createdAt",
  "updatedAt",
  "workspaceId",
  "provider",
  "model",
  "status",
  "statusReason"
)
SELECT
  'wama_' || "p"."workspaceId" || '_' || md5("provider"."value" || ':' || "model"."value"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  "p"."workspaceId",
  "provider"."value",
  "model"."value",
  'needs_review'::"AiModelApprovalStatus",
  'migrated_from_free_text_policy_lists'
FROM "WorkspaceCompliancePolicy" AS "p"
CROSS JOIN LATERAL jsonb_array_elements_text("p"."approvedAiProviders") AS "provider"("value")
CROSS JOIN LATERAL jsonb_array_elements_text("p"."approvedAiModels") AS "model"("value")
WHERE jsonb_typeof("p"."approvedAiProviders") = 'array'
  AND jsonb_typeof("p"."approvedAiModels") = 'array'
  AND length(trim("provider"."value")) > 0
  AND length(trim("model"."value")) > 0
ON CONFLICT ("workspaceId", "provider", "model") DO NOTHING;

-- The lists are gone once their contents are preserved above. Leaving them
-- would leave two answers to "which model may this workspace use?".
ALTER TABLE "WorkspaceCompliancePolicy"
  DROP COLUMN "approvedAiProviders",
  DROP COLUMN "approvedAiModels";

-- --------------------------------------------------------------------------
-- 7. Workspace DPIA/DSFA.
--
-- Every workspace gets a row at `not_started`. That is a statement of fact —
-- nobody has assessed anything — and it is what makes the assessment visible
-- rather than absent.
-- --------------------------------------------------------------------------

CREATE TABLE "WorkspaceDpiaAssessment" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "status" "WorkspaceDpiaStatus" NOT NULL DEFAULT 'not_started',
  "scope" TEXT,
  "rationale" TEXT,
  "documentReference" TEXT,
  "assessedByUserId" TEXT,
  "approvedByUserId" TEXT,
  "assessedAt" TIMESTAMP(3),
  "reviewDueAt" TIMESTAMP(3),
  CONSTRAINT "WorkspaceDpiaAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceDpiaAssessment_workspaceId_key"
  ON "WorkspaceDpiaAssessment"("workspaceId");
CREATE INDEX "WorkspaceDpiaAssessment_workspaceId_idx"
  ON "WorkspaceDpiaAssessment"("workspaceId");
CREATE INDEX "WorkspaceDpiaAssessment_status_idx"
  ON "WorkspaceDpiaAssessment"("status");

ALTER TABLE "WorkspaceDpiaAssessment"
  ADD CONSTRAINT "WorkspaceDpiaAssessment_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceDpiaAssessment"
  ADD CONSTRAINT "WorkspaceDpiaAssessment_assessedByUserId_fkey"
  FOREIGN KEY ("assessedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkspaceDpiaAssessment"
  ADD CONSTRAINT "WorkspaceDpiaAssessment_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "WorkspaceDpiaAssessment" ("id", "createdAt", "updatedAt", "workspaceId")
SELECT 'wdpia_' || "w"."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, "w"."id"
FROM "Workspace" AS "w"
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkspaceDpiaAssessment" AS "d" WHERE "d"."workspaceId" = "w"."id"
);

-- --------------------------------------------------------------------------
-- 8. Policy: which legal bases the workspace supports, and its default.
--
-- All five are supported and the default is `not_assessed`, so an existing
-- workspace neither loses an option nor gains a determination it never made.
-- --------------------------------------------------------------------------

ALTER TABLE "WorkspaceCompliancePolicy"
  ADD COLUMN "supportedLegalBases" JSONB NOT NULL
    DEFAULT '["contract","legitimate_interest","legal_obligation","consent","not_assessed"]'::jsonb,
  ADD COLUMN "defaultLegalBasis" "LegalBasis" NOT NULL DEFAULT 'not_assessed';

-- Prisma models the column without a database-level default: the application
-- always writes the list explicitly. The default above existed only to fill the
-- existing rows.
ALTER TABLE "WorkspaceCompliancePolicy" ALTER COLUMN "supportedLegalBases" DROP DEFAULT;

-- --------------------------------------------------------------------------
-- 9. Analysis Run: the output scan and the approval the run was permitted under.
--
-- Both are NULL on runs recorded before this migration: no scan was performed
-- and no governed approval was resolved, and saying otherwise would be a claim
-- nobody made.
-- --------------------------------------------------------------------------

ALTER TABLE "AnalysisRun"
  ADD COLUMN "outputScanOutcome" "AiOutputScanOutcome",
  ADD COLUMN "aiModelApprovalId" TEXT;

CREATE INDEX "AnalysisRun_outputScanOutcome_idx" ON "AnalysisRun"("outputScanOutcome");
CREATE INDEX "AnalysisRun_aiModelApprovalId_idx" ON "AnalysisRun"("aiModelApprovalId");

ALTER TABLE "AnalysisRun"
  ADD CONSTRAINT "AnalysisRun_aiModelApprovalId_fkey"
  FOREIGN KEY ("aiModelApprovalId") REFERENCES "WorkspaceAiModelApproval"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
