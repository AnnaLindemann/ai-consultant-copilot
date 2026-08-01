import { z } from "zod"

export const userRoleSchema = z.enum(["ADMIN", "MANAGER", "CLIENT"])

// The roles a staff invitation may create. A Client is never invited into a
// workspace: clients self-register, confirm their own email, and are then
// associated with exactly one engagement's Discovery through Discovery Access
// (roadmap Phase 3A "Authentication"; domain-model.md §3A.3).
export const staffRoleSchema = z.enum(["ADMIN", "MANAGER"])

export const invitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "revoked",
  "expired",
])

export const discoveryAccessStatusSchema = z.enum([
  "pending",
  "active",
  "revoked",
  "expired",
])

// What a notification is *about*, as a stable English identifier the frontend
// localizes (coding-standards.md §12A: the server returns identifiers, not
// prose). These are part of the API contract; renaming one is a contract
// change.
//
// Each event has its own identifier. The staff-invitation kinds describe an
// invitation into a workspace with a role — a thing a Client is never sent
// (domain-model.md §3A.3) — so the discovery-access lifecycle carries its own
// pair rather than borrowing them: a notification's kind is what a recipient's
// interface, and anyone later querying these rows, keys off, and one identifier
// standing for two different events makes both unreadable.
export const notificationKindSchema = z.enum([
  "invitation_issued",
  "invitation_accepted",
  "invitation_revoked",
  "invitation_expired",
  "discovery_access_granted",
  "discovery_access_revoked",
  "discovery_submitted",
  "discovery_returned",
  "discovery_accepted",
  "discovery_reopened",
  "ownership_transferred",
  "role_changed",
  "sign_in",
  "denied_permission",
])

export const auditEventTypeSchema = z.enum([
  "sign_in",
  "invitation_issued",
  "invitation_accepted",
  "invitation_revoked",
  "invitation_expired",
  "discovery_access_granted",
  "discovery_access_revoked",
  "discovery_submitted",
  "discovery_returned",
  "discovery_accepted",
  "discovery_reopened",
  "ownership_transferred",
  "role_changed",
  "denied_permission",
  // Technology Knowledge Base curation (Phase 5A). These record *who did what*
  // to the curation workflow and belong to the workspace Audit Trail. They are
  // deliberately not the Technology Update History, which records what the
  // knowledge base itself came to say and belongs to no workspace — three
  // governance logs, three purposes, never merged (architecture.md §7A.8, §9.3).
  "technology_proposal_created",
  "technology_proposal_approved",
  "technology_proposal_rejected",
])

export type UserRole = z.infer<typeof userRoleSchema>
export type StaffRole = z.infer<typeof staffRoleSchema>
export type InvitationStatus = z.infer<typeof invitationStatusSchema>
export type DiscoveryAccessStatus = z.infer<
  typeof discoveryAccessStatusSchema
>
export type NotificationKind = z.infer<typeof notificationKindSchema>
export type AuditEventType = z.infer<typeof auditEventTypeSchema>
