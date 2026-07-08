import type { EvaluationResult } from "./evaluation.types.js"

type EvaluateAnalysisOutputInput = {
  model: string
  provider: string
  jsonParseSuccess: boolean
  schemaValid: boolean
  latencyMs?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costEstimateUsd?: number
}

// Collects the objective signals of an analysis run. It deliberately produces
// no subjective quality judgement: until a genuine evaluator is built, no
// placeholder score may be presented as a real evaluation (roadmap Phase 0;
// architecture.md §5).
export function evaluateAnalysisOutput(
  input: EvaluateAnalysisOutputInput,
): EvaluationResult {
  return {
    model: input.model,
    provider: input.provider,
    jsonParseSuccess: input.jsonParseSuccess,
    schemaValid: input.schemaValid,
    latencyMs: input.latencyMs,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
    costEstimateUsd: input.costEstimateUsd,
  }
}
