import "dotenv/config"

import { requireValidEnvironment } from "./config/startup.js"
import { logger } from "./lib/application-logger.js"
import { installProcessErrorHandlers } from "./lib/process-error-handlers.js"

// Starting the process, in the one order that makes each failure visible where
// it happens (roadmap Phase 12 "Production deployment"; "Operational error
// handling").
//
// **The order is the design.** Every module below the entry point throws at
// *import* time when its own configuration is missing — `prisma.ts` on
// `DATABASE_URL`, `better-auth.ts` on the signing secret, `email-delivery.ts`
// on the Resend credentials. Each of those refusals is correct and stays. But
// imported eagerly they fire one at a time, in module-graph order, and they say
// nothing about the mistakes that do not throw: a `CLIENT_ORIGIN` still
// pointing at localhost, an `http://` base URL, HTTPS enforcement without a
// trusted proxy in front of it.
//
// So configuration is judged first, in full, by a module that imports nothing
// but the logger — and only then is the application imported. An operator gets
// every problem from one deploy attempt instead of one problem per attempt.
//
// Then, and only then:
//
//  1. **The database is proven**, with a query rather than a connection object.
//     `prisma.$connect()` resolves against a refused port and against a wrong
//     password with the driver adapter in use, so it proved nothing and the
//     failure branch beneath it could never run (audit finding 1.1).
//  2. **The listener opens.** Not before: a process that is listening is a
//     process the platform routes traffic to, and routing traffic to an
//     instance whose database is unreachable produces a service that looks
//     healthy and fails every request.
//  3. **Shutdown is armed**, so the next deploy drains rather than truncates.

async function startServer() {
  // (0) Configuration. Exits on failure, having reported every problem.
  const environment = requireValidEnvironment()
  if (!environment) return

  // Faults are fatal from here on. Installed before the application is imported
  // so a throw during module initialization is reported as identifiers rather
  // than as whatever the failing module attached to it.
  installProcessErrorHandlers()

  // Imported dynamically, after validation: these modules reach the database,
  // the authentication provider, and the mail vendor at import time.
  const [
    { default: app },
    { requireDatabaseReady },
    { prisma },
    { installGracefulShutdown },
  ] = await Promise.all([
    import("./app.js"),
    import("./lib/database-readiness.js"),
    import("./lib/prisma.js"),
    import("./lib/graceful-shutdown.js"),
  ])

  // (1) The database, proven by a query.
  if (!(await requireDatabaseReady())) {
    // The failure's class and code are already logged by the probe; nothing
    // about the connection string reaches this line.
    process.exit(1)
  }

  // (2) Accept traffic.
  const server = app.listen(environment.port, () => {
    logger.info("server.started", { port: environment.port })
  })

  // A listener that cannot bind — a port already in use — must stop the process
  // rather than leave it running and answering nothing.
  server.on("error", (error: NodeJS.ErrnoException) => {
    logger.error("SERVER_LISTEN_FAILED", {
      port: environment.port,
      errorName: error.name,
      errorCode: error.code ?? null,
    })
    process.exit(1)
  })

  // (3) Stop deliberately when the platform asks.
  installGracefulShutdown({
    server,
    disconnect: () => prisma.$disconnect(),
  })
}

void startServer()
