// The identifiers the Security, Privacy & AI Compliance surfaces report
// (roadmap Phase 10). The server returns an identifier and structured
// parameters, never prose; the frontend localizes it (architecture.md §7.1;
// coding-standards.md §12A).
export const complianceMessageIds = [
  "compliance.message.policy_loaded",
  "compliance.message.policy_saved",
  "compliance.message.engagement_saved",
  "compliance.message.privacy_processing_saved",
  "compliance.message.consent_recorded",
  "compliance.message.consent_withdrawn",
  "compliance.message.dpia_saved",
  "compliance.message.dpia_loaded",
  "compliance.message.model_approvals_loaded",
  "compliance.message.model_approval_saved",
  "compliance.message.model_approval_removed",
  "compliance.message.retention_preview_ready",
  "compliance.message.retention_executed",
  "compliance.message.identifier_preview_ready",
  "compliance.message.ai_output_reviewed",
  "compliance.message.download_link_issued",
  "compliance.message.client_data_exported",
  "compliance.message.client_data_erased",
  "compliance.error.invalid_input",
  "compliance.error.not_found",
  "compliance.error.export_not_permitted",
  "compliance.error.legal_hold_active",
  "compliance.error.confirmation_mismatch",
  "compliance.error.download_link_invalid",
  "compliance.error.insecure_transport",
  // A consent record may exist only where the engagement's determined legal
  // basis is consent. Recording one otherwise would be the false claim the
  // separation of permission and consent exists to prevent.
  "compliance.error.consent_requires_consent_basis",
  "compliance.error.consent_already_withdrawn",
  "compliance.error.legal_basis_not_supported",
  "compliance.error.human_review_required",
  "compliance.error.internal",
  // Why an AI-assisted step was refused before anything left for the provider.
  // Each maps one-to-one onto an `AiDenialReason`, so a consultant is told
  // which rule stopped the request rather than that "something" did.
  "compliance.ai.denied.workspace_ai_processing_disabled",
  "compliance.ai.denied.engagement_ai_processing_prohibited",
  "compliance.ai.denied.engagement_ai_processing_restricted_classification",
  "compliance.ai.denied.content_ai_restricted",
  "compliance.ai.denied.confidential_processing_not_permitted",
  "compliance.ai.denied.processing_purpose_not_recorded",
  "compliance.ai.denied.legal_basis_not_assessed",
  "compliance.ai.denied.consent_record_missing",
  "compliance.ai.denied.consent_withdrawn",
  "compliance.ai.denied.dpia_not_screened",
  "compliance.ai.denied.dpia_required_not_completed",
  "compliance.ai.denied.workspace_dpia_not_approved",
  "compliance.ai.denied.provider_model_not_approved",
  "compliance.ai.denied.provider_model_approval_needs_review",
  "compliance.ai.denied.provider_model_approval_revoked",
  "compliance.ai.denied.pii_redaction_failed",
  // Why an AI *result* could not be used, after the request had already run.
  "compliance.ai.output_rejected.output_personal_data_detected",
] as const

export type ComplianceMessageId = (typeof complianceMessageIds)[number]

export const isComplianceMessageId = (
  value: string,
): value is ComplianceMessageId =>
  (complianceMessageIds as readonly string[]).includes(value)

// The message identifier a refusal to run an AI step is reported with. Built
// from the reason so the two can never drift apart.
export const aiDenialMessageId = (reason: string): string =>
  `compliance.ai.denied.${reason}`

// The message identifier a refused AI *result* is reported with.
export const aiOutputRejectionMessageId = (reason: string): string =>
  `compliance.ai.output_rejected.${reason}`
