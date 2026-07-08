import type { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"


export type CreateAnalysisRunInput = {
  engagementId: string
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
      engagementId: input.engagementId,
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

export const getAnalysisRunsByEngagementId = async (engagementId: string) => {
  return prisma.analysisRun.findMany({
    where: {
      engagementId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
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
