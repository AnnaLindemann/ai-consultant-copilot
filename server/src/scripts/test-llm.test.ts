import assert from "node:assert/strict"
import { test } from "node:test"

import { describeLlmFailure } from "./test-llm.js"

// What the provider smoke test is allowed to print when it fails.
//
// Every call it makes is authenticated, so a provider SDK error arrives with
// the failing request attached: the API key in an `Authorization` header, the
// response body, the URL. The script prints a report built field by field
// instead of the error, and this file is where that stays true — a report
// assembled from an allow-list is only as good as the assertion that nothing
// else got in.

const API_KEY = "gsk_do_not_print_9f3a2c7e1b5d8460"
const BEARER = `Bearer ${API_KEY}`
const COOKIE = `session=tok_do_not_print_5f3a9c1e; Path=/; HttpOnly`
const URL_WITH_KEY = `https://api.groq.com/openai/v1/chat/completions?key=${API_KEY}`

// One error carrying every shape a vendor SDK attaches, so a single assertion
// covers all of them.
const providerError = () =>
  Object.assign(new Error(`401 Unauthorized calling ${URL_WITH_KEY}`), {
    name: "APIError",
    status: 401,
    code: "invalid_api_key",
    headers: { authorization: BEARER, cookie: COOKIE },
    request: { url: URL_WITH_KEY, headers: { Authorization: BEARER } },
    response: { body: `{"error":{"message":"Invalid API Key: ${API_KEY}"}}` },
    cause: new Error(`upstream rejected ${BEARER}`),
  })

const printed = (value: unknown) => JSON.stringify(value)

test("a provider failure is reported as identifiers, not as the error", () => {
  const report = describeLlmFailure(providerError(), {
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  })

  assert.deepEqual(report, {
    event: "LLM_SMOKE_TEST_FAILED",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    httpStatus: 401,
    errorName: "APIError",
    // Lower-case vendor prose is not machine-code shaped, so it does not
    // survive `failureIdentity` — the status is what carries the diagnosis.
    errorCode: null,
  })
})

test("no secret-bearing part of the error reaches the report", () => {
  const transcript = printed(
    describeLlmFailure(providerError(), {
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    }),
  )

  for (const forbidden of [
    API_KEY,
    BEARER,
    "Bearer ",
    COOKIE,
    URL_WITH_KEY,
    "https://",
    "Unauthorized calling",
    "Invalid API Key",
    "upstream rejected",
  ]) {
    assert.equal(
      transcript.includes(forbidden),
      false,
      `the failure report disclosed "${forbidden}": ${transcript}`,
    )
  }
})

test("the report holds nothing but its declared fields", () => {
  // An allow-list is only an allow-list if nothing else can be added by an
  // error that happens to carry it.
  const report = describeLlmFailure(providerError(), { provider: "groq" })

  assert.deepEqual(Object.keys(report).sort(), [
    "errorCode",
    "errorName",
    "event",
    "httpStatus",
    "model",
    "provider",
  ])
})

test("an unrecognized provider or model is dropped rather than echoed", () => {
  // Both come from the environment, so neither is trusted to be what it claims.
  const report = describeLlmFailure(new Error("boom"), {
    provider: `groq ${API_KEY}`,
    model: `llama ${BEARER}`,
  })

  assert.equal(report.provider, null)
  assert.equal(report.model, null)
  assert.equal(printed(report).includes(API_KEY), false)
})

test("a missing configuration reports the failure without inventing one", () => {
  // The configuration is exactly what may be absent when the smoke test fails.
  const report = describeLlmFailure(new Error("LLM_PROVIDER is required"))

  assert.equal(report.provider, null)
  assert.equal(report.model, null)
  assert.equal(report.httpStatus, null)
  assert.equal(report.errorName, "Error")
})

test("a status that is not an HTTP status is not reported as one", () => {
  for (const status of [
    "401 Unauthorized",
    { code: 401 },
    600,
    99,
    401.5,
    Number.NaN,
    null,
  ]) {
    assert.equal(
      describeLlmFailure(Object.assign(new Error("boom"), { status })).httpStatus,
      null,
      `${printed(status)} was reported as an HTTP status`,
    )
  }

  assert.equal(
    describeLlmFailure(Object.assign(new Error("boom"), { status: 429 }))
      .httpStatus,
    429,
  )
})

test("a thrown non-error discloses nothing either", () => {
  // A rejected promise carries whatever was thrown, which need not be an Error.
  // What survives is the *type* of the thrown value, never the value itself.
  const report = describeLlmFailure(`failed with ${BEARER}`)

  assert.equal(printed(report).includes(API_KEY), false)
  assert.equal(printed(report).includes("failed with"), false)
  assert.equal(report.errorName, "string")
})
