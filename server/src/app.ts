import express from "express"
import cors from "cors"
import { toNodeHandler } from "better-auth/node"

import { auth } from "./lib/auth/better-auth.js"
import {
  globalErrorHandler,
  requestContext,
  requestLifecycleLogger,
} from "./lib/http-observability.js"
import { transportSecurity } from "./lib/transport-security.js"
import authRouter from "./routes/auth.js"
import complianceRouter from "./routes/compliance.js"
import engagementsRouter from "./routes/engagements.js"
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

// Encryption in transit, where the deployment says it is served over HTTPS: an
// unencrypted request is refused rather than redirected, because a redirect
// would already have carried the session cookie over the clear channel.
app.use(transportSecurity)

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  }),
)

// The authentication provider's own endpoints, mounted before `express.json()`
// because Better Auth consumes the raw request itself. These carry the flows
// that are entirely the provider's: following an email-verification link,
// requesting and completing a password reset, and reading the raw session
// (architecture.md §7A.1).
app.all("/api/auth/*splat", toNodeHandler(auth))

app.use(express.json())

app.get("/health", (req, res) => {
  res.json({ status: true, message: "it is working" })
})

app.use("/auth", authRouter)
app.use("/organizations", organizationsRouter)
app.use("/engagements", engagementsRouter)
app.use("/knowledge", knowledgeRouter)
app.use("/technology", technologyRouter)
app.use("/portal", portalRouter)
app.use("/compliance", complianceRouter)

app.use(globalErrorHandler)

export default app
