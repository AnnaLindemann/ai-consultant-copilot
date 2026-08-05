import assert from "node:assert/strict"
import { test } from "node:test"

import {
  API_BASE_URL_MESSAGES,
  DEVELOPMENT_API_BASE_URL,
  validateApiBaseUrl,
} from "./api-base-url.ts"

// --- Development: unobstructed ----------------------------------------------

test("a development build needs no variable", () => {
  const verdict = validateApiBaseUrl(undefined, false)

  assert.equal(verdict.valid, true)
  if (!verdict.valid) return
  assert.equal(verdict.apiBaseUrl, DEVELOPMENT_API_BASE_URL)
})

test("a development build may point anywhere reachable", () => {
  // Running against a colleague's machine, or a tunnel, is legitimate.
  for (const value of ["http://localhost:8787", "http://192.168.1.20:8787"]) {
    assert.equal(validateApiBaseUrl(value, false).valid, true, value)
  }
})

// --- Production: the build stops --------------------------------------------

test("a production build refuses a missing value", () => {
  // The audit's blocker: the value is inlined, so the deployed bundle would
  // call localhost from each visitor's browser.
  const verdict = validateApiBaseUrl(undefined, true)

  assert.equal(verdict.valid, false)
  if (verdict.valid) return
  assert.equal(verdict.reason, "missing")
})

test("a production build refuses an empty or whitespace value", () => {
  for (const value of ["", "   "]) {
    const verdict = validateApiBaseUrl(value, true)
    assert.equal(verdict.valid, false, JSON.stringify(value))
    if (verdict.valid) return
    assert.equal(verdict.reason, "missing")
  }
})

test("a production build refuses plain HTTP", () => {
  // The session cookie is Secure; over plain HTTP the browser never sends it,
  // so this is a broken deployment rather than a less secure one.
  const verdict = validateApiBaseUrl("http://api.example.com", true)

  assert.equal(verdict.valid, false)
  if (verdict.valid) return
  assert.equal(verdict.reason, "not_https")
})

test("a production build refuses localhost", () => {
  for (const value of [
    "https://localhost:8787",
    "https://127.0.0.1:8787",
  ]) {
    const verdict = validateApiBaseUrl(value, true)
    assert.equal(verdict.valid, false, value)
    if (verdict.valid) return
    assert.equal(verdict.reason, "localhost")
  }
})

test("a malformed URL is refused in either mode", () => {
  for (const isProduction of [true, false]) {
    for (const value of ["not a url", "ftp://api.example.com", "api.example.com"]) {
      const verdict = validateApiBaseUrl(value, isProduction)
      assert.equal(verdict.valid, false, `${value} (production=${isProduction})`)
    }
  }
})

test("a value carrying a path is refused", () => {
  // It would be concatenated into every request URL and produce a wrong path,
  // silently.
  const verdict = validateApiBaseUrl("https://api.example.com/v1", true)

  assert.equal(verdict.valid, false)
  if (verdict.valid) return
  assert.equal(verdict.reason, "not_an_origin")
})

test("a trailing slash is tolerated", () => {
  // Common, harmless, and not worth failing a deployment over.
  const verdict = validateApiBaseUrl("https://api.example.com/", true)

  assert.equal(verdict.valid, true)
})

test("a correct production value is accepted, port included", () => {
  for (const value of ["https://api.example.com", "https://api.example.com:8443"]) {
    const verdict = validateApiBaseUrl(value, true)
    assert.equal(verdict.valid, true, value)
    if (!verdict.valid) return
    assert.equal(verdict.apiBaseUrl, value)
  }
})

// --- The message ------------------------------------------------------------

test("every refusal has a message that says what to do", () => {
  // A build log is read in a hurry. Each message names the variable and the fix.
  for (const [reason, message] of Object.entries(API_BASE_URL_MESSAGES)) {
    assert.ok(
      message.includes("NEXT_PUBLIC_API_BASE_URL"),
      `${reason} message does not name the variable`,
    )
    assert.ok(message.length > 60, `${reason} message is too terse to act on`)
  }
})
