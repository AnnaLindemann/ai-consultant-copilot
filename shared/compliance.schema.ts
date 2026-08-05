import { z } from "zod"

// The Security, Privacy & AI Compliance contract shared by client and server
// (roadmap Phase 10). Every identifier here is English and is never translated;
// the frontend maps each one to a German label (coding-standards.md §12A).

// How sensitive a piece of engagement content, a document, or a generated
// output is (roadmap Phase 10 "Data Classification"). One enum rather than a
// sensitivity level plus a set of flags, because the roadmap names one list and
// a classification is one answer to "what is this?".
//
// `personal_data` and `ai_restricted` are classifications in their own right,
// not modifiers: personal data is regulated content that must be redacted
// before it reaches a provider, and AI-restricted content never reaches one at
// all. Their place on the sensitivity ladder is `classificationRank` below.
export const dataClassificationSchema = z.enum([
  "public",
  "internal",
  "confidential",
  "personal_data",
  "strictly_confidential",
  "ai_restricted",
])

export type DataClassification = z.infer<typeof dataClassificationSchema>

// How protected each classification is, relative to the others. Used to compare
// a request's classification against what a policy permits — never to *display*
// an order, and never persisted: the stored value is the identifier.
export const CLASSIFICATION_RANK: Record<DataClassification, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  personal_data: 3,
  strictly_confidential: 4,
  ai_restricted: 5,
}

// The engagement's own permission for AI processing.
//
// **This is an internal Engagement-level permission, not consent under GDPR
// Article 6(1)(a).** It records what the consulting team has decided about
// using AI on this engagement's material; it says nothing about which legal
// basis makes the underlying processing of personal data lawful. That is
// `legalBasisSchema` below, and — where the basis is genuinely consent — the
// consent record in `engagementConsentRecordSchema`. Conflating the two was the
// defect this naming exists to prevent.
//
//  - `allowed`     — the workspace policy decides.
//  - `restricted`  — AI may assist, but only on content that is not
//                    confidential, and only after PII redaction.
//  - `prohibited`  — no AI processing for this engagement, whatever the policy
//                    permits.
export const engagementAiProcessingPermissionSchema = z.enum([
  "allowed",
  "restricted",
  "prohibited",
])

export type EngagementAiProcessingPermission = z.infer<
  typeof engagementAiProcessingPermissionSchema
>

// The GDPR Article 6 legal basis under which this engagement's personal data is
// processed. `not_assessed` is the honest starting value and the only one the
// product ever writes on its own: a legal basis is a human's determination, and
// a back-filled one would be an invented one.
export const legalBasisSchema = z.enum([
  "contract",
  "legitimate_interest",
  "legal_obligation",
  "consent",
  "not_assessed",
])

export type LegalBasis = z.infer<typeof legalBasisSchema>

// What was done about personal data before the request left for the provider.
//
// Deliberately **redaction**, not anonymization: the implementation replaces
// recognized identifiers with stable placeholders, which is pseudonymization at
// best — reversible by anyone holding the original text — and is not the
// irreversible anonymization that would take the data out of the GDPR's scope.
// Recorded on every Analysis Run so an auditor can tell a request that needed no
// redaction from one that was redacted, and both from one that was refused
// because redaction could not be completed.
export const piiRedactionStatusSchema = z.enum([
  "not_required",
  "applied",
  "failed",
])

export type PiiRedactionStatus = z.infer<typeof piiRedactionStatusSchema>

// What the re-scan of the model's *response* found (roadmap Phase 10
// corrections §5). An output is never assumed clean because the input was
// redacted: it is scanned with the same rules before it is classified or
// persisted as usable content.
export const aiOutputScanOutcomeSchema = z.enum([
  "not_scanned",
  "clean",
  "personal_data_detected",
])

export type AiOutputScanOutcome = z.infer<typeof aiOutputScanOutcomeSchema>

// Whether a human has reviewed what the AI produced. `not_required` is recorded
// when the workspace policy does not demand approval before AI output becomes
// accepted engagement content; `pending` becomes `reviewed` only when an
// authorized human accepts that stage's output — saving an ordinary draft is
// not a review and never clears it.
export const humanReviewStatusSchema = z.enum([
  "not_required",
  "pending",
  "reviewed",
])

