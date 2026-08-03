import { Prisma } from "@prisma/client"

import {
  validateClassificationTransition,
  validateCloseNoActionTransition,
  validateCompleteReentryTransition,
  validateOpenReentryTransition,
} from "../domain/engagement/feedback.js"
import { createSha256Hash } from "../lib/create-sha256-hash.js"
import { prisma } from "../lib/prisma.js"
import { reportVersionSourceSnapshot } from "./consultant-report-version.repository.js"
import { engagementScopeWhere } from "./engagement.repository.js"

import type { EngagementScope } from "../domain/access/access.js"
import type {
  ClientFeedbackSummary,
  ClientPortalFeedbackSummary,
  FeedbackClassification,
  FeedbackImpactStage,
  FeedbackImpactView,
  FeedbackReentrySummary,
  ReentryStageOutcome,
  ReentryStageResultOption,
} from "../../../shared/feedback.schema.js"
import type { ReportSourceSnapshot } from "../../../shared/consultant-report.schema.js"

// What a re-entry started from. Passed to the caller that decides which result
// each impacted stage could be completed with, so "unchanged since the re-entry
// opened" is answered where the options are built rather than only at the
// refusal.
export type ReentrySourceFacts = {
  impactedStages: FeedbackImpactStage[]
  sourceDiscoveryFingerprint: string
  sourceAssessmentRevision: number
  sourceAssessmentFingerprint: string
  sourceOpportunityVersionId: string | null
  sourceRecommendationVersionId: string | null
  sourceRoadmapVersionId: string | null
  sourceReportVersionId: string
}

type FeedbackRow = Prisma.ClientFeedbackGetPayload<{
  include: typeof withFeedbackRelations
}>

type ReentryRow = Prisma.FeedbackReentryGetPayload<object>

const UNIQUE_VIOLATION = "P2002"

// How every Phase 9 mutation names its target. The record id alone would be
// enough to find the row, and that is exactly the problem: an engagement-side
// write states its workspace and engagement so the scope is a property of the
// statement rather than of whichever read happened to precede it
// (coding-standards.md §6A).
const scopedFeedbackWhere = (
  scope: EngagementScope,
  input: { engagementId: string; feedbackId: string },
) => ({
  id: input.feedbackId,
  workspaceId: scope.workspaceId,
  engagementId: input.engagementId,
})

const scopedReentryWhere = (
  scope: EngagementScope,
  input: { engagementId: string; reentryId: string },
) => ({
  id: input.reentryId,
  workspaceId: scope.workspaceId,
  engagementId: input.engagementId,
})

// The Client Portal's only answer about a Feedback. Built from the narrow
// `select` below rather than by stripping fields off the Manager view, so a
// field added to `ClientFeedbackSummary` later cannot leak here by default
// (architecture.md §7A.5; coding-standards.md §6A).
const PORTAL_FEEDBACK_FIELDS = {
  id: true,
  status: true,
  originalContent: true,
  submittedAt: true,
  sourcePublicationId: true,
  sourceReportVersionNumber: true,
} as const

const toClientPortalSummary = (row: {
  id: string
  status: ClientPortalFeedbackSummary["status"]
  originalContent: string
  submittedAt: Date
  sourcePublicationId: string
  sourceReportVersionNumber: number
}): ClientPortalFeedbackSummary => ({
  id: row.id,
  status: row.status,
  content: row.originalContent,
  submittedAt: row.submittedAt.toISOString(),
  sourcePublicationId: row.sourcePublicationId,
  sourceReportVersionNumber: row.sourceReportVersionNumber,
})

// Submission is the one Phase 9 write a Client makes, so it answers in the
// Client's own DTO. The Manager view is never constructed on this path — not on
// creation and not on idempotent replay, where the stored row may already carry
// a classification and the Manager's internal prose.
export const createClientFeedback = async (
  scope: EngagementScope,
  input: {
    engagementId: string
    publicationId: string
    submissionKey: string
    content: string
    submittedByUserId: string
  },
): Promise<
  | { created: boolean; feedback: ClientPortalFeedbackSummary }
  | { created: false; reason: "publication_not_found" | "invalid_idempotent_submission" }
