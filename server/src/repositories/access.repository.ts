import type { Prisma } from "@prisma/client"

import { getCurrentRequestId } from "../lib/application-logger.js"
import { prisma } from "../lib/prisma.js"

import type {
  AuditEventType,
  NotificationKind,
  StaffRole,
  UserRole,
} from "../../../shared/access.schema.js"

// Persistence for the access and collaboration side (architecture.md §3, §6).
//
// Every operation here takes the acting user's workspace as a **required**
// parameter, never an optional filter: an unscoped access-side read or write is
// a review-blocking defect, not a performance note (coding-standards.md §6A).
// The only deliberate exceptions are the two lookups that *establish* scope
// rather than work inside it — resolving a workspace during bootstrap, and
// resolving an authentication identity's membership — and they are named so
// that is obvious.

export type WorkspaceScope = { workspaceId: string }

// --- Workspace -------------------------------------------------------------

export const createWorkspace = async (input: { name: string }) =>
  prisma.workspace.create({ data: { name: input.name } })

export const countWorkspaces = async () => prisma.workspace.count()

// Bootstrap only: the first administrator adopts the single workspace the
// Phase 3A migration created, so existing engagements keep a reachable owner.
export const findSingleWorkspaceForBootstrap = async () => {
  const workspaces = await prisma.workspace.findMany({ take: 2 })
  return workspaces.length === 1 ? workspaces[0] : null
}

// --- Users -----------------------------------------------------------------

export const createUser = async (input: {
  workspaceId: string
  email: string
  displayName?: string | null
  role: UserRole
  authUserId: string
  emailVerifiedAt?: Date | null
}) =>
  prisma.user.create({
    data: {
      workspaceId: input.workspaceId,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      authUserId: input.authUserId,
      emailVerifiedAt: input.emailVerifiedAt,
    },
  })

// Bootstrap only: adopt the migration's placeholder owner as the first real
// administrator, so the engagements it owns stay reachable by a signed-in user.
export const adoptUserAsFirstAdministrator = async (
  userId: string,
  input: { email: string; displayName: string; authUserId: string },
) =>
  prisma.user.update({
    where: { id: userId },
    data: {
      email: input.email,
      displayName: input.displayName,
      authUserId: input.authUserId,
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  })

export const findUnlinkedAdministrator = async (scope: WorkspaceScope) =>
  prisma.user.findFirst({
    where: { workspaceId: scope.workspaceId, role: "ADMIN", authUserId: null },
    orderBy: { createdAt: "asc" },
  })

export const getUserByWorkspaceAndEmail = async (
  scope: WorkspaceScope,
  email: string,
) =>
  prisma.user.findUnique({
    where: { workspaceId_email: { workspaceId: scope.workspaceId, email } },
  })

export const getWorkspaceUserById = async (
  scope: WorkspaceScope,
  userId: string,
) =>
  prisma.user.findFirst({
    where: { id: userId, workspaceId: scope.workspaceId },
  })

// The workspace membership behind an authentication identity, if it has one.
//
// Deliberately *not* workspace-scoped, and the only read here that is not: the
// question it answers is "does this identity already belong to a workspace, and
// which?", which a scoped query cannot answer — a scoped lookup would return
// nothing for an identity that belongs elsewhere, i.e. exactly the case that
// must be refused. It returns membership facts only (workspace, role), never
// engagement-side data, so no engagement content crosses a boundary through it;
// its one caller uses the answer solely to refuse (architecture.md §7A.4).
export const getUserByAuthUserId = async (authUserId: string) =>
  prisma.user.findUnique({ where: { authUserId } })

export const listUsersByWorkspace = async (scope: WorkspaceScope) =>
  prisma.user.findMany({
    where: { workspaceId: scope.workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
  })

// Scoped by workspace as well as by id, so an administrator cannot change a
// role in a workspace that is not theirs even with a valid user id.
export const updateUserRoleInWorkspace = async (
  scope: WorkspaceScope,
  userId: string,
  role: StaffRole,
) => {
  const updated = await prisma.user.updateMany({
    where: { id: userId, workspaceId: scope.workspaceId },
    data: { role },
  })

  if (updated.count === 0) return null

  return prisma.user.findUniqueOrThrow({ where: { id: userId } })
}

// --- Engagement ownership --------------------------------------------------

export const getEngagementOwnership = async (
  scope: WorkspaceScope,
  engagementId: string,
) =>
  prisma.engagement.findFirst({
    where: { id: engagementId, workspaceId: scope.workspaceId },
    select: { id: true, workspaceId: true, owningManagerId: true },
  })

export const updateEngagementOwner = async (
  scope: WorkspaceScope,
  engagementId: string,
  owningManagerId: string,
) => {
  const updated = await prisma.engagement.updateMany({
    where: { id: engagementId, workspaceId: scope.workspaceId },
    data: { owningManagerId },
  })

  if (updated.count === 0) return null

  return prisma.engagement.findUniqueOrThrow({
    where: { id: engagementId },
    select: {
      id: true,
      workspaceId: true,
      owningManagerId: true,
      title: true,
      stage: true,
    },
  })
}

// --- Staff invitations -----------------------------------------------------
//
// Invitations create Managers and additional Administrators only. A Client is
// never invited: they self-register and are then associated with one
// engagement's Discovery through Discovery Access (roadmap Phase 3A).

export const createInvitation = async (input: {
  workspaceId: string
  createdByUserId: string
  email: string
  role: StaffRole
  tokenHash: string
  expiresAt: Date
}) =>
  prisma.clientInvitation.create({
    data: {
      workspaceId: input.workspaceId,
      createdByUserId: input.createdByUserId,
      email: input.email,
      role: input.role,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    },
  })

// Accepting an invitation is the one access-side lookup a caller performs
// before they have a workspace — holding the emailed token is what identifies
// the workspace, which is why this operation resolves scope instead of taking
// it.
export const getInvitationByTokenHash = async (tokenHash: string) =>
  prisma.clientInvitation.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      workspaceId: true,
      createdByUserId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
    },
  })

