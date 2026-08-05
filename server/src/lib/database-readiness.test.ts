import assert from "node:assert/strict"
import { test } from "node:test"

import {
  probeDatabase,
  requireDatabaseReady,
  type DatabaseProbe,
} from "./database-readiness.js"

// A client that answers, one that refuses, one that never replies.
const answering = (): DatabaseProbe => ({
  $queryRaw: async () => [{ "?column?": 1 }],
})

const refusing = (error: unknown): DatabaseProbe => ({
  $queryRaw: async () => {
    throw error
  },
})

const hanging = (): DatabaseProbe => ({
  $queryRaw: () => new Promise(() => {}),
})

class ConnectionRefused extends Error {
  override readonly name = "PrismaClientInitializationError"
  readonly code = "ECONNREFUSED"
  // What a driver actually attaches, and what must never escape.
  readonly meta = {
    connectionString: "postgresql://user:hunter2@db.internal:5432/app",
  }
}

test("a database that answers is ready", async () => {
  assert.deepEqual(await probeDatabase(answering()), { ready: true })
  assert.equal(await requireDatabaseReady(answering()), true)
})

test("a database that refuses the connection is not ready", async () => {
  const readiness = await probeDatabase(refusing(new ConnectionRefused()))

  assert.equal(readiness.ready, false)
  if (readiness.ready) return
  assert.equal(readiness.errorName, "PrismaClientInitializationError")
  assert.equal(readiness.errorCode, "ECONNREFUSED")

  assert.equal(await requireDatabaseReady(refusing(new ConnectionRefused())), false)
})

test("a database that never answers is not ready, rather than hanging startup", async () => {
  // Without the bound, an unreachable host that neither refuses nor replies
  // leaves startup blocked until the platform's own deploy timeout notices.
  const readiness = await probeDatabase(hanging(), 20)

  assert.equal(readiness.ready, false)
  if (readiness.ready) return
  assert.equal(readiness.errorName, "DatabaseProbeTimeout")
  assert.equal(readiness.errorCode, "ETIMEDOUT")
})

test("readiness reports identifiers only — never the connection string", async () => {
  const readiness = await probeDatabase(refusing(new ConnectionRefused()))

  const serialized = JSON.stringify(readiness)
  assert.equal(serialized.includes("hunter2"), false)
  assert.equal(serialized.includes("db.internal"), false)
  assert.equal(serialized.includes("postgresql://"), false)
})

test("an error carrying prose contributes no prose", async () => {
  // `failureIdentity` admits a name and a code only if they *look* like
  // identifiers, so a driver that puts a sentence in either contributes
  // nothing rather than leaking it.
  const talkative = Object.assign(new Error("could not connect to db.internal"), {
    name: "connection to server at 10.0.0.5 failed",
    code: "the password authentication failed for user ai_user",
  })

  const readiness = await probeDatabase(refusing(talkative))

  assert.equal(readiness.ready, false)
  if (readiness.ready) return
  assert.equal(readiness.errorName, "unrecognized")
  assert.equal(readiness.errorCode, null)
})

test("a non-Error rejection is still reported safely", async () => {
  const readiness = await probeDatabase(refusing("a bare string rejection"))

  assert.equal(readiness.ready, false)
  if (readiness.ready) return
  assert.equal(readiness.errorName, "string")
  assert.equal(readiness.errorCode, null)
})
