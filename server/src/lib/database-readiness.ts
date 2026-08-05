import { logger } from "./application-logger.js"
import { failureIdentity } from "./failure-identity.js"

// Whether the database is actually reachable and answering.
//
// **Why this is not `prisma.$connect()`.** With the `@prisma/adapter-pg` driver
// adapter, `$connect()` resolves without opening a connection — it resolves
// against a refused port, and it resolves against a wrong password. The startup
// check that used it therefore logged `database.connected` when nothing was
// connected, and its failure branch — the one that exits the process — could
// never run. A deployment with a mistyped `DATABASE_URL` started, listened,
// answered its health check, and failed every real request (audit finding 1.1).
//
// A query is the only thing that proves a database. `SELECT 1` is the smallest
// one that does: it takes no locks, reads no table, needs no schema, and cannot
// be satisfied by anything other than an authenticated, connected session
// against a live server.
//
// **Nothing the database says is ever logged.** A connection failure arrives
// carrying the connection string it failed on, password included; a query
// failure arrives carrying the statement and its parameters. Only the error's
// class and machine code survive (`failure-identity.ts`).

export type DatabaseProbe = {
  $queryRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>
}

export type DatabaseReadiness =
  | { ready: true }
  | { ready: false; errorName: string; errorCode: string | null }

// The shared client, resolved on first use rather than at import.
//
// `prisma.ts` throws at import time when `DATABASE_URL` is absent — correctly,
// and that refusal stays. But it means importing it eagerly here would make
// *this* module unimportable without a database, including from a test that
// supplies its own client and from the health router that only ever probes one
// it was handed. Deferring the import keeps the refusal exactly where it
// belongs, on the path that actually needs a connection.
const defaultClient = async (): Promise<DatabaseProbe> =>
  (await import("./prisma.js")).prisma

// The probe itself. Takes the client as a parameter so readiness can be tested
// against a stub that answers, one that throws, and one that never resolves.
export const probeDatabase = async (
  client?: DatabaseProbe,
  timeoutMs: number = DATABASE_PROBE_TIMEOUT_MS,
): Promise<DatabaseReadiness> => {
  try {
    const database = client ?? (await defaultClient())
    await withTimeout(database.$queryRaw`SELECT 1`, timeoutMs)
    return { ready: true }
  } catch (error) {
    return { ready: false, ...failureIdentity(error) }
  }
}

// The startup gate. Returns whether the process may proceed to listen.
//
// `database.connected` is emitted **only** after a query has actually
// succeeded, so the line means what it says.
export const requireDatabaseReady = async (
  client?: DatabaseProbe,
  timeoutMs: number = DATABASE_PROBE_TIMEOUT_MS,
): Promise<boolean> => {
  const readiness = await probeDatabase(client, timeoutMs)

  if (readiness.ready) {
    logger.info("database.connected")
    return true
  }

  logger.error("DATABASE_CONNECTION_FAILED", {
    errorName: readiness.errorName,
    errorCode: readiness.errorCode,
  })
  return false
}

// A probe that hangs is a probe that failed. Without this, an unreachable host
// that neither refuses nor answers leaves startup blocked forever and the
// platform's own deploy timeout becomes the only thing that notices.
export const DATABASE_PROBE_TIMEOUT_MS = 5_000

class DatabaseProbeTimeout extends Error {
  override readonly name = "DatabaseProbeTimeout"
  readonly code = "ETIMEDOUT"
}

const withTimeout = async <T>(work: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new DatabaseProbeTimeout()), timeoutMs)
        // The timer must never be the reason the process stays alive.
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
