import {
  defaultCompliancePolicy,
  isConfidential,
  isPastRetention,
  retentionCutoff,
  retentionDueAt,
} from "../domain/compliance/compliance.js"
import { isCompilablePersonalIdentifierRule } from "../domain/compliance/pii.js"
import { logger } from "../lib/application-logger.js"
import { failureIdentity } from "../lib/failure-identity.js"
import { appendAuditTrail } from "../repositories/access.repository.js"
import {
  countAiModelApprovalsNeedingReview,
  countAiOutputsWithPersonalData,
  countAnalysisRunsAwaitingReview,
  countAuditEventsOfType,
  countEngagementsAwaitingDpiaScreening,
  countEngagementsByClassification,
  countEngagementsUnderLegalHold,
  countEngagementsWithRestrictedAi,
  countEngagementsWithoutLegalBasis,
  countEngagementsWithWithdrawnConsent,
  countPastRetention,
  countPiiRedactionFailures,
  deleteAiArtifactsPastRetention,
  deleteAuditEntriesPastRetention,
  deleteDocumentsPastRetention,
  ensureCompliancePolicyRow,
  ensureWorkspaceDpiaRow,
  getCompliancePolicyRow,
  getWorkspaceDpiaRow,
  listPastRetentionItemIds,
  updateCompliancePolicyRow,
  updateWorkspaceDpiaRow,
} from "../repositories/compliance.repository.js"

import type { AuditEventType } from "../../../shared/access.schema.js"
import type {
  ComplianceDashboard,
  CompliancePolicy,
  DataClassification,
  ExecuteRetention,
  LegalBasis,
  PersonalIdentifierRule,
  RegulatoryFramework,
  RetentionCategory,
  RetentionPreview,
  RetentionResult,
  UpdateCompliancePolicy,
  UpdateWorkspaceDpia,
  WorkspaceDpia,
} from "../../../shared/compliance.schema.js"
import type { Prisma } from "@prisma/client"

// The application service for the Workspace Compliance Policy, the workspace
// DPIA and the Compliance Dashboard (roadmap Phase 10). It resolves the policy
// every other compliance decision is made against, applies an administrator's
// changes, and reports what the policy produced.
//
// Every read and every figure is workspace-scoped. A compliance aggregate is as
// much a disclosure as a record is (architecture.md §7A.4).

export type WorkspaceScope = { workspaceId: string }

// The workspace's policy, guaranteed to exist.
//
// A workspace created before this phase was given a policy row by the phase's
// migration; this covers a workspace created by a path that predates it, so a
// policy is never simply absent.
//
// Nothing is seeded here any more. The first Phase 10 implementation seeded the
// approved provider and model lists from the deployment's configured LLM so the
// stages kept working — but an approval is now a governed decision with a
// contract status, a region, a retention and a training decision and an
// approving human, and the deployment's `.env` cannot make one. An
// administrator approves the model once, deliberately; until they do, AI
// processing is refused and says exactly why.
export const getCompliancePolicy = async (
  scope: WorkspaceScope,
): Promise<CompliancePolicy> => {
  const row = await ensureCompliancePolicyRow(scope, defaultCompliancePolicy())
  return toCompliancePolicy(row)
}

export type CompliancePolicyView = CompliancePolicy & {
  configuredAt: string | null
}

export const getCompliancePolicyView = async (
  scope: WorkspaceScope,
): Promise<CompliancePolicyView> => {
  const policy = await getCompliancePolicy(scope)
  const row = await getCompliancePolicyRow(scope)

  return { ...policy, configuredAt: row?.configuredAt?.toISOString() ?? null }
}

export type UpdateCompliancePolicyFailure =
  | "invalid_identifier_rule"
  | "duplicate_identifier_rule"
  | "unsupported_default_legal_basis"

export type UpdateCompliancePolicyResult =
  | { success: true; policy: CompliancePolicy }
  | { success: false; failure: UpdateCompliancePolicyFailure }

