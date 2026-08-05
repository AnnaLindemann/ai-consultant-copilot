import type { Request, Response } from "express"

import { updateLogContext } from "./application-logger.js"
import { authenticationProvider } from "./auth/authentication-provider.js"

import type {
  ActingUser,
  AuthenticatedIdentity,
} from "../domain/access/access.js"
import type { AuthHeaders, RequestCredentials } from "../domain/access/ports.js"

// The interface layer's only job in access control: establish *who is acting*,
// once, and pass it inward (architecture.md §7A.1; coding-standards.md §6A).
// It makes no authorization decision — those all go through the AccessPolicy
// via `services/authorization.service.ts`.

declare global {
  namespace Express {
    interface Request {
      identity?: AuthenticatedIdentity
    }
  }
}

// Resolve the caller's identity, refusing an unauthenticated request as
// unauthenticated. Returns null once the refusal has been written.
export const requireIdentity = async (
  req: Request,
  res: Response,
): Promise<AuthenticatedIdentity | null> => {
  if (req.identity) return req.identity

  const identity = await authenticationProvider.resolveIdentity(
    requestCredentials(req),
  )

  if (!identity) {
    res.status(401).json({
      status: false,
      message: "auth.error.unauthenticated",
    })
    return null
  }

  req.identity = identity
  updateLogContext({
    actorId: identity.actingUser?.id,
    workspaceId: identity.actingUser?.workspaceId,
  })
  return identity
}

// Resolve the caller *and* their workspace membership. An authenticated
// identity that belongs to no workspace — a self-registered client not yet
// associated with an engagement's Discovery — reaches nothing, and is refused
// the same way an unauthenticated caller is so the response says nothing about
// which accounts exist in which workspace.
export const requireActingUser = async (
  req: Request,
  res: Response,
): Promise<ActingUser | null> => {
  const identity = await requireIdentity(req, res)
  if (!identity) return null

  if (!identity.actingUser) {
    res.status(401).json({
      status: false,
      message: "auth.error.unauthenticated",
    })
    return null
  }

  return identity.actingUser
}

export const requestCredentials = (req: Request): RequestCredentials => ({
  headers: {
    cookie: req.header("cookie"),
    authorization: req.header("authorization"),
    origin: req.header("origin"),
    referer: req.header("referer"),
    host: req.header("host"),
  },
})

// Apply the headers the authentication provider asked for — session cookies,
// chiefly. What they contain is the provider's business, not this layer's.
export const applyAuthHeaders = (res: Response, headers: AuthHeaders) => {
  for (const [name, value] of headers) {
    res.append(name, value)
  }
}
