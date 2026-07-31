import express from "express"
import cors from "cors"
import { toNodeHandler } from "better-auth/node"

import { auth } from "./lib/auth/better-auth.js"
import authRouter from "./routes/auth.js"
import engagementsRouter from "./routes/engagements.js"
import organizationsRouter from "./routes/organizations.js"
import portalRouter from "./routes/portal.js"

const app = express()
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
app.use("/portal", portalRouter)

export default app