// Apply an administrator's edit. Only the fields they sent change; the rest of
// the policy stands. The change appends to the append-only Audit Trail, which
// is where the history of who changed which rule lives — the policy row itself
// carries only the rules in force.
export const updateCompliancePolicy = async (
  scope: WorkspaceScope,
  actingUserId: string,
  update: UpdateCompliancePolicy,
): Promise<UpdateCompliancePolicyResult> => {
  const current = await getCompliancePolicy(scope)
  const next: CompliancePolicy = { ...current, ...update }

  // A personal-identifier rule whose pattern does not compile would be silently
  // skipped at redaction time, which is exactly the failure the administrator
  // needs to hear about *now*, while they can still fix the typo.
  const broken = next.personalIdentifierRules.find(
    (rule) => !isCompilablePersonalIdentifierRule(rule),
  )
  if (broken !== undefined) {
    return { success: false, failure: "invalid_identifier_rule" }
  }

  const duplicate = firstDuplicateIdentifierRule(next.personalIdentifierRules)
  if (duplicate !== null) {
    return { success: false, failure: "duplicate_identifier_rule" }
  }

  // The default a new engagement starts from has to be one of the bases this
  // workspace supports, or the default would hand out a basis the workspace
  // says it does not use.
  if (!next.supportedLegalBases.includes(next.defaultLegalBasis)) {
    return { success: false, failure: "unsupported_default_legal_basis" }
  }

  await updateCompliancePolicyRow(scope, next, actingUserId)

  await recordComplianceEvent({
    workspaceId: scope.workspaceId,
    userId: actingUserId,
    eventType: "compliance_policy_updated",
    payload: { changed: Object.keys(update).sort() },
  })

  return { success: true, policy: next }
}

// --- The workspace DPIA / DSFA ---------------------------------------------

// The workspace's assessment of its standard processing operation, guaranteed
// to exist so that "nobody has assessed this" is a visible state rather than an
// absent record (roadmap Phase 10 corrections §8).
export const getWorkspaceDpia = async (
  scope: WorkspaceScope,
): Promise<WorkspaceDpia> => {
  const row = await ensureWorkspaceDpiaRow(scope)

  return {
    status: row.status,
    scope: row.scope,
    rationale: row.rationale,
    documentReference: row.documentReference,
    assessedByUserId: row.assessedByUserId,
    approvedByUserId: row.approvedByUserId,
    assessedAt: row.assessedAt?.toISOString() ?? null,
    reviewDueAt: row.reviewDueAt?.toISOString() ?? null,
  }
}

// Record an administrator's assessment. The product never derives a DPIA
// conclusion — it records the human's, stamps who made it, and then holds the
// AI gate to it.
export const updateWorkspaceDpia = async (
  scope: WorkspaceScope,
  actingUserId: string,
  update: UpdateWorkspaceDpia,
): Promise<WorkspaceDpia> => {
  await ensureWorkspaceDpiaRow(scope)

  await updateWorkspaceDpiaRow(
    scope,
    {
      status: update.status,
      scope: update.scope,
      rationale: update.rationale,
      documentReference: update.documentReference,
      assessedAt:
        update.assessedAt === undefined
          ? undefined
          : update.assessedAt === null
            ? null
            : new Date(update.assessedAt),
      reviewDueAt:
        update.reviewDueAt === undefined
          ? undefined
          : update.reviewDueAt === null
            ? null
            : new Date(update.reviewDueAt),
    },
    actingUserId,
  )

  await recordComplianceEvent({
    workspaceId: scope.workspaceId,
    userId: actingUserId,
    eventType: "workspace_dpia_updated",
    payload: { changed: Object.keys(update).sort(), status: update.status ?? null },
  })

  return getWorkspaceDpia(scope)
}

// --- The Compliance Dashboard ----------------------------------------------

