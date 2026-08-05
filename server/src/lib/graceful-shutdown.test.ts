import assert from "node:assert/strict"
import { test } from "node:test"

import {
  installGracefulShutdown,
  shutdown,
  type ShutdownSignal,
} from "./graceful-shutdown.js"

// Nothing here touches the real process. `terminate`, the signal target, and
// the clock are all injected, so the whole sequence — including the timeout
// branch — runs without killing the test runner or spending real seconds.

type Listener = () => void

const fakeTarget = () => {
  const listeners = new Map<ShutdownSignal, Listener[]>()

  return {
    on(event: ShutdownSignal, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
      return this
    },
    emit(event: ShutdownSignal) {
      for (const listener of listeners.get(event) ?? []) listener()
    },
    count(event: ShutdownSignal) {
      return (listeners.get(event) ?? []).length
    },
  }
}

const fakeServer = (options: { closes?: boolean; error?: Error } = {}) => {
  const calls: string[] = []
  let release: (() => void) | null = null

  return {
    calls,
    // Let a "still draining" server finish, for the tests that want it to.
    finish: () => release?.(),
    close(callback?: (error?: Error) => void) {
      calls.push("close")
      if (options.closes === false) {
        release = () => callback?.(options.error)
        return this
      }
      callback?.(options.error)
      return this
    },
    closeIdleConnections() {
      calls.push("closeIdleConnections")
    },
    closeAllConnections() {
      calls.push("closeAllConnections")
    },
  }
}

const immediately = async () => {}
const never = () => new Promise<void>(() => {})

test("a clean shutdown closes, drains, disconnects, and exits zero", async () => {
  const server = fakeServer()
  const order: string[] = []
  const exits: number[] = []

  const code = await shutdown("SIGTERM", {
    server,
    disconnect: async () => {
      order.push("disconnect")
    },
    terminate: (value) => {
      exits.push(value)
    },
    wait: never,
  })

  // The sequence, in the order the platform needs it: stop accepting, release
  // idle sockets, then return the pool.
  assert.deepEqual(server.calls, ["close", "closeIdleConnections"])
  assert.deepEqual(order, ["disconnect"])
  assert.equal(code, 0)
  assert.deepEqual(exits, [0])
})

test("the grace period is bounded, and expiring is visible in the exit code", async () => {
  // A request that never finishes must not hold the process open until the
  // platform kills it — that is the ungraceful shutdown this exists to avoid.
  const server = fakeServer({ closes: false })
  const exits: number[] = []

  const code = await shutdown("SIGTERM", {
    server,
    disconnect: immediately,
    terminate: (value) => {
      exits.push(value)
    },
    // The clock, so the bound is proven without waiting for it.
    wait: immediately,
  })

  assert.ok(server.calls.includes("closeAllConnections"), "sockets were not forced closed")
  assert.equal(code, 1)
  assert.deepEqual(exits, [1])
})

test("the database is disconnected even when the grace period expires", async () => {
  const disconnected: string[] = []

  await shutdown("SIGTERM", {
    server: fakeServer({ closes: false }),
    disconnect: async () => {
      disconnected.push("disconnect")
    },
    terminate: () => {},
    wait: immediately,
  })

  assert.deepEqual(disconnected, ["disconnect"])
})

test("a failed disconnect does not turn a clean shutdown into a failed one", async () => {
  // The connection is going away with the process either way; reporting a
  // clean stop as failed would be the wrong signal to a deploy pipeline.
  const code = await shutdown("SIGINT", {
    server: fakeServer(),
    disconnect: async () => {
      throw new Error("pool already closed")
    },
    terminate: () => {},
    wait: never,
  })

  assert.equal(code, 0)
})

test("a server that reports a close error still completes the sequence", async () => {
  const disconnected: string[] = []

  const code = await shutdown("SIGTERM", {
    server: fakeServer({ error: new Error("Server is not running.") }),
    disconnect: async () => {
      disconnected.push("disconnect")
    },
    terminate: () => {},
    wait: never,
  })

  assert.deepEqual(disconnected, ["disconnect"])
  assert.equal(code, 0)
})

// --- Installation -----------------------------------------------------------

test("handlers are installed once per target", () => {
  const target = fakeTarget()
  const options = {
    server: fakeServer(),
    disconnect: immediately,
    terminate: () => {},
    wait: never,
    target,
  }

  assert.equal(installGracefulShutdown(options), true)
  // A second registration would run the whole sequence twice on one signal and
  // race itself to the exit.
  assert.equal(installGracefulShutdown(options), false)

  assert.equal(target.count("SIGTERM"), 1)
  assert.equal(target.count("SIGINT"), 1)
})

test("both SIGTERM and SIGINT start the sequence", async () => {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    const target = fakeTarget()
    const server = fakeServer()

    installGracefulShutdown({
      server,
      disconnect: immediately,
      terminate: () => {},
      wait: never,
      target,
    })

    target.emit(signal)
    // The handler starts the sequence without awaiting it; one turn of the
    // microtask queue is enough for `close` to have been called.
    await Promise.resolve()

    assert.ok(server.calls.includes("close"), `${signal} did not close the server`)
  }
})

test("a second signal during shutdown is ignored", async () => {
  const target = fakeTarget()
  const server = fakeServer({ closes: false })

  installGracefulShutdown({
    server,
    disconnect: immediately,
    terminate: () => {},
    wait: never,
    target,
  })

  target.emit("SIGTERM")
  target.emit("SIGTERM")
  target.emit("SIGINT")
  await Promise.resolve()

  // A platform that signals twice is impatient, not confused. Restarting would
  // close an already-closing server and double-disconnect the pool.
  assert.equal(server.calls.filter((call) => call === "close").length, 1)
})
