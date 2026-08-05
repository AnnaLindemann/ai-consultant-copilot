import type {
  DataClassification,
  DpaStatus,
  EngagementAiProcessingPermission,
  EngagementDpiaScreening,
  HumanReviewStatus,
  LegalBasis,
  PersonalIdentifierKind,
  PiiRedactionStatus,
  PromptRetentionDecision,
  TrainingUseDecision,
  AiModelApprovalStatus,
  WorkspaceDpiaStatus,
} from "../../shared/compliance.schema"

// The compliance identifiers the surfaces offer, listed literally.
//
// Every client import from `shared/` is **type-only**: the shared modules sit
// outside the frontend's build root, so a value imported from one does not
// resolve at build time. The identifiers are therefore repeated here and held
// to the shared contract by `i18n/catalogue.test.ts`, which asserts these lists
// are exactly the schema's own options — so a value added to the domain fails a
// test rather than quietly disappearing from a dropdown.
//
// The types above are what keep the entries honest: a value that is not a
// `DataClassification` is a compile error.

export const DATA_CLASSIFICATIONS: readonly DataClassification[] = [
  "public",
  "internal",
  "confidential",
  "personal_data",
  "strictly_confidential",
  "ai_restricted",
]

export const AI_PROCESSING_PERMISSIONS: readonly EngagementAiProcessingPermission[] = [
  "allowed",
  "restricted",
  "prohibited",
]

export const PII_REDACTION_STATUSES: readonly PiiRedactionStatus[] = [
  "not_required",
  "applied",
  "failed",
]

export const HUMAN_REVIEW_STATUSES: readonly HumanReviewStatus[] = [
  "not_required",
  "pending",
  "reviewed",
]

export const LEGAL_BASES: readonly LegalBasis[] = [
  "contract",
  "legitimate_interest",
  "legal_obligation",
  "consent",
  "not_assessed",
]

export const DPIA_SCREENINGS: readonly EngagementDpiaScreening[] = [
  "not_assessed",
  "within_standard_dpia",
  "additional_not_required",
  "additional_required",
  "additional_completed",
]

export const WORKSPACE_DPIA_STATUSES: readonly WorkspaceDpiaStatus[] = [
  "not_started",
  "in_progress",
  "approved",
  "not_required",
]

export const AI_MODEL_APPROVAL_STATUSES: readonly AiModelApprovalStatus[] = [
  "approved",
  "needs_review",
  "revoked",
]

export const DPA_STATUSES: readonly DpaStatus[] = [
  "in_place",
  "not_required",
  "pending",
  "not_assessed",
]

export const PROMPT_RETENTION_DECISIONS: readonly PromptRetentionDecision[] = [
  "not_retained",
  "retained_limited",
  "retained_unknown",
]

export const TRAINING_USE_DECISIONS: readonly TrainingUseDecision[] = [
  "excluded",
  "permitted",
  "unknown",
]

export const PERSONAL_IDENTIFIER_KINDS: readonly PersonalIdentifierKind[] = [
  "person_name",
  "email",
  "phone",
  "postal_address",
  "contract_identifier",
  "iban",
  "custom",
]

// Which classifications are confidential client information. It mirrors the
// server's rule so the interface can *reflect* it — the decision itself is the
// server's, and the client never makes one (architecture.md §7).
const CONFIDENTIAL: readonly DataClassification[] = [
  "confidential",
  "personal_data",
  "strictly_confidential",
  "ai_restricted",
]

export const isConfidentialClassification = (
  classification: DataClassification,
): boolean => CONFIDENTIAL.includes(classification)
