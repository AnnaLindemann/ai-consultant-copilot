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
  "document_published",
  "document_publication_revoked",
  // Phase 9 notifies the owning Manager that a Client left feedback. The
  // Manager's own review steps are recorded in the Audit Trail, not announced
  // back to themselves, so they add audit event types and no notification kind.
  "client_feedback_submitted",
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
  "document_published",
  "document_publication_revoked",
  "document_downloaded",
  "document_notification_sent",
  "document_notification_failed",
  "client_feedback_submitted",
  "client_feedback_classified",
  "client_feedback_closed_no_action",
  "feedback_reentry_opened",
  "feedback_reentry_completed",
  "report_version_created",
  "report_submitted_for_review",
  "report_approved",
  "report_approved_version_superseded",
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
  // Security, privacy and AI compliance (Phase 10). The roadmap expands *this*
  // log rather than adding a fourth one: access to confidential information,
  // document downloads and exports, AI policy decisions, PII redaction actions,
  // denied AI requests, and compliance-related administrative actions are all
  // access-and-collaboration events, which is what the Audit Trail records.
  "compliance_policy_updated",
  "engagement_classification_changed",
  "engagement_ai_processing_permission_changed",
  "engagement_legal_hold_changed",
  "confidential_content_accessed",
  "document_download_link_issued",
  "ai_request_denied",
  "ai_pii_redaction_applied",
  "ai_pii_redaction_failed",
  // An AI *result* refused because personal identifiers came back in the
  // response. Recorded with kinds and counts only, never values.
  "ai_output_personal_data_detected",
  "client_data_exported",
  "client_data_erased",
  // The privacy-processing record, real GDPR consent, the DPIA, the governed
  // provider/model approvals and the retention action (Phase 10 corrections).
  // Each is an administrative decision with an author, which is exactly what
  // this log is for.
  "engagement_privacy_processing_updated",
  "engagement_consent_recorded",
  "engagement_consent_withdrawn",
  "engagement_dpia_screening_changed",
  "workspace_dpia_updated",
  "ai_model_approval_updated",
  "ai_model_approval_removed",
  "ai_model_approval_needs_review",
  "retention_preview_generated",
  "retention_action_executed",
  // Audit entries surviving an erasure, reduced to their event and their time.
  "audit_entries_minimized",
])

export type UserRole = z.infer<typeof userRoleSchema>
export type StaffRole = z.infer<typeof staffRoleSchema>
export type InvitationStatus = z.infer<typeof invitationStatusSchema>
export type DiscoveryAccessStatus = z.infer<
  typeof discoveryAccessStatusSchema
>
export type NotificationKind = z.infer<typeof notificationKindSchema>
export type AuditEventType = z.infer<typeof auditEventTypeSchema>
