import assert from "node:assert/strict"
import { test } from "node:test"

import {
  BENCHMARK_STAGES,
  MANUAL_CHECKLIST,
  buildBenchmarkPrompts,
  renderBenchmarkReport,
  runBenchmark,
} from "./llm-benchmark.js"
import {
  benchmarkAssessment,
  benchmarkDiscoveryProfile,
  benchmarkOpportunities,
  benchmarkRoadmap,
} from "./benchmark-fixtures.js"
import { findPersonalIdentifiers } from "../domain/compliance/pii.js"
import { defaultCompliancePolicy } from "../domain/compliance/compliance.js"

import type { LlmResponse } from "../lib/llm-client.js"

// The benchmark's own orchestration, exercised without a provider. **No test in
// any suite may call a live model**: it would cost money and make the suite
// non-deterministic, which is why the runner sits behind an explicit command.

const responding = (content: string): LlmResponse => ({
  content,
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  latencyMs: 1200,
  promptTokens: 4000,
  completionTokens: 900,
  totalTokens: 4900,
})

// --- The prompts ------------------------------------------------------------

test("all six stages are covered", () => {
  const prompts = buildBenchmarkPrompts()

  assert.deepEqual(
    prompts.map((entry) => entry.stage),
    [...BENCHMARK_STAGES],
  )
  assert.equal(BENCHMARK_STAGES.length, 6)
})

test("each prompt is substantial and carries its stage's version and fingerprint", () => {
  for (const entry of buildBenchmarkPrompts()) {
    // A benchmark against a two-line prompt measures nothing about a stage
    // whose real input is a full Discovery Profile and a knowledge package.
    assert.ok(
      entry.prompt.length > 1000,
      `${entry.stage} prompt is too small to be representative (${entry.prompt.length} chars)`,
    )
    assert.ok(entry.promptVersion.length > 0, entry.stage)
    assert.ok(entry.promptFingerprint.length > 0, entry.stage)
  }
})

test("prompt construction is deterministic", () => {
  // Two runs must differ because of the model, never because of the fixture.
  const first = buildBenchmarkPrompts()
  const second = buildBenchmarkPrompts()

  assert.deepEqual(
    first.map((entry) => entry.prompt),
    second.map((entry) => entry.prompt),
  )
})

test("the benchmark's own fixtures carry no personal data the rules recognize", () => {
  // The prompts leave for an external provider. A fixture carrying a real
  // contact, address, IBAN or customer number would be a disclosure to a
  // processor nobody consented to.
  //
  // Scoped to the fixture data rather than the whole prompt on purpose. A
  // prompt also contains the prompt template and the curated knowledge
  // catalogue, and the shipped catalogue contains the ordinary German word
  // "Auftragsverarbeitung", which the built-in contract-identifier rule matches
  // as though it were a customer reference. That false positive is a known
  // limitation of shape-based redaction (`domain/compliance/pii.ts` says so),
  // not a defect in the fixtures — and asserting over it would make this check
  // permanently yellow and therefore worthless.
  const rules = defaultCompliancePolicy().personalIdentifierRules

  const fixtures = JSON.stringify({
    discovery: benchmarkDiscoveryProfile(),
    assessment: benchmarkAssessment(),
    opportunities: benchmarkOpportunities(),
    roadmap: benchmarkRoadmap(),
  })

  assert.deepEqual(findPersonalIdentifiers(fixtures, rules), [])
})

test("no prompt carries an identifier kind the fixtures could have introduced", () => {
  // The kinds that would mean a real person had reached the fixture: an email
  // address, a phone number, an IBAN, a postal address. The
  // contract-identifier false positive above is deliberately not in this list.
  const rules = defaultCompliancePolicy().personalIdentifierRules
  const disallowed = new Set(["email", "phone", "iban", "postal_address"])

  for (const entry of buildBenchmarkPrompts()) {
    const found = findPersonalIdentifiers(entry.prompt, rules).filter((kind) =>
      disallowed.has(kind),
    )

    assert.deepEqual(found, [], `${entry.stage} prompt contains ${found.join("/")}`)
  }
})

test("the discovery fixture states its figures as unknown rather than inventing them", () => {
  // The same rule the product enforces on the model: baselines and targets are
  // the client's, and the fixture must not model bad behaviour.
  const discovery = benchmarkDiscoveryProfile()

  assert.equal(discovery.budgetAmount, null)
  assert.ok(discovery.missingInformation.length > 0)
})

// --- Judging ----------------------------------------------------------------

