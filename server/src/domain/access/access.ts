import type {
  DiscoveryAccessStatus,
  UserRole,
} from "../../../../shared/access.schema.js"

// The access side of the domain (domain-model.md §3A; architecture.md §4.2a,
// §7A.2). This module is the *single* place the access rules live: which role
// reaches which engagement, what makes Discovery Access valid, and how a
// refusal is disclosed. Routes and services ask `decideAccess`; they do not
// re-implement a rule of their own — a route that invents its own rule is a
// defect (coding-standards.md §6A).
//
// It is pure: no HTTP, no Prisma, no provider. Every rule here is testable
// without infrastructure, which is what makes the isolation reviewable.

// Who is acting. Established once at the interface layer and passed inward; no
// inner layer re-derives it from the transport (coding-standards.md §6A).
export type ActingUser = {
  id: string
  workspaceId: string
  role: UserRole
  email: string
  displayName: string | null
}

// An authenticated identity that is not (yet) a member of any workspace — a
// self-registered client waiting to be associated with an engagement's
// Discovery. They are authenticated, and they reach nothing.
export type AuthenticatedIdentity = {
  authUserId: string
  email: string
  emailVerified: boolean
  actingUser: ActingUser | null
}

// The workspace-and-ownership scope every engagement-side repository operation
// requires. It is deliberately the same shape the policy decides against, so
// the reach a query is given and the reach the policy grants cannot drift
// apart (architecture.md §7A.4).
export type EngagementScope = {
  workspaceId: string
  userId: string
  role: UserRole
}

export const engagementScopeOf = (actingUser: ActingUser): EngagementScope => ({
  workspaceId: actingUser.workspaceId,
  userId: actingUser.id,
  role: actingUser.role,
})

// How far a role reaches into engagement-side rows, expressed as data so the
// repository can turn it into a query without re-deciding the rule. An
// Administrator reaches their whole workspace; a Manager reaches what they own;
// a Client reaches only the engagements their own active Discovery Access names.
//
// This is the same rule the AccessPolicy applies, in the form persistence
// needs — so a query can never be given more reach than the policy grants.
export type EngagementReach =
  | { kind: "whole_workspace"; workspaceId: string }
  | { kind: "owned_engagements"; workspaceId: string; owningManagerId: string }
  | { kind: "granted_discovery"; workspaceId: string; clientUserId: string }

export const engagementReach = (scope: EngagementScope): EngagementReach => {
  switch (scope.role) {
    case "ADMIN":
      return { kind: "whole_workspace", workspaceId: scope.workspaceId }
    case "MANAGER":
      return {
        kind: "owned_engagements",
        workspaceId: scope.workspaceId,
        owningManagerId: scope.userId,
      }
    case "CLIENT":
      return {
        kind: "granted_discovery",
        workspaceId: scope.workspaceId,
        clientUserId: scope.userId,
      }
  }
}

// What a caller wants to do. Deny-by-default: an action absent from this union
// cannot be authorized, so adding a route does not silently widen anyone's
// reach (architecture.md §7A.2).
export type AccessAction =
  // The consultant workbench, over engagement-side data.
  | "engagement.list"
  | "engagement.read"
  | "engagement.create"
  | "engagement.update"
  | "engagement.generate"
  | "discovery.save"
  | "discovery.submit"
  | "discovery.review"
  | "analysis_run.read"
  | "organization.read"
  | "organization.create"
  // Workspace administration.
  | "workspace.manage"
  | "invitation.issue"
  | "invitation.revoke"
  | "ownership.transfer"
  | "role.change"
  | "discovery_access.grant"
  | "discovery_access.revoke"
  // The Client Discovery Portal.
  | "portal.discovery.read"
  | "portal.discovery.save"
  | "portal.discovery.submit"

// What the action is aimed at. The kind decides how a refusal is disclosed: a
// refusal about a named resource must be indistinguishable from that resource
// not existing (architecture.md §7A.4).
export type AccessTarget =
  | { kind: "workspace" }
  | {
      kind: "engagement"
      workspaceId: string
      owningManagerId: string
    }
  | {
      kind: "discovery"
      engagementId: string
      workspaceId: string
      discoveryAccess: DiscoveryAccessFacts | null
    }

