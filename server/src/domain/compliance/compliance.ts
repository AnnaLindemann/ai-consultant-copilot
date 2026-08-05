import {
  CLASSIFICATION_RANK,
  type AiDenialReason,
  type CompliancePolicy,
  type DataClassification,
  type EngagementAiProcessingPermission,
  type EngagementDpiaScreening,
  type LegalBasis,
  type WorkspaceAiModelApproval,
  type WorkspaceDpiaStatus,
} from "../../../../shared/compliance.schema.js"

// The compliance side of the domain (roadmap Phase 10). This module is the
// *single* place the rules live: what counts as confidential, whether an AI
// request may be sent at all, whether personal data must be redacted first, and
// when a retained record is past its retention period.
//
// It is pure: no HTTP, no Prisma, no provider, no clock of its own. Every rule
// here is testable without infrastructure, which is what makes "AI processing
// never bypasses workspace policy" a reviewable claim rather than a hope.
//
// It deliberately mirrors `domain/access/access.ts`: one decision function,
// asked in a fixed order, denying by default.

// The classifications that count as confidential client information. Personal
// data is included: it is regulated content whose disclosure harms the person
// it describes, so a policy that refuses confidential AI processing refuses it
// too.
const CONFIDENTIAL_FLOOR = CLASSIFICATION_RANK.confidential

export const isConfidential = (classification: DataClassification): boolean =>
  CLASSIFICATION_RANK[classification] >= CONFIDENTIAL_FLOOR

// Content that may never be sent to an AI provider, whatever any policy says.
export const isAiRestricted = (classification: DataClassification): boolean =>
  classification === "ai_restricted"

// Content that carries personal data in the GDPR sense and must therefore be
// redacted before it reaches a provider.
//
// `strictly_confidential` is treated as potentially carrying personal data:
// the current model has only one classification field and no separate safe
// dimension that says "highly confidential, but no natural-person data". A
// higher confidentiality label therefore cannot be used to bypass the legal
// basis, purpose, DPIA, or redaction gates.
export const carriesPersonalData = (
  classification: DataClassification,
): boolean =>
  classification === "personal_data" ||
  classification === "strictly_confidential"

// The more protective of two classifications. A document inherits at least its
// engagement's classification: a report assembled from confidential discovery
// is not less confidential than the discovery it came from.
export const strongerClassification = (
  a: DataClassification,
  b: DataClassification,
): DataClassification =>
  CLASSIFICATION_RANK[a] >= CLASSIFICATION_RANK[b] ? a : b

// The engagement's privacy-processing record, as the decision needs it.
export type PrivacyProcessingFacts = {
  processingPurpose: string | null
  legalBasis: LegalBasis
  // The consent in force, where the basis is consent. `null` means none was
  // ever taken; a record with `withdrawn: true` means one was and is no longer.
  activeConsent: { withdrawn: boolean } | null
}

// What the caller wants to send, and to whom.
export type AiProcessingRequest = {
  // How the engagement content going into the prompt is classified.
  inputClassification: DataClassification
  // The engagement's own permission for AI assistance. Not GDPR consent.
  permission: EngagementAiProcessingPermission
  privacy: PrivacyProcessingFacts
  dpiaScreening: EngagementDpiaScreening
  workspaceDpiaStatus: WorkspaceDpiaStatus
  // The governed approval for the provider and model the deployment would
  // actually call, or `null` where the workspace has approved no such pair.
  approval: Pick<WorkspaceAiModelApproval, "status"> | null
}

export type AiProcessingDecision =
  | {
      permitted: true
      // Whether personal identifiers must be redacted before the prompt is
      // sent. When true, a request whose redaction cannot be completed is
      // refused — the pipeline never falls back to sending the original text.
      piiRedactionRequired: boolean
      // Whether the workspace requires a human to review what the AI produced
      // before it becomes accepted engagement content.
      humanReviewRequired: boolean
    }
  | { permitted: false; reason: AiDenialReason }

