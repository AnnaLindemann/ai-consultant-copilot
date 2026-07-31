import type { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"


// Which methodology stage an AI-assisted step supported. Recording it keeps one
// shared run mechanism while letting runs be filtered by stage (architecture.md
// §8). `analysis` is the pre-existing whole-engagement analysis endpoint.
export type AnalysisRunStage = "analysis" | "assessment"

export type CreateAnalysisRunInput = {
  workspaceId: string
  engagementId: string
  stage: AnalysisRunStage
  provider: string
  model: string
  promptFingerprint: string
  promptVersion: string
  latencyMs?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costEstimateUsd?: Prisma.Decimal | number | string
  jsonParseSuccess: boolean
  schemaValid: boolean
  errorMessage?: string
}

export const createAnalysisRun = async (input: CreateAnalysisRunInput) => {
  return prisma.analysisRun.create({
    data: {
      workspaceId: input.workspaceId,
      engagementId: input.engagementId,
      stage: input.stage,
      provider: input.provider,
      model: input.model,
      promptFingerprint: input.promptFingerprint,
      promptVersion: input.promptVersion,
      latencyMs: input.latencyMs,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      costEstimateUsd: input.costEstimateUsd,
      jsonParseSuccess: input.jsonParseSuccess,
      schemaValid: input.schemaValid,
      errorMessage: input.errorMessage,
    },
  })
}

export const getAnalysisRunsByEngagementId = async (
  workspaceId: string,
  engagementId: string,
) => {
  return prisma.analysisRun.findMany({
    where: {
      workspaceId,
      engagementId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      stage: true,
      provider: true,
      model: true,
      promptFingerprint: true,
      promptVersion: true,
      latencyMs: true,
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      costEstimateUsd: true,
      jsonParseSuccess: true,
      schemaValid: true,
      errorMessage: true,
      createdAt: true,
    },
  })
}
