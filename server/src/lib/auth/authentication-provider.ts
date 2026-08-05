import { APIError } from "better-auth"

import { auth } from "./better-auth.js"
import { logger } from "../application-logger.js"
import { failureIdentity } from "../failure-identity.js"
import { prisma } from "../prisma.js"

import type { AuthenticatedIdentity } from "../../domain/access/access.js"
import type {
  AuthHeaders,
  AuthIdentityResult,
  AuthProviderError,
  AuthSessionResult,
  AuthenticationProvider,
  RequestCredentials,
} from "../../domain/access/ports.js"

// The `AuthenticationProvider` adapter: everything the rest of the application
// is allowed to know about how identity is proven (architecture.md §3, §7A.1).
//
// It translates between Better Auth's shapes and the port's plain data. The
// consulting side receives an `AuthenticatedIdentity` — and, when the identity
// belongs to a workspace, the `ActingUser` that every access decision is
// evaluated against. Passwords never cross this boundary.

export const authenticationProvider: AuthenticationProvider = {
  resolveIdentity: async (credentials) => {
    const session = await auth.api.getSession({
      headers: toHeaders(credentials),
    })

    if (!session?.user) return null

    return resolveWorkspaceMembership({
      authUserId: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
    })
  },

  registerIdentity: async ({ email, name, password }) => {
    try {
      const { headers, response } = await auth.api.signUpEmail({
        body: { email, name, password },
        returnHeaders: true,
      })

      return {
        success: true,
        authUserId: response.user.id,
        setHeaders: toSetHeaders(headers),
      } satisfies AuthIdentityResult
    } catch (error) {
      return { success: false, error: toProviderError(error) }
    }
  },

  startSession: async ({ email, password }) => {
    try {
      const { headers, response } = await auth.api.signInEmail({
        body: { email, password },
        returnHeaders: true,
      })

      return {
        success: true,
        authUserId: response.user.id,
        setHeaders: toSetHeaders(headers),
      } satisfies AuthSessionResult
    } catch (error) {
      return { success: false, error: toProviderError(error) }
    }
  },

  endSession: async (credentials) => {
    const { headers } = await auth.api.signOut({
      headers: toHeaders(credentials),
      returnHeaders: true,
    })

    return toSetHeaders(headers)
  },

  sendVerification: async ({ email }) => {
    await auth.api.sendVerificationEmail({ body: { email } })
  },

  // Confirming an address without an email round-trip is only ever correct
  // where confirmation is already established: the bootstrap secret, and an
  // invitation link that was itself delivered to that address. It writes the
  // provider's own table from inside the provider's adapter, so the consulting
  // side still has no path to authentication state.
  confirmEmail: async ({ authUserId }) => {
    await prisma.authUser.update({
      where: { id: authUserId },
      data: { emailVerified: true },
    })
  },

  resolveIdentityByEmail: async (email) => {
    const authUser = await prisma.authUser.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, emailVerified: true },
    })

    if (!authUser) return null

    return {
      authUserId: authUser.id,
      email: authUser.email,
      name: authUser.name,
      emailVerified: authUser.emailVerified,
    }
  },

  countIdentities: async () => prisma.authUser.count(),
}

// Join an authentication identity to its workspace membership. A verified
// identity with no membership is authenticated and reaches nothing — the state
// of a self-registered client before a consultant associates them with an
// engagement's Discovery.
export const resolveWorkspaceMembership = async (identity: {
  authUserId: string
  email: string
  emailVerified: boolean
}): Promise<AuthenticatedIdentity> => {
  const membership = await prisma.user.findUnique({
    where: { authUserId: identity.authUserId },
    select: {
      id: true,
      workspaceId: true,
      role: true,
      email: true,
      displayName: true,
    },
  })

  return {
    authUserId: identity.authUserId,
    email: identity.email,
    emailVerified: identity.emailVerified,
    actingUser: membership,
  }
}

const toHeaders = (credentials: RequestCredentials): Headers => {
  const headers = new Headers()

  for (const [name, value] of Object.entries(credentials.headers)) {
    if (value !== undefined) headers.set(name, value)
  }

  return headers
}

// The provider's response headers, as the plain pairs the port promises. Only
// `set-cookie` can legitimately repeat, so it is collected separately.
const toSetHeaders = (headers: Headers): AuthHeaders => {
  const cookies = headers.getSetCookie()

  return cookies.map((cookie) => ["set-cookie", cookie] as const)
}

const PROVIDER_ERROR_BY_CODE: Record<string, AuthProviderError> = {
  USER_ALREADY_EXISTS: "email_already_registered",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "email_already_registered",
  EMAIL_NOT_VERIFIED: "email_not_verified",
  PASSWORD_TOO_SHORT: "password_too_weak",
  PASSWORD_TOO_LONG: "password_too_weak",
  INVALID_EMAIL_OR_PASSWORD: "invalid_credentials",
  INVALID_PASSWORD: "invalid_credentials",
  INVALID_EMAIL: "invalid_credentials",
  USER_NOT_FOUND: "invalid_credentials",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "invalid_credentials",
}

const toProviderError = (error: unknown): AuthProviderError => {
  if (error instanceof APIError) {
    const code = (error.body as { code?: string } | undefined)?.code
    const mapped = code ? PROVIDER_ERROR_BY_CODE[code] : undefined
    if (mapped) return mapped

    // An unrecognized 4xx is still the caller's problem, not an outage; only a
    // 5xx means the provider itself failed.
    return error.statusCode >= 500 ? "provider_unavailable" : "invalid_credentials"
  }

  // Never the error object. Every call into this adapter carries an email
  // address and a password, and a thrown provider error routinely arrives with
  // the failing request attached — body, headers, cookies and all. Only the
  // error's class and machine code are reported (`failure-identity.ts`), which
  // is what distinguishes "the database is unreachable" from "the SDK threw"
  // without putting a credential in a log line.
  logger.error("AUTH_PROVIDER_FAILED", failureIdentity(error))
  return "provider_unavailable"
}
