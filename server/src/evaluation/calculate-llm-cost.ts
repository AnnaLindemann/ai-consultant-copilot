import { findLlmRate, isPriced } from "./llm-rates.js"

export type CostCalculationInput = {
  provider: string
  model: string
  promptTokens?: number
  completionTokens?: number
}

// What one run cost, or nothing.
//
// `undefined` is a real answer here and callers must keep it as one: it means
// "this provider/model pair has no confirmed rate", and
// `AnalysisRun.costEstimateUsd` is nullable precisely so that can be recorded
// truthfully. Substituting a zero, or another model's rate, would turn an
// absent figure into a wrong one — and a wrong cost is worse than a missing
// cost, because a consultant cannot tell that it is wrong (see
// `llm-rates.ts`).
export function calculateLlmCost(
  input: CostCalculationInput,
): number | undefined {
  const rate = findLlmRate(input.provider, input.model)
  if (!isPriced(rate)) return undefined

  const promptTokens = input.promptTokens ?? 0
  const completionTokens = input.completionTokens ?? 0

  const inputCost = (promptTokens / 1_000_000) * rate.inputUsdPerMillionTokens
  const outputCost =
    (completionTokens / 1_000_000) * rate.outputUsdPerMillionTokens

  // Six decimal places, matching `AnalysisRun.costEstimateUsd`'s
  // `Decimal(10, 6)`: rounding here rather than at the database keeps the
  // recorded figure and the reported one identical.
  return Number((inputCost + outputCost).toFixed(6))
}
