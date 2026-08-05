import express from "express"
import cors from "cors"
import { toNodeHandler } from "better-auth/node"

import { readClientOrigins } from "./config/environment.js"
import { JSON_BODY_LIMIT } from "./config/http.js"
import { auth } from "./lib/auth/better-auth.js"
import {
  globalErrorHandler,
  payloadTooLargeHandler,
  requestContext,
  requestLifecycleLogger,
} from "./lib/http-observability.js"
import { transportSecurity } from "./lib/transport-security.js"
import authRouter from "./routes/auth.js"
import complianceRouter from "./routes/compliance.js"
import engagementsRouter from "./routes/engagements.js"
import healthRouter from "./routes/health.js"
import knowledgeRouter from "./routes/knowledge.js"
import organizationsRouter from "./routes/organizations.js"
import portalRouter from "./routes/portal.js"
import technologyRouter from "./routes/technology.js"

const app = express()

// Behind a TLS-terminating proxy, `x-forwarded-proto` is what says whether the
// request reached the deployment over TLS — and Express only reads it when the
// deployment says the proxy is trusted. A client can otherwise claim to be
// secure by setting the header itself (roadmap Phase 10).
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", true)
}

app.use(requestContext)
app.use(requestLifecycleLogger)

// Liveness and readiness, mounted **before** transport security and before
// CORS.
//
// The order is the point. A managed platform's health probe originates inside
// the provider's network and arrives over plain HTTP; behind the HTTPS
// enforcement below it was refused with 403, so a correctly configured
// deployment could never report healthy and the deploy failed (audit blocker
// B3). Probes come first, ask nothing of the caller, and disclose nothing.
app.use("/health", healthRouter)

// Encryption in transit, where the deployment says it is served over HTTPS: an
// unencrypted request is refused rather than redirected, because a redirect
// would already have carried the session cookie over the clear channel.
app.use(transportSecurity)

// The exact origins this deployment serves, parsed once in `config/environment`
// so CORS and Better Auth's CSRF origin check can never disagree about what is
// trusted. A list, so a staging origin can be named deliberately — never a
// pattern, because a pattern would silently trust every Vercel preview build.
app.use(
  cors({
    origin: [...readClientOrigins()],
    credentials: true,
  }),
)

// The authentication provider's own endpoints, mounted before `express.json()`
// because Better Auth consumes the raw request itself. These carry the flows
// that are entirely the provider's: following an email-verification link,
// requesting and completing a password reset, and reading the raw session
// (architecture.md §7A.1).
app.all("/api/auth/*splat", toNodeHandler(auth))

// The request body limit is stated rather than inherited, and lives in
// `config/http.ts` so it can be read and asserted without constructing the
// application. Express's 100 kB default is under what a real Consultant Report
// or Roadmap save carries.
app.use(express.json({ limit: JSON_BODY_LIMIT }))

// A body that exceeded the limit is a refusal of *this request*, not an
// internal failure. Without this it reached the global handler and was reported
// as `server.error.internal`, which tells a consultant nothing and points an
// operator at the wrong thing entirely.
app.use(payloadTooLargeHandler)

app.use("/auth", authRouter)
app.use("/organizations", organizationsRouter)
app.use("/engagements", engagementsRouter)
app.use("/knowledge", knowledgeRouter)
app.use("/technology", technologyRouter)
app.use("/portal", portalRouter)
app.use("/compliance", complianceRouter)

app.use(globalErrorHandler)

export default app
