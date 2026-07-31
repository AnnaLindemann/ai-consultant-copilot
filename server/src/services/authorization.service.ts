import type { Response } from "express"

import {
  decideAccess,
  deniedOutOfReach,
  engagementScopeOf,
  type AccessAction,
  type AccessDecision,
  type AccessTarget,
  type ActingUser,
  type EngagementScope,
} from "../domain/access/access.js"
import { failureIdentity } from "../lib/failure-identity.js"
import {
  appendAuditTrail,
  getDiscoveryAccessForClient,
} from "../repositories/access.repository.js"
import { getEngagementById } from "../repositories/engagement.repository.js"

import type { EngagementWithOrganization } from "../repositories/engagement.repository.js"

// Where the AccessPolicy is *applied* (architecture.md §7A.2: "the policy is
// domain logic, its enforcement is application-layer"). Every route asks one of
// the three functions below before it loads or writes anything; no route makes
// an access decision of its own.
//
// Each denial appends a `denied_permission` entry to the append-only Audit
// Trail (architecture.md §7A.8) and is reported through `denyRequest`, which is
// uniform and non-revealing.

// A denial always carries its disclosure, so a refusal can never reach the
// boundary without a way to be reported.
export type AccessDenial = Extract<AccessDecision, { permitted: false }>

export type AuthorizationOutcome<TResource> =
  | { permitted: true; resource: TResource; scope: EngagementScope }
  | { permitted: false; decision: AccessDenial }

// What a refusal knows about the engagement it was aimed at, kept as two
// separate facts because they are two separate facts.
//
// `requestedEngagementId` is whatever the caller named — an identifier from a
// URL, which may belong to another workspace, to a colleague, or to nothing at
// all. It is the thing an investigation actually wants to see, and it is
// **never** written to the relational column: `AuditTrail.engagementId` is a
// foreign key, so an identifier that does not resolve would be rejected by the
// database and the denial would go unrecorded — the one outcome an append-only
// access log may not have (architecture.md §7A.8).
//
// `loadedEngagementId` is set only where the row was actually read back through
// the scoped repository, which is the only state in which the foreign key is
// known to hold.
type DenialContext = {
  requestedEngagementId?: string
  loadedEngagementId?: string
}

// A workspace-level capability: managing users, roles, invitations, ownership,
// or reading the workspace's own audit trail.
export const authorizeWorkspaceAction = async (
  actingUser: ActingUser | null,
  action: AccessAction,
): Promise<AuthorizationOutcome<null>> => {
  const target: AccessTarget = { kind: "workspace" }
  const decision = decideAccess(actingUser, action, target)

  if (!decision.permitted) {
    return deny(actingUser, action, decision, {})
  }

  return { permitted: true, resource: null, scope: engagementScopeOf(actingUser!) }
}

// An action on one engagement, through the workbench. The engagement is loaded
// through the scoped repository first, so a request for an engagement outside
// the caller's reach cannot even produce the facts a decision would need — and
// is then refused exactly as a missing engagement is.
export const authorizeEngagementAction = async (
  actingUser: ActingUser | null,
  action: AccessAction,
  engagementId: string,
): Promise<AuthorizationOutcome<EngagementWithOrganization>> => {
  if (!actingUser) {
    return deny(
      null,
      action,
      decideAccess(null, action, { kind: "workspace" }) as AccessDenial,
      {},
    )
  }

  const scope = engagementScopeOf(actingUser)
  const engagement = await getEngagementById(engagementId, scope)

  // Out of reach and nonexistent are the same answer, deliberately: the
  // repository's scope already refused it, and re-deciding on facts we were not
  // given would be guessing (architecture.md §7A.4).
  if (!engagement) {
    return deny(actingUser, action, deniedOutOfReach() as AccessDenial, {
      requestedEngagementId: engagementId,
    })
  }

  const decision = decideAccess(actingUser, action, {
    kind: "engagement",
    workspaceId: engagement.workspaceId,
    owningManagerId: engagement.owningManagerId,
  })

  if (!decision.permitted) {
    // The row was read back within this caller's reach, so the relation holds.
    return deny(actingUser, action, decision, {
      requestedEngagementId: engagementId,
      loadedEngagementId: engagement.id,
    })
  }

  return { permitted: true, resource: engagement, scope }
}

// A Client Discovery Portal action. Authorized as *client + valid Discovery
// Access + this engagement's discovery* — the portal's own rule, not the
// workbench's rule with a filter applied (architecture.md §7A.5).
export const authorizePortalDiscoveryAction = async (
  actingUser: ActingUser | null,
  action: AccessAction,
  engagementId: string,
): Promise<AuthorizationOutcome<EngagementWithOrganization>> => {
  if (!actingUser) {
    return deny(
      null,
      action,
      decideAccess(null, action, { kind: "workspace" }) as AccessDenial,
      {},
    )
  }

  const discoveryAccess = await getDiscoveryAccessForClient(
    { workspaceId: actingUser.workspaceId },
    engagementId,
    actingUser.id,
  )

  const decision = decideAccess(actingUser, action, {
    kind: "discovery",
    engagementId,
    workspaceId: actingUser.workspaceId,
    discoveryAccess,
  })

  if (!decision.permitted) {
    // Nothing was loaded: a portal refusal is decided from the Discovery Access
    // record alone, so the engagement the caller named is unverified.
    return deny(actingUser, action, decision, {
      requestedEngagementId: engagementId,
    })
  }

  // The access record is valid, so the engagement it names is loadable within
  // the client's reach. A missing row here means the engagement is gone; the
  // client is told the same thing either way.
  const scope = engagementScopeOf(actingUser)
  const engagement = await getEngagementById(engagementId, scope)

  if (!engagement) {
    return deny(actingUser, action, deniedOutOfReach() as AccessDenial, {
      requestedEngagementId: engagementId,
    })
  }

  return { permitted: true, resource: engagement, scope }
}

