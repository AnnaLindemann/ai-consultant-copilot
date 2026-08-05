import { logger } from "./application-logger.js"
import { failureIdentity } from "./failure-identity.js"

// Stopping deliberately (roadmap Phase 12 "Operational error handling …
// degradation behavior").
//
// A managed platform sends `SIGTERM` on every deploy, on every scale-down, and
// on every free-tier idle stop — which is to say, constantly. Without a handler
// the process dies where it stands: an in-flight report render is abandoned
// mid-request, a transaction is left for the database to roll back on socket
// close, and the consultant sees a connection reset rather than a result.
//
// The sequence is fixed and each step exists for a reason:
//
//  1. **Stop accepting new work.** `server.close()` stops the listener
//     immediately, so the platform's next request goes to another instance (or
//     is retried) rather than into a process that is about to disappear.
//  2. **Let in-flight requests finish**, bounded. Idle keep-alive sockets are
//     closed at once so they do not hold the shutdown open; sockets with a
//     request actually running are left alone until the grace period expires.
//  3. **Disconnect the database.** Returning the pool deliberately beats having
//     the server notice the sockets dropped.
//  4. **Exit.**
//
// And the bound matters as much as the sequence: a shutdown that waits forever
// for one stuck request is a deploy that hangs until the platform kills it,
// which is the ungraceful shutdown this exists to avoid. When the grace period
// expires the remaining sockets are destroyed and the process exits non-zero,
// so the truncation is visible rather than silent.
//
// **This is not the fail-fast path.** `uncaughtException` and
// `unhandledRejection` still exit immediately through
// `process-error-handlers.ts`: a process in an unknown state has nothing worth
// draining, and pausing to drain it would be running application code on top of
// a fault. Signals are orderly; faults are not.

export type ShutdownSignal = "SIGTERM" | "SIGINT"

type Terminate = (code: number) => never | void

type ClosableServer = {
  close: (callback?: (error?: Error) => void) => unknown
  closeIdleConnections?: () => void
  closeAllConnections?: () => void
}

type SignalTarget = {
  on(event: ShutdownSignal, listener: () => void): unknown
}

export type GracefulShutdownOptions = {
  server: ClosableServer
  // Returning the database pool. Injected rather than imported so the sequence
  // is testable without a database.
  disconnect: () => Promise<void>
  timeoutMs?: number
  terminate?: Terminate
  target?: SignalTarget
  // Waiting is done by the caller's clock, so a test does not spend real
  // seconds proving the bound holds.
  wait?: (ms: number) => Promise<void>
}

export const SHUTDOWN_GRACE_MS = 10_000

// Installed at most once per target, exactly as the fault handlers are. A
// second registration would run the whole sequence twice on one signal and race
// itself to the exit.
const installedTargets = new WeakSet<SignalTarget>()

export const installGracefulShutdown = (
  options: GracefulShutdownOptions,
): boolean => {
  const target = options.target ?? (process as unknown as SignalTarget)
  if (installedTargets.has(target)) return false

  let shuttingDown = false

  const onSignal = (signal: ShutdownSignal) => () => {
    // A platform that sends a second signal while the first is still draining
    // is impatient, not confused. Restarting the sequence would close an
    // already-closing server and double-disconnect the pool.
    if (shuttingDown) return
    shuttingDown = true

    void shutdown(signal, options)
  }

  target.on("SIGTERM", onSignal("SIGTERM"))
  target.on("SIGINT", onSignal("SIGINT"))
  installedTargets.add(target)
  return true
}

// The sequence itself, exported so a test can drive it directly and assert the
// order without going near a real signal.
export const shutdown = async (
  signal: ShutdownSignal,
  options: GracefulShutdownOptions,
): Promise<number> => {
  const {
    server,
    disconnect,
    timeoutMs = SHUTDOWN_GRACE_MS,
    terminate = process.exit,
    wait = delay,
  } = options

  logger.info("server.shutdown_started", { reasonCode: signal })

  // (1) and (2): stop listening, and release the sockets that are merely idle.
  const closed = closeServer(server)
  server.closeIdleConnections?.()

  const drained = await Promise.race([
    closed.then(() => true),
    wait(timeoutMs).then(() => false),
  ])

  if (!drained) {
    // The bound. Whatever is still running has had its grace period; holding
    // the process open past it only delays the platform's own kill.
    logger.warn("server.shutdown_timed_out", { latencyMs: timeoutMs })
    server.closeAllConnections?.()
  }

  // (3) Return the pool regardless of how (2) ended. A failure here is logged
  // as identifiers and does not change the exit code: the connection is going
  // away with the process either way, and reporting a clean shutdown as failed
  // would be the wrong signal to a deploy pipeline.
  try {
    await disconnect()
    logger.info("database.disconnected")
  } catch (error) {
    logger.error("DATABASE_DISCONNECT_FAILED", failureIdentity(error))
  }

  const code = drained ? 0 : 1
  logger.info("server.shutdown_complete", { reasonCode: signal, count: code })

  // (4)
  terminate(code)
  return code
}

const closeServer = (server: ClosableServer): Promise<void> =>
  new Promise((resolve) => {
    server.close((error) => {
      if (error) {
        // "Not running" is the only error `close` reports, and it means the
        // work of step (1) is already done.
        logger.warn("server.close_reported_error", failureIdentity(error))
      }
      resolve()
    })
  })

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    // The grace timer must never be the reason the process stays alive.
    timer.unref?.()
  })
