import assert from "node:assert/strict"
import { test } from "node:test"
import express from "express"

import { createHealthRouter } from "./health.js"
import { createTransportSecurity } from "../lib/transport-security.js"

import type { DatabaseProbe } from "../lib/database-readiness.js"

// The probes are driven through a real Express app, because half of what is
// being asserted is about *mounting* — that they answer before authentication,
// before CORS, and before HTTPS enforcement.

const answering: DatabaseProbe = { $queryRaw: async () => [{ ok: 1 }] }

class ConnectionRefused extends Error {
  override readonly name = "PrismaClientInitializationError"
  readonly code = "ECONNREFUSED"
  readonly meta = {
    connectionString: "postgresql://user:hunter2@db.internal:5432/app",
  }
}

const refusing: DatabaseProbe = {
  $queryRaw: async () => {
    throw new ConnectionRefused()
  },
}

const withServer = async (
  configure: (app: express.Express) => void,
  run: (baseUrl: string) => Promise<void>,
) => {
  const app = express()
  configure(app)
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

test("liveness answers without touching the database", async () => {
  // A client that would throw if it were consulted at all. Liveness must never
  // depend on the database: restarting a healthy process because its database
  // blinked turns a recoverable outage into a restart loop.
  const forbidden: DatabaseProbe = {
    $queryRaw: async () => {
      throw new Error("liveness must not query the database")
    },
  }

  await withServer(
    (app) => app.use("/health", createHealthRouter(forbidden)),
    async (baseUrl) => {
      for (const path of ["/health", "/health/live"]) {
        const response = await fetch(`${baseUrl}${path}`)
        assert.equal(response.status, 200, path)
        assert.deepEqual(await response.json(), {
          status: true,
          message: "health.live",
        })
      }
    },
  )
})

test("readiness is 200 when the database answers", async () => {
  await withServer(
    (app) => app.use("/health", createHealthRouter(answering)),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health/ready`)

      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), {
        status: true,
        message: "health.ready",
      })
    },
  )
})

test("readiness is 503 when the database is unavailable", async () => {
  await withServer(
    (app) => app.use("/health", createHealthRouter(refusing)),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health/ready`)

      assert.equal(response.status, 503)
      assert.deepEqual(await response.json(), {
        status: false,
        message: "health.not_ready",
      })
    },
  )
})

test("a readiness failure discloses nothing about the database", async () => {
  await withServer(
    (app) => app.use("/health", createHealthRouter(refusing)),
    async (baseUrl) => {
      const body = await (await fetch(`${baseUrl}/health/ready`)).text()

      // Not the host, the credentials, the driver, the error class, or its
      // machine code. An unauthenticated caller learns only that the service is
      // not currently serving — which they would learn from any request anyway.
      for (const forbidden of [
        "hunter2",
        "db.internal",
        "postgresql",
        "Prisma",
        "ECONNREFUSED",
        "5432",
      ]) {
        assert.equal(
          body.includes(forbidden),
          false,
          `readiness body disclosed ${forbidden}`,
        )
      }
    },
  )
})

test("no probe requires authentication", async () => {
  await withServer(
    (app) => {
      app.use("/health", createHealthRouter(answering))
      // Everything after the probes refuses an anonymous caller. The probes are
      // mounted first, so this never runs for them.
      app.use((_req, res) =>
        res.status(401).json({ status: false, message: "auth.error.unauthenticated" }),
      )
    },
    async (baseUrl) => {
      for (const path of ["/health", "/health/live", "/health/ready"]) {
        assert.notEqual(
          (await fetch(`${baseUrl}${path}`)).status,
          401,
          `${path} required authentication`,
        )
      }
      assert.equal((await fetch(`${baseUrl}/engagements`)).status, 401)
    },
  )
})

test("probes answer over plain HTTP while HTTPS enforcement is on", async () => {
  // The deployment blocker this pairing exists to prevent: a platform's probe
  // arrives over plain HTTP inside the provider's network, HTTPS enforcement
  // refused it with 403, and the deployment could never report healthy.
  await withServer(
    (app) => {
      app.use("/health", createHealthRouter(answering))
      app.use(createTransportSecurity({ requireHttps: true, trustProxy: true }))
      app.get("/engagements", (_req, res) => res.json({ status: true }))
    },
    async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/health/live`)).status, 200)
      assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 200)

      // An ordinary request over the same plain transport is still refused.
      assert.equal((await fetch(`${baseUrl}/engagements`)).status, 403)
    },
  )
})

test("readiness still reports 503 rather than 403 behind HTTPS enforcement", async () => {
  // The exemption must not turn a real readiness failure into a transport one.
  await withServer(
    (app) => {
      app.use("/health", createHealthRouter(refusing))
      app.use(createTransportSecurity({ requireHttps: true, trustProxy: true }))
    },
    async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 503)
    },
  )
})