// The one decision point for AI processing, in a fixed order:
//
//   engagement permission → content classification → workspace AI policy →
//   privacy-processing record → consent, where the basis is consent →
//   DPIA → governed provider/model approval.
//
// A failure at any step is a refusal, and the refusal happens *before* a prompt
// is built, so no client content can leave on a request that was never
// permitted (roadmap Phase 10 Definition of Done: "AI processing respects
// Workspace policy, engagement restrictions, and AI consent before any request
// is sent to an external provider").
export const decideAiProcessing = (
  policy: CompliancePolicy,
  request: AiProcessingRequest,
): AiProcessingDecision => {
  // 1. The engagement's own prohibition outranks everything. A consultant who
  //    has promised a client that no AI touches their material must be able to
  //    hold that promise regardless of how the workspace is configured.
  if (request.permission === "prohibited") {
    return denied("engagement_ai_processing_prohibited")
  }

  // 2. Content classified AI-restricted never reaches a provider. This is a
  //    property of the content, not of anyone's permission, so no policy switch
  //    can re-enable it.
  if (isAiRestricted(request.inputClassification)) {
    return denied("content_ai_restricted")
  }

  // 3. The workspace policy.
  if (!policy.aiProcessingPermitted) {
    return denied("workspace_ai_processing_disabled")
  }

  const confidential = isConfidential(request.inputClassification)

  // 4. Restricted permission allows AI assistance on this engagement's
  //    non-confidential material only. It is the middle answer between "yes"
  //    and "no", and it means exactly this rather than a softer "yes".
  if (request.permission === "restricted" && confidential) {
    return denied("engagement_ai_processing_restricted_classification")
  }

  if (confidential && !policy.confidentialAiProcessingPermitted) {
    return denied("confidential_processing_not_permitted")
  }

  // 5. Processing personal data needs a purpose and a lawful basis — and an
  //    engagement's own, not the workspace's default. This is the correction
  //    the first Phase 10 implementation was missing: an internal permission to
  //    use AI says nothing about what makes the underlying processing lawful.
  const privacyRefusal = refusePersonalDataWithoutLawfulBasis(request)
  if (privacyRefusal !== null) return denied(privacyRefusal)

  // 6. A DPIA that is required and not approved stops the processing it was
  //    required for. The product never *makes* that determination — it records
  //    the human's and then holds them to it.
  const dpiaRefusal = refuseUnassessedDpia(request)
  if (dpiaRefusal !== null) return denied(dpiaRefusal)

  // 7. The provider and model must both be covered by a governed Workspace
  //    approval. Deny-by-default is the rule here as it is for access
  //    (architecture.md §7A.2): a workspace that has approved nothing has
  //    approved nothing, and a matching *string* is not an approval.
  const approvalRefusal = refuseUngovernedProvider(request)
  if (approvalRefusal !== null) return denied(approvalRefusal)

  return {
    permitted: true,
    piiRedactionRequired: isPiiRedactionRequired(policy, request),
    humanReviewRequired: policy.humanApprovalRequiredForAiOutput,
  }
}

// Whether personal data may lawfully be sent at all.
//
// The check is scoped to requests that actually carry personal data: an
// engagement classified `internal` whose content is a process description does
// not need an Article 6 basis to be summarized, and demanding one would stop
// ordinary work to no protective end. Where the content *is* personal data,
// though, a missing purpose or an unassessed basis is a refusal — the
// application will not send personal data to a provider under a legal basis
// nobody has determined.
const refusePersonalDataWithoutLawfulBasis = (
  request: AiProcessingRequest,
): AiDenialReason | null => {
  if (!carriesPersonalData(request.inputClassification)) return null

  const { processingPurpose, legalBasis, activeConsent } = request.privacy

  if (processingPurpose === null || processingPurpose.trim().length === 0) {
    return "processing_purpose_not_recorded"
  }

  if (legalBasis === "not_assessed") return "legal_basis_not_assessed"

  // Consent is the one basis the product can hold to account, because it is the
  // one whose withdrawal is an event in the system. A basis of consent with no
  // consent record behind it is a claim, not a basis.
  if (legalBasis === "consent") {
    if (activeConsent === null) return "consent_record_missing"
    if (activeConsent.withdrawn) return "consent_withdrawn"
  }

  return null
}

// Whether the DPIA position permits this processing.
//
// Personal data again scopes the question: a DPIA assesses the risk of
// processing personal data, so content that carries none is not held up by one.
const refuseUnassessedDpia = (
  request: AiProcessingRequest,
): AiDenialReason | null => {
  if (!carriesPersonalData(request.inputClassification)) return null

  switch (request.dpiaScreening) {
    case "not_assessed":
      return "dpia_not_screened"
    case "additional_required":
      // The screening itself says a further assessment is needed and it has not
      // been completed. Nothing else in the system may overrule that.
      return "dpia_required_not_completed"
    case "within_standard_dpia":
      // The engagement relies on the workspace's standard assessment, so that
      // assessment has to actually be approved. `not_required` is an approved
      // conclusion too: a workspace may have determined, and recorded, that no
      // DPIA is needed for the standard operation.
      return request.workspaceDpiaStatus === "approved" ||
        request.workspaceDpiaStatus === "not_required"
        ? null
        : "workspace_dpia_not_approved"
    case "additional_not_required":
    case "additional_completed":
      return null
  }
}

// Whether a governed Workspace approval covers the provider and model that
// would actually be called.
const refuseUngovernedProvider = (
  request: AiProcessingRequest,
): AiDenialReason | null => {
  if (request.approval === null) return "provider_model_not_approved"

  switch (request.approval.status) {
    case "approved":
      return null
    case "needs_review":
      return "provider_model_approval_needs_review"
    case "revoked":
      return "provider_model_approval_revoked"
  }
}

