import type { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"

import { engagementScopeWhere } from "./engagement.repository.js"

import type {
  CompliancePolicy,
  DataClassification,
  EngagementAiProcessingPermission,
  EngagementDpiaScreening,
  LegalBasis,
  UpsertAiModelApproval,
} from "../../../shared/compliance.schema.js"
import type { EngagementScope } from "../domain/access/access.js"

// Persistence for the Security, Privacy & AI Compliance side (roadmap Phase
// 10).
//
// The workspace is a **required** parameter of every operation, as it is on the
// access and engagement repositories: a compliance figure read across
// workspaces would be exactly the leak the boundary exists to prevent, and a
// dashboard aggregate is as much a disclosure as a record is (architecture.md
// §7A.4).

export type WorkspaceScope = { workspaceId: string }

// --- The Compliance Policy -------------------------------------------------

export const getCompliancePolicyRow = async (scope: WorkspaceScope) =>
  prisma.workspaceCompliancePolicy.findUnique({
    where: { workspaceId: scope.workspaceId },
  })

// Create the workspace's policy row if it has none. Every workspace created
// from Phase 10 onward gets one with its workspace, and the phase's migration
// back-filled the rest; this covers the remaining case of a workspace created
// by a path that predates the phase, so a policy is never simply absent.
export const ensureCompliancePolicyRow = async (
  scope: WorkspaceScope,
  seed: CompliancePolicy,
) =>
  prisma.workspaceCompliancePolicy.upsert({
    where: { workspaceId: scope.workspaceId },
    update: {},
    create: {
      workspaceId: scope.workspaceId,
      ...toPolicyColumns(seed),
    },
  })

export const updateCompliancePolicyRow = async (
  scope: WorkspaceScope,
  policy: CompliancePolicy,
  configuredByUserId: string,
) =>
  prisma.workspaceCompliancePolicy.update({
    where: { workspaceId: scope.workspaceId },
    data: {
      ...toPolicyColumns(policy),
      configuredAt: new Date(),
      configuredByUserId,
    },
  })

const toPolicyColumns = (policy: CompliancePolicy) => ({
  defaultDataClassification: policy.defaultDataClassification,
  clientDataExportPermitted: policy.clientDataExportPermitted,
  documentDownloadLinkTtlMinutes: policy.documentDownloadLinkTtlMinutes,
  encryptDocumentsAtRest: policy.encryptDocumentsAtRest,
  requireEncryptedTransport: policy.requireEncryptedTransport,
  aiProcessingPermitted: policy.aiProcessingPermitted,
  confidentialAiProcessingPermitted: policy.confidentialAiProcessingPermitted,
  redactPersonalDataBeforeAi: policy.redactPersonalDataBeforeAi,
  humanApprovalRequiredForAiOutput: policy.humanApprovalRequiredForAiOutput,
  supportedLegalBases: [...policy.supportedLegalBases],
  defaultLegalBasis: policy.defaultLegalBasis,
  engagementRetentionDays: policy.engagementRetentionDays,
  documentRetentionDays: policy.documentRetentionDays,
  auditRetentionDays: policy.auditRetentionDays,
  aiArtifactRetentionDays: policy.aiArtifactRetentionDays,
  personalIdentifierRules:
    policy.personalIdentifierRules as unknown as Prisma.InputJsonValue,
  regulatoryFrameworks:
    policy.regulatoryFrameworks as unknown as Prisma.InputJsonValue,
})

// --- The engagement's own compliance state ---------------------------------

export type EngagementComplianceUpdate = {
  dataClassification?: DataClassification
  aiProcessingPermission?: EngagementAiProcessingPermission
  aiProcessingPermissionNotes?: string | null
  dpiaScreening?: EngagementDpiaScreening
  dpiaScreeningNote?: string | null
  legalHold?: boolean
  legalHoldReason?: string | null
}

// Written through the engagement scope, like every other engagement-side write:
// an update that matched no row within the caller's reach changed nothing, and
// the caller is told the same thing it would be told about an engagement that
// does not exist.
//
// Attribution travels with the decision. Changing the AI processing permission
// or the DPIA screening stamps who changed it and when, so the engagement row
// answers "who last decided this?" without a join, and the Audit Trail keeps
// the history of every change before it.
export const updateEngagementCompliance = async (
  engagementId: string,
  scope: EngagementScope,
  update: EngagementComplianceUpdate,
  actingUserId: string,
) => {
  const now = new Date()
  const permissionChanged =
    update.aiProcessingPermission !== undefined ||
    update.aiProcessingPermissionNotes !== undefined
  const screeningChanged =
    update.dpiaScreening !== undefined || update.dpiaScreeningNote !== undefined
  const holdChanged =
    update.legalHold !== undefined || update.legalHoldReason !== undefined

  const result = await prisma.engagement.updateMany({
    where: { id: engagementId, ...engagementScopeWhere(scope) },
    data: {
      ...update,
      ...(permissionChanged
        ? {
            aiProcessingPermissionUpdatedAt: now,
            aiProcessingPermissionUpdatedByUserId: actingUserId,
          }
        : {}),
      ...(screeningChanged
        ? {
            dpiaScreeningUpdatedAt: now,
            dpiaScreeningUpdatedByUserId: actingUserId,
          }
        : {}),
      ...(holdChanged ? { legalHoldUpdatedAt: now } : {}),
    },
  })

  return result.count > 0
}

// --- The engagement's privacy-processing record ----------------------------

export type EngagementPrivacyProcessingUpdate = {
  processingPurpose?: string | null
  legalBasis?: LegalBasis
  legalBasisNote?: string | null
}

// A determination has an author: every write here stamps who confirmed it and
// when, because "the legal basis is legitimate interest" is worth nothing
// without somebody's name against it.
export const updateEngagementPrivacyProcessing = async (
  engagementId: string,
  scope: EngagementScope,
  update: EngagementPrivacyProcessingUpdate,
  actingUserId: string,
) => {
  const result = await prisma.engagement.updateMany({
    where: { id: engagementId, ...engagementScopeWhere(scope) },
    data: {
      ...update,
      privacyProcessingConfirmedAt: new Date(),
      privacyProcessingConfirmedByUserId: actingUserId,
    },
  })

  return result.count > 0
}

// --- Real GDPR consent ------------------------------------------------------

// Every consent ever taken for this engagement, newest first. Withdrawn records
// are included: the account of what was lawful *then* survives the withdrawal.
export const listConsentRecords = async (
  engagementId: string,
  scope: WorkspaceScope,
) =>
  prisma.engagementConsentRecord.findMany({
    where: { engagementId, workspaceId: scope.workspaceId },
    orderBy: { grantedAt: "desc" },
  })

// The consent currently in force, if any: the most recent record that has not
// been withdrawn.
export const findActiveConsentRecord = async (
  engagementId: string,
  scope: WorkspaceScope,
) =>
  prisma.engagementConsentRecord.findFirst({
    where: { engagementId, workspaceId: scope.workspaceId, withdrawnAt: null },
    orderBy: { grantedAt: "desc" },
  })

export const createConsentRecord = async (
  scope: WorkspaceScope,
  input: {
    engagementId: string
    consentText: string
    consentTextVersion: string
    processingPurpose: string
    subjectName: string
    subjectRole: string | null
    subjectOrganization: string | null
    privacyNoticeVersion: string | null
    recordedByUserId: string
  },
) =>
  prisma.engagementConsentRecord.create({
    data: { workspaceId: scope.workspaceId, ...input },
  })

// Withdraw one consent. Scoped to a record that is not already withdrawn, so a
// second withdrawal changes nothing and the first withdrawal's time and author
// are never overwritten.
export const withdrawConsentRecord = async (
  consentId: string,
  engagementId: string,
  scope: WorkspaceScope,
  withdrawal: { withdrawnByUserId: string; withdrawalNote: string | null },
) => {
  const result = await prisma.engagementConsentRecord.updateMany({
    where: {
      id: consentId,
      engagementId,
      workspaceId: scope.workspaceId,
      withdrawnAt: null,
    },
    data: {
      withdrawnAt: new Date(),
      withdrawnByUserId: withdrawal.withdrawnByUserId,
      withdrawalNote: withdrawal.withdrawalNote,
    },
  })

  return result.count > 0
}

// --- Governed provider/model approvals -------------------------------------

export const listAiModelApprovals = async (scope: WorkspaceScope) =>
  prisma.workspaceAiModelApproval.findMany({
    where: { workspaceId: scope.workspaceId },
    orderBy: [{ provider: "asc" }, { model: "asc" }],
  })

// The approval covering exactly the provider and model the deployment would
// call. Exact identity, never a prefix or a fuzzy match: an approval for one
// model is not an approval for another that happens to share a name.
export const findAiModelApproval = async (
  scope: WorkspaceScope,
  provider: string,
  model: string,
) =>
  prisma.workspaceAiModelApproval.findUnique({
    where: {
      workspaceId_provider_model: {
        workspaceId: scope.workspaceId,
        provider,
        model,
      },
    },
  })

export const upsertAiModelApproval = async (
  scope: WorkspaceScope,
  input: UpsertAiModelApproval,
  actor: { userId: string; reviewedProfileRevision: number | null },
) => {
  const now = new Date()
  const columns = {
    technologyProfileCode: input.technologyProfileCode ?? null,
    reviewedProfileRevision: actor.reviewedProfileRevision,
    status: input.status,
    // An administrator's own decision clears whatever reason the system had
    // recorded for asking them to look: they have looked.
    statusReason: null,
    dpaStatus: input.dpaStatus,
    dpaReference: input.dpaReference ?? null,
    processingRegion: input.processingRegion ?? null,
    promptRetention: input.promptRetention,
    trainingUse: input.trainingUse,
    thirdCountryTransferMechanism: input.thirdCountryTransferMechanism ?? null,
    lastReviewedAt: now,
    // Only an approval has an approver. A row set to `needs_review` or
    // `revoked` keeps no approval stamp, because none is in force.
    approvedAt: input.status === "approved" ? now : null,
    approvedByUserId: input.status === "approved" ? actor.userId : null,
  }

  return prisma.workspaceAiModelApproval.upsert({
    where: {
      workspaceId_provider_model: {
        workspaceId: scope.workspaceId,
        provider: input.provider,
        model: input.model,
      },
    },
    update: columns,
    create: {
      workspaceId: scope.workspaceId,
      provider: input.provider,
      model: input.model,
      ...columns,
    },
  })
}

export const deleteAiModelApproval = async (
  scope: WorkspaceScope,
  approvalId: string,
) => {
  const result = await prisma.workspaceAiModelApproval.deleteMany({
    where: { id: approvalId, workspaceId: scope.workspaceId },
  })

  return result.count > 0
}

export const getAiModelApprovalById = async (
  scope: WorkspaceScope,
  approvalId: string,
) =>
  prisma.workspaceAiModelApproval.findFirst({
    where: { id: approvalId, workspaceId: scope.workspaceId },
  })

// Send every workspace's approval of one Technology Profile back for review.
//
// Called when an approved Technology Update changed a compliance-relevant fact
// beneath those approvals (roadmap Phase 10 corrections §7). It crosses
// workspaces deliberately and is the **one** operation here that does: the
// Technology Knowledge Base belongs to no workspace, and a provider whose data
// region changed changed it for everybody. It reads and writes nothing
// engagement-specific.
export const flagAiModelApprovalsForProfile = async (
  technologyProfileCode: string,
  reason: string,
) => {
  const affected = await prisma.workspaceAiModelApproval.findMany({
    where: {
      technologyProfileCode,
      status: "approved",
    },
    select: {
      id: true,
      workspaceId: true,
      provider: true,
      model: true,
    },
  })

  if (affected.length === 0) return []

  await prisma.workspaceAiModelApproval.updateMany({
    where: {
      technologyProfileCode,
      // A revoked approval is already refused; sending it "back for review"
      // would weaken it.
      status: "approved",
    },
    data: {
      status: "needs_review",
      statusReason: reason,
      approvedAt: null,
      approvedByUserId: null,
    },
  })

  return affected
}

export const countAiModelApprovalsNeedingReview = async (
  scope: WorkspaceScope,
) =>
  prisma.workspaceAiModelApproval.count({
    where: { workspaceId: scope.workspaceId, status: "needs_review" },
  })

// --- The workspace DPIA -----------------------------------------------------

export const getWorkspaceDpiaRow = async (scope: WorkspaceScope) =>
  prisma.workspaceDpiaAssessment.findUnique({
    where: { workspaceId: scope.workspaceId },
  })

// A workspace always has a DPIA row, so "nobody has assessed this" is a visible
// state rather than an absent record.
export const ensureWorkspaceDpiaRow = async (scope: WorkspaceScope) =>
  prisma.workspaceDpiaAssessment.upsert({
    where: { workspaceId: scope.workspaceId },
    update: {},
    create: { workspaceId: scope.workspaceId },
  })

export const updateWorkspaceDpiaRow = async (
  scope: WorkspaceScope,
  update: {
    status?: "not_started" | "in_progress" | "approved" | "not_required"
    scope?: string | null
    rationale?: string | null
    documentReference?: string | null
    assessedAt?: Date | null
    reviewDueAt?: Date | null
  },
  actingUserId: string,
) =>
  prisma.workspaceDpiaAssessment.update({
    where: { workspaceId: scope.workspaceId },
    data: {
      ...update,
      assessedByUserId: actingUserId,
      // Only an approved assessment carries an approver. Moving it back to
      // `in_progress` clears the approval, because there is no longer one.
      ...(update.status === undefined
        ? {}
        : update.status === "approved" || update.status === "not_required"
          ? { approvedByUserId: actingUserId }
          : { approvedByUserId: null }),
    },
  })

// --- Analysis Run compliance metadata --------------------------------------

// Mark the AI output of one stage as reviewed by a human.
//
// It updates the runs that are still awaiting review for that engagement and
// stage, because the human accepting the stage's output is reviewing what every
// run of that stage produced up to now. It is workspace-scoped like every other
// engagement-side write, and it **throws** rather than swallowing a failure:
// the caller's accept must fail rather than proceed while the record of the
// review is missing.
export const markStageRunsReviewed = async (
  scope: WorkspaceScope,
  engagementId: string,
  stage: string,
) =>
  prisma.analysisRun.updateMany({
    where: {
      workspaceId: scope.workspaceId,
      engagementId,
      stage,
      humanReviewStatus: "pending",
    },
    data: { humanReviewStatus: "reviewed", humanReviewedAt: new Date() },
  })

// Whether any AI-assisted run for this engagement and stage is still awaiting a
// human's review. It is what the accept paths ask before letting content reach
// a trusted state.
export const countStageRunsAwaitingReview = async (
  scope: WorkspaceScope,
  engagementId: string,
  stage: string,
) =>
  prisma.analysisRun.count({
    where: {
      workspaceId: scope.workspaceId,
      engagementId,
      stage,
      humanReviewStatus: "pending",
    },
  })

export const countAnalysisRunsAwaitingReview = async (scope: WorkspaceScope) =>
  prisma.analysisRun.count({
    where: { workspaceId: scope.workspaceId, humanReviewStatus: "pending" },
  })

export const countPiiRedactionFailures = async (scope: WorkspaceScope) =>
  prisma.analysisRun.count({
    where: { workspaceId: scope.workspaceId, piiRedactionStatus: "failed" },
  })

export const countAiOutputsWithPersonalData = async (scope: WorkspaceScope) =>
  prisma.analysisRun.count({
    where: {
      workspaceId: scope.workspaceId,
      outputScanOutcome: "personal_data_detected",
    },
  })

// --- Compliance Dashboard aggregates ---------------------------------------

export const countEngagementsByClassification = async (
  scope: WorkspaceScope,
) => {
  const groups = await prisma.engagement.groupBy({
    by: ["dataClassification"],
    where: { workspaceId: scope.workspaceId },
    _count: { _all: true },
  })

  return groups.map((group) => ({
    classification: group.dataClassification,
    count: group._count._all,
  }))
}

export const countEngagementsWithRestrictedAi = async (scope: WorkspaceScope) =>
  prisma.engagement.count({
    where: {
      workspaceId: scope.workspaceId,
      OR: [
        { aiProcessingPermission: { in: ["restricted", "prohibited"] } },
        { dataClassification: "ai_restricted" },
      ],
    },
  })

export const countEngagementsUnderLegalHold = async (scope: WorkspaceScope) =>
  prisma.engagement.count({
    where: { workspaceId: scope.workspaceId, legalHold: true },
  })

// Engagements whose personal-data processing has no determined legal basis.
// This is what tells an administrator where AI is about to be refused before a
// consultant runs into it.
export const countEngagementsWithoutLegalBasis = async (
  scope: WorkspaceScope,
) =>
  prisma.engagement.count({
    where: { workspaceId: scope.workspaceId, legalBasis: "not_assessed" },
  })

// Engagements resting on consent where the consent in force has been withdrawn
// — or was never taken. Both mean the same operational thing: AI processing of
// that engagement's personal data is refused.
export const countEngagementsWithWithdrawnConsent = async (
  scope: WorkspaceScope,
) =>
  prisma.engagement.count({
    where: {
      workspaceId: scope.workspaceId,
      legalBasis: "consent",
      consentRecords: { none: { withdrawnAt: null } },
    },
  })

export const countEngagementsAwaitingDpiaScreening = async (
  scope: WorkspaceScope,
) =>
  prisma.engagement.count({
    where: {
      workspaceId: scope.workspaceId,
      dpiaScreening: { in: ["not_assessed", "additional_required"] },
    },
  })

export const countAuditEventsOfType = async (
  scope: WorkspaceScope,
  eventTypes: readonly string[],
) =>
  prisma.auditTrail.count({
    where: {
      workspaceId: scope.workspaceId,
      eventType: { in: [...eventTypes] },
    },
  })

// --- Retention -------------------------------------------------------------

// The cutoffs one retention run works from. `null` means the category has no
// configured period, so nothing of that kind is ever due.
export type RetentionCutoffs = {
  engagements: Date | null
  documents: Date | null
  audit: Date | null
  aiArtifacts: Date | null
}

// How many records of each kind have passed the configured retention period,
// split by whether a legal hold protects them.
//
// A legal hold on the engagement excludes everything belonging to it: a legal
// obligation to keep the record outranks a default retention period, exactly as
// it outranks an erasure request.
export const countPastRetention = async (
  scope: WorkspaceScope,
  cutoffs: RetentionCutoffs,
) => {
  const held = { engagement: { legalHold: true } } as const
  const notHeld = { engagement: { legalHold: false } } as const

  const [
    engagements,
    engagementsHeld,
    documents,
    documentsHeld,
    auditEntries,
    auditEntriesHeld,
    aiArtifacts,
    aiArtifactsHeld,
  ] = await Promise.all([
    cutoffs.engagements === null
      ? 0
      : prisma.engagement.count({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.engagements },
            legalHold: false,
          },
        }),
    cutoffs.engagements === null
      ? 0
      : prisma.engagement.count({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.engagements },
            legalHold: true,
          },
        }),
    cutoffs.documents === null
      ? 0
      : prisma.reportPdfArtifact.count({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.documents },
            publications: { none: {} },
            ...notHeld,
          },
        }),
    cutoffs.documents === null
      ? 0
      : prisma.reportPdfArtifact.count({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.documents },
            ...held,
          },
        }),
    cutoffs.audit === null
      ? 0
      : prisma.auditTrail.count({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.audit },
            OR: [{ engagementId: null }, { engagement: { legalHold: false } }],
          },
        }),
    cutoffs.audit === null
      ? 0
      : prisma.auditTrail.count({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.audit },
            ...held,
          },
        }),
    cutoffs.aiArtifacts === null
      ? 0
      : prisma.analysisRun.count({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.aiArtifacts },
            ...notHeld,
          },
        }),
    cutoffs.aiArtifacts === null
      ? 0
      : prisma.analysisRun.count({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.aiArtifacts },
            ...held,
          },
        }),
  ])

  return {
    engagements: { due: engagements, heldBack: engagementsHeld },
    documents: { due: documents, heldBack: documentsHeld },
    auditEntries: { due: auditEntries, heldBack: auditEntriesHeld },
    aiArtifacts: { due: aiArtifacts, heldBack: aiArtifactsHeld },
  }
}

