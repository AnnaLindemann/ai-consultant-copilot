#!/usr/bin/env node
import { spawn } from "node:child_process"
import { once } from "node:events"
import { access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

// `npm run smoke:production` — does the built artifact actually run?
//
// The audit found that nothing proved it did. `tsc` emitted output that nobody
// started, and the deployment's start command existed only in a runbook, so the
// first thing to discover a broken build path would have been a failed deploy
// (audit blocker B2).
//
// This starts the **compiled** server exactly as production starts it —
// `node dist/server/src/server.js` — waits for readiness, checks the probes,
// and stops it with SIGTERM so the graceful-shutdown path is exercised too.
//
// It needs a reachable database, because readiness is a real query. It needs no
// provider key, no mail vendor, and no network beyond the database: it never
// calls a model and never sends mail.
//
// Written in plain JavaScript, and outside `src/`, so that it is not itself
// compiled and cannot become part of what it is testing.

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const entryPoint = path.join(serverRoot, "dist", "server", "src", "server.js")

const PORT = Number(process.env.SMOKE_PORT ?? 8799)
const BASE_URL = `http://127.0.0.1:${PORT}`
const START_TIMEOUT_MS = 30_000
const STOP_TIMEOUT_MS = 15_000

const log = (message) => console.log(`[smoke] ${message}`)

// The same `server/.env` the compiled server loads through `dotenv/config`.
// Loaded here as well so the pre-flight checks below see the same
// configuration the child process will, rather than reporting a missing
// variable that is in fact configured. Absent — as it is on a hosting platform,
// where the environment is injected directly — this is simply a no-op.
try {
  process.loadEnvFile(path.join(serverRoot, ".env"))
} catch {
  // No local env file. Whatever the shell already exports is what is used.
}

const fail = (message) => {
  console.error(`[smoke] FAILED: ${message}`)
  process.exitCode = 1
}

const main = async () => {
  try {
    await access(entryPoint)
  } catch {
    fail(
      `no build at ${path.relative(serverRoot, entryPoint)}. Run \`npm run build\` first.`,
    )
    return
  }

  if (!process.env.DATABASE_URL) {
    fail(
      "DATABASE_URL is not set. Readiness is a real query, so the smoke test needs a reachable database.",
    )
    return
  }

  log(`starting ${path.relative(serverRoot, entryPoint)} on port ${PORT}`)

  const child = spawn(process.execPath, [entryPoint], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
      // Deliberately *not* production: production requires a real mail vendor,
      // a strong secret and a document key, and this test is about whether the
      // built artifact runs — not about whether this machine is a deployment.
      // The production refusals themselves are covered by
      // `src/config/environment.test.ts`.
      NODE_ENV: process.env.NODE_ENV === "production" ? "production" : "development",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  const output = []
  child.stdout.on("data", (chunk) => output.push(String(chunk)))
  child.stderr.on("data", (chunk) => output.push(String(chunk)))

  let exited = false
  child.on("exit", () => {
    exited = true
  })

  try {
    const started = await waitForReady(child, () => exited)
    if (!started) {
      fail("the server did not become ready")
      console.error(output.join(""))
      return
    }

    log("readiness reached")

    // The three probes, checked as a platform would check them.
    await expect("/health/live", 200, "liveness")
    await expect("/health/ready", 200, "readiness")
    await expect("/health", 200, "health alias")

    // An unauthenticated request must still be refused: the probes are open,
    // and nothing else is.
    await expect("/engagements", 401, "unauthenticated engagement read")

    // `database.connected` may only appear after a query has actually
    // succeeded. Before Phase 12 it was logged after a connection object that
    // never connected (audit finding 1.1).
    const logs = output.join("")
    if (!logs.includes('"event":"database.connected"')) {
      fail("the server did not log database.connected")
    }
    if (!logs.includes('"event":"server.started"')) {
      fail("the server did not log server.started")
    }
  } finally {
    await stop(child)
  }

  if (process.exitCode) return

  const logs = output.join("")
  // The graceful path, exercised by the SIGTERM above.
  if (!logs.includes('"event":"server.shutdown_complete"')) {
    fail("the server did not shut down gracefully on SIGTERM")
    console.error(logs)
    return
  }

  log("shutdown was graceful")
  log("OK — the built artifact starts, serves, and stops cleanly")
}

const waitForReady = async (child, hasExited) => {
  const deadline = Date.now() + START_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (hasExited()) return false

    try {
      const response = await fetch(`${BASE_URL}/health/ready`)
      if (response.status === 200) return true
    } catch {
      // Not listening yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  return false
}

const expect = async (pathname, status, description) => {
  const response = await fetch(`${BASE_URL}${pathname}`)

  if (response.status !== status) {
    fail(`${description}: expected ${status} from ${pathname}, got ${response.status}`)
    return
  }

  log(`${description}: ${status}`)
}

const stop = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return

  log("sending SIGTERM")
  child.kill("SIGTERM")

  const timer = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS)
  try {
    await once(child, "exit")
  } finally {
    clearTimeout(timer)
  }
}

await main()
