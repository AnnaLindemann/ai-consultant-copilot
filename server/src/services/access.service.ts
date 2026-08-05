import { authenticationProvider } from "../lib/auth/authentication-provider.js"
import { getCompliancePolicy } from "./compliance.service.js"
import {
  generateInvitationToken,
  hashInvitationToken,
} from "../lib/auth/invitation-token.js"
import { emailDelivery } from "../lib/email-delivery.js"
import { renderEmail } from "../lib/email-templates.js"
import {
  adoptUserAsFirstAdministrator,
  appendAuditTrail,
  countWorkspaces,
  createDiscoveryAccess,
  createInvitation,
  createUser,
  createWorkspace,
  findSingleWorkspaceForBootstrap,
  findUnlinkedAdministrator,
  getInvitationByTokenHash,
  getUserByAuthUserId,
  getUserByWorkspaceAndEmail,
  getWorkspaceUserById,
  listAuditTrailByWorkspace,
  listDiscoveryAccessByWorkspace,
  listInvitationsByWorkspace,
  listNotificationsForUser,
  listUsersByWorkspace,
  markInvitationAccepted,
  markInvitationExpired,
  markInvitationRevoked,
  markNotificationRead,
  revokeDiscoveryAccess,
  updateEngagementOwner,
  updateUserRoleInWorkspace,
} from "../repositories/access.repository.js"
import { raiseNotification } from "./notification.service.js"

import {
  canOwnEngagement,
  canReceiveDiscoveryAccess,
  type ActingUser,
} from "../domain/access/access.js"
import type { AuthHeaders } from "../domain/access/ports.js"
import type {
  AcceptInvitationInput,
  BootstrapAuthInput,
  GrantDiscoveryAccessInput,
  InviteStaffInput,
  RegisterClientInput,
  SignInInput,
  TransferOwnershipInput,
  UpdateUserRoleInput,
} from "../schemas/auth.schema.js"

// The access and collaboration application service. It orchestrates the
// documented lifecycles — bootstrap, client self-registration, staff
// invitation, Discovery Access, ownership transfer, role change — over the
// authentication provider, the scoped repositories, the append-only Audit
// Trail, and the notification mechanism.
//
// It never handles a password: creating and verifying one is the authentication
// provider's job (coding-standards.md §6, §6A).

const DEFAULT_INVITE_DAYS = 7
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000"

export type AccessFailure =
  | "bootstrap_unavailable"
  | "invalid_credentials"
  | "email_not_verified"
  | "email_already_registered"
  | "password_too_weak"
  | "provider_unavailable"
  | "invitation_invalid"
  | "invitation_unavailable"
  | "client_not_registered"
  | "client_email_unverified"
  | "not_a_client"
  | "user_not_in_workspace"
  | "not_a_manager"
  | "invitation_not_revocable"
  | "notification_not_found"
  | "discovery_access_not_found"

type Failure = { success: false; failure: AccessFailure }

const fail = (failure: AccessFailure): Failure => ({ success: false, failure })

// --- Bootstrap -------------------------------------------------------------