// Report a refusal. Unauthenticated and forbidden stay distinct outcomes, and
// every refusal about a named resource is reported as `not_found` with one
// fixed body, so responses cannot be used to discover whether an engagement
// exists, who owns it, or which workspace it is in (coding-standards.md §6A, §7).
export const denyRequest = (
  res: Response,
  outcome: { decision: AccessDenial },
) => {
  switch (outcome.decision.disclosure) {
    case "unauthenticated":
      return res
        .status(401)
        .json({ status: false, message: "auth.error.unauthenticated" })
    case "not_found":
      return res
        .status(404)
        .json({ status: false, message: "auth.error.not_found" })
    case "forbidden":
    default:
      // Deny by default, including for a disclosure this switch has not been
      // taught yet: a refusal must always produce a response.
      return res
        .status(403)
        .json({ status: false, message: "auth.error.forbidden" })
  }
}

const deny = async <TResource>(
  actingUser: ActingUser | null,
  action: AccessAction,
  decision: AccessDenial,
  context: DenialContext,
): Promise<AuthorizationOutcome<TResource>> => {
  await recordDeniedPermission(actingUser, action, decision, context)

  return { permitted: false, decision }
}

// A denial is a normal outcome, not a system fault — and every denial the
// architecture asks for is recorded (architecture.md §7A.8), including the ones
// aimed at an engagement in another workspace, a colleague's engagement, an
// engagement that does not exist, and an expired or revoked Discovery Access.
// Those four are exactly the attempts worth investigating, so "the identifier
// did not resolve, therefore nothing was written" would lose the entries that
// matter most.
//
// Two rules make that hold:
//
//  - **The attempted identifier travels in the payload, not in the relation.**
//    `engagementId` is a foreign key and carries only a row that was read back
//    within the caller's reach; `requestedEngagementId` carries what the caller
//    actually asked for, whatever it turned out to be. Referential integrity
//    and the attempted identifier are both kept, rather than traded off.
//  - **The audit never changes the answer.** The refusal has already been
//    decided; a failing insert may not turn it into a 500, and may not be
//    swallowed silently either (coding-standards.md §7). So a write that fails
//    is retried once without the relation — the payload alone is a complete
//    record — and a second failure is reported as a structured, secret-free log
//    line an operator can alert on.
const recordDeniedPermission = async (
  actingUser: ActingUser | null,
  action: AccessAction,
  decision: AccessDenial,
  context: DenialContext,
) => {
  // An entry belongs to a workspace, so an unauthenticated caller — or an
  // identity with no workspace membership yet — has no workspace to record it
  // against, and inventing one would put a fabricated entry in an append-only
  // log.
  if (!actingUser) return

  const entry = {
    workspaceId: actingUser.workspaceId,
    userId: actingUser.id,
    eventType: "denied_permission" as const,
    payload: {
      action,
      reason: decision.reason,
      role: actingUser.role,
      requestedEngagementId: context.requestedEngagementId ?? null,
    },
  }

  try {
    await appendAuditTrail({
      ...entry,
      engagementId: context.loadedEngagementId ?? null,
    })
    return
  } catch (error) {
    // Nothing is retried when there was no relation to drop: the second attempt
    // would be the first one again.
    if (!context.loadedEngagementId) {
      return reportAuditFailure(entry, error, false)
    }

    try {
      await appendAuditTrail({
        ...entry,
        engagementId: null,
        payload: { ...entry.payload, engagementRelationDropped: true },
      })
    } catch (retryError) {
      reportAuditFailure(entry, retryError, true)
    }
  }
}

// A lost audit entry is a governance failure, so it is reported as an event with
// a stable identifier rather than as a stack trace nobody alerts on. Only
// identifiers are logged — never the error object, whose attached state can
// carry the failing query and its parameters (see `failure-identity.ts`).
const reportAuditFailure = (
  entry: {
    workspaceId: string
    userId: string
    payload: { action: AccessAction; reason: string }
  },
  error: unknown,
  afterRetry: boolean,
) => {
  console.error("AUDIT_APPEND_FAILED", {
    eventType: "denied_permission",
    workspaceId: entry.workspaceId,
    userId: entry.userId,
    action: entry.payload.action,
    reason: entry.payload.reason,
    afterRetry,
    ...failureIdentity(error),
  })
}