// The facts that make Discovery Access valid: it names one client and one
// engagement, in one workspace, and it is neither expired nor revoked
// (architecture.md §4.3, §7A.5). Validity is re-checked on every request, not
// only at acceptance.
export type DiscoveryAccessFacts = {
  workspaceId: string
  engagementId: string
  userId: string
  status: DiscoveryAccessStatus
  expiresAt: Date | null
}

export type AccessDenialReason =
  | "not_authenticated"
  | "no_workspace_membership"
  | "outside_workspace"
  | "role_not_permitted"
  | "not_engagement_owner"
  | "no_active_discovery_access"
  // The scoped repository yielded nothing, so the facts a decision needs do not
  // exist within the caller's reach. Deny by default: not knowing is a denial,
  // and the caller is deliberately not told which of "another workspace",
  // "another owner", or "no such engagement" it was.
  | "out_of_reach"

// How a refusal reaches the caller. `unauthenticated` and `forbidden` are
// distinct outcomes (coding-standards.md §7); `not_found` is what every refusal
// about a *named* resource collapses to, so responses cannot be used to
// enumerate another workspace's engagements.
export type AccessDisclosure = "unauthenticated" | "forbidden" | "not_found"

export type AccessDecision =
  | { permitted: true }
  | {
      permitted: false
      reason: AccessDenialReason
      disclosure: AccessDisclosure
    }

// Which roles may perform each action at all. This is the *role* step; the
// workspace step runs before it and the ownership/discovery-access step after.
const ROLES_PERMITTED: Record<AccessAction, readonly UserRole[]> = {
  "engagement.list": ["ADMIN", "MANAGER"],
  "engagement.read": ["ADMIN", "MANAGER"],
  "engagement.create": ["ADMIN", "MANAGER"],
  "engagement.update": ["ADMIN", "MANAGER"],
  "engagement.generate": ["ADMIN", "MANAGER"],
  "discovery.save": ["ADMIN", "MANAGER"],
  "discovery.submit": ["ADMIN", "MANAGER"],
  "discovery.review": ["ADMIN", "MANAGER"],
  "analysis_run.read": ["ADMIN", "MANAGER"],
  "organization.read": ["ADMIN", "MANAGER"],
  "organization.create": ["ADMIN", "MANAGER"],

  // Workspace administration is the Administrator's, without exception — a
  // Manager cannot widen their own reach (domain-model.md §3A.2).
  "workspace.manage": ["ADMIN"],
  "invitation.issue": ["ADMIN"],
  "invitation.revoke": ["ADMIN"],
  "ownership.transfer": ["ADMIN"],
  "role.change": ["ADMIN"],
  "discovery_access.grant": ["ADMIN", "MANAGER"],
  "discovery_access.revoke": ["ADMIN", "MANAGER"],

  // The portal is the Client's surface and nobody else's. A consultant reviews
  // discovery through the workbench, not by acting as the client.
  "portal.discovery.read": ["CLIENT"],
  "portal.discovery.save": ["CLIENT"],
  "portal.discovery.submit": ["CLIENT"],
}

