-- Phase 8 approval lifecycle correction. Approval is a dedicated transition
-- from manager_review to approved and records its own actor/time/source
-- fingerprint without mutating content.

ALTER TABLE "ConsultantReportVersion"
    ADD COLUMN "approvedAt" TIMESTAMP(3),
    ADD COLUMN "approvedByUserId" TEXT,
    ADD COLUMN "approvedSourceFingerprint" TEXT;

CREATE INDEX "ConsultantReportVersion_approvedByUserId_idx"
    ON "ConsultantReportVersion"("approvedByUserId");
CREATE INDEX "ConsultantReportVersion_approvedAt_idx"
    ON "ConsultantReportVersion"("approvedAt");

ALTER TABLE "ConsultantReportVersion"
    ADD CONSTRAINT "ConsultantReportVersion_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