export const listInvitationsByWorkspace = async (scope: WorkspaceScope) =>
  prisma.clientInvitation.findMany({
    where: { workspaceId: scope.workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
      createdByUserId: true,
    },
  })

export const markInvitationAccepted = async (
  invitationId: string,
  acceptedByUserId: string,
) =>
  prisma.clientInvitation.update({
    where: { id: invitationId },
    data: { status: "accepted", acceptedAt: new Date(), acceptedByUserId },
  })

export const markInvitationRevoked = async (
  scope: WorkspaceScope,
  invitationId: string,
) => {
  const revoked = await prisma.clientInvitation.updateMany({
    where: {
      id: invitationId,
      workspaceId: scope.workspaceId,
      status: "pending",
    },
    data: { status: "revoked", revokedAt: new Date() },
  })

  if (revoked.count === 0) return null

  return prisma.clientInvitation.findUniqueOrThrow({
    where: { id: invitationId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      createdByUserId: true,
    },
  })
}

export const markInvitationExpired = async (invitationId: string) =>
  prisma.clientInvitation.update({
    where: { id: invitationId },
    data: { status: "expired" },
  })

// --- Discovery Access ------------------------------------------------------

export const createDiscoveryAccess = async (input: {
  workspaceId: string
  engagementId: string
  userId: string
  grantedByUserId: string
  expiresAt: Date | null
}) =>
  prisma.discoveryAccess.upsert({
    where: {
      engagementId_userId: {
        engagementId: input.engagementId,
        userId: input.userId,
      },
    },
    // Re-granting after a revocation reactivates the association. It never
    // touches the Discovery Profile, so content the client already provided
    // stays exactly as they left it (architecture.md §7A.5).
    update: {
      status: "active",
      expiresAt: input.expiresAt,
      grantedByUserId: input.grantedByUserId,
      revokedAt: null,
      acceptedAt: new Date(),
    },
    create: {
      workspaceId: input.workspaceId,
      engagementId: input.engagementId,
      userId: input.userId,
      grantedByUserId: input.grantedByUserId,
      expiresAt: input.expiresAt,
      acceptedAt: new Date(),
      status: "active",
    },
  })