export type HumanReviewStatus = z.infer<typeof humanReviewStatusSchema>

export const aiAssistedStageSchema = z.enum([
  "analysis",
  "assessment",
  "prioritization",
  "solution_matching",
  "roadmap",
  "report",
])

export type AiAssistedStage = z.infer<typeof aiAssistedStageSchema>

export const reviewAiOutputSchema = z.object({
  stage: aiAssistedStageSchema,
})

export type ReviewAiOutput = z.infer<typeof reviewAiOutputSchema>

// Why an AI-assisted step ran, in compliance terms — the "purpose" a processing
// record has to name. It is deliberately separate from the Analysis Run's
// `stage`: the stage says where in the methodology the step sat, the purpose
// says what the personal data was processed *for*.
export const aiProcessingPurposeSchema = z.enum([
  "engagement_analysis",
  "assessment_generation",
  "opportunity_prioritization",
  "solution_matching",
  "roadmap_assembly",
  "report_drafting",
])

export type AiProcessingPurpose = z.infer<typeof aiProcessingPurposeSchema>

// Why an AI request was refused. Each is a compliance outcome the consultant
// can act on, not an error (architecture.md §13), and each is recorded in the
// Audit Trail as a denied AI request.
export const aiDenialReasonSchema = z.enum([
  "workspace_ai_processing_disabled",
  "engagement_ai_processing_prohibited",
  "engagement_ai_processing_restricted_classification",
  "content_ai_restricted",
  "confidential_processing_not_permitted",
  // Privacy-processing record: personal data may not be sent to a provider
  // under a legal basis nobody has determined.
  "processing_purpose_not_recorded",
  "legal_basis_not_assessed",
  // Where the determined basis is consent, a real consent record must exist and
  // must not have been withdrawn.
  "consent_record_missing",
  "consent_withdrawn",
  // The DPIA screening either has not happened or says an additional
  // assessment is required and has not been approved.
  "dpia_not_screened",
  "dpia_required_not_completed",
  "workspace_dpia_not_approved",
  // The governed Workspace approval for the provider/model actually configured.
  "provider_model_not_approved",
  "provider_model_approval_needs_review",
  "provider_model_approval_revoked",
  "pii_redaction_failed",
])

export type AiDenialReason = z.infer<typeof aiDenialReasonSchema>

// Why an AI *result* was refused after it came back. Separate from the denial
// reasons above because nothing was refused before transmission — the request
// ran, and what came back could not be used.
export const aiOutputRejectionReasonSchema = z.enum([
  "output_personal_data_detected",
])

export type AiOutputRejectionReason = z.infer<
  typeof aiOutputRejectionReasonSchema
>

// The kinds of personal identifier the redactor recognizes (roadmap Phase 10:
// "names, email addresses, telephone numbers, postal addresses, contract
// identifiers, and other configurable personal identifiers"). `custom` covers
// the workspace's own configured identifiers.
export const personalIdentifierKindSchema = z.enum([
  "person_name",
  "email",
  "phone",
  "postal_address",
  "contract_identifier",
  "iban",
  "custom",
])

export type PersonalIdentifierKind = z.infer<
  typeof personalIdentifierKindSchema
>

// A workspace-configured personal identifier. `literal` matches a term exactly
// (a contact's name, a customer number); `pattern` is a regular expression for
// an identifier format the client uses. Configuration, not code — the roadmap
// requires regulatory rules to be configurable rather than hard-coded, and an
// administrator creates, edits and removes these rules in the workspace's
// compliance settings.
export const personalIdentifierRuleSchema = z.object({
  label: z.string().min(1).max(80),
  kind: personalIdentifierKindSchema,
  match: z.enum(["literal", "pattern"]),
  value: z.string().min(1).max(400),
})

export type PersonalIdentifierRule = z.infer<
  typeof personalIdentifierRuleSchema
>

export const previewPersonalIdentifierRulesSchema = z.object({
  text: z.string().max(8000),
  rules: z.array(personalIdentifierRuleSchema).max(100).optional(),
})