// The first administrator (roadmap Phase 3A: "created through a secure
// bootstrap process"). Permitted only while nobody can sign in at all, and
// guarded by a deployment secret at the route boundary.
//
// It adopts the workspace and the placeholder owner the Phase 3A migration
// created, so the engagements carried over from earlier phases end the phase
// owned by a real, signed-in administrator.
export const bootstrapFirstAdministrator = async (input: BootstrapAuthInput) => {
  if (await anyIdentityExists()) return fail("bootstrap_unavailable")

  const identity = await authenticationProvider.registerIdentity({
    email: input.administratorEmail,
    name: input.administratorName,
    password: input.password,
  })

  if (!identity.success) return fail(identity.error)

  // The bootstrap secret already establishes the operator's control of this
  // deployment, so the address needs no separate confirmation round-trip.
  await authenticationProvider.confirmEmail({ authUserId: identity.authUserId })

  const workspace =
    (await findSingleWorkspaceForBootstrap()) ??
    (await createWorkspace({ name: input.workspaceName }))

  // Every engagement operates under an explicit Workspace Compliance Policy
  // (roadmap Phase 10 Definition of Done), so the policy exists from the moment
  // the workspace does — not from the moment an administrator first opens the
  // settings. Reading it is what creates it if it is somehow absent.
  await getCompliancePolicy({ workspaceId: workspace.id })

  const placeholderOwner = await findUnlinkedAdministrator({
    workspaceId: workspace.id,
  })

  const administrator = placeholderOwner
    ? await adoptUserAsFirstAdministrator(placeholderOwner.id, {
        email: input.administratorEmail,
        displayName: input.administratorName,
        authUserId: identity.authUserId,
      })
    : await createUser({
        workspaceId: workspace.id,
        email: input.administratorEmail,
        displayName: input.administratorName,
        role: "ADMIN",
        authUserId: identity.authUserId,
        emailVerifiedAt: new Date(),
      })

  await appendAuditTrail({
    workspaceId: workspace.id,
    userId: administrator.id,
    eventType: "sign_in",
    payload: { bootstrap: true },
  })

  return {
    success: true as const,
    workspace: { id: workspace.id, name: workspace.name },
    administrator: publicUser(administrator),
    // Signing in is a separate, explicit step: the bootstrap response carries
    // no session, so the operator proves the password they just chose.
    setHeaders: [] as AuthHeaders,
  }
}

// --- Client self-registration ----------------------------------------------

// The only way a Client account comes into existence (roadmap Phase 3A;
// domain-model.md §3A.3). It creates an authentication identity and sends the
// confirmation email; it creates no workspace membership and grants no access.
// A consultant later associates the confirmed identity with exactly one
// engagement's Discovery.
export const registerClient = async (input: RegisterClientInput) => {
  const identity = await authenticationProvider.registerIdentity({
    email: input.email,
    name: input.displayName,
    password: input.password,
  })

  if (!identity.success) return fail(identity.error)

  return { success: true as const }
}

export const resendVerification = async (email: string) => {
  await authenticationProvider.sendVerification({ email })
}

// --- Sign in and out -------------------------------------------------------

export const signIn = async (input: SignInInput) => {
  const session = await authenticationProvider.startSession(input)
  if (!session.success) return fail(session.error)

  const identity = await authenticationProvider.resolveIdentity({
    headers: { cookie: cookieHeaderFrom(session.setHeaders) },
  })

  if (identity?.actingUser) {
    await appendAuditTrail({
      workspaceId: identity.actingUser.workspaceId,
      userId: identity.actingUser.id,
      eventType: "sign_in",
      payload: { role: identity.actingUser.role },
    })
  }

  return {
    success: true as const,
    setHeaders: session.setHeaders,
    // A confirmed identity with no workspace membership is a self-registered
    // client awaiting association. They are signed in and reach nothing.
    actingUser: identity?.actingUser ?? null,
  }
}

export const signOut = async (headers: Record<string, string | undefined>) =>
  authenticationProvider.endSession({ headers })

// --- Staff invitations -----------------------------------------------------

