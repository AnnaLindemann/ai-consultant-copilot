import { Router, type Response } from "express"
import type { ZodError } from "zod"

import {
  acceptInvitationSchema,
  bootstrapAuthSchema,
  grantDiscoveryAccessSchema,
  inviteStaffSchema,
  markNotificationReadSchema,
  registerClientSchema,
  resendVerificationSchema,
  revokeInvitationSchema,
  signInSchema,
  transferOwnershipSchema,
  updateUserRoleSchema,
} from "../schemas/auth.schema.js"
import {
  acceptStaffInvitation,
  bootstrapFirstAdministrator,
  changeUserRole,
  grantDiscoveryAccess,
  issueStaffInvitation,
  listOwnNotifications,
  listWorkspaceAudit,
  listWorkspaceDiscoveryAccess,
  listWorkspaceInvitations,
  listWorkspaceUsers,
  readOwnNotification,
  registerClient,
  resendVerification,
  revokeDiscoveryAccessById,
  revokeStaffInvitation,
  signIn,
  signOut,
  transferEngagementOwnership,
  type AccessFailure,
} from "../services/access.service.js"
import {
  applyAuthHeaders,
  requestCredentials,
  requireActingUser,
} from "../lib/auth-context.js"
import {
  authorizeEngagementAction,
  authorizeWorkspaceAction,
  denyRequest,
} from "../services/authorization.service.js"

const router = Router()

// The access surface. Authentication is established by `requireActingUser`;
// every authorization decision goes through the AccessPolicy via
// `authorizeWorkspaceAction` / `authorizeEngagementAction`. No route here
// decides for itself who may do what (coding-standards.md §6A).

// How a refused access operation is reported. Each is a structured outcome the
// caller can act on, reported as an identifier the frontend localizes.
const failureStatus: Record<AccessFailure, number> = {
  bootstrap_unavailable: 409,
  invalid_credentials: 401,
  email_not_verified: 403,
  email_already_registered: 409,
  password_too_weak: 400,
  provider_unavailable: 502,
  invitation_invalid: 404,
  invitation_unavailable: 409,
  client_not_registered: 422,
  client_email_unverified: 422,
  not_a_client: 422,
  user_not_in_workspace: 404,
  not_a_manager: 422,
  invitation_not_revocable: 404,
  notification_not_found: 404,
  discovery_access_not_found: 404,
}

const failureMessage: Record<AccessFailure, string> = {
  bootstrap_unavailable: "auth.error.bootstrap_unavailable",
  invalid_credentials: "auth.error.invalid_credentials",
  email_not_verified: "auth.error.email_not_verified",
  email_already_registered: "auth.error.email_already_registered",
  password_too_weak: "auth.error.password_too_weak",
  provider_unavailable: "auth.error.provider_unavailable",
  invitation_invalid: "auth.error.invitation_invalid",
  invitation_unavailable: "auth.error.invitation_unavailable",
  client_not_registered: "auth.error.client_not_registered",
  client_email_unverified: "auth.error.client_email_unverified",
  not_a_client: "auth.error.not_a_client",
  user_not_in_workspace: "auth.error.user_not_in_workspace",
  not_a_manager: "auth.error.not_a_manager",
  invitation_not_revocable: "auth.error.invitation_not_revocable",
  notification_not_found: "auth.error.notification_not_found",
  discovery_access_not_found: "auth.error.discovery_access_not_found",
}

// --- Account lifecycle -----------------------------------------------------

// The first administrator. Guarded by a deployment secret, and refused outright
// once anyone can sign in.
router.post("/bootstrap", async (req, res) => {
  const parseResult = bootstrapAuthSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  const configuredSecret = process.env.AUTH_BOOTSTRAP_SECRET?.trim()
  if (!configuredSecret || parseResult.data.secret !== configuredSecret) {
    return res.status(403).json({
      status: false,
      message: "auth.error.forbidden",
    })
  }

  const result = await bootstrapFirstAdministrator(parseResult.data)
  if (!result.success) return accessFailure(res, result.failure)

  return res.status(201).json({
    status: true,
    message: "auth.message.bootstrap_complete",
    data: { workspace: result.workspace, administrator: result.administrator },
  })
})

// Client self-registration — the only path by which a Client account exists.
// The response is deliberately identical whether or not the address was already
// registered, so it cannot be used to discover who has an account.
router.post("/register", async (req, res) => {
  const parseResult = registerClientSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  const result = await registerClient(parseResult.data)

  if (!result.success && result.failure !== "email_already_registered") {
    return accessFailure(res, result.failure)
  }

  return res.status(202).json({
    status: true,
    message: "auth.message.verification_sent",
  })
})

router.post("/verification/resend", async (req, res) => {
  const parseResult = resendVerificationSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  await resendVerification(parseResult.data.email)

  return res.status(202).json({
    status: true,
    message: "auth.message.verification_sent",
  })
})

router.post("/login", async (req, res) => {
  const parseResult = signInSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  const result = await signIn(parseResult.data)
  if (!result.success) return accessFailure(res, result.failure)

  applyAuthHeaders(res, result.setHeaders)

  return res.json({
    status: true,
    message: "auth.message.login_successful",
    data: { user: result.actingUser },
  })
})