export type PreviewPersonalIdentifierRules = z.infer<
  typeof previewPersonalIdentifierRulesSchema
>

// A regulatory framework the workspace operates under, kept as configuration so
// a new jurisdiction is a policy change rather than a code change (roadmap
// Phase 10: "keeping regulatory rules configurable rather than hard-coded").
export const regulatoryFrameworkSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "codes are English identifiers"),
  enabled: z.boolean(),
  note: z.string().max(400).optional(),
})

export type RegulatoryFramework = z.infer<typeof regulatoryFrameworkSchema>

// A retention period in days. `null` means "kept until explicitly erased" — an
// explicit decision, not an unset field.
const retentionDaysSchema = z.number().int().min(1).max(36500).nullable()

// The unified Workspace Compliance Policy (roadmap Phase 10). Its named parts —
// data handling, AI policy, privacy processing and data retention — live on one
// record because the roadmap describes one policy per workspace, and because a
// rule that is split across records is a rule nobody can read in one place.
export const compliancePolicySchema = z.object({
  // Data handling.
  defaultDataClassification: dataClassificationSchema,
  clientDataExportPermitted: z.boolean(),
  documentDownloadLinkTtlMinutes: z.number().int().min(1).max(1440),
  encryptDocumentsAtRest: z.boolean(),
  requireEncryptedTransport: z.boolean(),

  // AI policy.
  aiProcessingPermitted: z.boolean(),
  confidentialAiProcessingPermitted: z.boolean(),
  redactPersonalDataBeforeAi: z.boolean(),
  humanApprovalRequiredForAiOutput: z.boolean(),

  // Privacy processing. The workspace may declare which legal bases its
  // engagements are allowed to select and which one a new engagement starts
  // from — but the *effective* purpose and basis are always the individual
  // engagement's own, never inherited silently from here.
  supportedLegalBases: z.array(legalBasisSchema).min(1).max(5),
  defaultLegalBasis: legalBasisSchema,

  // Data retention.
  engagementRetentionDays: retentionDaysSchema,
  documentRetentionDays: retentionDaysSchema,
  auditRetentionDays: retentionDaysSchema,
  aiArtifactRetentionDays: retentionDaysSchema,

  // Configurable rules.
  personalIdentifierRules: z.array(personalIdentifierRuleSchema).max(100),
  regulatoryFrameworks: z.array(regulatoryFrameworkSchema).max(20),
})

export type CompliancePolicy = z.infer<typeof compliancePolicySchema>

// An administrator's edit. Every field is optional so a change to one rule does
// not require restating the rest, and the server merges onto the stored policy.
export const updateCompliancePolicySchema = compliancePolicySchema.partial()

export type UpdateCompliancePolicy = z.infer<
  typeof updateCompliancePolicySchema
>

// --- The engagement's privacy-processing record ----------------------------

// What the engagement's personal data is processed *for* and what makes that
// lawful (roadmap Phase 10 corrections §2). Recorded per engagement because the
// workspace's default is a starting point, not a determination: two engagements
// under one workspace can rest on different bases.
export const engagementPrivacyProcessingSchema = z.object({
  // The processing purpose in the GDPR sense, in the consultant's own words.
  // Null until someone states it; AI processing of personal data is refused
  // while it is missing.
  processingPurpose: z.string().max(2000).nullable(),
  legalBasis: legalBasisSchema,
  // The reasoning, the DPA clause, the legitimate-interest balancing test — a
  // free-text reference rather than a modeled legal argument.
  legalBasisNote: z.string().max(4000).nullable(),
  // Who confirmed this record, and when. A determination has an author.
  confirmedAt: z.string().nullable(),
  confirmedByUserId: z.string().nullable(),
})

export type EngagementPrivacyProcessing = z.infer<
  typeof engagementPrivacyProcessingSchema
>

