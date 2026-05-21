/*
  Warnings:

  - You are about to drop the column `company` on the `ClientCase` table. All the data in the column will be lost.
  - You are about to drop the column `problem` on the `ClientCase` table. All the data in the column will be lost.
  - Added the required column `companyName` to the `ClientCase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currentProcess` to the `ClientCase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `desiredOutcome` to the `ClientCase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gdprConcerns` to the `ClientCase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `industry` to the `ClientCase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sensitiveData` to the `ClientCase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `statedProblem` to the `ClientCase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ClientCase` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CompanySize" AS ENUM ('solo', 'micro', 'small', 'medium', 'large', 'enterprise');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ProcessFrequency" AS ENUM ('rarely', 'monthly', 'weekly', 'daily', 'many_times_per_day');

-- CreateEnum
CREATE TYPE "DataAvailability" AS ENUM ('none', 'unknown', 'restricted', 'available');

-- CreateEnum
CREATE TYPE "DataQuality" AS ENUM ('poor', 'mixed', 'good', 'unknown');

-- CreateEnum
CREATE TYPE "Timeline" AS ENUM ('asap', 'this_quarter', 'this_year', 'unknown');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EUR', 'USD', 'GBP', 'OTHER');

-- AlterTable
ALTER TABLE "ClientCase" DROP COLUMN "company",
DROP COLUMN "problem",
ADD COLUMN     "affectedUsers" JSONB,
ADD COLUMN     "bottlenecks" JSONB,
ADD COLUMN     "budgetAmount" DECIMAL(12,2),
ADD COLUMN     "budgetCurrency" "Currency",
ADD COLUMN     "budgetNotes" TEXT,
ADD COLUMN     "businessImpact" TEXT,
ADD COLUMN     "communicationChannels" JSONB,
ADD COLUMN     "companyName" TEXT NOT NULL,
ADD COLUMN     "companySize" "CompanySize",
ADD COLUMN     "currentProcess" TEXT NOT NULL,
ADD COLUMN     "currentTools" JSONB,
ADD COLUMN     "dataAvailability" "DataAvailability",
ADD COLUMN     "dataLocation" JSONB,
ADD COLUMN     "dataQuality" "DataQuality",
ADD COLUMN     "dataTypes" JSONB,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "desiredOutcome" TEXT NOT NULL,
ADD COLUMN     "gdprConcerns" BOOLEAN NOT NULL,
ADD COLUMN     "geography" TEXT,
ADD COLUMN     "humanApprovalRequired" BOOLEAN,
ADD COLUMN     "industry" TEXT NOT NULL,
ADD COLUMN     "integrationNeeds" JSONB,
ADD COLUMN     "manualWorkLevel" "Level",
ADD COLUMN     "mvpScope" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "painPoints" JSONB,
ADD COLUMN     "processFrequency" "ProcessFrequency",
ADD COLUMN     "processSteps" JSONB,
ADD COLUMN     "sensitiveData" BOOLEAN NOT NULL,
ADD COLUMN     "sensitiveDataTypes" JSONB,
ADD COLUMN     "statedProblem" TEXT NOT NULL,
ADD COLUMN     "successMetrics" JSONB,
ADD COLUMN     "technicalConstraints" JSONB,
ADD COLUMN     "timeline" "Timeline",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "urgency" "Level";

-- CreateIndex
CREATE INDEX "ClientCase_industry_idx" ON "ClientCase"("industry");

-- CreateIndex
CREATE INDEX "ClientCase_companySize_idx" ON "ClientCase"("companySize");

-- CreateIndex
CREATE INDEX "ClientCase_urgency_idx" ON "ClientCase"("urgency");

-- CreateIndex
CREATE INDEX "ClientCase_dataAvailability_idx" ON "ClientCase"("dataAvailability");

-- CreateIndex
CREATE INDEX "ClientCase_dataQuality_idx" ON "ClientCase"("dataQuality");

-- CreateIndex
CREATE INDEX "ClientCase_sensitiveData_idx" ON "ClientCase"("sensitiveData");

-- CreateIndex
CREATE INDEX "ClientCase_gdprConcerns_idx" ON "ClientCase"("gdprConcerns");

-- CreateIndex
CREATE INDEX "ClientCase_createdAt_idx" ON "ClientCase"("createdAt");
