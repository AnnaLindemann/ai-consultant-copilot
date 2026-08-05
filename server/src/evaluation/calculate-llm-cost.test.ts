import assert from "node:assert/strict"
import { test } from "node:test"

import { calculateLlmCost } from "./calculate-llm-cost.js"
import { LLM_RATES, findLlmRate, isPriced } from "./llm-rates.js"

// A model whose rate the table records, so the arithmetic can be asserted
// without pinning this test to whichever model happens to be the default.
const PRICED = { provider: "groq", model: "llama-3.3-70b-versatile" } as const

test("a priced model combines prompt and completion token costs at its own rate", () => {
  const rate = findLlmRate(PRICED.provider, PRICED.model)
  assert.ok(isPriced(rate), "the fixture model was expected to carry a rate")

  const cost = calculateLlmCost({
    ...PRICED,
    promptTokens: 1_000_000,
    completionTokens: 1_000_000,
  })

  // One million of each is exactly the two per-million rates added together.
  assert.equal(
    cost,
    Number(
      (rate.inputUsdPerMillionTokens + rate.outputUsdPerMillionTokens).toFixed(6),
    ),
  )
})

test("a priced model treats missing token counts as zero", () => {
  assert.equal(calculateLlmCost(PRICED), 0)
})

test("a priced model rounds to six decimal places", () => {
  const rate = findLlmRate(PRICED.provider, PRICED.model)
  assert.ok(isPriced(rate))

  const cost = calculateLlmCost({
    ...PRICED,
    promptTokens: 1,
    completionTokens: 0,
  })

  assert.equal(
    cost,
    Number((rate.inputUsdPerMillionTokens / 1_000_000).toFixed(6)),
  )
})

// The rule the whole table exists for: an unknown or unpriced pair produces
// *no* estimate. A defaulted figure would be a fabricated measurement recorded
// against a consultant's engagement, which is the one outcome worse than a gap
// (`llm-rates.ts`).

test("an unknown model yields no estimate rather than a wrong one", () => {
  assert.equal(
    calculateLlmCost({
      provider: "groq",
      model: "a-model-nobody-priced",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    }),
    undefined,
  )
})

test("an unknown provider yields no estimate", () => {
  assert.equal(
    calculateLlmCost({
      provider: "some-other-provider",
      model: "llama-3.3-70b-versatile",
      promptTokens: 1_000_000,
    }),
    undefined,
  )
})

test("a known but deliberately unpriced model yields no estimate", () => {
  // GPT-OSS is in the table so it is discoverable, and carries no figures
  // because nobody has confirmed them against the provider's price list.
  const rate = findLlmRate("groq", "openai/gpt-oss-120b")

  assert.ok(rate, "the model was expected to be listed")
  assert.equal(rate.status, "verification_required")
  assert.equal(
    calculateLlmCost({
      provider: "groq",
      model: "openai/gpt-oss-120b",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    }),
    undefined,
  )
})

test("every listed rate either carries both figures or none", () => {
  // A half-filled entry would silently price one side of a run at zero.
  for (const [provider, models] of Object.entries(LLM_RATES)) {
    for (const [model, rate] of Object.entries(models)) {
      const hasInput = typeof rate.inputUsdPerMillionTokens === "number"
      const hasOutput = typeof rate.outputUsdPerMillionTokens === "number"

      assert.equal(
        hasInput,
        hasOutput,
        `${provider}:${model} carries one price figure but not the other`,
      )
      assert.equal(
        hasInput,
        rate.status !== "verification_required",
        `${provider}:${model} status and figures disagree`,
      )
      assert.ok(
        rate.source,
        `${provider}:${model} names no source to re-verify against`,
      )
    }
  }
})