export const listPastRetentionItemIds = async (
  scope: WorkspaceScope,
  cutoffs: RetentionCutoffs,
  limit = 100,
) => {
  const notHeld = { engagement: { legalHold: false } } as const

  const [engagements, documents, auditEntries, aiArtifacts] = await Promise.all([
    cutoffs.engagements === null
      ? []
      : prisma.engagement.findMany({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.engagements },
            legalHold: false,
          },
          orderBy: { createdAt: "asc" },
          take: limit,
          select: { id: true },
        }),
    cutoffs.documents === null
      ? []
      : prisma.reportPdfArtifact.findMany({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.documents },
            publications: { none: {} },
            ...notHeld,
          },
          orderBy: { createdAt: "asc" },
          take: limit,
          select: { id: true },
        }),
    cutoffs.audit === null
      ? []
      : prisma.auditTrail.findMany({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.audit },
            OR: [{ engagementId: null }, { engagement: { legalHold: false } }],
          },
          orderBy: { createdAt: "asc" },
          take: limit,
          select: { id: true },
        }),
    cutoffs.aiArtifacts === null
      ? []
      : prisma.analysisRun.findMany({
          where: {
            workspaceId: scope.workspaceId,
            createdAt: { lte: cutoffs.aiArtifacts },
            ...notHeld,
          },
          orderBy: { createdAt: "asc" },
          take: limit,
          select: { id: true },
        }),
  ])

  return {
    engagements: engagements.map(({ id }) => id),
    documents: documents.map(({ id }) => id),
    auditEntries: auditEntries.map(({ id }) => id),
    aiArtifacts: aiArtifacts.map(({ id }) => id),
  }
}

