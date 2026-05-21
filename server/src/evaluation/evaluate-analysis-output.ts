import type { EvaluationResult } from "./evaluation.types.js"

type EvaluateAnalysisOutputInput = {
  model: string
  jsonParseSuccess: boolean
  schemaValid: boolean
  latencyMs?: number
  provider: string
  promptTokens?: number
completionTokens?: number
totalTokens?: number
costEstimateUsd?: number
}

export function evaluateAnalysisOutput(
  input: EvaluateAnalysisOutputInput,
): EvaluationResult {
  return {
    model: input.model,
    jsonParseSuccess: input.jsonParseSuccess,
    schemaValid: input.schemaValid,
    relevance: "medium",
    hallucinationRisk: "medium",
    businessValue: "medium",
    actionability: "medium",
    latencyMs: input.latencyMs,
    promptTokens: input.promptTokens,
completionTokens: input.completionTokens,
totalTokens: input.totalTokens,
    provider: input.provider,
    costEstimateUsd: input.costEstimateUsd,
  }
}