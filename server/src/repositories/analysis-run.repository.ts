import type { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"


// Which methodology stage an AI-assisted step supported. Recording it keeps one
// shared run mechanism while letting runs be filtered by stage (architecture.md
// §8). `analysis` is the pre-existing whole-engagement analysis endpoint.
export type AnalysisRunStage =
  | "analysis"
  | "assessment"
  | "prioritization"
  | "solution_matching"
  | "roadmap"
  | "report"

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
  // The curated Consulting Knowledge Base entries that grounded the run, by
  // their stable codes, in the order the retrieval selected them (roadmap
  // Phase 5). Omitted by a stage that retrieves no knowledge; recorded even on
  // a failed run, because what the model was *given* is part of the audit trail
  // whether or not it answered (coding-standards.md §7).
  knowledgeEntryCodes?: readonly string[]
  // The curated Technology Knowledge Base profiles that grounded the run, by
  // their stable codes (roadmap Phase 6). Recorded separately from the
  // consulting codes above because the two knowledge bases are independent
  // subsystems named specifically, never merged into one "knowledge base"
  // (coding-standards.md §12). Omitted by a stage that retrieves no technology
  // knowledge.
  technologyProfileCodes?: readonly string[]
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
      knowledgeEntryCodes:
        input.knowledgeEntryCodes === undefined
          ? undefined
          : [...input.knowledgeEntryCodes],
      technologyProfileCodes:
        input.technologyProfileCodes === undefined
          ? undefined
          : [...input.technologyProfileCodes],
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
