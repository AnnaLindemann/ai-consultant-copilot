-- Phase 5A: the curated Technology Knowledge Base and its Technology Curator.
--
-- A separate table group from the Consulting Knowledge Base and from the
-- engagement tables. Like the Consulting Knowledge Base it carries **no
-- workspace column**: both knowledge bases are product-level assets shared
-- across workspaces, deliberately outside the Phase 3A isolation boundary
-- (architecture.md §9; domain-model.md §3A.1). No engagement row gains a
-- foreign key into it, and no row here points into an engagement.
--
-- The only write path to "TechnologyProfile" is the Technology Curator applying
-- an explicitly human-approved "TechnologyUpdateProposal" (architecture.md
-- §9.3). "TechnologyUpdateHistory" is append-only, mirroring "AuditTrail": it
-- has no updatedAt column and no update or delete path exists in code.
--
-- Every statement is additive. Nothing existing is dropped, renamed, or
-- rewritten, so the migration is safe against a database that already holds
-- workspaces, engagements, analysis runs, and consulting knowledge.

CREATE TYPE "TechnologyProfileStatus" AS ENUM ('active', 'deprecated');

CREATE TYPE "TechnologyChangeKind" AS ENUM ('create', 'revise', 'deprecate');

CREATE TYPE "TechnologyProposalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- The top-level organizing concept. Flat by decision: nesting is added only if
-- a real second level appears (architecture.md §6, principle §1.6), so there is
-- no parent column to leave permanently null.
CREATE TABLE "TechnologyCategory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedByUserId" TEXT,

    CONSTRAINT "TechnologyCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechnologyCategory_code_key" ON "TechnologyCategory"("code");
CREATE INDEX "TechnologyCategory_active_idx" ON "TechnologyCategory"("active");
CREATE INDEX "TechnologyCategory_sortOrder_idx" ON "TechnologyCategory"("sortOrder");

-- The registry of trusted official origins. Provenance, not content — kept
-- distinct from the AI Providers category on purpose.
CREATE TABLE "TechnologySource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "officialChannels" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedByUserId" TEXT,

    CONSTRAINT "TechnologySource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechnologySource_code_key" ON "TechnologySource"("code");
CREATE INDEX "TechnologySource_active_idx" ON "TechnologySource"("active");

-- One technology or model, classified under exactly one category. The
-- "categoryCode" column is NOT NULL and carries a foreign key, which is what
-- makes "exactly one Technology Category" a property of the schema rather than
-- of the code that writes it (domain-model.md §2, §4.2, §8).
CREATE TABLE "TechnologyProfile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "matchTerms" JSONB NOT NULL,
    "tags" JSONB NOT NULL,
    "status" "TechnologyProfileStatus" NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TechnologyProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechnologyProfile_code_key" ON "TechnologyProfile"("code");
CREATE INDEX "TechnologyProfile_categoryCode_idx" ON "TechnologyProfile"("categoryCode");
CREATE INDEX "TechnologyProfile_status_idx" ON "TechnologyProfile"("status");

-- The shape retrieval narrows by first: one category's active profiles.
CREATE INDEX "TechnologyProfile_categoryCode_status_idx"
  ON "TechnologyProfile"("categoryCode", "status");

-- The governance record of a proposed change, approved or rejected. It is not
-- an Analysis Run and never becomes one.
CREATE TABLE "TechnologyUpdateProposal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "changeKind" "TechnologyChangeKind" NOT NULL,
    "profileCode" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "proposedProfile" JSONB,
    "rationale" TEXT NOT NULL,
    "assumptions" JSONB NOT NULL,
    "gaps" JSONB NOT NULL,
    "sourceCodes" JSONB NOT NULL,
    "status" "TechnologyProposalStatus" NOT NULL DEFAULT 'pending',
    "createdByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decisionNote" TEXT,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "TechnologyUpdateProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TechnologyUpdateProposal_status_idx" ON "TechnologyUpdateProposal"("status");
CREATE INDEX "TechnologyUpdateProposal_profileCode_idx" ON "TechnologyUpdateProposal"("profileCode");
CREATE INDEX "TechnologyUpdateProposal_createdAt_idx" ON "TechnologyUpdateProposal"("createdAt");

-- The append-only log of approved, applied revisions only.
--
-- Note the absence of an "updatedAt" column: an entry is never rewritten, so
-- there is nothing for it to record. This mirrors "AuditTrail" exactly.
CREATE TABLE "TechnologyUpdateHistory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proposalId" TEXT NOT NULL,
    "profileCode" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "changeKind" "TechnologyChangeKind" NOT NULL,
    "sourceCodes" JSONB NOT NULL,
    "appliedProfile" JSONB NOT NULL,
    "approvedByUserId" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnologyUpdateHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TechnologyUpdateHistory_profileCode_idx" ON "TechnologyUpdateHistory"("profileCode");
CREATE INDEX "TechnologyUpdateHistory_categoryCode_idx" ON "TechnologyUpdateHistory"("categoryCode");
CREATE INDEX "TechnologyUpdateHistory_appliedAt_idx" ON "TechnologyUpdateHistory"("appliedAt");
CREATE INDEX "TechnologyUpdateHistory_proposalId_idx" ON "TechnologyUpdateHistory"("proposalId");

-- Who curated what. SET NULL throughout, so removing a user never removes
-- curated knowledge and never rewrites an append-only history entry.
ALTER TABLE "TechnologyCategory"
  ADD CONSTRAINT "TechnologyCategory_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TechnologySource"
  ADD CONSTRAINT "TechnologySource_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TechnologyUpdateProposal"
  ADD CONSTRAINT "TechnologyUpdateProposal_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TechnologyUpdateProposal"
  ADD CONSTRAINT "TechnologyUpdateProposal_decidedByUserId_fkey"
  FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TechnologyUpdateHistory"
  ADD CONSTRAINT "TechnologyUpdateHistory_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A profile belongs to exactly one category, and RESTRICT is what keeps that
-- true: a category holding profiles cannot be deleted out from under them.
ALTER TABLE "TechnologyProfile"
  ADD CONSTRAINT "TechnologyProfile_categoryCode_fkey"
  FOREIGN KEY ("categoryCode") REFERENCES "TechnologyCategory"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A history entry may never be orphaned from the proposal that authorized it,
-- nor from the profile it changed: RESTRICT, because an append-only governance
-- record that can lose its subject is not an audit trail.
ALTER TABLE "TechnologyUpdateHistory"
  ADD CONSTRAINT "TechnologyUpdateHistory_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "TechnologyUpdateProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TechnologyUpdateHistory"
  ADD CONSTRAINT "TechnologyUpdateHistory_profileCode_fkey"
  FOREIGN KEY ("profileCode") REFERENCES "TechnologyProfile"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
