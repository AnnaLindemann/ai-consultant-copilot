import assert from "node:assert/strict"
import { test } from "node:test"

import {
  logger,
  safeInboundRequestId,
  withLogContext,
} from "./application-logger.js"

test("logger writes valid single-line JSON to stdout for info", () => {
  const { stdout, stderr } = captureLogger(() => {
    logger.info("test.valid_json", {
      method: "GET",
      route: "/engagements/:id",
      httpStatus: 200,
    })
  })

  assert.equal(stderr.length, 0)
  assert.equal(stdout.length, 1)
  assert.equal(stdout[0]?.includes("\n"), false)

  const entry = JSON.parse(stdout[0]!)
  assert.equal(entry.level, "info")
  assert.equal(entry.event, "test.valid_json")
  assert.equal(entry.method, "GET")
  assert.equal(entry.route, "/engagements/:id")
  assert.equal(entry.httpStatus, 200)
})

test("request id validation accepts only the strict server id shape", () => {
  assert.equal(safeInboundRequestId("req_valid123"), "req_valid123")
  assert.equal(safeInboundRequestId("external.trace.id"), null)
  assert.equal(safeInboundRequestId("token=raw-client-content"), null)
})

test("logger writes warn and error levels to stderr", () => {
  const { stdout, stderr } = captureLogger(() => {
    logger.warn("test.warn")
    logger.error("test.error")
  })

  assert.equal(stdout.length, 0)
  assert.equal(stderr.length, 2)
  assert.equal(JSON.parse(stderr[0]!).level, "warn")
  assert.equal(JSON.parse(stderr[1]!).level, "error")
})

test("logger drops unknown and sensitive metadata keys while retaining allowed fields", () => {
  const { stderr } = captureLogger(() => {
    logger.error("test.allowlist", {
      workspaceId: "ws_safe123",
      engagementId: "eng_safe123",
      action: "read",
      reasonCode: "denied",
      message: "raw message must not be serialized",
      detail: "raw detail must not be serialized",
      email: "person@example.com",
      token: "secret-token",
      body: { content: "raw body" },
    } as never)
  })

  const entry = JSON.parse(stderr[0]!)
  assert.equal(entry.workspaceId, "ws_safe123")
  assert.equal(entry.engagementId, "eng_safe123")
  assert.equal(entry.action, "read")
  assert.equal(entry.reasonCode, "denied")
  assert.equal("message" in entry, false)
  assert.equal("detail" in entry, false)
  assert.equal("email" in entry, false)
  assert.equal("token" in entry, false)
  assert.equal("body" in entry, false)

  const line = stderr[0]!
  assert.equal(line.includes("raw message"), false)
  assert.equal(line.includes("person@example.com"), false)
  assert.equal(line.includes("secret-token"), false)
})

test("logger truncates allowed string fields", () => {
  const longReason = "x".repeat(200)
  const { stdout } = captureLogger(() => {
    logger.info("test.truncate", { reasonCode: longReason })
  })

  const entry = JSON.parse(stdout[0]!)
  assert.equal(entry.reasonCode.length, 128)
})

test("logger rejects malformed engagement identifiers", () => {
  const { stdout } = captureLogger(() => {
    logger.info("test.engagement_id_shape", {
      engagementId: "alice@example.com",
      workspaceId: "ws_safe123",
    })
  })

  const entry = JSON.parse(stdout[0]!)
  assert.equal(entry.engagementId, undefined)
  assert.equal(entry.workspaceId, "ws_safe123")
})

test("logger reduces Error metadata to failure identity", () => {
  const error = Object.assign(new Error("raw databaseUrl should not appear"), {
    code: "P2002",
  })

  const { stderr } = captureLogger(() => {
    logger.error("test.error_identity", { category: error })
  })

  const entry = JSON.parse(stderr[0]!)
  assert.equal(entry.category, undefined)
  assert.equal(entry.errorName, "Error")
  assert.equal(entry.errorCode, "P2002")
  assert.equal(stderr[0]!.includes("raw databaseUrl"), false)
})

test("logger ignores circular, BigInt, Buffer, and throwing-getter metadata", () => {
  const circular: Record<string, unknown> = {}
  circular.self = circular
  const metadata = {
    count: 1n,
    category: circular,
    provider: Buffer.from("secret"),
    get route() {
      throw new Error("getter raw value")
    },
  }

  assert.doesNotThrow(() => {
    captureLogger(() => logger.info("test.non_throwing", metadata as never))
  })
})

test("request context overrides caller-supplied context fields", () => {
  const { stdout } = captureLogger(() => {
    withLogContext(
      {
        requestId: "req_contextWins1",
        workspaceId: "ws_context",
        actorId: "usr_context",
      },
      () =>
        logger.info("test.context_wins", {
          requestId: "req_callerLoses1",
          workspaceId: "ws_caller",
          actorId: "usr_caller",
        }),
    )
  })

  const entry = JSON.parse(stdout[0]!)
  assert.equal(entry.requestId, "req_contextWins1")
  assert.equal(entry.workspaceId, "ws_context")
  assert.equal(entry.actorId, "usr_context")
})

test("logger sink failures are swallowed", () => {
  const original = console.log
  console.log = () => {
    throw new Error("sink failed")
  }

  try {
    assert.doesNotThrow(() => logger.info("test.sink_failure"))
  } finally {
    console.log = original
  }
})

const captureLogger = (operation: () => void) => {
  const stdout: string[] = []
  const stderr: string[] = []
  const originals = {
    error: console.error,
    log: console.log,
  }

  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "))
  }
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "))
  }

  try {
    operation()
    return { stdout, stderr }
  } finally {
    Object.assign(console, originals)
  }
}
