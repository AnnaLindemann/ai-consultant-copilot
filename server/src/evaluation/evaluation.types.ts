// Only objective, machine-derived signals are represented here. Subjective
// quality scores (relevance, hallucination risk, business value, actionability)
// are intentionally absent: no genuine evaluator exists yet, and presenting a
// placeholder score as a real evaluation is forbidden (roadmap Phase 0;
// architecture.md §5; coding-standards.md §8).
export type EvaluationResult = {
  model: string
  provider: string
  schemaValid: boolean
  jsonParseSuccess: boolean
  latencyMs?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costEstimateUsd?: number
}
