-- Phase 10: Security, Privacy & AI Compliance.
--
-- Every workspace gains an explicit Compliance Policy, every engagement gains
-- its data classification, AI consent and legal-hold state, every AI-assisted
-- Analysis Run gains its compliance metadata, and stored report PDFs gain the
-- fields that record how their bytes are encrypted at rest.
--
-- The migration is additive and back-fills so the application is fully working
-- at its completion: existing workspaces receive a policy row, and existing
-- engagements and report versions take the defaults rather than being left
-- unclassified. Analysis Runs recorded before this phase are deliberately left
-- with NULL compliance metadata — no compliance decision stood behind them, and
-- a back-filled value would be an invented one.

CREATE TYPE "DataClassification" AS ENUM (
  'public',
  'internal',
  'confidential',
  'personal_data',
  'strictly_confidential',
  'ai_restricted'
);

CREATE TYPE "AiConsent" AS ENUM (
  'allowed',
  'restricted',
  'prohibited'
);

CREATE TYPE "AnonymizationStatus" AS ENUM (
  'not_required',
  'applied',
  'failed'
);

CREATE TYPE "HumanReviewStatus" AS ENUM (
  'not_required',
  'pending',
  'reviewed'
);

-- The unified Compliance Policy: one row per workspace.
CREATE TABLE "WorkspaceCompliancePolicy" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "defaultDataClassification" "DataClassification" NOT NULL DEFAULT 'confidential',
  "clientDataExportPermitted" BOOLEAN NOT NULL DEFAULT true,
  "documentDownloadLinkTtlMinutes" INTEGER NOT NULL DEFAULT 15,
  "encryptDocumentsAtRest" BOOLEAN NOT NULL DEFAULT true,
  "requireEncryptedTransport" BOOLEAN NOT NULL DEFAULT true,
  "aiProcessingPermitted" BOOLEAN NOT NULL DEFAULT true,
  "approvedAiProviders" JSONB NOT NULL,
  "approvedAiModels" JSONB NOT NULL,
  "confidentialAiProcessingPermitted" BOOLEAN NOT NULL DEFAULT true,
  "anonymizePersonalDataBeforeAi" BOOLEAN NOT NULL DEFAULT true,
  "humanApprovalRequiredForAiOutput" BOOLEAN NOT NULL DEFAULT true,
  "engagementRetentionDays" INTEGER,
  "documentRetentionDays" INTEGER,
  "auditRetentionDays" INTEGER,
  "aiArtifactRetentionDays" INTEGER,
  "personalIdentifierRules" JSONB NOT NULL,
  "regulatoryFrameworks" JSONB NOT NULL,
  "configuredAt" TIMESTAMP(3),
  "configuredByUserId" TEXT,
  CONSTRAINT "WorkspaceCompliancePolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceCompliancePolicy_workspaceId_key"
  ON "WorkspaceCompliancePolicy"("workspaceId");
CREATE INDEX "WorkspaceCompliancePolicy_workspaceId_idx"
  ON "WorkspaceCompliancePolicy"("workspaceId");
CREATE INDEX "WorkspaceCompliancePolicy_configuredByUserId_idx"
  ON "WorkspaceCompliancePolicy"("configuredByUserId");

ALTER TABLE "WorkspaceCompliancePolicy"
  ADD CONSTRAINT "WorkspaceCompliancePolicy_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceCompliancePolicy"
  ADD CONSTRAINT "WorkspaceCompliancePolicy_configuredByUserId_fkey"
  FOREIGN KEY ("configuredByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Engagement compliance state.
ALTER TABLE "Engagement"
  ADD COLUMN "dataClassification" "DataClassification" NOT NULL DEFAULT 'confidential',
  ADD COLUMN "aiConsent" "AiConsent" NOT NULL DEFAULT 'allowed',
  ADD COLUMN "aiConsentNotes" TEXT,
  ADD COLUMN "aiConsentUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "aiConsentUpdatedByUserId" TEXT,
  ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legalHoldReason" TEXT,
  ADD COLUMN "legalHoldUpdatedAt" TIMESTAMP(3);

CREATE INDEX "Engagement_dataClassification_idx" ON "Engagement"("dataClassification");
CREATE INDEX "Engagement_aiConsent_idx" ON "Engagement"("aiConsent");
CREATE INDEX "Engagement_legalHold_idx" ON "Engagement"("legalHold");

ALTER TABLE "Engagement"
  ADD CONSTRAINT "Engagement_aiConsentUpdatedByUserId_fkey"
  FOREIGN KEY ("aiConsentUpdatedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Compliance metadata on every AI-assisted Analysis Run.
ALTER TABLE "AnalysisRun"
  ADD COLUMN "purpose" TEXT,
  ADD COLUMN "inputClassification" "DataClassification",
  ADD COLUMN "outputClassification" "DataClassification",
  ADD COLUMN "anonymizationStatus" "AnonymizationStatus",
  ADD COLUMN "anonymizationRedactionCount" INTEGER,
  ADD COLUMN "humanReviewStatus" "HumanReviewStatus",
  ADD COLUMN "humanReviewedAt" TIMESTAMP(3);

CREATE INDEX "AnalysisRun_anonymizationStatus_idx" ON "AnalysisRun"("anonymizationStatus");
CREATE INDEX "AnalysisRun_humanReviewStatus_idx" ON "AnalysisRun"("humanReviewStatus");

-- Document classification and encryption at rest.
ALTER TABLE "ConsultantReportVersion"
  ADD COLUMN "dataClassification" "DataClassification" NOT NULL DEFAULT 'confidential';

ALTER TABLE "ReportPdfArtifact"
  ADD COLUMN "encryptionAlgorithm" TEXT,
  ADD COLUMN "encryptionKeyId" TEXT;

-- Back-fill: every existing workspace gets an explicit policy, so that "every
-- engagement operates under an explicit Workspace Compliance Policy" holds for
-- the work that already exists and not only for workspaces created from here on.
--
-- `configuredAt` stays NULL: these are the values the workspace starts under,
-- and recording them as an administrator's deliberate configuration would be
-- untrue. The approved provider and model lists start empty; the application
-- seeds them from the deployment's configured LLM on first read, which is the
-- only place that knows what the deployment actually uses.
INSERT INTO "WorkspaceCompliancePolicy" (
  "id",
  "createdAt",
  "updatedAt",
  "workspaceId",
  "approvedAiProviders",
  "approvedAiModels",
  "personalIdentifierRules",
  "regulatoryFrameworks"
)
SELECT
  'wcp_' || "w"."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  "w"."id",
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[{"code":"GDPR","enabled":true},{"code":"EU_AI_ACT","enabled":true}]'::jsonb
FROM "Workspace" AS "w"
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkspaceCompliancePolicy" AS "p" WHERE "p"."workspaceId" = "w"."id"
);
