import { Router } from "express"

import { probeDatabase, type DatabaseProbe } from "../lib/database-readiness.js"

// Liveness and readiness (roadmap Phase 12 "Monitoring and operational
// observability").
//
// Two endpoints, because they answer two different questions and a platform
// does two different things with the answers:
//
//  - **`/health/live` — is this process running?** It touches nothing. A
//    failure means the process is wedged and should be restarted. It must never
//    depend on the database: restarting a healthy process because its database
//    is briefly unavailable turns a recoverable outage into a restart loop.
//  - **`/health/ready` — can this process serve requests?** It runs the same
//    `SELECT 1` the startup gate runs. A failure means take it out of rotation;
//    it does not mean kill it.
//
// `/health` is kept as an alias of liveness, because it is the path the README,
// the API table, and any existing configuration already name.
//
// **Three properties hold for all three.**
//
//  - **Unauthenticated.** A probe has no session. They are mounted before the
//    authentication surface and ask nothing of the caller.
//  - **They disclose nothing.** No database name, host, latency, driver,
//    version, environment, or error text. A readiness failure is the single
//    identifier `health.not_ready` — enough for an operator to correlate with
//    the server's own logs, and useless to anyone else. This is why readiness
//    is safe to leave open: an unauthenticated caller learns only that the
//    service is or is not currently serving, which they would learn from any
//    request anyway.
//  - **They are reachable when HTTPS enforcement is on.** They are mounted
//    ahead of the transport-security middleware in `app.ts`, so a platform
//    probe that arrives over plain HTTP inside the private network is answered
//    rather than refused. That refusal is exactly what would otherwise stop a
//    deployment from ever becoming healthy (audit blocker B3).

export const HEALTH_PATH_PREFIX = "/health"

export const createHealthRouter = (client?: DatabaseProbe): Router => {
  const router = Router()

  const live = (_request: unknown, response: import("express").Response) =>
    response.json({ status: true, message: "health.live" })

  router.get("/", live)
  router.get("/live", live)

  router.get("/ready", async (_request, response) => {
    const readiness = await probeDatabase(client)

    if (!readiness.ready) {
      // The failure's class and code are already on the server's own log line
      // from the probe; the response carries neither.
      return response
        .status(503)
        .json({ status: false, message: "health.not_ready" })
    }

    return response.json({ status: true, message: "health.ready" })
  })

  return router
}

export default createHealthRouter()
