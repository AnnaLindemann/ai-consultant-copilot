import { z } from "zod"

import { staffRoleSchema } from "../../../shared/access.schema.js"

// Request validation for the access surface (architecture.md §13: all external
// input is validated at the interface boundary). Passwords are only ever passed
// straight through to the authentication provider; nothing here stores one.

const nonEmptyString = z.string().trim().min(1)
const emailAddress = z.string().trim().toLowerCase().email()

// The provider enforces this too; stating it here means the caller gets a
// structured 400 rather than a provider error.
const chosenPassword = z.string().min(12).max(128)

export const bootstrapAuthSchema = z.object({
  secret: nonEmptyString,
  workspaceName: nonEmptyString,
  administratorEmail: emailAddress,
  administratorName: nonEmptyString,
  password: chosenPassword,
})

// Client self-registration — the only way a Client account is created. It names
// no workspace and no engagement: association with one engagement's Discovery
// is a separate, consultant-initiated step.
export const registerClientSchema = z.object({
  email: emailAddress,
  displayName: nonEmptyString,
  password: chosenPassword,
})

export const resendVerificationSchema = z.object({
  email: emailAddress,
})

export const signInSchema = z.object({
  email: emailAddress,
  password: nonEmptyString,
})

// Staff invitations create Managers and Administrators only; the role enum
// makes a CLIENT invitation a validation failure rather than a runtime check.
export const inviteStaffSchema = z.object({
  email: emailAddress,
  role: staffRoleSchema,
  expiresInDays: z.number().int().positive().max(30).optional(),
})

export const acceptInvitationSchema = z.object({
  token: nonEmptyString,
  displayName: nonEmptyString,
  password: chosenPassword,
})

export const revokeInvitationSchema = z.object({
  invitationId: nonEmptyString,
})

// Discovery Access names the client by the address they self-registered with —
// the association step cannot create an account, so the address must already
// belong to a confirmed identity.
export const grantDiscoveryAccessSchema = z.object({
  email: emailAddress,
  expiresInDays: z.number().int().positive().max(90).optional(),
})

export const updateUserRoleSchema = z.object({
  role: staffRoleSchema,
})

export const transferOwnershipSchema = z.object({
  managerId: nonEmptyString,
})

export const markNotificationReadSchema = z.object({
  notificationId: nonEmptyString,
})

export type BootstrapAuthInput = z.infer<typeof bootstrapAuthSchema>
export type RegisterClientInput = z.infer<typeof registerClientSchema>
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>
export type SignInInput = z.infer<typeof signInSchema>
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>
export type RevokeInvitationInput = z.infer<typeof revokeInvitationSchema>
export type GrantDiscoveryAccessInput = z.infer<
  typeof grantDiscoveryAccessSchema
>
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>
export type MarkNotificationReadInput = z.infer<
  typeof markNotificationReadSchema
>
