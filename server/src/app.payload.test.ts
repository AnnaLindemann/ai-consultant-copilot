import assert from "node:assert/strict"
import { test } from "node:test"
import express from "express"

import { JSON_BODY_LIMIT } from "./config/http.js"
import {
  globalErrorHandler,
  payloadTooLargeHandler,
  requestContext,
} from "./lib/http-observability.js"

// The body limit and the refusal it produces, exercised through a minimal app
// wired exactly as `app.ts` wires it. Importing the real app would require a
// database, an authentication provider and a mail vendor; what is being
// asserted is the middleware chain, and that is the whole of it.

const withServer = async (run: (baseUrl: string) => Promise<void>) => {
  const app = express()
  app.use(requestContext)
  app.use(express.json({ limit: JSON_BODY_LIMIT }))
  app.use(payloadTooLargeHandler)
  app.post("/engagements/:id/report", (req, res) =>
    res.json({ status: true, received: Object.keys(req.body ?? {}).length }),
  )
  app.use(globalErrorHandler)

  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === "object", "test server did not start")
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

const post = (baseUrl: string, body: string) =>
  fetch(`${baseUrl}/engagements/eng_1/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })

// German prose, because that is what the real payloads carry and multi-byte
// characters are where a byte limit and a character count diverge.
const germanProse = (approximateBytes: number) => {
  const sentence =
    "Die Bearbeitung eingehender Anfragen erfordert derzeit mehrere manuelle Schritte über verschiedene Systeme hinweg. "
  return sentence.repeat(Math.ceil(approximateBytes / sentence.length))
}

test("the limit is stated rather than inherited", () => {
  // Express's default is 100 kB, which a real Consultant Report exceeds.
  assert.equal(JSON_BODY_LIMIT, "1mb")
})

test("a report-sized payload is accepted", async () => {
  await withServer(async (baseUrl) => {
    // Comfortably past Express's 100 kB default, comfortably inside 1 MB —
    // the range a real report, roadmap or recommendation save occupies.
    const body = JSON.stringify({
      executiveSummary: germanProse(300_000),
      title: "Bericht",
    })

    assert.ok(
      Buffer.byteLength(body) > 100 * 1024,
      "the fixture must exceed the default limit to prove anything",
    )

    const response = await post(baseUrl, body)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: true, received: 2 })
  })
})

test("an oversized payload is refused as its own error, not as an internal failure", async () => {
  await withServer(async (baseUrl) => {
    const response = await post(
      baseUrl,
      JSON.stringify({ executiveSummary: germanProse(1_400_000) }),
    )

    assert.equal(response.status, 413)

    const body = (await response.json()) as Record<string, unknown>

    // The point of the dedicated handler: `server.error.internal` told the
    // consultant nothing actionable and pointed an operator at a server fault
    // that does not exist.
    assert.equal(body.status, false)
    assert.equal(body.message, "server.error.payload_too_large")
    assert.notEqual(body.message, "server.error.internal")
  })
})

test("the refusal carries a request id and no detail about the limit", async () => {
  await withServer(async (baseUrl) => {
    const response = await post(
      baseUrl,
      JSON.stringify({ executiveSummary: germanProse(1_400_000) }),
    )
    const body = (await response.json()) as Record<string, unknown>

    // Correlatable with the server's own log line, like every other refusal.
    assert.match(String(body.requestId), /^req_/)

    // The limit is a deployment decision, not a number to tune a payload
    // against, and the rejected body is engagement content.
    const serialized = JSON.stringify(body)
    assert.equal(serialized.includes("1mb"), false)
    assert.equal(serialized.includes("Bearbeitung"), false)
  })
})

test("malformed JSON within the limit is still an ordinary failure", async () => {
  await withServer(async (baseUrl) => {
    // The payload handler must not swallow every body-parser error — only the
    // one it is about.
    const response = await post(baseUrl, "{ not json")

    assert.notEqual(response.status, 413)
    assert.ok(response.status >= 400)
  })
})