// The Compliance Dashboard (roadmap Phase 10). It answers the administrator's
// operational questions — how much confidential work is in the workspace, where
// AI is restricted, what the policy refused, what could not be redacted, where
// the privacy record is incomplete, and what has passed its retention period.
export const getComplianceDashboard = async (
  scope: WorkspaceScope,
  now: Date = new Date(),
): Promise<ComplianceDashboard> => {
  const policy = await getCompliancePolicy(scope)
  const row = await getCompliancePolicyRow(scope)
  const dpia = await getWorkspaceDpia(scope)

  const [
    byClassification,
    aiRestricted,
    legalHolds,
    deniedAi,
    redactionFailures,
    outputsWithPersonalData,
    deniedPermissions,
    awaitingReview,
    withoutLegalBasis,
    withdrawnConsent,
    awaitingScreening,
    approvalsNeedingReview,
    retention,
  ] = await Promise.all([
    countEngagementsByClassification(scope),
    countEngagementsWithRestrictedAi(scope),
    countEngagementsUnderLegalHold(scope),
    countAuditEventsOfType(scope, ["ai_request_denied"]),
    countPiiRedactionFailures(scope),
    countAiOutputsWithPersonalData(scope),
    countAuditEventsOfType(scope, ["denied_permission"]),
    countAnalysisRunsAwaitingReview(scope),
    countEngagementsWithoutLegalBasis(scope),
    countEngagementsWithWithdrawnConsent(scope),
    countEngagementsAwaitingDpiaScreening(scope),
    countAiModelApprovalsNeedingReview(scope),
    countPastRetention(scope, {
      engagements: retentionCutoff(policy.engagementRetentionDays, now),
      documents: retentionCutoff(policy.documentRetentionDays, now),
      audit: retentionCutoff(policy.auditRetentionDays, now),
      aiArtifacts: retentionCutoff(policy.aiArtifactRetentionDays, now),
    }),
  ])

  const engagementsByClassification = Object.fromEntries(
    byClassification.map(({ classification, count }) => [classification, count]),
  ) as Record<DataClassification, number>

  const confidentialEngagements = byClassification
    .filter(({ classification }) =>
      (
        [
          "confidential",
          "personal_data",
          "strictly_confidential",
          "ai_restricted",
        ] as const
      ).includes(classification as never),
    )
    .reduce((total, { count }) => total + count, 0)

  return {
    policyConfiguredAt: row?.configuredAt?.toISOString() ?? null,
    engagementsByClassification,
    confidentialEngagements,
    aiRestrictedEngagements: aiRestricted,
    engagementsUnderLegalHold: legalHolds,
    deniedAiRequests: deniedAi,
    piiRedactionFailures: redactionFailures,
    aiOutputsWithPersonalData: outputsWithPersonalData,
    deniedPermissionAttempts: deniedPermissions,
    analysisRunsAwaitingHumanReview: awaitingReview,
    engagementsWithoutLegalBasis: withoutLegalBasis,
    engagementsWithWithdrawnConsent: withdrawnConsent,
    engagementsAwaitingDpiaScreening: awaitingScreening,
    aiModelApprovalsNeedingReview: approvalsNeedingReview,
    workspaceDpiaStatus: dpia.status,
    retention: {
      engagementsPastRetention: retention.engagements.due,
      documentsPastRetention: retention.documents.due,
      auditEntriesPastRetention: retention.auditEntries.due,
      aiArtifactsPastRetention: retention.aiArtifacts.due,
    },
  }
}

// --- Retention preview and execution ---------------------------------------

const retentionCutoffsOf = (policy: CompliancePolicy, now: Date) => ({
  engagements: retentionCutoff(policy.engagementRetentionDays, now),
  documents: retentionCutoff(policy.documentRetentionDays, now),
  audit: retentionCutoff(policy.auditRetentionDays, now),
  aiArtifacts: retentionCutoff(policy.aiArtifactRetentionDays, now),
})

export const previewRetention = async (
  scope: WorkspaceScope,
  actingUserId: string,
  now: Date = new Date(),
): Promise<RetentionPreview> => {
  const policy = await getCompliancePolicy(scope)
  const cutoffs = retentionCutoffsOf(policy, now)
  const [counts, itemIds] = await Promise.all([
    countPastRetention(scope, cutoffs),
    listPastRetentionItemIds(scope, cutoffs),
  ])

  const preview: RetentionPreview = {
    generatedAt: now.toISOString(),
    entries: [
      {
        category: "engagements",
        retentionDays: policy.engagementRetentionDays,
        dueCount: counts.engagements.due,
        excludedByLegalHold: counts.engagements.heldBack,
        executable: false,
        itemIds: itemIds.engagements,
      },
      {
        category: "documents",
        retentionDays: policy.documentRetentionDays,
        dueCount: counts.documents.due,
        excludedByLegalHold: counts.documents.heldBack,
        executable: true,
        itemIds: itemIds.documents,
      },
      {
        category: "audit_entries",
        retentionDays: policy.auditRetentionDays,
        dueCount: counts.auditEntries.due,
        excludedByLegalHold: counts.auditEntries.heldBack,
        executable: true,
        itemIds: itemIds.auditEntries,
      },
      {
        category: "ai_artifacts",
        retentionDays: policy.aiArtifactRetentionDays,
        dueCount: counts.aiArtifacts.due,
        excludedByLegalHold: counts.aiArtifacts.heldBack,
        executable: true,
        itemIds: itemIds.aiArtifacts,
      },
    ],
  }

  await recordComplianceEvent({
    workspaceId: scope.workspaceId,
    userId: actingUserId,
    eventType: "retention_preview_generated",
    payload: {
      generatedAt: preview.generatedAt,
      entries: preview.entries.map((entry) => ({
        category: entry.category,
        dueCount: entry.dueCount,
        excludedByLegalHold: entry.excludedByLegalHold,
        executable: entry.executable,
      })),
    },
  })

  return preview
}