// Delete the rendered document artifacts that are past their retention period.
//
// Only the *rendered bytes* go. The immutable report version stays, so the
// account of what was delivered survives — this is retention of a stored file,
// not erasure of a client's record. An artifact that has ever been published to
// a client is left alone: a document somebody was given is not swept out from
// under them by a date.
export const deleteDocumentsPastRetention = async (
  scope: WorkspaceScope,
  cutoff: Date,
) => {
  const result = await prisma.reportPdfArtifact.deleteMany({
    where: {
      workspaceId: scope.workspaceId,
      createdAt: { lte: cutoff },
      publications: { none: {} },
      engagement: { legalHold: false },
    },
  })

  return result.count
}

export const deleteAiArtifactsPastRetention = async (
  scope: WorkspaceScope,
  cutoff: Date,
) => {
  const result = await prisma.analysisRun.deleteMany({
    where: {
      workspaceId: scope.workspaceId,
      createdAt: { lte: cutoff },
      engagement: { legalHold: false },
    },
  })

  return result.count
}

// Delete audit entries that are past their retention period.
//
// The Audit Trail is append-only *in the application*: no code path updates or
// removes an entry to change what it says. A governed retention run is a
// different thing — data protection requires that records not be kept
// indefinitely, and an administrator triggering this has decided how long this
// workspace keeps them. Entries belonging to an engagement under legal hold are
// never touched.
export const deleteAuditEntriesPastRetention = async (
  scope: WorkspaceScope,
  cutoff: Date,
) => {
  const result = await prisma.auditTrail.deleteMany({
    where: {
      workspaceId: scope.workspaceId,
      createdAt: { lte: cutoff },
      OR: [{ engagementId: null }, { engagement: { legalHold: false } }],
    },
  })

  return result.count
}