router.post("/logout", async (req, res) => {
  const headers = await signOut(requestCredentials(req).headers)
  applyAuthHeaders(res, headers)

  return res.json({
    status: true,
    message: "auth.message.logout_successful",
  })
})

router.get("/me", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  return res.json({ status: true, data: actingUser })
})

// --- Staff invitations -----------------------------------------------------

router.post("/invitations", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "invitation.issue")
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = inviteStaffSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  const result = await issueStaffInvitation(actingUser, parseResult.data)

  return res.status(201).json({
    status: true,
    message: "auth.message.invitation_issued",
    data: {
      invitationId: result.invitation.id,
      email: result.invitation.email,
      role: result.invitation.role,
      expiresAt: result.invitation.expiresAt,
      // Whether the invitation mail actually left the process, reported as the
      // adapter said it — a development deployment logs or stores it locally
      // instead of sending, and saying otherwise would present a broken flow as
      // a completed one. The token itself is never returned: it is a credential
      // for the invitee, not information for the issuer.
      emailChannel: result.delivery.channel,
      emailDelivered: result.delivery.delivered,
    },
  })
})

// Accepting an invitation is unauthenticated by nature: holding the emailed
// token is what identifies the workspace and the role.
router.post("/invitations/accept", async (req, res) => {
  const parseResult = acceptInvitationSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  const result = await acceptStaffInvitation(parseResult.data)
  if (!result.success) return accessFailure(res, result.failure)

  return res.status(201).json({
    status: true,
    message: "auth.message.invitation_accepted",
    data: { user: result.user },
  })
})

router.post("/invitations/revoke", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "invitation.revoke",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = revokeInvitationSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  const result = await revokeStaffInvitation(
    actingUser,
    parseResult.data.invitationId,
  )
  if (!result.success) return accessFailure(res, result.failure)

  return res.json({ status: true, data: result.invitation })
})

// --- Discovery Access ------------------------------------------------------

// Associating a client with an engagement's Discovery is an action *on that
// engagement*, so it is authorized against the engagement — a Manager may do it
// for an engagement they own, and for no other.
router.post("/engagements/:id/discovery-access", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "discovery_access.grant",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = grantDiscoveryAccessSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  const result = await grantDiscoveryAccess(
    actingUser,
    req.params.id,
    parseResult.data,
  )
  if (!result.success) return accessFailure(res, result.failure)

  return res.status(201).json({
    status: true,
    message: "auth.message.discovery_access_granted",
    data: result.access,
  })
})

router.post("/discovery-access/:id/revoke", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "discovery_access.revoke",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const result = await revokeDiscoveryAccessById(actingUser, req.params.id)
  if (!result.success) return accessFailure(res, result.failure)

  return res.json({ status: true, data: result.access })
})

router.get("/workspace/discovery-access", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "workspace.manage")
  if (!authorized.permitted) return denyRequest(res, authorized)

  return res.json({
    status: true,
    data: await listWorkspaceDiscoveryAccess(actingUser),
  })
})

// --- Roles and ownership ---------------------------------------------------

router.patch("/users/:id/role", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "role.change")
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = updateUserRoleSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  const result = await changeUserRole(actingUser, req.params.id, parseResult.data)
  if (!result.success) return accessFailure(res, result.failure)

  return res.json({ status: true, data: result.user })
})

router.patch("/engagements/:id/ownership", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "ownership.transfer",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = transferOwnershipSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  const result = await transferEngagementOwnership(
    actingUser,
    req.params.id,
    parseResult.data,
  )
  if (!result.success) return accessFailure(res, result.failure)

  return res.json({ status: true, data: result.engagement })
})

// --- Workspace reads -------------------------------------------------------

router.get("/workspace/users", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "workspace.manage")
  if (!authorized.permitted) return denyRequest(res, authorized)

  return res.json({ status: true, data: await listWorkspaceUsers(actingUser) })
})

router.get("/workspace/invitations", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "workspace.manage")
  if (!authorized.permitted) return denyRequest(res, authorized)

  return res.json({
    status: true,
    data: await listWorkspaceInvitations(actingUser),
  })
})

router.get("/workspace/audit", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "workspace.manage")
  if (!authorized.permitted) return denyRequest(res, authorized)

  return res.json({ status: true, data: await listWorkspaceAudit(actingUser) })
})

// --- Notifications ---------------------------------------------------------
//
// A user's own notifications. No authorization action is needed beyond being a
// workspace member: the query is scoped to the acting user's own id, so there
// is nothing here to decide about somebody else's data.

router.get("/notifications", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  return res.json({ status: true, data: await listOwnNotifications(actingUser) })
})

router.post("/notifications/read", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const parseResult = markNotificationReadSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error)

  const result = await readOwnNotification(
    actingUser,
    parseResult.data.notificationId,
  )
  if (!result.success) return accessFailure(res, result.failure)

  return res.json({ status: true, data: result.notification })
})

const invalidInput = (res: Response, error: ZodError) =>
  res.status(400).json({
    status: false,
    message: "auth.error.invalid_input",
    errors: error.flatten(),
  })

const accessFailure = (res: Response, failure: AccessFailure) =>
  res.status(failureStatus[failure]).json({
    status: false,
    message: failureMessage[failure],
  })

export default router
