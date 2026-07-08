import assert from "node:assert/strict"
import { test } from "node:test"

import { calculateLlmCost } from "./calculate-llm-cost.js"

test("calculateLlmCost combines prompt and completion token costs", () => {
  // 1M prompt tokens @ $0.59 + 1M completion tokens @ $0.79 = $1.38
  const cost = calculateLlmCost({
    promptTokens: 1_000_000,
    completionTokens: 1_000_000,
  })

  assert.equal(cost, 1.38)
})

test("calculateLlmCost treats missing token counts as zero", () => {
  assert.equal(calculateLlmCost({}), 0)
})

test("calculateLlmCost rounds to six decimal places", () => {
  // 1 / 1_000_000 * 0.59 = 0.00000059, which rounds to 0.000001 at 6 dp.
  const cost = calculateLlmCost({ promptTokens: 1, completionTokens: 0 })

  assert.equal(cost, 0.000001)
})
