import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"

import { prisma } from "../prisma.js"
import { emailDelivery } from "../email-delivery.js"
import { renderEmail } from "../email-templates.js"

// Better Auth — the runtime authentication provider behind
// `AuthenticationProvider` (architecture.md §7A.1). It owns password hashing
// and verification, sessions, email verification, and password reset. Nothing
// in this file is a consulting-domain decision: role, workspace membership,
// engagement ownership, and Discovery Access all live in the domain and are
// resolved from the identity this provider establishes.
//
// Its tables are the access/auth group (`AuthUser`, `AuthSession`,
// `AuthAccount`, `AuthVerification`), mapped by `modelName` below so they read
// as this repository's models while staying the provider's own storage.

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000"
const SERVER_BASE_URL = process.env.SERVER_BASE_URL ?? "http://localhost:8787"

// A development secret keeps `npm run dev` working from a bare checkout; a
// production process without a real secret is a misconfiguration, not a default
// to paper over.
const readAuthSecret = () => {
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  if (secret) return secret

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Sessions would be signed with a known development key.",
    )
  }

  return "development-only-better-auth-secret"
}

export const auth = betterAuth({
  secret: readAuthSecret(),
  baseURL: SERVER_BASE_URL,
  basePath: "/api/auth",
  trustedOrigins: [CLIENT_ORIGIN],

  database: prismaAdapter(prisma, { provider: "postgresql" }),

  // The access/auth table group.
  user: { modelName: "authUser" },
  session: { modelName: "authSession" },
  account: { modelName: "authAccount" },
  verification: { modelName: "authVerification" },

  emailAndPassword: {
    enabled: true,
    // Confirming the address is part of the documented self-registration
    // lifecycle, so an unconfirmed identity cannot obtain a session
    // (roadmap Phase 3A "Authentication").
    requireEmailVerification: true,
    minPasswordLength: 12,
    sendResetPassword: async ({ user, url }) => {
      await emailDelivery.send(
        renderEmail("password_reset", user.email, { resetUrl: url }),
      )
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await emailDelivery.send(
        renderEmail("email_verification", user.email, { verifyUrl: url }),
      )
    },
  },
})

export type BetterAuthInstance = typeof auth