> => {
  // The whole binding chain in one statement: this publication, in this
  // workspace and engagement, still active, published to exactly this client,
  // complete, and pointing at an approved ReportVersion.
  const publication = await prisma.documentPublication.findFirst({
    where: {
      id: input.publicationId,
      workspaceId: scope.workspaceId,
      engagementId: input.engagementId,
      status: "active",
      clientUserId: scope.userId,
      pdfArtifactId: { not: null },
      title: { not: null },
    },
    include: { reportVersion: { select: { id: true, versionNumber: true, reviewState: true } } },
  })
  if (!publication || publication.reportVersion.reviewState !== "approved") {
    return { created: false, reason: "publication_not_found" }
  }

  const contentHash = createSha256Hash(input.content)
  const existing = await prisma.clientFeedback.findUnique({
    where: {
      sourcePublicationId_submittedByUserId_submissionKey: {
        sourcePublicationId: publication.id,
        submittedByUserId: input.submittedByUserId,
        submissionKey: input.submissionKey,
      },
    },
    select: { ...PORTAL_FEEDBACK_FIELDS, submissionContentHash: true },
  })
  if (existing) {
    if (existing.submissionContentHash !== contentHash) {
      return { created: false, reason: "invalid_idempotent_submission" }
    }
    return { created: false, feedback: toClientPortalSummary(existing) }
  }

  try {
    const feedback = await prisma.$transaction(async (tx) => {
      const created = await tx.clientFeedback.create({
        data: {
          workspaceId: scope.workspaceId,
          engagementId: input.engagementId,
          sourcePublicationId: publication.id,
          sourceReportVersionId: publication.reportVersionId,
          sourceReportVersionNumber: publication.reportVersion.versionNumber,
          sourceReportVersionPublishedAt: publication.publishedAt,
          submittedByUserId: input.submittedByUserId,
          submittedAt: new Date(),
          submissionKey: input.submissionKey,
          submissionContentHash: contentHash,
          originalContent: input.content,
          impactedStages: [],
        },
        select: PORTAL_FEEDBACK_FIELDS,
      })

      await tx.auditTrail.create({
        data: {
          workspaceId: scope.workspaceId,
          userId: input.submittedByUserId,
          engagementId: input.engagementId,
          eventType: "client_feedback_submitted",
          payload: {
            feedbackId: created.id,
            publicationId: publication.id,
            reportVersionId: publication.reportVersionId,
            reportVersionNumber: publication.reportVersion.versionNumber,
            submittedAt: created.submittedAt.toISOString(),
          },
        },
      })

      return created
    })

    return { created: true, feedback: toClientPortalSummary(feedback) }
  } catch (error) {
    // Two simultaneous submissions of the same retry: the loser reads back the
    // winner's row rather than reporting a failure the client cannot act on.
    if (!isUniqueViolation(error)) throw error
    const feedback = await prisma.clientFeedback.findUnique({
      where: {
        sourcePublicationId_submittedByUserId_submissionKey: {
          sourcePublicationId: publication.id,
          submittedByUserId: input.submittedByUserId,
          submissionKey: input.submissionKey,
        },
      },
      select: { ...PORTAL_FEEDBACK_FIELDS, submissionContentHash: true },
    })
    if (feedback?.submissionContentHash === contentHash) {
      return { created: false, feedback: toClientPortalSummary(feedback) }
    }
    return { created: false, reason: "invalid_idempotent_submission" }
  }
}

export const listFeedback = async (
  engagementId: string,
  scope: EngagementScope,
  impactOf: (
    sourceSnapshot: ReportSourceSnapshot,
    sourceReportVersionId: string,
    declaredImpactedStages: FeedbackImpactStage[],
  ) => FeedbackImpactView,
): Promise<ClientFeedbackSummary[]> => {
  const feedback = await prisma.clientFeedback.findMany({
    where: { engagementId, workspaceId: scope.workspaceId, engagement: engagementScopeWhere(scope) },
    orderBy: { submittedAt: "desc" },
    include: withFeedbackRelations,
  })

  return feedback.map((row) => toFeedbackSummary(row, impactOf))
}

