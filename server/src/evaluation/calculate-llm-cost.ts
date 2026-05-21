export type CostCalculationInput = {
  promptTokens?: number
  completionTokens?: number
}

export function calculateLlmCost(
  input: CostCalculationInput,
): number {
  const promptTokens = input.promptTokens ?? 0
  const completionTokens = input.completionTokens ?? 0

  const inputCost =
    (promptTokens / 1_000_000) * 0.59

  const outputCost =
    (completionTokens / 1_000_000) * 0.79

  return Number((inputCost + outputCost).toFixed(6))
}