// The facts the AccessPolicy needs to judge a portal request, scoped to the
// acting client's own workspace and user id.
export const getDiscoveryAccessForClient = async (
  scope: WorkspaceScope,
  engagementId: string,
  userId: string,
) =>
  prisma.discoveryAccess.findFirst({
    where: { workspaceId: scope.workspaceId, engagementId, userId },
    select: {
      id: true,
      workspaceId: true,
      engagementId: true,
      userId: true,
      status: true,
      expiresAt: true,
      grantedByUserId: true,
    },
  })

export const getActiveDiscoveryAccessByEngagement = async (
  scope: WorkspaceScope,
  engagementId: string,
) =>
  prisma.discoveryAccess.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      engagementId,
      status: "active",
    },
    select: {
      id: true,
      userId: true,
      user: { select: { email: true } },
      engagementId: true,
      grantedByUserId: true,
    },
  })

export const listDiscoveryAccessByWorkspace = async (scope: WorkspaceScope) =>
  prisma.discoveryAccess.findMany({
    where: { workspaceId: scope.workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      engagementId: true,
      userId: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      revokedAt: true,
    },
  })

export const revokeDiscoveryAccess = async (
  scope: WorkspaceScope,
  accessId: string,
) => {
  const revoked = await prisma.discoveryAccess.updateMany({
    where: { id: accessId, workspaceId: scope.workspaceId },
    data: { status: "revoked", revokedAt: new Date() },
  })

  if (revoked.count === 0) return null

  return prisma.discoveryAccess.findUniqueOrThrow({
    where: { id: accessId },
    select: { id: true, engagementId: true, userId: true, status: true },
  })
}

// --- Notifications ---------------------------------------------------------

export const createNotification = async (input: {
  workspaceId: string
  userId: string
  kind: NotificationKind
  payload: Prisma.InputJsonValue
  engagementId?: string | null
}) =>
  prisma.notification.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      kind: input.kind,
      payload: input.payload,
      engagementId: input.engagementId ?? null,
    },
  })

export const listNotificationsForUser = async (
  scope: WorkspaceScope,
  userId: string,
) =>
  prisma.notification.findMany({
    where: { workspaceId: scope.workspaceId, userId },
    orderBy: { createdAt: "desc" },
  })

// Scoped to the recipient: a notification is only markable as read by the
// person it was addressed to.
export const markNotificationRead = async (
  scope: WorkspaceScope,
  userId: string,
  notificationId: string,
) => {
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, workspaceId: scope.workspaceId, userId },
    data: { readAt: new Date() },
  })

  if (updated.count === 0) return null

  return prisma.notification.findUniqueOrThrow({ where: { id: notificationId } })
}

// --- Audit Trail -----------------------------------------------------------
//
// Append-only by construction: this module exposes appending and reading and
// nothing else — no update, no delete (architecture.md §7A.8;
// coding-standards.md §6A). It is the access-and-collaboration log and is never
// written from the Analysis Run or Technology Update History paths.

export const appendAuditTrail = async (input: {
  workspaceId: string
  eventType: AuditEventType
  payload: Prisma.InputJsonValue
  userId?: string | null
  engagementId?: string | null
}) =>
  prisma.auditTrail.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      engagementId: input.engagementId ?? null,
      eventType: input.eventType,
      payload: withCurrentRequestId(input.payload),
    },
  })

const withCurrentRequestId = (
  payload: Prisma.InputJsonValue,
): Prisma.InputJsonValue => {
  const requestId = getCurrentRequestId()
  if (
    requestId === undefined ||
    payload === null ||
    Array.isArray(payload) ||
    typeof payload !== "object"
  ) {
    return payload
  }

  return { ...payload, requestId }
}

export const listAuditTrailByWorkspace = async (scope: WorkspaceScope) =>
  prisma.auditTrail.findMany({
    where: { workspaceId: scope.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