export const listClientPortalFeedback = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<ClientPortalFeedbackSummary[]> => {
  const feedback = await prisma.clientFeedback.findMany({
    where: {
      engagementId,
      workspaceId: scope.workspaceId,
      submittedByUserId: scope.userId,
      engagement: engagementScopeWhere(scope),
    },
    orderBy: { submittedAt: "desc" },
    select: PORTAL_FEEDBACK_FIELDS,
  })

  return feedback.map(toClientPortalSummary)
}

export const listOpenReentries = async (
  engagementId: string,
  scope: EngagementScope,
  optionsOf: (reentry: ReentrySourceFacts) => ReentryStageResultOption[],
): Promise<FeedbackReentrySummary[]> => {
  const reentries = await prisma.feedbackReentry.findMany({
    where: {
      engagementId,
      workspaceId: scope.workspaceId,
      status: "open",
      engagement: engagementScopeWhere(scope),
    },
    orderBy: { openedAt: "desc" },
  })

  return reentries.map((reentry) => toReentrySummary(reentry, optionsOf))
}

export const getOpenReentry = async (
  scope: EngagementScope,
  input: { engagementId: string; reentryId: string },
  optionsOf: (reentry: ReentrySourceFacts) => ReentryStageResultOption[],
): Promise<FeedbackReentrySummary | null> => {
  const reentry = await prisma.feedbackReentry.findFirst({
    where: {
      ...scopedReentryWhere(scope, input),
      status: "open",
      engagement: engagementScopeWhere(scope),
    },
  })

  return reentry && toReentrySummary(reentry, optionsOf)
}

export const classifyClientFeedback = async (
  scope: EngagementScope,
  input: {
    engagementId: string
    feedbackId: string
    expectedRevision: number
    reviewedByUserId: string
    classification: FeedbackClassification
    impactedStages: FeedbackImpactStage[]
    managerSummary: string
    managerDecision: string
  },
  impactOf: (
    sourceSnapshot: ReportSourceSnapshot,
    sourceReportVersionId: string,
    declaredImpactedStages: FeedbackImpactStage[],
  ) => FeedbackImpactView,
): Promise<
  | { classified: true; feedback: ClientFeedbackSummary }
  | {
      classified: false
      reason: "feedback_not_found" | "invalid_feedback_transition" | "stale_update"
      currentRevision?: number
    }
> => {
  const current = await prisma.clientFeedback.findFirst({
    where: { ...scopedFeedbackWhere(scope, input), engagement: engagementScopeWhere(scope) },
    select: { id: true, revision: true, status: true },
  })
  if (!current) return { classified: false, reason: "feedback_not_found" }

  const transitionFailure = validateClassificationTransition(current.status)
  if (transitionFailure) return { classified: false, reason: "invalid_feedback_transition" }
  if (current.revision !== input.expectedRevision) {
    return { classified: false, reason: "stale_update", currentRevision: current.revision }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // The scope, the expected revision and the permitted statuses all travel in
    // the statement, so a concurrent transition cannot slip between the read
    // above and this write.
    const result = await tx.clientFeedback.updateMany({
      where: {
        ...scopedFeedbackWhere(scope, input),
        revision: input.expectedRevision,
        status: { in: ["submitted", "classified"] },
      },
      data: {
        status: "classified",
        classification: input.classification,
        impactedStages: input.impactedStages as unknown as Prisma.InputJsonValue,
        managerSummary: input.managerSummary,
        managerDecision: input.managerDecision,
        reviewedAt: new Date(),
        reviewedByUserId: input.reviewedByUserId,
        revision: { increment: 1 },
      },
    })
    if (result.count === 0) return null

    await tx.auditTrail.create({
      data: {
        workspaceId: scope.workspaceId,
        userId: input.reviewedByUserId,
        engagementId: input.engagementId,
        eventType: "client_feedback_classified",
        payload: {
          feedbackId: input.feedbackId,
          classification: input.classification,
          impactedStages: input.impactedStages,
        },
      },
    })

    return tx.clientFeedback.findFirstOrThrow({
      where: scopedFeedbackWhere(scope, input),
      include: withFeedbackRelations,
    })
  })
  if (!updated) return { classified: false, reason: "stale_update" }

  return { classified: true, feedback: toFeedbackSummary(updated, impactOf) }
}