export const updateEngagementPrivacyProcessingSchema = z
  .object({
    processingPurpose: z.string().max(2000).nullable().optional(),
    legalBasis: legalBasisSchema.optional(),
    legalBasisNote: z.string().max(4000).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "at least one privacy-processing field must be given",
  )

export type UpdateEngagementPrivacyProcessing = z.infer<
  typeof updateEngagementPrivacyProcessingSchema
>

// --- Actual GDPR consent ----------------------------------------------------

// A real consent record under GDPR Article 6(1)(a), recorded **only** where the
// engagement's determined legal basis is `consent` (roadmap Phase 10
// corrections §3).
//
// It is deliberately narrow. It records that a named subject was shown a named
// consent text describing a named purpose, and when. It does **not** model
// third-party consent: a company representative's agreement does not cover the
// personal data of that company's employees, customers or other third parties,
// and this product does not pretend otherwise. Anything wider is a legal
// question for a human, not a field.
export const engagementConsentRecordSchema = z.object({
  id: z.string(),
  // The exact wording the subject agreed to, and the version it was published
  // under. Both are kept: a consent nobody can reproduce is not evidence.
  consentText: z.string().min(1).max(8000),
  consentTextVersion: z.string().min(1).max(80),
  // What the subject was told the processing is for. Kept separately from the
  // engagement's own purpose so a later edit of the engagement record cannot
  // silently re-describe what somebody consented to.
  processingPurpose: z.string().min(1).max(2000),
  // Who consented, as identified at the time.
  subjectName: z.string().min(1).max(200),
  subjectRole: z.string().max(200).nullable(),
  subjectOrganization: z.string().max(200).nullable(),
  // The privacy notice in force when consent was taken, where one exists.
  privacyNoticeVersion: z.string().max(80).nullable(),

  grantedAt: z.string(),
  recordedByUserId: z.string().nullable(),

  // Withdrawal. A withdrawn consent stops future AI processing that depends on
  // it; the record itself is never deleted, because the account of what was
  // lawful *then* has to survive the withdrawal.
  withdrawnAt: z.string().nullable(),
  withdrawnByUserId: z.string().nullable(),
  withdrawalNote: z.string().max(2000).nullable(),
})

export type EngagementConsentRecord = z.infer<
  typeof engagementConsentRecordSchema
>

export const recordEngagementConsentSchema = engagementConsentRecordSchema.pick({
  consentText: true,
  consentTextVersion: true,
  processingPurpose: true,
  subjectName: true,
}).extend({
  subjectRole: z.string().max(200).nullable().optional(),
  subjectOrganization: z.string().max(200).nullable().optional(),
  privacyNoticeVersion: z.string().max(80).nullable().optional(),
})

export type RecordEngagementConsent = z.infer<
  typeof recordEngagementConsentSchema
>

export const withdrawEngagementConsentSchema = z.object({
  consentId: z.string().min(1),
  withdrawalNote: z.string().max(2000).optional(),
})

export type WithdrawEngagementConsent = z.infer<
  typeof withdrawEngagementConsentSchema
>

// --- DPIA / DSFA ------------------------------------------------------------

// Where the workspace's data protection impact assessment for the *standard*
// processing operation stands (roadmap Phase 10 corrections §8). One assessment
// per workspace, human-controlled throughout: the product records the outcome
// and never derives it.
export const workspaceDpiaStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "approved",
  "not_required",
])

export type WorkspaceDpiaStatus = z.infer<typeof workspaceDpiaStatusSchema>

export const workspaceDpiaSchema = z.object({
  status: workspaceDpiaStatusSchema,
  // What the standard processing operation covers, and why the conclusion
  // holds. Free text: this is a human's assessment, not a modeled argument.
  scope: z.string().max(4000).nullable(),
  rationale: z.string().max(8000).nullable(),
  // Where the assessment document itself lives. A reference, never the
  // document: the workbench is not a document management system.
  documentReference: z.string().max(500).nullable(),
  assessedByUserId: z.string().nullable(),
  approvedByUserId: z.string().nullable(),
  assessedAt: z.string().nullable(),
  reviewDueAt: z.string().nullable(),
})

export type WorkspaceDpia = z.infer<typeof workspaceDpiaSchema>