export const executeRetention = async (
  scope: WorkspaceScope,
  actingUserId: string,
  input: ExecuteRetention,
  now: Date = new Date(),
): Promise<RetentionResult> => {
  const policy = await getCompliancePolicy(scope)
  const cutoffs = retentionCutoffsOf(policy, now)
  const counts = await countPastRetention(scope, cutoffs)
  const itemIds = await listPastRetentionItemIds(scope, cutoffs)
  const requested = new Set(input.categories)

  const entries: RetentionResult["entries"] = []

  if (requested.has("engagements")) {
    entries.push({
      category: "engagements",
      attempted: true,
      deletedCount: 0,
      skippedCount: counts.engagements.due,
      excludedByLegalHold: counts.engagements.heldBack,
      reported: true,
      success: true,
      error: null,
      itemIds: itemIds.engagements,
    })
  }

  if (requested.has("documents")) {
    entries.push(
      await executeRetentionCategory({
        category: "documents",
        cutoff: cutoffs.documents,
        dueCount: counts.documents.due,
        excludedByLegalHold: counts.documents.heldBack,
        itemIds: itemIds.documents,
        deleteDue: (cutoff) => deleteDocumentsPastRetention(scope, cutoff),
      }),
    )
  }

  if (requested.has("ai_artifacts")) {
    entries.push(
      await executeRetentionCategory({
        category: "ai_artifacts",
        cutoff: cutoffs.aiArtifacts,
        dueCount: counts.aiArtifacts.due,
        excludedByLegalHold: counts.aiArtifacts.heldBack,
        itemIds: itemIds.aiArtifacts,
        deleteDue: (cutoff) => deleteAiArtifactsPastRetention(scope, cutoff),
      }),
    )
  }

  if (requested.has("audit_entries")) {
    entries.push(
      await executeRetentionCategory({
        category: "audit_entries",
        cutoff: cutoffs.audit,
        dueCount: counts.auditEntries.due,
        excludedByLegalHold: counts.auditEntries.heldBack,
        itemIds: itemIds.auditEntries,
        deleteDue: (cutoff) => deleteAuditEntriesPastRetention(scope, cutoff),
      }),
    )
  }

  const result: RetentionResult = {
    executedAt: now.toISOString(),
    entries,
  }

  await recordComplianceEvent({
    workspaceId: scope.workspaceId,
    userId: actingUserId,
    eventType: "retention_action_executed",
    payload: {
      requestKey: input.requestKey ?? null,
      executedAt: result.executedAt,
      categories: [...requested].sort(),
      entries: entries.map((entry) => ({
        category: entry.category,
        attempted: entry.attempted,
        deletedCount: entry.deletedCount,
        skippedCount: entry.skippedCount,
        excludedByLegalHold: entry.excludedByLegalHold,
        reported: entry.reported,
        success: entry.success,
        error: entry.error ?? null,
      })),
    },
  })

  return result
}

const executeRetentionCategory = async (input: {
  category: Exclude<RetentionCategory, "engagements">
  cutoff: Date | null
  dueCount: number
  excludedByLegalHold: number
  itemIds?: string[]
  deleteDue: (cutoff: Date) => Promise<number>
}): Promise<RetentionResult["entries"][number]> => {
  if (input.cutoff === null) {
    return {
      category: input.category,
      attempted: true,
      deletedCount: 0,
      skippedCount: input.dueCount,
      excludedByLegalHold: input.excludedByLegalHold,
      reported: false,
      success: true,
      error: null,
      itemIds: input.itemIds,
    }
  }

  try {
    const deletedCount = await input.deleteDue(input.cutoff)

    return {
      category: input.category,
      attempted: true,
      deletedCount,
      skippedCount: Math.max(input.dueCount - deletedCount, 0),
      excludedByLegalHold: input.excludedByLegalHold,
      reported: false,
      success: true,
      error: null,
      itemIds: input.itemIds,
    }
  } catch (error) {
    return {
      category: input.category,
      attempted: true,
      deletedCount: 0,
      skippedCount: input.dueCount,
      excludedByLegalHold: input.excludedByLegalHold,
      reported: false,
      success: false,
      error: failureIdentity(error),
      itemIds: input.itemIds,
    }
  }
}