export const closeClientFeedbackWithoutAction = async (
  scope: EngagementScope,
  input: {
    engagementId: string
    feedbackId: string
    expectedRevision: number
    closedByUserId: string
    reason: string
  },
  impactOf: (
    sourceSnapshot: ReportSourceSnapshot,
    sourceReportVersionId: string,
    declaredImpactedStages: FeedbackImpactStage[],
  ) => FeedbackImpactView,
): Promise<
  | { closed: true; feedback: ClientFeedbackSummary }
  | {
      closed: false
      reason:
        | "feedback_not_found"
        | "invalid_feedback_transition"
        | "missing_rationale"
        | "stale_update"
      currentRevision?: number
    }
> => {
  const current = await prisma.clientFeedback.findFirst({
    where: { ...scopedFeedbackWhere(scope, input), engagement: engagementScopeWhere(scope) },
    select: { id: true, revision: true, status: true },
  })
  if (!current) return { closed: false, reason: "feedback_not_found" }

  const transitionFailure = validateCloseNoActionTransition(current.status, input.reason)
  if (transitionFailure === "missing_rationale") {
    return { closed: false, reason: "missing_rationale" }
  }
  if (transitionFailure) return { closed: false, reason: "invalid_feedback_transition" }
  if (current.revision !== input.expectedRevision) {
    return { closed: false, reason: "stale_update", currentRevision: current.revision }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.clientFeedback.updateMany({
      where: {
        ...scopedFeedbackWhere(scope, input),
        revision: input.expectedRevision,
        status: { in: ["submitted", "classified"] },
      },
      data: {
        status: "closed_no_action",
        closedNoActionReason: input.reason,
        reviewedAt: new Date(),
        reviewedByUserId: input.closedByUserId,
        revision: { increment: 1 },
      },
    })
    if (result.count === 0) return null

    await tx.auditTrail.create({
      data: {
        workspaceId: scope.workspaceId,
        userId: input.closedByUserId,
        engagementId: input.engagementId,
        eventType: "client_feedback_closed_no_action",
        payload: {
          feedbackId: input.feedbackId,
          reason: input.reason,
        },
      },
    })

    return tx.clientFeedback.findFirstOrThrow({
      where: scopedFeedbackWhere(scope, input),
      include: withFeedbackRelations,
    })
  })
  if (!updated) return { closed: false, reason: "stale_update" }

  return { closed: true, feedback: toFeedbackSummary(updated, impactOf) }
}

export const openFeedbackReentry = async (
  scope: EngagementScope,
  input: {
    engagementId: string
    feedbackId: string
    expectedRevision: number
    openedByUserId: string
    impactedStages: FeedbackImpactStage[]
    plan: string
    sourceDiscoveryFingerprint: string
    sourceAssessmentRevision: number
    sourceAssessmentFingerprint: string
    sourceOpportunityVersionId: string | null
    sourceRecommendationVersionId: string | null
    sourceRoadmapVersionId: string | null
    sourceReportVersionId: string
  },
  impactOf: (
    sourceSnapshot: ReportSourceSnapshot,
    sourceReportVersionId: string,
    declaredImpactedStages: FeedbackImpactStage[],
  ) => FeedbackImpactView,
  optionsOf: (reentry: ReentrySourceFacts) => ReentryStageResultOption[],
): Promise<
  | { opened: true; feedback: ClientFeedbackSummary; reentry: FeedbackReentrySummary }
  | {
      opened: false
      reason:
        | "feedback_not_found"
        | "feedback_not_classified"
        | "invalid_feedback_transition"
        | "reentry_already_open"
        | "no_impacted_stages"
        | "stale_update"
      currentRevision?: number
    }
