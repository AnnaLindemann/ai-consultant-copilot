import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DEFAULT_GROQ_SETTINGS,
  groqRequestBody,
  readGroqSettings,
} from "./groq.provider.js"

// The request body and the settings that shape it are pure, so what a given
// configuration actually sends is assertable without a network call or an API
// key — which is the only way to prove that an *unset* option sends nothing
// rather than quietly sending a default.

test("the default request carries only a model and a message", () => {
  const body = groqRequestBody("Hallo", "openai/gpt-oss-120b", DEFAULT_GROQ_SETTINGS)

  assert.deepEqual(Object.keys(body).sort(), ["messages", "model"])
  assert.equal(body.model, "openai/gpt-oss-120b")
  assert.deepEqual(body.messages, [{ role: "user", content: "Hallo" }])
})

test("nothing about the response format is claimed unless configured", () => {
  // Whether a model supports structured JSON output, and what it does with a
  // reasoning model's thinking, are per-model facts to establish against the
  // live API — the benchmark establishes them. Sending a parameter a model
  // rejects fails every call.
  const body = groqRequestBody("p", "m", DEFAULT_GROQ_SETTINGS)

  assert.equal("response_format" in body, false)
  assert.equal("reasoning_format" in body, false)
  assert.equal("temperature" in body, false)
  assert.equal("max_completion_tokens" in body, false)
})

test("a configured response format and reasoning format are sent", () => {
  const body = groqRequestBody("p", "m", {
    ...DEFAULT_GROQ_SETTINGS,
    responseFormat: "json_object",
    reasoningFormat: "hidden",
  })

  assert.deepEqual(body.response_format, { type: "json_object" })
  assert.equal(body.reasoning_format, "hidden")
})

test("temperature and completion ceiling are sent when configured", () => {
  const body = groqRequestBody("p", "m", {
    ...DEFAULT_GROQ_SETTINGS,
    temperature: 0.2,
    maxCompletionTokens: 8000,
  })

  assert.equal(body.temperature, 0.2)
  assert.equal(body.max_completion_tokens, 8000)
})

test("a temperature of zero is sent rather than treated as unset", () => {
  // The bug a truthiness check would introduce: 0 is a meaningful temperature.
  const body = groqRequestBody("p", "m", {
    ...DEFAULT_GROQ_SETTINGS,
    temperature: 0,
  })

  assert.equal(body.temperature, 0)
})

test("the model requested is the model sent — never substituted", () => {
  // No silent fallback: whatever the caller asked for is what goes on the wire.
  for (const model of ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "unknown"]) {
    assert.equal(groqRequestBody("p", model, DEFAULT_GROQ_SETTINGS).model, model)
  }
})

// --- Settings ---------------------------------------------------------------

test("an unconfigured deployment gets a bounded timeout and no retries", () => {
  const settings = readGroqSettings({})

  assert.equal(settings.timeoutMs, DEFAULT_GROQ_SETTINGS.timeoutMs)
  assert.ok(settings.timeoutMs > 0, "a call must not be able to hang forever")
  // Retrying spends money twice. It is a decision, made by configuration and
  // never by default.
  assert.equal(settings.maxRetries, 0)
})

test("settings are read from the environment", () => {
  const settings = readGroqSettings({
    LLM_TIMEOUT_MS: "45000",
    LLM_MAX_RETRIES: "2",
    LLM_TEMPERATURE: "0.4",
    LLM_MAX_COMPLETION_TOKENS: "12000",
    LLM_RESPONSE_FORMAT: "json_object",
    LLM_REASONING_FORMAT: "hidden",
  })

  assert.deepEqual(settings, {
    timeoutMs: 45_000,
    maxRetries: 2,
    temperature: 0.4,
    maxCompletionTokens: 12_000,
    responseFormat: "json_object",
    reasoningFormat: "hidden",
  })
})

test("an unrecognized format value is ignored rather than sent", () => {
  // Sending a value the provider does not know fails the call. Silence is the
  // safe reading of a typo.
  const settings = readGroqSettings({
    LLM_RESPONSE_FORMAT: "json",
    LLM_REASONING_FORMAT: "quiet",
  })

  assert.equal(settings.responseFormat, null)
  assert.equal(settings.reasoningFormat, null)
})

test("every documented reasoning format is accepted", () => {
  for (const value of ["hidden", "parsed", "raw"] as const) {
    assert.equal(readGroqSettings({ LLM_REASONING_FORMAT: value }).reasoningFormat, value)
  }
})

test("an unparseable numeric setting falls back rather than becoming NaN", () => {
  const settings = readGroqSettings({
    LLM_TIMEOUT_MS: "soon",
    LLM_MAX_RETRIES: "",
    LLM_TEMPERATURE: "warm",
  })

  assert.equal(settings.timeoutMs, DEFAULT_GROQ_SETTINGS.timeoutMs)
  assert.equal(settings.maxRetries, 0)
  assert.equal(settings.temperature, null)
})
