import { defaultCompliancePolicy } from "./compliance.js"

import type {
  RecordEngagementConsent,
  UpsertAiModelApproval,
} from "../../../../shared/compliance.schema.js"

type ConsentRecordInput = RecordEngagementConsent & {
  engagementId: string
  recordedByUserId: string
}

type AiModelApprovalInput = UpsertAiModelApproval

// A stored Workspace Compliance Policy, in the shape the repository returns
// one. It exists so the AI-assisted stage tests can replace the *storage* seam
// and still run the real compliance gate and the real policy rules, rather than
// mocking away the decision they are meant to keep honest.
//
// It is deliberately a permissive, fully-configured policy: a stage test is
// about the stage. The refusals themselves are tested where the rules live
// (`compliance.test.ts`) and where the gate is applied.
export const compliancePolicyRowFixture = (
  overrides: Partial<ReturnType<typeof defaultCompliancePolicy>> = {},
) => {
  const policy = {
    ...defaultCompliancePolicy(),
    ...overrides,
  }

  return {
    ...policy,
    personalIdentifierRules: [...policy.personalIdentifierRules],
    regulatoryFrameworks: [...policy.regulatoryFrameworks],
    // Configured, so reading it never triggers the one-time seeding write.
    configuredAt: new Date("2026-08-01T00:00:00.000Z"),
    configuredByUserId: "user_admin",
  }
}

// The compliance repository, replaced wholesale, for a test whose subject is
// something else — an AI stage, or workspace bootstrap — that now reads the
// policy on its way through.
//
// It lives here rather than being repeated in each test file so that adding a
// repository operation does not silently leave several suites unable to load
// the module they mock.
//
// The stored policy is read through a function so a test can change it between
// cases: binding the value once would freeze whatever the first case set.
export const compliancePolicyRepositoryMock = (
  readRow: () => ReturnType<typeof compliancePolicyRowFixture> =
    compliancePolicyRowFixture,
) => ({
  ensureCompliancePolicyRow: async () => readRow(),
  getCompliancePolicyRow: async () => readRow(),
  updateCompliancePolicyRow: async () => readRow(),
  markStageRunsReviewed: async () => ({ count: 0 }),
  countStageRunsAwaitingReview: async () => 0,
  countAnalysisRunsAwaitingReview: async () => 0,
  countPiiRedactionFailures: async () => 0,
  countAiOutputsWithPersonalData: async () => 0,
  countAiModelApprovalsNeedingReview: async () => 0,
  countEngagementsWithoutLegalBasis: async () => 0,
  countEngagementsWithWithdrawnConsent: async () => 0,
  countEngagementsAwaitingDpiaScreening: async () => 0,
  countAuditEventsOfType: async () => 0,
  countEngagementsByClassification: async () => [],
  countEngagementsUnderLegalHold: async () => 0,
  countEngagementsWithRestrictedAi: async () => 0,
  updateEngagementCompliance: async () => true,
  updateEngagementPrivacyProcessing: async () => true,
  listConsentRecords: async () => [],
  findActiveConsentRecord: async () => null,
  createConsentRecord: async (_scope: unknown, input: ConsentRecordInput) => ({
    id: "consent_1",
    consentText: input.consentText,
    consentTextVersion: input.consentTextVersion,
    processingPurpose: input.processingPurpose,
    subjectName: input.subjectName,
    subjectRole: input.subjectRole,
    subjectOrganization: input.subjectOrganization,
    privacyNoticeVersion: input.privacyNoticeVersion,
    grantedAt: new Date("2026-08-01T00:00:00.000Z"),
    recordedByUserId: input.recordedByUserId,
    withdrawnAt: null,
    withdrawnByUserId: null,
    withdrawalNote: null,
  }),
  withdrawConsentRecord: async () => true,
  getWorkspaceDpiaRow: async () => null,
  ensureWorkspaceDpiaRow: async () => ({
    status: "not_required" as const,
    scope: null,
    rationale: null,
    documentReference: null,
    assessedByUserId: null,
    approvedByUserId: null,
    assessedAt: null,
    reviewDueAt: null,
  }),
  updateWorkspaceDpiaRow: async () => ({}),
  findAiModelApproval: async (
    _scope: unknown,
    provider: string,
    model: string,
  ) =>
    provider === "groq" && model === "llama-3.3-70b-versatile"
      ? {
          id: "approval_1",
          provider,
          model,
          technologyProfileCode: "groq_llama",
          reviewedProfileRevision: 1,
          status: "approved" as const,
          statusReason: null,
          dpaStatus: "in_place" as const,
          dpaReference: "DPA-1",
          processingRegion: "EU",
          promptRetention: "not_retained" as const,
          trainingUse: "excluded" as const,
          thirdCountryTransferMechanism: null,
          approvedAt: new Date("2026-08-01T00:00:00.000Z"),
          approvedByUserId: "user_admin",
          lastReviewedAt: new Date("2026-08-01T00:00:00.000Z"),
        }
      : null,
  listAiModelApprovals: async () => [],
  getAiModelApprovalById: async () => ({
    id: "approval_1",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    technologyProfileCode: "groq_llama",
    reviewedProfileRevision: 1,
    status: "approved" as const,
    statusReason: null,
    dpaStatus: "in_place" as const,
    dpaReference: "DPA-1",
    processingRegion: "EU",
    promptRetention: "not_retained" as const,
    trainingUse: "excluded" as const,
    thirdCountryTransferMechanism: null,
    approvedAt: new Date("2026-08-01T00:00:00.000Z"),
    approvedByUserId: "user_admin",
    lastReviewedAt: new Date("2026-08-01T00:00:00.000Z"),
  }),
  upsertAiModelApproval: async (
    _scope: unknown,
    input: AiModelApprovalInput,
  ) => ({
    id: "approval_1",
    provider: input.provider,
    model: input.model,
    technologyProfileCode: input.technologyProfileCode ?? null,
    reviewedProfileRevision: 1,
    status: input.status,
    statusReason: null,
    dpaStatus: input.dpaStatus,
    dpaReference: input.dpaReference ?? null,
    processingRegion: input.processingRegion ?? null,
    promptRetention: input.promptRetention,
    trainingUse: input.trainingUse,
    thirdCountryTransferMechanism:
      input.thirdCountryTransferMechanism ?? null,
    approvedAt:
      input.status === "approved"
        ? new Date("2026-08-01T00:00:00.000Z")
        : null,
    approvedByUserId: input.status === "approved" ? "user_admin" : null,
    lastReviewedAt: new Date("2026-08-01T00:00:00.000Z"),
  }),
  deleteAiModelApproval: async () => true,
  flagAiModelApprovalsForProfile: async () => [],
  readEngagementForExport: async () => null,
  deleteEngagementPermanently: async () => false,
  countPastRetention: async () => ({
    engagements: { due: 0, heldBack: 0 },
    documents: { due: 0, heldBack: 0 },
    auditEntries: { due: 0, heldBack: 0 },
    aiArtifacts: { due: 0, heldBack: 0 },
  }),
  deleteDocumentsPastRetention: async () => 0,
  deleteAiArtifactsPastRetention: async () => 0,
  deleteAuditEntriesPastRetention: async () => 0,
  listPastRetentionItemIds: async () => ({
    engagements: [],
    documents: [],
    auditEntries: [],
    aiArtifacts: [],
  }),
  minimizeAuditEntriesForEngagement: async () => 0,
})