> => {
  const current = await prisma.clientFeedback.findFirst({
    where: { ...scopedFeedbackWhere(scope, input), engagement: engagementScopeWhere(scope) },
    select: { id: true, revision: true, status: true, classification: true },
  })
  if (!current) return { opened: false, reason: "feedback_not_found" }
  if (current.revision !== input.expectedRevision) {
    return { opened: false, reason: "stale_update", currentRevision: current.revision }
  }

  const transitionFailure = validateOpenReentryTransition(
    current.status,
    current.classification,
    input.impactedStages,
  )
  if (transitionFailure === "feedback_not_classified") {
    return { opened: false, reason: "feedback_not_classified" }
  }
  if (transitionFailure === "no_impacted_stages") {
    return { opened: false, reason: "no_impacted_stages" }
  }
  if (transitionFailure) return { opened: false, reason: "invalid_feedback_transition" }

  const existingOpen = await prisma.feedbackReentry.findFirst({
    where: {
      feedbackId: input.feedbackId,
      workspaceId: scope.workspaceId,
      engagementId: input.engagementId,
      status: "open",
    },
    select: { id: true },
  })
  if (existingOpen) return { opened: false, reason: "reentry_already_open" }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const updated = await tx.clientFeedback.updateMany({
        where: {
          ...scopedFeedbackWhere(scope, input),
          revision: input.expectedRevision,
          status: "classified",
        },
        data: { status: "reentry_open", revision: { increment: 1 } },
      })
      if (updated.count === 0) return null

      const reentry = await tx.feedbackReentry.create({
        data: {
          workspaceId: scope.workspaceId,
          engagementId: input.engagementId,
          feedbackId: input.feedbackId,
          impactedStages: input.impactedStages as unknown as Prisma.InputJsonValue,
          plan: input.plan,
          outcomes: [],
          sourceDiscoveryFingerprint: input.sourceDiscoveryFingerprint,
          sourceAssessmentRevision: input.sourceAssessmentRevision,
          sourceAssessmentFingerprint: input.sourceAssessmentFingerprint,
          sourceOpportunityVersionId: input.sourceOpportunityVersionId,
          sourceRecommendationVersionId: input.sourceRecommendationVersionId,
          sourceRoadmapVersionId: input.sourceRoadmapVersionId,
          sourceReportVersionId: input.sourceReportVersionId,
          openedByUserId: input.openedByUserId,
        },
      })

      await tx.auditTrail.create({
        data: {
          workspaceId: scope.workspaceId,
          userId: input.openedByUserId,
          engagementId: input.engagementId,
          eventType: "feedback_reentry_opened",
          payload: {
            feedbackId: input.feedbackId,
            reentryId: reentry.id,
            impactedStages: input.impactedStages,
            sourceDiscoveryFingerprint: input.sourceDiscoveryFingerprint,
            sourceAssessmentRevision: input.sourceAssessmentRevision,
            sourceOpportunityVersionId: input.sourceOpportunityVersionId,
            sourceRecommendationVersionId: input.sourceRecommendationVersionId,
            sourceRoadmapVersionId: input.sourceRoadmapVersionId,
            sourceReportVersionId: input.sourceReportVersionId,
          },
        },
      })

      const feedback = await tx.clientFeedback.findFirstOrThrow({
        where: scopedFeedbackWhere(scope, input),
        include: withFeedbackRelations,
      })

      return { feedback, reentry }
    })
    if (!created) return { opened: false, reason: "stale_update" }

    return {
      opened: true,
      feedback: toFeedbackSummary(created.feedback, impactOf),
      reentry: toReentrySummary(created.reentry, optionsOf),
    }
  } catch (error) {
    // The partial unique index is the real guarantee that one Feedback has at
    // most one open re-entry; the read above only makes the common case a clean
    // refusal rather than a race.
    if (isUniqueViolation(error)) return { opened: false, reason: "reentry_already_open" }
    throw error
  }
}

