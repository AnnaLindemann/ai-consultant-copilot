-- Phase 5: curated Consulting Knowledge Base.
--
-- The knowledge base is a separate, engagement-independent table group. It
-- carries no workspace column: both knowledge bases are product-level assets
-- shared across workspaces, deliberately outside the Phase 3A isolation
-- boundary (architecture.md §9; domain-model.md §3A.1). Engagement rows never
-- gain a foreign key into it — an engagement references an entry by its stable
-- `code`.
--
-- Every statement is additive. Nothing existing is dropped, renamed, or
-- rewritten, so the migration is safe against a database that already holds
-- workspaces, engagements, and analysis runs.

CREATE TYPE "ConsultingKnowledgeKind" AS ENUM (
  'business_domain',
  'business_process',
  'business_problem',
  'customer_operations_taxonomy',
  'discovery_question',
  'assessment_framework',
  'ai_readiness_criterion',
  'ai_use_case',
  'solution_pattern',
  'implementation_pattern',
  'roi_model',
  'risk_model',
  'best_practice',
  'follow_up_template'
);

CREATE TABLE "ConsultingKnowledgeEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "ConsultingKnowledgeKind" NOT NULL,
    "domainCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "matchTerms" JSONB NOT NULL,
    "stageScopes" JSONB NOT NULL,
    "taxonomyCodes" JSONB NOT NULL,
    "processCodes" JSONB NOT NULL,
    "problemCodes" JSONB NOT NULL,
    "useCaseCodes" JSONB NOT NULL,
    "relatedCodes" JSONB NOT NULL,
    "details" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedByUserId" TEXT,

    CONSTRAINT "ConsultingKnowledgeEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultingKnowledgeEntry_code_key" ON "ConsultingKnowledgeEntry"("code");
CREATE INDEX "ConsultingKnowledgeEntry_kind_idx" ON "ConsultingKnowledgeEntry"("kind");
CREATE INDEX "ConsultingKnowledgeEntry_domainCode_idx" ON "ConsultingKnowledgeEntry"("domainCode");
CREATE INDEX "ConsultingKnowledgeEntry_active_idx" ON "ConsultingKnowledgeEntry"("active");

-- The shape every retrieval narrows by first: one domain's active entries of a
-- required kind.
CREATE INDEX "ConsultingKnowledgeEntry_domainCode_kind_active_idx"
  ON "ConsultingKnowledgeEntry"("domainCode", "kind", "active");

-- Who last curated an entry. `SET NULL` so removing a user never removes the
-- curated knowledge they touched.
ALTER TABLE "ConsultingKnowledgeEntry"
  ADD CONSTRAINT "ConsultingKnowledgeEntry_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Which curated entries grounded an AI-assisted run, by their stable codes, in
-- the order the retrieval selected them. Nullable and defaulted to NULL, so
-- runs recorded before the knowledge base existed stay valid and keep saying
-- exactly what they can honestly say: nothing about knowledge grounding.
ALTER TABLE "AnalysisRun" ADD COLUMN "knowledgeEntryCodes" JSONB;