// --- GDPR export and erasure ----------------------------------------------

// Everything the workspace holds about one engagement, for the client-data
// export a data subject may request. Read through the caller's engagement
// reach, so an export can never become the route by which an engagement leaves
// its workspace.
export const readEngagementForExport = async (
  engagementId: string,
  scope: EngagementScope,
) =>
  prisma.engagement.findFirst({
    where: { id: engagementId, ...engagementScopeWhere(scope) },
    include: {
      organization: true,
      owningManager: { select: { id: true, email: true, displayName: true } },
      opportunityVersions: { orderBy: { versionNumber: "asc" } },
      recommendationVersions: { orderBy: { versionNumber: "asc" } },
      roadmapVersions: { orderBy: { versionNumber: "asc" } },
      reportVersions: { orderBy: { versionNumber: "asc" } },
      documentPublications: { orderBy: { publishedAt: "asc" } },
      clientFeedback: { orderBy: { submittedAt: "asc" } },
      feedbackReentries: { orderBy: { createdAt: "asc" } },
      discoveryAccesses: true,
      consentRecords: { orderBy: { grantedAt: "asc" } },
      analysisRuns: { orderBy: { createdAt: "asc" } },
      auditTrails: { orderBy: { createdAt: "asc" } },
    },
  })

// Reduce the audit entries that will survive an erasure to what an account
// needs: the event, its time, and who acted.
//
// The Audit Trail deliberately outlives the engagement it accounts for — a log
// that could be emptied by deleting the thing it accounts for would account for
// nothing (architecture.md §7A.8). But its payloads can carry the client's own
// content: a classification change names a classification, a feedback event may
// quote the client, a download names a document. Keeping those after an erasure
// would leave the erased client's data in the log (roadmap Phase 10 corrections
// §11), so the payload is replaced with a marker naming nothing.
//
// This is the one place the application rewrites an audit payload, and it does
// it to *remove* client data rather than to change what an entry says
// happened — which is why the erasure appends its own entry recording that it
// did so.
export const minimizeAuditEntriesForEngagement = async (
  engagementId: string,
  scope: WorkspaceScope,
) => {
  const result = await prisma.auditTrail.updateMany({
    where: { engagementId, workspaceId: scope.workspaceId },
    data: { payload: { minimized: true } },
  })

  return result.count
}

// Permanently delete one engagement's client data.
//
// The engagement row is deleted and the database cascades to everything it
// owns — discovery, assessment, every version, publications, rendered PDFs,
// analysis runs, notifications, feedback, discovery access and consent records.
//
// The **Audit Trail is deliberately not deleted**. Its rows reference the
// engagement with ON DELETE SET NULL, so they survive with the relation
// cleared, and the erasure itself appends an entry naming the erased
// engagement in its payload. An append-only log that could be emptied by
// deleting the thing it accounts for would not be an account of anything
// (architecture.md §7A.8).
export const deleteEngagementPermanently = async (
  engagementId: string,
  scope: EngagementScope,
) => {
  const result = await prisma.engagement.deleteMany({
    where: { id: engagementId, ...engagementScopeWhere(scope) },
  })

  return result.count > 0
}