test("a provider failure is recorded as a failed stage, with identifiers only", async () => {
  const attached = Object.assign(new Error("boom"), {
    name: "APIConnectionError",
    code: "ECONNRESET",
    // What an SDK error actually arrives carrying.
    request: { headers: { authorization: "Bearer gsk_secret_key_value" } },
  })

  const run = await runBenchmark({
    callLlm: async () => {
      throw attached
    },
  })

  assert.equal(run.outcomes.length, 6)
  for (const outcome of run.outcomes) {
    assert.equal(outcome.apiSuccess, false)
    assert.equal(outcome.schemaValid, false)
    assert.equal(outcome.errorName, "APIConnectionError")
    assert.equal(outcome.errorCode, "ECONNRESET")
  }

  // Nothing the SDK attached survives into the result.
  assert.equal(JSON.stringify(run).includes("gsk_secret_key_value"), false)
  assert.equal(JSON.stringify(run).includes("Bearer"), false)
})

test("unparseable output is recorded as a failure rather than throwing", async () => {
  const run = await runBenchmark({
    callLlm: async () => responding("Es tut mir leid, das kann ich nicht."),
  })

  for (const outcome of run.outcomes) {
    assert.equal(outcome.apiSuccess, true)
    assert.equal(outcome.jsonParseSuccess, false)
    assert.equal(outcome.schemaValid, false)
    assert.equal(outcome.groundingOutcome, "refused")
    assert.ok(outcome.failureMessage)
  }
})

test("well-formed JSON that fails a stage's schema is distinguished from unparseable output", async () => {
  const run = await runBenchmark({
    callLlm: async () => responding('{"clientSummary": "zu wenig"}'),
  })

  for (const outcome of run.outcomes) {
    // The distinction the benchmark exists to make: "the model cannot produce
    // JSON" is a different problem from "the model produces JSON that does not
    // satisfy the contract".
    assert.equal(outcome.jsonParseSuccess, true)
    assert.equal(outcome.schemaValid, false)
  }
})

test("token usage and latency are recorded per stage", async () => {
  const run = await runBenchmark({ callLlm: async () => responding("{}") })

  for (const outcome of run.outcomes) {
    assert.equal(outcome.latencyMs, 1200)
    assert.equal(outcome.promptTokens, 4000)
    assert.equal(outcome.completionTokens, 900)
    assert.equal(outcome.totalTokens, 4900)
  }
})

test("cost follows the rate table, and is null for an unpriced model", async () => {
  const priced = await runBenchmark({ callLlm: async () => responding("{}") })
  assert.ok(
    priced.outcomes.every((outcome) => typeof outcome.costEstimateUsd === "number"),
  )
  assert.equal(priced.costingAvailable, true)

  const unpriced = await runBenchmark({
    callLlm: async () => ({
      ...responding("{}"),
      model: "openai/gpt-oss-120b",
    }),
  })

  // No confirmed rate means no estimate — never a guessed one.
  assert.ok(unpriced.outcomes.every((outcome) => outcome.costEstimateUsd === null))
  assert.equal(unpriced.costingAvailable, false)
})

test("personal data in the model's output is detected by kind, never by value", async () => {
  // A response is never assumed clean because the input was synthetic: a model
  // can complete a placeholder into something that looks real.
  const run = await runBenchmark({
    callLlm: async () =>
      responding('{"note": "Bitte an max.mustermann@example.com senden"}'),
  })

  for (const outcome of run.outcomes) {
    assert.deepEqual([...outcome.outputPiiKinds], ["email"])
  }

  // Kinds only. A record of what leaked would be the leak.
  assert.equal(JSON.stringify(run).includes("max.mustermann@example.com"), false)
})

test("iterations repeat every stage", async () => {
  const run = await runBenchmark({ callLlm: async () => responding("{}") }, 3)

  assert.equal(run.outcomes.length, 18)
  assert.equal(run.iterations, 3)
})

test("the model recorded is the one that answered", async () => {
  // No fallback: whatever came back is what is reported, so a provider that
  // resolved an alias cannot be mistaken for the model that was requested.
  const run = await runBenchmark({
    callLlm: async () => ({ ...responding("{}"), model: "some-other-model" }),
  })

  assert.equal(run.model, "some-other-model")
})

// --- Reporting --------------------------------------------------------------

test("the report names every stage and carries the manual checklist", async () => {
  const run = await runBenchmark({ callLlm: async () => responding("{}") })
  const report = renderBenchmarkReport(run)

  for (const stage of BENCHMARK_STAGES) {
    assert.ok(report.includes(stage), `report omits ${stage}`)
  }

  // The numbers decide nothing on their own; German quality and groundedness
  // are what a model is adopted on.
  assert.ok(report.includes(MANUAL_CHECKLIST))
  assert.ok(report.includes("German quality"))
  assert.ok(report.includes("Groundedness"))
})

test("an unpriced run says so instead of showing a figure", async () => {
  const run = await runBenchmark({
    callLlm: async () => ({ ...responding("{}"), model: "openai/gpt-oss-120b" }),
  })

  const report = renderBenchmarkReport(run)

  assert.ok(report.includes("Cost is not reported for this model"))
  assert.ok(report.includes("unpriced"))
})
