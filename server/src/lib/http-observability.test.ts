import assert from "node:assert/strict"
import { after, test } from "node:test"

import express from "express"

import { REQUEST_ID_HEADER } from "./application-logger.js"
import {
  globalErrorHandler,
  requestContext,
  requestLifecycleLogger,
  safeRequestMetadata,
} from "./http-observability.js"

const app = express()

app.use(requestContext)
app.use(requestLifecycleLogger)
app.get("/ok", (_req, res) => {
  res.status(400).json({ status: false, message: "test.error" })
})
app.get("/boom", () => {
  throw new Error("connection string with secret=should-never-be-returned")
})
app.get("/partial-fail", (_req, res, next) => {
  res.write("partial response")
  next(new Error("RAW_SECRET_AFTER_HEADERS_SENT"))
})
app.use(globalErrorHandler)

const server = app.listen(0)

const baseUrl = (() => {
  const address = server.address()
  assert.ok(address && typeof address === "object", "test server did not start")
  return `http://127.0.0.1:${address.port}`
})()

after(() => server.close())

test("request ids are server-owned even when the client provides a valid id", async () => {
  const response = await fetch(`${baseUrl}/ok`, {
    headers: { [REQUEST_ID_HEADER]: "req_safeInbound123" },
  })

  const responseRequestId = response.headers.get(REQUEST_ID_HEADER)
  assert.ok(responseRequestId?.startsWith("req_"))
  assert.notEqual(responseRequestId, "req_safeInbound123")
  assert.equal((await response.json()).requestId, responseRequestId)
})

test("an unsafe inbound request id is replaced before it reaches responses", async () => {
  const unsafe = "token=raw-client-content"
  const response = await fetch(`${baseUrl}/ok`, {
    headers: { [REQUEST_ID_HEADER]: unsafe },
  })

  const responseRequestId = response.headers.get(REQUEST_ID_HEADER)
  assert.ok(responseRequestId?.startsWith("req_"))
  assert.notEqual(responseRequestId, unsafe)
  assert.equal((await response.json()).requestId, responseRequestId)
})

test("the global error boundary returns a safe body with the request id", async () => {
  const response = await fetch(`${baseUrl}/boom`, {
    headers: { [REQUEST_ID_HEADER]: "req_globalBoundary1" },
  })

  const responseRequestId = response.headers.get(REQUEST_ID_HEADER)
  assert.equal(response.status, 500)
  assert.ok(responseRequestId?.startsWith("req_"))
  assert.deepEqual(await response.json(), {
    status: false,
    message: "server.error.internal",
    requestId: responseRequestId,
  })
})

test("unmatched routes and favicon complete logging without uncaught exceptions", async () => {
  const uncaught: unknown[] = []
  const onUncaught = (error: unknown) => {
    uncaught.push(error)
  }
  process.on("uncaughtException", onUncaught)

  try {
    const { value, lines } = await captureConsole(async () => {
      const unmatched = await fetch(`${baseUrl}/stale/client/path`)
      const favicon = await fetch(`${baseUrl}/favicon.ico`)
      await delay()
      return { unmatched, favicon }
    })

    assert.equal(uncaught.length, 0)
    assert.equal(value.unmatched.status, 404)
    assert.equal(value.favicon.status, 404)

    const completed = lines
      .map(parseLogLine)
      .filter((entry) => entry?.event === "http.request_completed")
    assert.ok(completed.length >= 2)
    assert.ok(completed.every((entry) => entry?.httpStatus === 404))
  } finally {
    process.off("uncaughtException", onUncaught)
  }
})

test("headers-sent failures emit one sanitized error event without Express raw stderr", async () => {
  const { lines } = await captureConsole(async () => {
    try {
      await fetch(`${baseUrl}/partial-fail`)
    } catch {
      // Destroying a partially-written response can surface as a fetch failure;
      // the assertion below is about server-side logging behavior.
    }
    await delay()
  })

  const transcript = lines.join("\n")
  assert.equal(transcript.includes("RAW_SECRET_AFTER_HEADERS_SENT"), false)
  assert.equal(/\bat .*http-observability\.test/.test(transcript), false)

  const errors = lines
    .map(parseLogLine)
    .filter((entry) => entry?.event === "http.unexpected_error")

  assert.equal(errors.length, 1)
  assert.equal(errors[0]?.errorName, "Error")
  assert.equal(errors[0]?.httpStatus, 500)
})

test("request metadata extraction ignores malformed params and throwing request shapes", () => {
  const req = {} as express.Request
  Object.defineProperty(req, "params", {
    get() {
      throw new Error("raw param getter")
    },
  })
  Object.defineProperty(req, "path", {
    get() {
      throw new Error("raw path getter")
    },
  })
  Object.defineProperty(req, "method", {
    get() {
      throw new Error("raw method getter")
    },
  })

  assert.doesNotThrow(() => safeRequestMetadata(req))
  assert.deepEqual(safeRequestMetadata(req), {})
})

test("logged routes are normalized and do not echo unsafe URL content", async () => {
  const unsafePaths = [
    "/unknown/averyveryveryveryveryveryverylongsegment",
    "/unknown/alice@example.com",
    "/unknown/abcdefghijklmnopqrstuvwxyz1234567890",
    "/unknown/%E2%98%83",
    "/unknown/download?signedUrl=secret-token",
    "/missing/eng_safeIdentifier1",
  ]

  const { lines } = await captureConsole(async () => {
    for (const path of unsafePaths) {
      await fetch(`${baseUrl}${path}`)
    }
    await delay()
  })

  const routes = lines
    .map(parseLogLine)
    .filter((entry) => entry?.event === "http.request_completed")
    .map((entry) => entry?.route)

  assert.ok(routes.includes("/unknown/:segment"))
  assert.ok(routes.includes("/unknown/download"))
  assert.ok(routes.includes("/missing/:id"))

  const transcript = JSON.stringify(routes)
  assert.equal(transcript.includes("alice@example.com"), false)
  assert.equal(transcript.includes("abcdefghijklmnopqrstuvwxyz1234567890"), false)
  assert.equal(transcript.includes("signedUrl"), false)
  assert.equal(transcript.includes("%E2%98%83"), false)
})

const captureConsole = async <T>(operation: () => Promise<T>) => {
  const lines: string[] = []
  const originals = {
    error: console.error,
    log: console.log,
  }

  const record = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "))
  }

  console.error = record
  console.log = record

  try {
    return { value: await operation(), lines }
  } finally {
    Object.assign(console, originals)
  }
}

const parseLogLine = (line: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(line)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

const delay = () => new Promise((resolve) => setTimeout(resolve, 20))