// Whether personal identifiers must be removed before this request is sent.
//
// Three independent grounds, any of which is sufficient: the workspace requires
// it, the content is classified as personal data, or the engagement's AI
// permission is restricted — a consultant who limited AI assistance to
// non-confidential material has not thereby agreed to send names and addresses.
export const isPiiRedactionRequired = (
  policy: CompliancePolicy,
  request: Pick<AiProcessingRequest, "inputClassification" | "permission">,
): boolean =>
  policy.redactPersonalDataBeforeAi ||
  carriesPersonalData(request.inputClassification) ||
  request.permission === "restricted"

// How an AI-assisted step's output is classified.
//
// The correction that matters here (roadmap Phase 10 corrections §5): an output
// is **never** downgraded merely because the input was redacted. The model's
// response is re-scanned with the same rules first, and this function is given
// what that scan found.
//
//  - Personal identifiers in the response mean the output carries personal
//    data, whatever the input was and whatever redaction claimed to do.
//  - Only a response that was scanned and came back clean may drop from
//    `personal_data` to `confidential` — the material it describes really has
//    been reduced to placeholders.
//  - An unscanned response keeps its input's classification. Silence is not
//    evidence of absence.
export const outputClassificationFor = (input: {
  inputClassification: DataClassification
  piiRedactionApplied: boolean
  outputScan: "not_scanned" | "clean" | "personal_data_detected"
}): DataClassification => {
  if (input.outputScan === "personal_data_detected") {
    return strongerClassification(input.inputClassification, "personal_data")
  }

  if (
    input.outputScan === "clean" &&
    input.piiRedactionApplied &&
    input.inputClassification === "personal_data"
  ) {
    return "confidential"
  }

  return input.inputClassification
}

// Whether client data may be permanently erased right now.
//
// The GDPR right to erasure is not absolute: a legal obligation to keep a
// record outranks it. A **legal hold** is how that obligation is recorded on an
// engagement, and it is the only thing that blocks erasure — a retention period
// that has not yet elapsed does not, because retention says how long data is
// kept *by default*, not how long the client is obliged to leave it there.
export const canEraseClientData = (engagement: {
  legalHold: boolean
}): boolean => !engagement.legalHold

// When a record reaches the end of its configured retention period. `null`
// retention means "kept until explicitly erased", which has no due date.
export const retentionDueAt = (
  createdAt: Date,
  retentionDays: number | null,
): Date | null => {
  if (retentionDays === null) return null

  const due = new Date(createdAt.getTime())
  due.setUTCDate(due.getUTCDate() + retentionDays)
  return due
}

export const isPastRetention = (
  createdAt: Date,
  retentionDays: number | null,
  now: Date,
): boolean => {
  const due = retentionDueAt(createdAt, retentionDays)
  return due !== null && due <= now
}

// The moment before which a record of the given age is past its retention
// period. `null` retention has no cutoff, which is what makes "kept until
// explicitly erased" mean exactly that.
export const retentionCutoff = (
  retentionDays: number | null,
  now: Date,
): Date | null => {
  if (retentionDays === null) return null

  const cutoff = new Date(now.getTime())
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays)
  return cutoff
}

// The policy every workspace starts under, so that "every engagement operates
// under an explicit Workspace Compliance Policy" holds from the moment a
// workspace exists rather than from the moment an administrator first visits
// the settings (roadmap Phase 10 Definition of Done).
//
// The defaults keep the workbench working while classifying honestly: an
// engagement's material is confidential until someone says otherwise, personal
// identifiers are redacted before they reach a provider, and AI output is
// reviewed by a human before it becomes accepted engagement content. AI
// assistance itself stays on — including on confidential material — because the
// product is an AI workbench and a default that stopped every stage would leave
// the application not working, which no phase may do (roadmap "How to read this
// roadmap").
//
// The legal basis default is `not_assessed`, and it is the one default that is
// deliberately *not* convenient: a legal basis is a human's determination, and
// a workspace that starts by asserting one would be asserting it for work
// nobody has looked at. AI processing of personal data is refused until someone
// does.
export const defaultCompliancePolicy = (): CompliancePolicy => ({
  defaultDataClassification: "confidential",
  clientDataExportPermitted: true,
  documentDownloadLinkTtlMinutes: 15,
  encryptDocumentsAtRest: true,
  requireEncryptedTransport: true,

  aiProcessingPermitted: true,
  confidentialAiProcessingPermitted: true,
  redactPersonalDataBeforeAi: true,
  humanApprovalRequiredForAiOutput: true,

  supportedLegalBases: [
    "contract",
    "legitimate_interest",
    "legal_obligation",
    "consent",
    "not_assessed",
  ],
  defaultLegalBasis: "not_assessed",

  engagementRetentionDays: null,
  documentRetentionDays: null,
  auditRetentionDays: null,
  aiArtifactRetentionDays: null,

  personalIdentifierRules: [],
  regulatoryFrameworks: [
    { code: "GDPR", enabled: true },
    { code: "EU_AI_ACT", enabled: true },
  ],
})

const denied = (reason: AiDenialReason): AiProcessingDecision => ({
  permitted: false,
  reason,
})