// Completion is the one Phase 9 write whose validity depends on artifacts it
// does not own: the accepted version a stage is completed *with* can be
// superseded by any other Manager between a check and a write. So the results
// are resolved here, inside the completion transaction, against the re-entry row
// this transaction is committing against — the caller supplies *how* to resolve
// them (it owns the stage rules) but not *when*, which is what closes the
// time-of-check/time-of-use gap (architecture.md §7A.5).
export const completeFeedbackReentry = async (
  scope: EngagementScope,
  input: {
    engagementId: string
    reentryId: string
    expectedRevision: number
    completedByUserId: string
    completionNote: string
  },
  optionsOf: (reentry: ReentrySourceFacts) => ReentryStageResultOption[],
  resolveOutcomes: (
    tx: Prisma.TransactionClient,
    source: ReentrySourceFacts,
  ) => Promise<ReentryStageOutcome[] | null>,
): Promise<
  | { completed: true; reentry: FeedbackReentrySummary }
  | {
      completed: false
      reason:
        | "reentry_not_found"
        | "invalid_feedback_transition"
        | "invalid_result_artifact"
        | "stale_update"
      currentRevision?: number
    }
> => {
  const current = await prisma.feedbackReentry.findFirst({
    where: { ...scopedReentryWhere(scope, input), engagement: engagementScopeWhere(scope) },
    select: { id: true, revision: true, feedbackId: true, status: true },
  })
  if (!current) return { completed: false, reason: "reentry_not_found" }

  const transitionFailure = validateCompleteReentryTransition(current.status)
  if (transitionFailure) return { completed: false, reason: "invalid_feedback_transition" }
  if (current.revision !== input.expectedRevision) {
    return { completed: false, reason: "stale_update", currentRevision: current.revision }
  }

  type CompletionOutcome =
    | { failure: "invalid_result_artifact" | "stale_update" }
    | { reentry: ReentryRow }

  const outcome = await prisma.$transaction(async (tx): Promise<CompletionOutcome> => {
    // Re-read the re-entry inside the transaction, and only in the state this
    // completion is allowed to act on. Its source facts — not the ones a caller
    // read a round trip ago — are what the results are judged against.
    const reentry = await tx.feedbackReentry.findFirst({
      where: {
        ...scopedReentryWhere(scope, input),
        status: "open",
        revision: input.expectedRevision,
      },
    })
    if (!reentry) return { failure: "stale_update" as const }

    const outcomes = await resolveOutcomes(tx, reentrySourceFacts(reentry))
    if (!outcomes) return { failure: "invalid_result_artifact" as const }

    const result = await tx.feedbackReentry.updateMany({
      where: {
        ...scopedReentryWhere(scope, input),
        status: "open",
        revision: input.expectedRevision,
      },
      data: {
        status: "completed",
        outcomes: outcomes as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        completedByUserId: input.completedByUserId,
        completionNote: input.completionNote,
        revision: { increment: 1 },
      },
    })
    if (result.count === 0) return { failure: "stale_update" as const }

    const resolved = await tx.clientFeedback.updateMany({
      where: {
        id: current.feedbackId,
        workspaceId: scope.workspaceId,
        engagementId: input.engagementId,
        status: "reentry_open",
      },
      data: { status: "resolved", revision: { increment: 1 } },
    })
    if (resolved.count === 0) return { failure: "stale_update" as const }

    await tx.auditTrail.create({
      data: {
        workspaceId: scope.workspaceId,
        userId: input.completedByUserId,
        engagementId: input.engagementId,
        eventType: "feedback_reentry_completed",
        payload: {
          feedbackId: current.feedbackId,
          reentryId: input.reentryId,
          outcomes: outcomes as unknown as Prisma.InputJsonValue,
        },
      },
    })

    return {
      reentry: await tx.feedbackReentry.findFirstOrThrow({
        where: scopedReentryWhere(scope, input),
      }),
    }
  })
  if ("failure" in outcome) return { completed: false, reason: outcome.failure }

  return { completed: true, reentry: toReentrySummary(outcome.reentry, optionsOf) }
}

const withFeedbackRelations = {
  submittedBy: { select: { id: true, displayName: true, email: true } },
  reviewedBy: { select: { id: true, displayName: true, email: true } },
  sourceReportVersion: true,
} as const