export const updateWorkspaceDpiaSchema = z
  .object({
    status: workspaceDpiaStatusSchema.optional(),
    scope: z.string().max(4000).nullable().optional(),
    rationale: z.string().max(8000).nullable().optional(),
    documentReference: z.string().max(500).nullable().optional(),
    // ISO dates, because a date the administrator states is not the date the
    // row was written.
    assessedAt: z.string().datetime().nullable().optional(),
    reviewDueAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "at least one DPIA field must be given",
  )

export type UpdateWorkspaceDpia = z.infer<typeof updateWorkspaceDpiaSchema>

// The engagement's own screening against that standard assessment. The
// application may point at risk indicators; the determination is a human's, and
// `not_assessed` is what the product says until one has been made.
export const engagementDpiaScreeningSchema = z.enum([
  "not_assessed",
  "within_standard_dpia",
  "additional_not_required",
  "additional_required",
  "additional_completed",
])

export type EngagementDpiaScreening = z.infer<
  typeof engagementDpiaScreeningSchema
>

export const updateEngagementDpiaScreeningSchema = z
  .object({
    dpiaScreening: engagementDpiaScreeningSchema.optional(),
    dpiaScreeningNote: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "at least one DPIA screening field must be given",
  )

export type UpdateEngagementDpiaScreening = z.infer<
  typeof updateEngagementDpiaScreeningSchema
>

// --- Governed workspace AI provider/model approvals ------------------------

// Where a workspace's approval of one provider/model stands (roadmap Phase 10
// corrections §6). Deny-by-default: only `approved` permits an AI request.
//
// `needs_review` is reached two ways — a free-text provider/model list carried
// over from the first Phase 10 implementation, and a compliance-relevant change
// to the linked Technology Profile — and both mean the same thing: an
// Administrator has to look at this again before it is used.
export const aiModelApprovalStatusSchema = z.enum([
  "approved",
  "needs_review",
  "revoked",
])

export type AiModelApprovalStatus = z.infer<typeof aiModelApprovalStatusSchema>

export const dpaStatusSchema = z.enum([
  "in_place",
  "not_required",
  "pending",
  "not_assessed",
])

export type DpaStatus = z.infer<typeof dpaStatusSchema>

// What the workspace decided about the provider retaining prompts and inputs.
export const promptRetentionDecisionSchema = z.enum([
  "not_retained",
  "retained_limited",
  "retained_unknown",
])

export type PromptRetentionDecision = z.infer<
  typeof promptRetentionDecisionSchema
>

// What the workspace decided about the provider training on its inputs.
export const trainingUseDecisionSchema = z.enum([
  "excluded",
  "permitted",
  "unknown",
])

export type TrainingUseDecision = z.infer<typeof trainingUseDecisionSchema>

// The workspace's own approval of one provider/model for AI processing.
//
// It is deliberately **workspace-scoped and separate from the Technology
// Knowledge Base**: the shared KB holds source-backed reusable facts about a
// provider, curated through the Technology Update Proposal flow; a contract, a
// selected region and an approval decision belong to one workspace and are
// nobody else's business. Storing them in the shared KB would make one
// workspace's commercial arrangements everybody's curated knowledge.
export const workspaceAiModelApprovalSchema = z.object({
  id: z.string(),
  // The provider and model as the running deployment names them. This is what
  // the gate matches against, so it is the deployment's identity and not a
  // display name.
  provider: z.string().min(1).max(60),
  model: z.string().min(1).max(120),

  // The Technology Profile whose source-backed facts were reviewed. Null on an
  // approval carried over from the free-text lists, which is exactly why such
  // an approval starts as `needs_review`.
  technologyProfileCode: z.string().max(80).nullable(),
  // Which revision of that profile was reviewed, so a later approved change to
  // it can be recognized as newer than this decision.
  reviewedProfileRevision: z.number().int().nonnegative().nullable(),

  status: aiModelApprovalStatusSchema,
  // Why the approval is awaiting review, where the product knows. Free of
  // client content: it names facts about the provider, never an engagement.
  statusReason: z.string().max(500).nullable(),

  dpaStatus: dpaStatusSchema,
  dpaReference: z.string().max(500).nullable(),
  processingRegion: z.string().max(120).nullable(),
  promptRetention: promptRetentionDecisionSchema,
  trainingUse: trainingUseDecisionSchema,
  // How personal data reaching a third country is legitimated — standard
  // contractual clauses, an adequacy decision, or nothing because none is
  // needed. Free text, because the mechanism is a legal instrument the product
  // records rather than models.
  thirdCountryTransferMechanism: z.string().max(500).nullable(),

  approvedAt: z.string().nullable(),
  approvedByUserId: z.string().nullable(),
  lastReviewedAt: z.string().nullable(),
})

export type WorkspaceAiModelApproval = z.infer<
  typeof workspaceAiModelApprovalSchema
>

export const upsertAiModelApprovalSchema = z.object({
  provider: z.string().min(1).max(60),
  model: z.string().min(1).max(120),
  technologyProfileCode: z.string().max(80).nullable().optional(),
  status: aiModelApprovalStatusSchema,
  dpaStatus: dpaStatusSchema,
  dpaReference: z.string().max(500).nullable().optional(),
  processingRegion: z.string().max(120).nullable().optional(),
  promptRetention: promptRetentionDecisionSchema,
  trainingUse: trainingUseDecisionSchema,
  thirdCountryTransferMechanism: z.string().max(500).nullable().optional(),
})

export type UpsertAiModelApproval = z.infer<typeof upsertAiModelApprovalSchema>

// --- Retention --------------------------------------------------------------

// The kinds of record a retention period governs. Named rather than derived, so
// a preview and an execution are always talking about the same four things.
export const retentionCategorySchema = z.enum([
  "engagements",
  "documents",
  "audit_entries",
  "ai_artifacts",
])

export type RetentionCategory = z.infer<typeof retentionCategorySchema>

// What a retention run *would* do, per category. Nothing is deleted to produce
// it (roadmap Phase 10 corrections §10: a safe, administrator-visible preview).
export const retentionPreviewEntrySchema = z.object({
  category: retentionCategorySchema,
  retentionDays: z.number().int().nullable(),
  // Records past the configured period that this run would act on.
  dueCount: z.number().int().nonnegative(),
  // Records past the period that it would leave alone because their engagement
  // is under legal hold.
  excludedByLegalHold: z.number().int().nonnegative(),
  // Whether the manual retention action deletes records of this category, or
  // only reports them for an administrator to act on deliberately. Engagements
  // are reported, never swept: erasing a client's whole record is the explicit
  // erasure action and nothing else.
  executable: z.boolean(),
  // Safe operational identifiers. These are database ids only, never names,
  // prompts, document titles, or client-authored content.
  itemIds: z.array(z.string()).optional(),
})

export type RetentionPreviewEntry = z.infer<typeof retentionPreviewEntrySchema>

export const retentionPreviewSchema = z.object({
  generatedAt: z.string(),
  entries: z.array(retentionPreviewEntrySchema),
})

export type RetentionPreview = z.infer<typeof retentionPreviewSchema>

export const executeRetentionSchema = z.object({
  // Which categories to act on, restated by the administrator. A sweep that
  // acted on everything by default would be the accident this guards against.
  categories: z.array(retentionCategorySchema).min(1),
  // The irreversible action is restated, exactly as erasure is.
  confirm: z.literal("execute_retention"),
  // Client-chosen idempotency token. Re-running the same deletion is safe
  // because each category deletes only rows still due, but the token gives the
  // Audit Trail a stable retry marker.
  requestKey: z.string().min(1).max(120).optional(),
})

export type ExecuteRetention = z.infer<typeof executeRetentionSchema>

export const retentionResultEntrySchema = z.object({
  category: retentionCategorySchema,
  attempted: z.boolean(),
  deletedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  excludedByLegalHold: z.number().int().nonnegative(),
  // A category the administrator asked for that this action does not delete.
  reported: z.boolean(),
  success: z.boolean(),
  error: z
    .object({
      errorName: z.string(),
      errorCode: z.string().nullable(),
    })
    .nullable()
    .optional(),
  itemIds: z.array(z.string()).optional(),
})

export type RetentionResultEntry = z.infer<typeof retentionResultEntrySchema>

export const retentionResultSchema = z.object({
  executedAt: z.string(),
  entries: z.array(retentionResultEntrySchema),
})

export type RetentionResult = z.infer<typeof retentionResultSchema>

// --- The engagement's compliance state --------------------------------------

// How the engagement's content is classified, whether AI may assist with it,
// what makes processing its personal data lawful, where its DPIA screening
// stands, and whether a legal obligation currently prevents its erasure.
export const engagementComplianceSchema = z.object({
  dataClassification: dataClassificationSchema,

  aiProcessingPermission: engagementAiProcessingPermissionSchema,
  aiProcessingPermissionNotes: z.string().max(2000).nullable(),
  aiProcessingPermissionUpdatedAt: z.string().nullable(),
  aiProcessingPermissionUpdatedByUserId: z.string().nullable(),

  privacyProcessing: engagementPrivacyProcessingSchema,
  // The consent record in force, where the legal basis is consent and one has
  // been taken. Withdrawn and superseded records stay in the history the API
  // returns alongside it.
  activeConsent: engagementConsentRecordSchema.nullable(),
  consentHistory: z.array(engagementConsentRecordSchema),

  dpiaScreening: engagementDpiaScreeningSchema,
  dpiaScreeningNote: z.string().max(2000).nullable(),

  legalHold: z.boolean(),
  legalHoldReason: z.string().max(2000).nullable(),
})

export type EngagementCompliance = z.infer<typeof engagementComplianceSchema>

export const updateEngagementComplianceSchema = z
  .object({
    dataClassification: dataClassificationSchema.optional(),
    aiProcessingPermission: engagementAiProcessingPermissionSchema.optional(),
    aiProcessingPermissionNotes: z.string().max(2000).nullable().optional(),
    dpiaScreening: engagementDpiaScreeningSchema.optional(),
    dpiaScreeningNote: z.string().max(2000).nullable().optional(),
    legalHold: z.boolean().optional(),
    legalHoldReason: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "at least one compliance field must be given",
  )

export type UpdateEngagementCompliance = z.infer<
  typeof updateEngagementComplianceSchema
>

// --- The Compliance Dashboard ----------------------------------------------

// What the administrator's Compliance Dashboard reports (roadmap Phase 10).
// Every figure is read within the acting user's workspace, like every other
// aggregate (architecture.md §7A.4).
export const complianceDashboardSchema = z.object({
  policyConfiguredAt: z.string().nullable(),
  engagementsByClassification: z.record(dataClassificationSchema, z.number()),
  confidentialEngagements: z.number(),
  aiRestrictedEngagements: z.number(),
  engagementsUnderLegalHold: z.number(),
  deniedAiRequests: z.number(),
  piiRedactionFailures: z.number(),
  // AI results refused because personal identifiers came back in the response.
  aiOutputsWithPersonalData: z.number(),
  deniedPermissionAttempts: z.number(),
  analysisRunsAwaitingHumanReview: z.number(),
  // Privacy readiness, which is what tells an administrator where AI is about
  // to be refused before a consultant runs into it.
  engagementsWithoutLegalBasis: z.number(),
  engagementsWithWithdrawnConsent: z.number(),
  engagementsAwaitingDpiaScreening: z.number(),
  aiModelApprovalsNeedingReview: z.number(),
  workspaceDpiaStatus: workspaceDpiaStatusSchema,
  retention: z.object({
    engagementsPastRetention: z.number(),
    documentsPastRetention: z.number(),
    auditEntriesPastRetention: z.number(),
    aiArtifactsPastRetention: z.number(),
  }),
})

export type ComplianceDashboard = z.infer<typeof complianceDashboardSchema>

export const issueDocumentDownloadLinkSchema = z.object({
  versionId: z.string().min(1),
})

export const eraseClientDataSchema = z.object({
  // The erasure is irreversible, so the caller restates the engagement it means.
  // A mistyped identifier is refused rather than acted on.
  confirmEngagementId: z.string().min(1),
  reasonCode: z
    .enum(["client_request", "retention_follow_up", "admin_correction"])
    .default("client_request"),
  administrativeNote: z.string().max(500).optional(),
  // Backwards-compatible transport field. It is accepted while older clients
  // are updated, but never copied to the surviving Audit Trail because free
  // text can carry client identifiers.
  reason: z.string().max(2000).optional(),
})

export type EraseClientData = z.infer<typeof eraseClientDataSchema>
