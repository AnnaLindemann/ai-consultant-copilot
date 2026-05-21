export type EvaluationLevel = "low" | "medium" | "high"

export type EvaluationResult = {
  model: string
  schemaValid: boolean
  jsonParseSuccess: boolean
  relevance: EvaluationLevel
  hallucinationRisk: EvaluationLevel
  businessValue: EvaluationLevel
  actionability: EvaluationLevel
  latencyMs?: number
  costEstimate?: number
  provider: string
  promptTokens?: number
completionTokens?: number
totalTokens?: number
costEstimateUsd?: number
}