// Invite a Manager or an additional Administrator. The invitee follows the
// emailed link and sets their own password, so an administrator never creates,
// knows, or stores anyone's password (domain-model.md §3A.3).
export const issueStaffInvitation = async (
  actor: ActingUser,
  input: InviteStaffInput,
) => {
  const token = generateInvitationToken()
  const expiresAt = daysFromNow(input.expiresInDays ?? DEFAULT_INVITE_DAYS)

  const invitation = await createInvitation({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.id,
    email: input.email,
    role: input.role,
    tokenHash: hashInvitationToken(token),
    expiresAt,
  })

  await appendAuditTrail({
    workspaceId: actor.workspaceId,
    userId: actor.id,
    eventType: "invitation_issued",
    payload: {
      invitationId: invitation.id,
      email: input.email,
      role: input.role,
      expiresAt: expiresAt.toISOString(),
    },
  })

  // The invitee has no account yet, so the invitation reaches them by email;
  // the in-app notification records it for the administrator who issued it.
  await raiseNotification({
    workspaceId: actor.workspaceId,
    userId: actor.id,
    kind: "invitation_issued",
    payload: { invitationId: invitation.id, email: input.email, role: input.role },
  })

  const delivery = await emailDelivery.send(
    renderEmail("staff_invitation", input.email, {
      recipientName: input.email,
      acceptUrl: `${CLIENT_ORIGIN}/auth?invitation=${token}`,
      expiresOn: expiresAt.toISOString().slice(0, 10),
    }),
  )

  // The token is not returned to the caller on any channel. An invitation token
  // is a credential: whoever holds it becomes a Manager or an Administrator of
  // this workspace, so the only place it belongs is the message that was
  // addressed to the invitee. A local developer without a mail vendor reads it
  // from the development mailbox (`lib/dev-mailbox.ts`), which is their own
  // machine rather than an API response an administrator's browser, proxy, or
  // browser history would also keep.
  return { success: true as const, invitation, delivery }
}

// Accept a staff invitation: the invitee chooses their own password, which the
// authentication provider stores, and gains the workspace membership the
// invitation named.
export const acceptStaffInvitation = async (input: AcceptInvitationInput) => {
  const invitation = await getInvitationByTokenHash(
    hashInvitationToken(input.token),
  )

  if (!invitation) return fail("invitation_invalid")

  if (invitation.status !== "pending") return fail("invitation_unavailable")

  if (invitation.expiresAt <= new Date()) {
    await markInvitationExpired(invitation.id)
    await appendAuditTrail({
      workspaceId: invitation.workspaceId,
      userId: invitation.createdByUserId,
      eventType: "invitation_expired",
      payload: { invitationId: invitation.id, email: invitation.email },
    })
    await raiseNotification({
      workspaceId: invitation.workspaceId,
      userId: invitation.createdByUserId,
      kind: "invitation_expired",
      payload: { invitationId: invitation.id, email: invitation.email },
    })

    return fail("invitation_unavailable")
  }

  const identity = await authenticationProvider.registerIdentity({
    email: invitation.email,
    name: input.displayName,
    password: input.password,
  })

  if (!identity.success) return fail(identity.error)

  // The link was delivered to this address, so holding it confirms the address.
  await authenticationProvider.confirmEmail({ authUserId: identity.authUserId })

  const user = await createUser({
    workspaceId: invitation.workspaceId,
    email: invitation.email,
    displayName: input.displayName,
    role: invitation.role,
    authUserId: identity.authUserId,
    emailVerifiedAt: new Date(),
  })

  await markInvitationAccepted(invitation.id, user.id)

  await appendAuditTrail({
    workspaceId: invitation.workspaceId,
    userId: user.id,
    eventType: "invitation_accepted",
    payload: { invitationId: invitation.id, role: invitation.role },
  })

  await raiseNotification({
    workspaceId: invitation.workspaceId,
    userId: invitation.createdByUserId,
    kind: "invitation_accepted",
    payload: { invitationId: invitation.id, email: invitation.email },
  })

  return { success: true as const, user: publicUser(user) }
}

export const revokeStaffInvitation = async (
  actor: ActingUser,
  invitationId: string,
) => {
  const invitation = await markInvitationRevoked(
    { workspaceId: actor.workspaceId },
    invitationId,
  )

  if (!invitation) return fail("invitation_not_revocable")

  await appendAuditTrail({
    workspaceId: actor.workspaceId,
    userId: actor.id,
    eventType: "invitation_revoked",
    payload: { invitationId: invitation.id, email: invitation.email },
  })

  await raiseNotification({
    workspaceId: actor.workspaceId,
    userId: invitation.createdByUserId,
    kind: "invitation_revoked",
    payload: { invitationId: invitation.id, email: invitation.email },
  })

  return { success: true as const, invitation }
}