// The one decision point, in the fixed documented order:
// workspace scope → role → engagement ownership (Manager) / discovery access
// (Client). A failure at any step is a denial (domain-model.md §3A.1).
export const decideAccess = (
  actingUser: ActingUser | null,
  action: AccessAction,
  target: AccessTarget,
): AccessDecision => {
  if (actingUser === null) {
    return denied("not_authenticated", "unauthenticated")
  }

  // 1. Workspace. Asked first, and asked before the role, so a cross-workspace
  //    request is refused on the boundary rather than on a role technicality.
  if (target.kind !== "workspace" && target.workspaceId !== actingUser.workspaceId) {
    return denied("outside_workspace", disclosureFor(target))
  }

  // 2. Role.
  if (!ROLES_PERMITTED[action].includes(actingUser.role)) {
    return denied("role_not_permitted", disclosureFor(target))
  }

  // 3. Ownership, for a Manager acting on one engagement. An Administrator
  //    reaches every engagement in their own workspace and no other.
  if (target.kind === "engagement") {
    if (
      actingUser.role === "MANAGER" &&
      target.owningManagerId !== actingUser.id
    ) {
      return denied("not_engagement_owner", "not_found")
    }

    return { permitted: true }
  }

  // 3'. Discovery Access, for a Client in the portal. Access must name this
  //     client and this engagement, and must still be valid.
  if (target.kind === "discovery") {
    if (!isDiscoveryAccessValid(target.discoveryAccess, actingUser, target)) {
      return denied("no_active_discovery_access", "not_found")
    }

    return { permitted: true }
  }

  return { permitted: true }
}

// Whether Discovery Access grants this client this engagement's discovery,
// right now. Expiry and revocation take effect immediately, on the next
// request (architecture.md §7A.5).
export const isDiscoveryAccessValid = (
  discoveryAccess: DiscoveryAccessFacts | null,
  actingUser: ActingUser,
  target: { engagementId: string; workspaceId: string },
  now: Date = new Date(),
): boolean => {
  if (discoveryAccess === null) return false
  if (discoveryAccess.status !== "active") return false
  if (discoveryAccess.userId !== actingUser.id) return false
  if (discoveryAccess.workspaceId !== actingUser.workspaceId) return false
  if (discoveryAccess.workspaceId !== target.workspaceId) return false
  if (discoveryAccess.engagementId !== target.engagementId) return false
  if (discoveryAccess.expiresAt !== null && discoveryAccess.expiresAt <= now) {
    return false
  }

  return true
}

// Which roles a staff invitation may create. Clients are never invited: they
// self-register and are then associated with one engagement's Discovery
// (roadmap Phase 3A "Authentication"; domain-model.md §3A.3).
export const isStaffRole = (role: UserRole): boolean =>
  role === "ADMIN" || role === "MANAGER"

// Who an engagement may be owned by. Every engagement has exactly one owning
// Manager, and ownership is what a Manager's access is measured against
// (architecture.md §4.3) — so a transfer to a client would leave the engagement
// owned by someone with no reach to it.
export const canOwnEngagement = (role: UserRole): boolean => isStaffRole(role)

// Who Discovery Access may name. It is the *client* grant and nothing else
// (domain-model.md §3A.2, §3A.3; architecture.md §7A.5): it exists to let one
// self-registered client fill in one engagement's Discovery form through the
// portal, and the portal's actions are permitted to the CLIENT role alone.
//
// Granting it to an Administrator or a Manager would be meaningless at best —
// their reach is decided by role and ownership, not by this record — and
// misleading at worst: the workspace's Discovery Access listing is a register
// of *which client is working on which engagement*, and a staff account in it
// makes that register untrue. An address that already belongs to staff is
// therefore refused, not silently upgraded, downgraded, or reused.
export const canReceiveDiscoveryAccess = (role: UserRole): boolean =>
  role === "CLIENT"

// The denial for a resource the caller's scope did not yield. It is stated here
// rather than assembled by the caller so every refusal has one shape, and so no
// enforcement path can accidentally produce a "denial" that is missing its
// disclosure.
export const deniedOutOfReach = (): AccessDecision => ({
  permitted: false,
  reason: "out_of_reach",
  disclosure: "not_found",
})

// A refusal about a named resource is disclosed exactly as a missing resource;
// a refusal about a workspace-level capability is disclosed as forbidden, which
// tells the caller nothing they did not already know about themselves.
const disclosureFor = (target: AccessTarget): AccessDisclosure =>
  target.kind === "workspace" ? "forbidden" : "not_found"

const denied = (
  reason: AccessDenialReason,
  disclosure: AccessDisclosure,
): AccessDecision => ({ permitted: false, reason, disclosure })
