import assert from "node:assert/strict"
import { test } from "node:test"

import {
  createTransportSecurity,
  isSecureRequest,
  isTransportExemptPath,
} from "./transport-security.js"

import type { Request, Response } from "express"

// The middleware is exercised through small stand-ins rather than a live
// server: what is being asserted is a decision, and a decision is clearest when
// the inputs to it are visible in the test.

type Recorded = {
  status?: number
  body?: unknown
  headers: Record<string, string>
  nextCalled: boolean
}

const run = (
  request: Partial<Request> & Record<string, unknown>,
  options: { requireHttps: boolean; trustProxy: boolean },
): Recorded => {
  const recorded: Recorded = { headers: {}, nextCalled: false }

  const res = {
    setHeader: (name: string, value: string) => {
      recorded.headers[name] = value
    },
    status: (code: number) => {
      recorded.status = code
      return res
    },
    json: (body: unknown) => {
      recorded.body = body
      return res
    },
  } as unknown as Response

  createTransportSecurity(options)(
    { path: "/engagements", headers: {}, ...request } as Request,
    res,
    () => {
      recorded.nextCalled = true
    },
  )

  return recorded
}

// --- Development ------------------------------------------------------------

test("with enforcement off, plain HTTP is served and no HSTS is sent", () => {
  // A development machine is served over HTTP. A middleware that broke that
  // would be worse than no middleware.
  const result = run(
    { protocol: "http", secure: false },
    { requireHttps: false, trustProxy: false },
  )

  assert.equal(result.nextCalled, true)
  assert.equal(result.headers["strict-transport-security"], undefined)
})

// --- Behind a trusted proxy -------------------------------------------------

test("a trusted proxy's x-forwarded-proto: https is believed", () => {
  const result = run(
    {
      protocol: "http",
      secure: false,
      headers: { "x-forwarded-proto": "https" },
    },
    { requireHttps: true, trustProxy: true },
  )

  assert.equal(result.nextCalled, true)
  assert.equal(result.status, undefined)
  assert.match(
    result.headers["strict-transport-security"] ?? "",
    /max-age=31536000/,
  )
})

test("a forwarded chain is read from its left-most entry", () => {
  // The original client's protocol, not a later hop's view of it.
  assert.equal(
    isSecureRequest(
      { protocol: "http", headers: { "x-forwarded-proto": "https,http" } },
      true,
    ),
    true,
  )
  assert.equal(
    isSecureRequest(
      { protocol: "http", headers: { "x-forwarded-proto": "http,https" } },
      true,
    ),
    false,
  )
})

test("a trusted proxy reporting plain HTTP is still refused", () => {
  const result = run(
    { protocol: "http", secure: false, headers: { "x-forwarded-proto": "http" } },
    { requireHttps: true, trustProxy: true },
  )

  assert.equal(result.nextCalled, false)
  assert.equal(result.status, 403)
  assert.deepEqual(result.body, {
    status: false,
    message: "compliance.error.insecure_transport",
  })
})

// --- The forged header ------------------------------------------------------

test("an untrusted client cannot claim to be secure with a header", () => {
  // The whole reason `TRUST_PROXY` exists. Without a trusted hop the header is
  // a claim by whoever sent the request, and it buys nothing.
  const result = run(
    { protocol: "http", secure: false, headers: { "x-forwarded-proto": "https" } },
    { requireHttps: true, trustProxy: false },
  )

  assert.equal(result.nextCalled, false)
  assert.equal(result.status, 403)
})

test("the forged header is ignored at the decision, not merely at Express", () => {
  assert.equal(
    isSecureRequest(
      { protocol: "http", secure: false, headers: { "x-forwarded-proto": "https" } },
      false,
    ),
    false,
  )
})

// --- Real TLS ---------------------------------------------------------------

test("a genuinely encrypted socket is secure regardless of proxy trust", () => {
  for (const trustProxy of [true, false]) {
    assert.equal(
      isSecureRequest({ protocol: "http", socket: { encrypted: true } }, trustProxy),
      true,
    )
  }
})

test("Express's own https protocol is accepted", () => {
  assert.equal(isSecureRequest({ protocol: "https", secure: true }, false), true)
})

// --- Refusal, never redirection ---------------------------------------------

test("an insecure request is refused rather than redirected", () => {
  // A redirect would already have carried the session cookie over the clear
  // channel — and behind a TLS-terminating proxy it would loop.
  const result = run(
    { protocol: "http", secure: false },
    { requireHttps: true, trustProxy: true },
  )

  assert.equal(result.status, 403)
  assert.equal(result.headers["location"], undefined)
  assert.equal(result.headers["Location"], undefined)
})

// --- Probes -----------------------------------------------------------------

test("health paths are exempt, and nothing else is", () => {
  assert.equal(isTransportExemptPath("/health"), true)
  assert.equal(isTransportExemptPath("/health/live"), true)
  assert.equal(isTransportExemptPath("/health/ready"), true)

  assert.equal(isTransportExemptPath("/engagements"), false)
  assert.equal(isTransportExemptPath("/healthcheck"), false)
  // Not a prefix trick: a path that merely starts with the word is not a probe.
  assert.equal(isTransportExemptPath("/health-report/secrets"), false)
})

test("a probe over plain HTTP passes while enforcement is on", () => {
  const result = run(
    { path: "/health/ready", protocol: "http", secure: false },
    { requireHttps: true, trustProxy: true },
  )

  assert.equal(result.nextCalled, true)
  assert.equal(result.status, undefined)
  // HSTS is still sent: the deployment does serve TLS, and saying so costs
  // nothing on a probe.
  assert.match(
    result.headers["strict-transport-security"] ?? "",
    /includeSubDomains/,
  )
})