// Appending a compliance event to the append-only Audit Trail is best-effort in
// exactly the sense every other audit append is: a failing insert may not turn
// a completed operation into an error, and it may not be swallowed silently
// either (coding-standards.md §7). A lost entry is reported as a structured,
// secret-free log line an operator can alert on.
export const recordComplianceEvent = async (entry: {
  workspaceId: string
  userId?: string | null
  engagementId?: string | null
  eventType: AuditEventType
  payload: Prisma.InputJsonValue
}) => {
  try {
    await appendAuditTrail(entry)
  } catch (error) {
    logger.error("AUDIT_APPEND_FAILED", {
      eventType: entry.eventType,
      workspaceId: entry.workspaceId,
      userId: entry.userId ?? null,
      ...failureIdentity(error),
    })
  }
}

// Record that somebody reached confidential client information (roadmap Phase
// 10: the Audit Trail records "access to confidential information").
//
// It is deliberately narrow. Every read of every field would produce a log
// nobody could read, so it records the surfaces that actually *disclose* an
// engagement's confidential content — opening the engagement, and taking its
// report out of the workbench — and it records nothing at all for content that
// is not confidential, because that is not what the rule is about.
export const recordConfidentialAccess = async (access: {
  workspaceId: string
  userId: string
  engagementId: string
  classification: DataClassification
  surface: string
}) => {
  if (!isConfidential(access.classification)) return

  await recordComplianceEvent({
    workspaceId: access.workspaceId,
    userId: access.userId,
    engagementId: access.engagementId,
    eventType: "confidential_content_accessed",
    payload: {
      surface: access.surface,
      dataClassification: access.classification,
    },
  })
}

// Whether a record created at this time has passed the given retention period.
// Re-exported from the domain so services ask one question of one place.
export { isPastRetention, retentionCutoff, retentionDueAt }

const firstDuplicateIdentifierRule = (
  rules: readonly PersonalIdentifierRule[],
): string | null => {
  const seen = new Set<string>()

  for (const rule of rules) {
    const key = [
      rule.kind,
      rule.label.trim().toLowerCase(),
      rule.match,
      rule.value.trim().toLowerCase(),
    ].join("\u0000")

    if (seen.has(key)) return key
    seen.add(key)
  }

  return null
}

// Translate the persisted row into the policy contract. The Json columns were
// written from validated policies; a row that predates a rule reads back as
// that rule being unset rather than as broken state.
type CompliancePolicyRow = {
  defaultDataClassification: DataClassification
  clientDataExportPermitted: boolean
  documentDownloadLinkTtlMinutes: number
  encryptDocumentsAtRest: boolean
  requireEncryptedTransport: boolean
  aiProcessingPermitted: boolean
  confidentialAiProcessingPermitted: boolean
  redactPersonalDataBeforeAi: boolean
  humanApprovalRequiredForAiOutput: boolean
  supportedLegalBases: Prisma.JsonValue
  defaultLegalBasis: LegalBasis
  engagementRetentionDays: number | null
  documentRetentionDays: number | null
  auditRetentionDays: number | null
  aiArtifactRetentionDays: number | null
  personalIdentifierRules: Prisma.JsonValue
  regulatoryFrameworks: Prisma.JsonValue
}

const toCompliancePolicy = (row: CompliancePolicyRow): CompliancePolicy => ({
  defaultDataClassification: row.defaultDataClassification,
  clientDataExportPermitted: row.clientDataExportPermitted,
  documentDownloadLinkTtlMinutes: row.documentDownloadLinkTtlMinutes,
  encryptDocumentsAtRest: row.encryptDocumentsAtRest,
  requireEncryptedTransport: row.requireEncryptedTransport,
  aiProcessingPermitted: row.aiProcessingPermitted,
  confidentialAiProcessingPermitted: row.confidentialAiProcessingPermitted,
  redactPersonalDataBeforeAi: row.redactPersonalDataBeforeAi,
  humanApprovalRequiredForAiOutput: row.humanApprovalRequiredForAiOutput,
  supportedLegalBases: (row.supportedLegalBases ?? []) as LegalBasis[],
  defaultLegalBasis: row.defaultLegalBasis,
  engagementRetentionDays: row.engagementRetentionDays,
  documentRetentionDays: row.documentRetentionDays,
  auditRetentionDays: row.auditRetentionDays,
  aiArtifactRetentionDays: row.aiArtifactRetentionDays,
  personalIdentifierRules: (row.personalIdentifierRules ??
    []) as PersonalIdentifierRule[],
  regulatoryFrameworks: (row.regulatoryFrameworks ??
    []) as RegulatoryFramework[],
})
