-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT,
    "latencyMs" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "costEstimateUsd" DECIMAL(10,6),
    "jsonParseSuccess" BOOLEAN NOT NULL,
    "schemaValid" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisRun_caseId_idx" ON "AnalysisRun"("caseId");

-- CreateIndex
CREATE INDEX "AnalysisRun_provider_model_idx" ON "AnalysisRun"("provider", "model");

-- CreateIndex
CREATE INDEX "AnalysisRun_createdAt_idx" ON "AnalysisRun"("createdAt");

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClientCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
