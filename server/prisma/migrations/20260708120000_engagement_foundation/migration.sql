-- Phase 1 — Engagement Foundation.
--
-- Physically renames the legacy `ClientCase` table to `Engagement`, introduces
-- the `Organization` grouping and the `EngagementStage` marker, and relaxes the
-- discovery columns so an empty engagement is a valid state (roadmap Phase 1;
-- architecture.md §6). Existing data is preserved: every existing engagement is
-- backfilled with its own Organization carrying the company identity/context
-- that previously lived on the engagement row.

-- CreateEnum
CREATE TYPE "EngagementStage" AS ENUM ('discovery', 'assessment', 'prioritization', 'solution_matching', 'roadmap', 'report');

-- Rename the legacy table and align its constraint/index names.
ALTER TABLE "ClientCase" RENAME TO "Engagement";
ALTER TABLE "Engagement" RENAME CONSTRAINT "ClientCase_pkey" TO "Engagement_pkey";
ALTER INDEX "ClientCase_createdAt_idx" RENAME TO "Engagement_createdAt_idx";
ALTER INDEX "ClientCase_sensitiveData_idx" RENAME TO "Engagement_sensitiveData_idx";
ALTER INDEX "ClientCase_gdprConcerns_idx" RENAME TO "Engagement_gdprConcerns_idx";
-- `industry` moves to Organization, so its engagement-side index is dropped.
DROP INDEX "ClientCase_industry_idx";

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "companySize" "CompanySize",
    "geography" TEXT,
    "notes" TEXT,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "Organization"("name");

-- CreateIndex
CREATE INDEX "Organization_createdAt_idx" ON "Organization"("createdAt");

-- Add the new engagement columns. `organizationId` starts nullable so existing
-- rows can be backfilled before the NOT NULL + FK are enforced below.
ALTER TABLE "Engagement" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Engagement" ADD COLUMN "title" TEXT;
ALTER TABLE "Engagement" ADD COLUMN "stage" "EngagementStage" NOT NULL DEFAULT 'discovery';

-- Backfill: give every existing engagement its own Organization, carrying the
-- company identity/context that previously lived on the engagement. The
-- engagement's id is reused as the organization id (guaranteed unique).
INSERT INTO "Organization" ("id", "name", "industry", "companySize", "geography", "createdAt", "updatedAt")
SELECT "id", "companyName", "industry", "companySize", "geography", "createdAt", "updatedAt"
FROM "Engagement";

UPDATE "Engagement" SET "organizationId" = "id";

-- Enforce the required one-to-many Organization -> Engagement relationship.
ALTER TABLE "Engagement" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Engagement_organizationId_idx" ON "Engagement"("organizationId");

-- CreateIndex
CREATE INDEX "Engagement_stage_idx" ON "Engagement"("stage");

-- Company identity/context now lives on Organization; drop it from Engagement.
ALTER TABLE "Engagement" DROP COLUMN "companyName";
ALTER TABLE "Engagement" DROP COLUMN "industry";
ALTER TABLE "Engagement" DROP COLUMN "companySize";
ALTER TABLE "Engagement" DROP COLUMN "geography";

-- Discovery content becomes optional so an empty engagement is a valid state.
ALTER TABLE "Engagement" ALTER COLUMN "statedProblem" DROP NOT NULL;
ALTER TABLE "Engagement" ALTER COLUMN "currentProcess" DROP NOT NULL;
ALTER TABLE "Engagement" ALTER COLUMN "desiredOutcome" DROP NOT NULL;
ALTER TABLE "Engagement" ALTER COLUMN "sensitiveData" DROP NOT NULL;
ALTER TABLE "Engagement" ALTER COLUMN "gdprConcerns" DROP NOT NULL;

-- Rename the Analysis Run foreign key from the legacy `caseId` to `engagementId`
-- (architecture.md §6); behavior is unchanged.
ALTER TABLE "AnalysisRun" RENAME COLUMN "caseId" TO "engagementId";
ALTER TABLE "AnalysisRun" RENAME CONSTRAINT "AnalysisRun_caseId_fkey" TO "AnalysisRun_engagementId_fkey";
ALTER INDEX "AnalysisRun_caseId_idx" RENAME TO "AnalysisRun_engagementId_idx";