// --- Discovery Access ------------------------------------------------------

// Associate a self-registered, email-confirmed client with exactly one
// engagement's Discovery. The client must already have their own account: this
// is an association, never an account-creation path, which is what keeps the
// Client lifecycle self-registration-only.
//
// The grant names a **Client** and only a Client (`canReceiveDiscoveryAccess`).
// Three ways an address could be something else are refused here, all of them
// with the same non-revealing identifier so the response cannot be used to map
// who holds which role, or in which workspace:
//
//  1. the address already belongs to an Administrator or Manager of this
//     workspace — including the address of the consultant issuing the grant;
//  2. the address is a member of this workspace whose row belongs to a
//     different authentication identity;
//  3. the identity is already a member of *another* workspace. One identity
//     belongs to at most one workspace (`User.authUserId` is unique), so this
//     would otherwise surface as a constraint violation rather than a decision.
export const grantDiscoveryAccess = async (
  actor: ActingUser,
  engagementId: string,
  input: GrantDiscoveryAccessInput,
) => {
  const identity = await authenticationProvider.resolveIdentityByEmail(input.email)

  if (!identity) return fail("client_not_registered")
  if (!identity.emailVerified) return fail("client_email_unverified")

  const byEmail = await getUserByWorkspaceAndEmail(
    { workspaceId: actor.workspaceId },
    input.email,
  )

  if (
    byEmail &&
    (!canReceiveDiscoveryAccess(byEmail.role) ||
      byEmail.authUserId !== identity.authUserId)
  ) {
    return fail("not_a_client")
  }

  const membership =
    byEmail ?? (await getUserByAuthUserId(identity.authUserId))

  if (
    membership &&
    (membership.workspaceId !== actor.workspaceId ||
      !canReceiveDiscoveryAccess(membership.role))
  ) {
    return fail("not_a_client")
  }

  // The client's workspace membership is created here, by the association —
  // that is what puts a self-registered client into a workspace at all.
  const client =
    membership ??
    (await createUser({
      workspaceId: actor.workspaceId,
      email: input.email,
      displayName: identity.name,
      role: "CLIENT",
      authUserId: identity.authUserId,
      emailVerifiedAt: new Date(),
    }))

  const access = await createDiscoveryAccess({
    workspaceId: actor.workspaceId,
    engagementId,
    userId: client.id,
    grantedByUserId: actor.id,
    expiresAt: input.expiresInDays ? daysFromNow(input.expiresInDays) : null,
  })

  await appendAuditTrail({
    workspaceId: actor.workspaceId,
    userId: actor.id,
    engagementId,
    eventType: "discovery_access_granted",
    payload: { accessId: access.id, clientUserId: client.id },
  })

  // The client's own event, under its own identifier: they were given one
  // engagement's Discovery form, not invited into a workspace with a role.
  await raiseNotification({
    workspaceId: actor.workspaceId,
    userId: client.id,
    engagementId,
    kind: "discovery_access_granted",
    payload: { accessId: access.id, engagementId },
  })

  await emailDelivery.send(
    renderEmail("discovery_access_granted", input.email, {
      portalUrl: `${CLIENT_ORIGIN}/portal/engagements/${engagementId}`,
    }),
  )

  return { success: true as const, access }
}

// Revoking ends the client's access on the next request and deletes nothing
// they contributed (architecture.md §7A.5).
export const revokeDiscoveryAccessById = async (
  actor: ActingUser,
  accessId: string,
) => {
  const access = await revokeDiscoveryAccess(
    { workspaceId: actor.workspaceId },
    accessId,
  )

  if (!access) return fail("discovery_access_not_found")

  await appendAuditTrail({
    workspaceId: actor.workspaceId,
    userId: actor.id,
    engagementId: access.engagementId,
    eventType: "discovery_access_revoked",
    payload: { accessId: access.id, clientUserId: access.userId },
  })

  await raiseNotification({
    workspaceId: actor.workspaceId,
    userId: access.userId,
    engagementId: access.engagementId,
    kind: "discovery_access_revoked",
    payload: { accessId: access.id, engagementId: access.engagementId },
  })

  return { success: true as const, access }
}