const toFeedbackSummary = (
  feedback: FeedbackRow,
  impactOf: (
    sourceSnapshot: ReportSourceSnapshot,
    sourceReportVersionId: string,
    declaredImpactedStages: FeedbackImpactStage[],
  ) => FeedbackImpactView,
): ClientFeedbackSummary => {
  const sourceSnapshot = reportVersionSourceSnapshot(feedback.sourceReportVersion)
  const declaredImpactedStages = feedback.impactedStages as FeedbackImpactStage[]

  return {
    id: feedback.id,
    status: feedback.status,
    revision: feedback.revision,
    content: feedback.originalContent,
    submittedAt: feedback.submittedAt.toISOString(),
    submittedByUserId: feedback.submittedByUserId,
    submittedByName: actorName(feedback.submittedBy),
    submissionKey: feedback.submissionKey,
    sourcePublicationId: feedback.sourcePublicationId,
    sourceReportVersionId: feedback.sourceReportVersionId,
    sourceReportVersionNumber: feedback.sourceReportVersionNumber,
    sourceReportVersionPublishedAt: feedback.sourceReportVersionPublishedAt.toISOString(),
    sourceSnapshotFingerprint: sourceSnapshot.fingerprint,
    classification: feedback.classification,
    managerSummary: feedback.managerSummary,
    managerDecision: feedback.managerDecision,
    closedNoActionReason: feedback.closedNoActionReason,
    reviewedAt: feedback.reviewedAt?.toISOString() ?? null,
    reviewedByUserId: feedback.reviewedByUserId,
    reviewedByName: actorName(feedback.reviewedBy),
    impact: impactOf(
      sourceSnapshot,
      feedback.sourceReportVersionId,
      declaredImpactedStages,
    ),
  }
}

// What the re-entry started from, read off the stored row. One reading, used
// both by the read model's result options and by the transactional completion
// check, so the two cannot answer "unchanged since the re-entry opened"
// differently (coding-standards.md §4).
const reentrySourceFacts = (reentry: ReentryRow): ReentrySourceFacts => ({
  impactedStages: reentry.impactedStages as FeedbackImpactStage[],
  sourceDiscoveryFingerprint: reentry.sourceDiscoveryFingerprint,
  sourceAssessmentRevision: reentry.sourceAssessmentRevision,
  sourceAssessmentFingerprint: reentry.sourceAssessmentFingerprint,
  sourceOpportunityVersionId: reentry.sourceOpportunityVersionId,
  sourceRecommendationVersionId: reentry.sourceRecommendationVersionId,
  sourceRoadmapVersionId: reentry.sourceRoadmapVersionId,
  sourceReportVersionId: reentry.sourceReportVersionId,
})

const toReentrySummary = (
  reentry: ReentryRow,
  optionsOf: (reentry: ReentrySourceFacts) => ReentryStageResultOption[],
): FeedbackReentrySummary => {
  const impactedStages = reentry.impactedStages as FeedbackImpactStage[]

  return {
    id: reentry.id,
    feedbackId: reentry.feedbackId,
    status: reentry.status,
    revision: reentry.revision,
    impactedStages,
    plan: reentry.plan,
    outcomes: reentry.outcomes as unknown as ReentryStageOutcome[],
    openedAt: reentry.openedAt.toISOString(),
    openedByUserId: reentry.openedByUserId,
    completedAt: reentry.completedAt?.toISOString() ?? null,
    completedByUserId: reentry.completedByUserId,
    completionNote: reentry.completionNote,
    sourceDiscoveryFingerprint: reentry.sourceDiscoveryFingerprint,
    sourceAssessmentRevision: reentry.sourceAssessmentRevision,
    sourceAssessmentFingerprint: reentry.sourceAssessmentFingerprint,
    sourceOpportunityVersionId: reentry.sourceOpportunityVersionId,
    sourceRecommendationVersionId: reentry.sourceRecommendationVersionId,
    sourceRoadmapVersionId: reentry.sourceRoadmapVersionId,
    sourceReportVersionId: reentry.sourceReportVersionId,
    resultOptions: optionsOf(reentrySourceFacts(reentry)),
  }
}

const actorName = (
  actor: { displayName: string | null; email: string } | null,
): string | null => actor && (actor.displayName ?? actor.email)

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_VIOLATION