// --- Roles and ownership ---------------------------------------------------

export const changeUserRole = async (
  actor: ActingUser,
  userId: string,
  input: UpdateUserRoleInput,
) => {
  const updated = await updateUserRoleInWorkspace(
    { workspaceId: actor.workspaceId },
    userId,
    input.role,
  )

  if (!updated) return fail("user_not_in_workspace")

  await appendAuditTrail({
    workspaceId: actor.workspaceId,
    userId: actor.id,
    eventType: "role_changed",
    payload: { targetUserId: userId, role: input.role },
  })

  await raiseNotification({
    workspaceId: actor.workspaceId,
    userId,
    kind: "role_changed",
    payload: { role: input.role },
  })

  return { success: true as const, user: publicUser(updated) }
}

// Transfer engagement ownership. The new owner must be a Manager or
// Administrator in the same workspace, so a transfer can never move an
// engagement out of its workspace or hand it to a client.
export const transferEngagementOwnership = async (
  actor: ActingUser,
  engagementId: string,
  input: TransferOwnershipInput,
) => {
  const nextOwner = await getWorkspaceUserById(
    { workspaceId: actor.workspaceId },
    input.managerId,
  )

  if (!nextOwner) return fail("user_not_in_workspace")
  if (!canOwnEngagement(nextOwner.role)) return fail("not_a_manager")

  const engagement = await updateEngagementOwner(
    { workspaceId: actor.workspaceId },
    engagementId,
    nextOwner.id,
  )

  if (!engagement) return fail("user_not_in_workspace")

  await appendAuditTrail({
    workspaceId: actor.workspaceId,
    userId: actor.id,
    engagementId,
    eventType: "ownership_transferred",
    payload: { owningManagerId: nextOwner.id },
  })

  await raiseNotification({
    workspaceId: actor.workspaceId,
    userId: nextOwner.id,
    engagementId,
    kind: "ownership_transferred",
    payload: { engagementId },
  })

  return { success: true as const, engagement }
}

// --- Reads -----------------------------------------------------------------

export const listWorkspaceUsers = async (actor: ActingUser) =>
  listUsersByWorkspace({ workspaceId: actor.workspaceId })

export const listWorkspaceInvitations = async (actor: ActingUser) =>
  listInvitationsByWorkspace({ workspaceId: actor.workspaceId })

export const listWorkspaceDiscoveryAccess = async (actor: ActingUser) =>
  listDiscoveryAccessByWorkspace({ workspaceId: actor.workspaceId })

export const listWorkspaceAudit = async (actor: ActingUser) =>
  listAuditTrailByWorkspace({ workspaceId: actor.workspaceId })

// A user's own notifications, scoped to their workspace and their own id.
export const listOwnNotifications = async (actor: ActingUser) =>
  listNotificationsForUser({ workspaceId: actor.workspaceId }, actor.id)

export const readOwnNotification = async (
  actor: ActingUser,
  notificationId: string,
) => {
  const notification = await markNotificationRead(
    { workspaceId: actor.workspaceId },
    actor.id,
    notificationId,
  )

  if (!notification) return fail("notification_not_found")

  return { success: true as const, notification }
}

// --- Internals -------------------------------------------------------------

const anyIdentityExists = async () =>
  (await authenticationProvider.countIdentities()) > 0 ||
  (await countWorkspaces()) > 1

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

const cookieHeaderFrom = (headers: AuthHeaders) =>
  headers
    .filter(([name]) => name === "set-cookie")
    .map(([, value]) => value.split(";")[0])
    .join("; ")

const publicUser = (user: {
  id: string
  email: string
  displayName: string | null
  role: string
  workspaceId: string
}) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  workspaceId: user.workspaceId,
})
