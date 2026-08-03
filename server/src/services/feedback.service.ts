import type { Prisma } from "@prisma/client"

import {
  assessmentFingerprint,
  discoveryFingerprint,
} from "../domain/engagement/consultant-report.js"
import {
  feedbackSourceReportState,
  feedbackTechnicalStaleness,
  validateReentryOutcomes,
} from "../domain/engagement/feedback.js"
import { getReportVersionById } from "../repositories/consultant-report-version.repository.js"
import type { ReentrySourceFacts } from "../repositories/feedback.repository.js"
import {
  getEngagementById,
  toAssessment,
  toDiscoveryProfile,
  type EngagementScope,
  type EngagementWithOrganization,
} from "../repositories/engagement.repository.js"
import {
  closeClientFeedbackWithoutAction,
  classifyClientFeedback,
  completeFeedbackReentry,
  createClientFeedback,
  getOpenReentry,
  listFeedback,
  listClientPortalFeedback,
  listOpenReentries,
  openFeedbackReentry,
} from "../repositories/feedback.repository.js"
import { getRoadmapVersionById } from "../repositories/implementation-roadmap-version.repository.js"
import { getOpportunityVersionById } from "../repositories/opportunity-version.repository.js"
import { getRecommendationVersionById } from "../repositories/recommendation-version.repository.js"
import { getReportStageState } from "./consultant-report.service.js"
import { getRoadmapStageState } from "./implementation-roadmap.service.js"
import { getOpportunityVersionState } from "./opportunities.service.js"
import { getRecommendationStageState } from "./recommendations.service.js"

import type { ReportSourceSnapshot } from "../../../shared/consultant-report.schema.js"
import type { FeedbackMessageId } from "../../../shared/feedback-messages.js"
import type {
  ClassifyFeedbackInput,
  ClientFeedbackSummary,
  ClientPortalFeedbackSummary,
  CloseFeedbackInput,
  CompleteFeedbackReentryInput,
  FeedbackImpactStage,
  FeedbackImpactView,
  FeedbackReentrySummary,
  FeedbackStageState,
  OpenFeedbackReentryInput,
  ReentryStageOutcome,
  ReentryStageOutcomeInput,
  ReentryStageResultOption,
  SubmitClientFeedbackInput,
} from "../../../shared/feedback.schema.js"

export type FeedbackFailure =
  | "publication_not_found"
  | "invalid_idempotent_submission"
  | "feedback_not_found"
  | "feedback_not_classified"
  | "invalid_feedback_transition"
  | "reentry_not_found"
  | "reentry_already_open"
  | "reentry_sources_unavailable"
  | "no_impacted_stages"
  | "missing_rationale"
  | "incomplete_reentry_outcome"
  | "invalid_result_artifact"
  | "stale_update"

export type SubmitFeedbackResult =
  | { success: true; created: boolean; feedback: ClientPortalFeedbackSummary }
  | { success: false; failure: FeedbackFailure; messageId: FeedbackMessageId }

export type ClassifyFeedbackResult =
  | { success: true; feedback: ClientFeedbackSummary }
  | {
      success: false
      failure: FeedbackFailure
      messageId: FeedbackMessageId
      currentRevision?: number
    }

export type OpenReentryResult =
  | { success: true; feedback: ClientFeedbackSummary; reentry: FeedbackReentrySummary }
  | {
      success: false
      failure: FeedbackFailure
      messageId: FeedbackMessageId
      currentRevision?: number
    }

export type CompleteReentryResult =
  | { success: true; reentry: FeedbackReentrySummary }
  | {
      success: false
      failure: FeedbackFailure
      messageId: FeedbackMessageId
      currentRevision?: number
    }

const FAILURE_MESSAGE: Record<FeedbackFailure, FeedbackMessageId> = {
  publication_not_found: "feedback.error.publication_not_found",
  invalid_idempotent_submission: "feedback.error.invalid_idempotent_submission",
  feedback_not_found: "feedback.error.feedback_not_found",
  feedback_not_classified: "feedback.error.feedback_not_classified",
  invalid_feedback_transition: "feedback.error.invalid_feedback_transition",
  reentry_not_found: "feedback.error.reentry_not_found",
  reentry_already_open: "feedback.error.reentry_already_open",
  reentry_sources_unavailable: "feedback.error.reentry_sources_unavailable",
  no_impacted_stages: "feedback.error.no_impacted_stages",
  missing_rationale: "feedback.error.missing_rationale",
  incomplete_reentry_outcome: "feedback.error.incomplete_reentry_outcome",
  invalid_result_artifact: "feedback.error.invalid_result_artifact",
  stale_update: "feedback.error.stale_update",
}

// Submission answers in the Client's own DTO the whole way up. The Manager view
// is never built on this path, so there is nothing for a route to forget to
// strip (coding-standards.md §6A).
export const submitFeedback = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  input: SubmitClientFeedbackInput,
): Promise<SubmitFeedbackResult> => {
  const result = await createClientFeedback(scope, {
    engagementId: engagement.id,
    publicationId: input.publicationId,
    submissionKey: input.submissionKey,
    content: input.content,
    submittedByUserId: scope.userId,
  })

  if ("feedback" in result) {
    return { success: true, created: result.created, feedback: result.feedback }
  }

  return refused(result.reason)
}

export const getClientPortalFeedback = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
): Promise<ClientPortalFeedbackSummary[]> =>
  listClientPortalFeedback(engagement.id, scope)

export const getFeedbackStageState = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  stages?: EngagementStageStates,
): Promise<FeedbackStageState> => {
  const current = stages ?? (await loadEngagementStageStates(engagement, scope))
  const impactOf = impactViewFor(current)
  const optionsOf = resultOptionsFor(engagement, current)

  const [feedback, openReentries] = await Promise.all([
    listFeedback(engagement.id, scope, impactOf),
    listOpenReentries(engagement.id, scope, optionsOf),
  ])

  return { feedback, openReentries }
}

export const reviewFeedback = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  feedbackId: string,
  input: ClassifyFeedbackInput,
): Promise<ClassifyFeedbackResult> => {
  const current = await loadEngagementStageStates(engagement, scope)
  const result = await classifyClientFeedback(
    scope,
    {
      engagementId: engagement.id,
      feedbackId,
      expectedRevision: input.expectedRevision,
      reviewedByUserId: scope.userId,
      classification: input.classification,
      impactedStages: input.impactedStages,
      managerSummary: input.managerSummary,
      managerDecision: input.managerDecision,
    },
    impactViewFor(current),
  )

  if (!result.classified) {
    return { ...refused(result.reason), currentRevision: result.currentRevision }
  }

  return { success: true, feedback: result.feedback }
}

export const closeFeedbackWithoutAction = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  feedbackId: string,
  input: CloseFeedbackInput,
): Promise<ClassifyFeedbackResult> => {
  const current = await loadEngagementStageStates(engagement, scope)
  const result = await closeClientFeedbackWithoutAction(
    scope,
    {
      engagementId: engagement.id,
      feedbackId,
      expectedRevision: input.expectedRevision,
      closedByUserId: scope.userId,
      reason: input.reason,
    },
    impactViewFor(current),
  )

  if (!result.closed) {
    return { ...refused(result.reason), currentRevision: result.currentRevision }
  }

  return { success: true, feedback: result.feedback }
}

export const beginFeedbackReentry = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  input: OpenFeedbackReentryInput,
): Promise<OpenReentryResult> => {
  const current = await loadEngagementStageStates(engagement, scope)
  // The re-entry records what the engagement looked like when it opened, so
  // there has to be a report version to record. Refused as a missing source,
  // not as an invalid result — nothing has been submitted as a result yet.
  if (!current.report.activeVersion) return refused("reentry_sources_unavailable")

  const assessment = toAssessment(engagement)
  const result = await openFeedbackReentry(
    scope,
    {
      engagementId: engagement.id,
      feedbackId: input.feedbackId,
      expectedRevision: input.expectedRevision,
      openedByUserId: scope.userId,
      impactedStages: input.impactedStages,
      plan: input.plan,
      sourceDiscoveryFingerprint: discoveryFingerprint(toDiscoveryProfile(engagement)),
      sourceAssessmentRevision: engagement.assessmentRevision,
      sourceAssessmentFingerprint: assessment ? assessmentFingerprint(assessment) : "",
      sourceOpportunityVersionId: current.opportunities.activeVersion?.id ?? null,
      sourceRecommendationVersionId: current.recommendations.activeVersion?.id ?? null,
      sourceRoadmapVersionId: current.roadmap.activeVersion?.id ?? null,
      sourceReportVersionId: current.report.activeVersion.id,
    },
    impactViewFor(current),
    resultOptionsFor(engagement, current),
  )

  if (!result.opened) {
    return { ...refused(result.reason), currentRevision: result.currentRevision }
  }

  return { success: true, feedback: result.feedback, reentry: result.reentry }
}

export const finishFeedbackReentry = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  reentryId: string,
  input: CompleteFeedbackReentryInput,
): Promise<CompleteReentryResult> => {
  const current = await loadEngagementStageStates(engagement, scope)
  const optionsOf = resultOptionsFor(engagement, current)
  const openReentry = await getOpenReentry(
    scope,
    { engagementId: engagement.id, reentryId },
    optionsOf,
  )
  if (!openReentry) return refused("reentry_not_found")

  // The impacted stages are fixed when the re-entry opens, so completeness of
  // the submitted outcomes can be judged here. *Which artifact each completed
  // outcome names* cannot: that depends on engagement state any other Manager
  // can move, so it is resolved inside the completion transaction below.
  const transitionFailure = validateReentryOutcomes(
    openReentry.impactedStages,
    input.outcomes,
  )
  if (transitionFailure === "missing_rationale") return refused("missing_rationale")
  if (transitionFailure) return refused("incomplete_reentry_outcome")

  const result = await completeFeedbackReentry(
    scope,
    {
      engagementId: engagement.id,
      reentryId,
      expectedRevision: input.expectedRevision,
      completedByUserId: scope.userId,
      completionNote: input.completionNote,
    },
    optionsOf,
    (tx, source) => resolveOutcomes(tx, scope, engagement.id, source, input.outcomes),
  )

  if (!result.completed) {
    return { ...refused(result.reason), currentRevision: result.currentRevision }
  }

  return { success: true, reentry: result.reentry }
}

// --- Current engagement state -------------------------------------------------

// The four stage states the rest of the workbench already answers with. Phase 9
// reads them rather than deriving its own view of what is current or stale, so
// a Feedback card and its stage panel can never disagree (coding-standards.md
// §2 "reuse existing infrastructure… do not introduce a parallel mechanism").
export type EngagementStageStates = {
  opportunities: Awaited<ReturnType<typeof getOpportunityVersionState>>
  recommendations: Awaited<ReturnType<typeof getRecommendationStageState>>
  roadmap: Awaited<ReturnType<typeof getRoadmapStageState>>
  report: Awaited<ReturnType<typeof getReportStageState>>
}

export const loadEngagementStageStates = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
): Promise<EngagementStageStates> => {
  const [opportunities, recommendations, roadmap, report] = await Promise.all([
    getOpportunityVersionState(engagement, scope),
    getRecommendationStageState(engagement, scope),
    getRoadmapStageState(engagement, scope),
    getReportStageState(engagement, scope),
  ])

  return { opportunities, recommendations, roadmap, report }
}

// The three separate answers, assembled from the domain. Technical staleness is
// a property of the engagement and is the same for every Feedback; only the
// source-report comparison depends on which published version was commented on.
const impactViewFor =
  (current: EngagementStageStates) =>
  (
    sourceSnapshot: ReportSourceSnapshot,
    sourceReportVersionId: string,
    declaredImpactedStages: FeedbackImpactStage[],
  ): FeedbackImpactView => ({
    declaredImpactedStages,
    technicalStaleness: feedbackTechnicalStaleness({
      opportunitiesStale: current.opportunities.stale,
      recommendationsStale: current.recommendations.stale,
      roadmapStale: current.roadmap.stale,
      reportStale: current.report.stale,
      reportVersionSnapshot: current.report.activeVersion?.sourceSnapshot ?? null,
      currentSnapshot: current.report.currentSourceSnapshot,
    }),
    sourceReport: feedbackSourceReportState({
      sourceReportVersionId,
      activeReportVersionId: current.report.activeVersion?.id ?? null,
      sourceReportSnapshot: sourceSnapshot,
      currentSnapshot: current.report.currentSourceSnapshot,
    }),
    currentOpportunityVersionId: current.opportunities.activeVersion?.id ?? null,
    currentRecommendationVersionId: current.recommendations.activeVersion?.id ?? null,
    currentRoadmapVersionId: current.roadmap.activeVersion?.id ?? null,
    currentReportVersionId: current.report.activeVersion?.id ?? null,
  })

// --- Result identity ----------------------------------------------------------

// What each impacted stage could be completed with right now. There is at most
// one candidate per stage, because a completed outcome must reference the
// *active* accepted version — so the Manager selects a server-known result
// instead of typing an identifier, and Discovery and the Assessment need no
// input at all.
const resultOptionsFor =
  (engagement: EngagementWithOrganization, current: EngagementStageStates) =>
  (reentry: ReentrySourceFacts): ReentryStageResultOption[] =>
    reentry.impactedStages.map((stage) =>
      resultOptionFor(stage, engagement, current, reentry),
    )

const resultOptionFor = (
  stage: FeedbackImpactStage,
  engagement: EngagementWithOrganization,
  current: EngagementStageStates,
  source: ReentrySourceFacts,
): ReentryStageResultOption => {
  const unavailable = (
    unavailableReason: ReentryStageResultOption["unavailableReason"],
  ): ReentryStageResultOption => ({
    stage,
    available: false,
    unavailableReason,
    resultArtifactId: null,
    resultVersionNumber: null,
    resultRevision: null,
    resultFingerprint: null,
  })

  switch (stage) {
    case "discovery": {
      if (engagement.discoveryStatus !== "accepted") return unavailable("not_accepted")
      const fingerprint = discoveryFingerprint(toDiscoveryProfile(engagement))
      if (fingerprint === source.sourceDiscoveryFingerprint) {
        return unavailable("unchanged_since_source")
      }
      return {
        stage,
        available: true,
        unavailableReason: null,
        resultArtifactId: null,
        resultVersionNumber: null,
        resultRevision: null,
        resultFingerprint: fingerprint,
      }
    }
    case "assessment": {
      const assessment = toAssessment(engagement)
      if (assessment === null || engagement.assessmentReviewState !== "accepted") {
        return unavailable(assessment === null ? "artifact_missing" : "not_accepted")
      }
      const fingerprint = assessmentFingerprint(assessment)
      if (
        engagement.assessmentRevision <= source.sourceAssessmentRevision ||
        fingerprint === source.sourceAssessmentFingerprint
      ) {
        return unavailable("unchanged_since_source")
      }
      return {
        stage,
        available: true,
        unavailableReason: null,
        resultArtifactId: null,
        resultVersionNumber: null,
        resultRevision: engagement.assessmentRevision,
        resultFingerprint: fingerprint,
      }
    }
    case "opportunities": {
      const version = current.opportunities.activeVersion
      if (!version) return unavailable("artifact_missing")
      if (version.reviewState !== "accepted") return unavailable("not_accepted")
      if (version.id === source.sourceOpportunityVersionId) return unavailable("unchanged_since_source")
      return versionedOption(stage, version.id, version.versionNumber)
    }
    case "recommendations": {
      const version = current.recommendations.activeVersion
      if (!version) return unavailable("artifact_missing")
      if (version.reviewState !== "accepted") return unavailable("not_accepted")
      if (version.id === source.sourceRecommendationVersionId) return unavailable("unchanged_since_source")
      return versionedOption(stage, version.id, version.versionNumber)
    }
    case "roadmap": {
      const version = current.roadmap.activeVersion
      if (!version) return unavailable("artifact_missing")
      if (version.reviewState !== "accepted") return unavailable("not_accepted")
      if (version.id === source.sourceRoadmapVersionId) return unavailable("unchanged_since_source")
      return versionedOption(stage, version.id, version.versionNumber)
    }
    case "report": {
      const version = current.report.activeVersion
      if (!version) return unavailable("artifact_missing")
      if (version.reviewState !== "approved") return unavailable("not_accepted")
      if (version.id === source.sourceReportVersionId) {
        return unavailable("unchanged_since_source")
      }
      return versionedOption(stage, version.id, version.versionNumber)
    }
  }
}

const versionedOption = (
  stage: FeedbackImpactStage,
  resultArtifactId: string,
  resultVersionNumber: number,
): ReentryStageResultOption => ({
  stage,
  available: true,
  unavailableReason: null,
  resultArtifactId,
  resultVersionNumber,
  resultRevision: null,
  resultFingerprint: null,
})

// Turn what the Manager submitted into what is recorded. Every result identity
// is read from persisted engagement state here, so the stored lineage says what
// the engagement actually holds rather than what someone typed. A stage that
// cannot be evidenced refuses the whole completion.
//
// It runs on the completion transaction's client, and re-reads the engagement
// there too: the caller's engagement object was loaded before the request began
// and may already describe an Assessment that has since been sent back for
// revision. Nothing outside this function decides result validity, so the rules
// exist once (coding-standards.md §4).
const resolveOutcomes = async (
  tx: Prisma.TransactionClient,
  scope: EngagementScope,
  engagementId: string,
  reentry: ReentrySourceFacts,
  outcomes: ReentryStageOutcomeInput[],
): Promise<ReentryStageOutcome[] | null> => {
  const engagement = await getEngagementById(engagementId, scope, tx)
  if (!engagement) return null

  const resolved: ReentryStageOutcome[] = []

  for (const outcome of outcomes) {
    if (outcome.status !== "completed") {
      resolved.push({
        stage: outcome.stage,
        status: outcome.status,
        reason: outcome.reason?.trim() ?? null,
        resultArtifactId: null,
        resultVersionNumber: null,
        resultRevision: null,
        resultFingerprint: null,
      })
      continue
    }

    const completed = await resolveCompletedOutcome(
      tx,
      outcome,
      engagement,
      scope,
      reentry,
    )
    if (!completed) return null
    resolved.push(completed)
  }

  return resolved
}

const resolveCompletedOutcome = async (
  tx: Prisma.TransactionClient,
  outcome: ReentryStageOutcomeInput,
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  reentry: ReentrySourceFacts,
): Promise<ReentryStageOutcome | null> => {
  const completed = (fields: {
    resultArtifactId?: string | null
    resultVersionNumber?: number | null
    resultRevision?: number | null
    resultFingerprint?: string | null
  }): ReentryStageOutcome => ({
    stage: outcome.stage,
    status: "completed",
    reason: null,
    resultArtifactId: fields.resultArtifactId ?? null,
    resultVersionNumber: fields.resultVersionNumber ?? null,
    resultRevision: fields.resultRevision ?? null,
    resultFingerprint: fields.resultFingerprint ?? null,
  })

  switch (outcome.stage) {
    case "discovery": {
      if (engagement.discoveryStatus !== "accepted") return null
      const fingerprint = discoveryFingerprint(toDiscoveryProfile(engagement))
      // Completion means Discovery genuinely moved since the re-entry opened.
      if (fingerprint === reentry.sourceDiscoveryFingerprint) return null
      return completed({ resultFingerprint: fingerprint })
    }
    case "assessment": {
      const assessment = toAssessment(engagement)
      if (assessment === null || engagement.assessmentReviewState !== "accepted") {
        return null
      }
      const fingerprint = assessmentFingerprint(assessment)
      if (
        engagement.assessmentRevision <= reentry.sourceAssessmentRevision ||
        fingerprint === reentry.sourceAssessmentFingerprint
      ) {
        return null
      }
      return completed({
        resultRevision: engagement.assessmentRevision,
        resultFingerprint: fingerprint,
      })
    }
    case "opportunities": {
      const version = await getOpportunityVersionById(
        outcome.resultArtifactId ?? "",
        engagement.id,
        scope,
        tx,
      )
      if (
        !version ||
        version.status !== "active" ||
        version.reviewState !== "accepted" ||
        version.id === reentry.sourceOpportunityVersionId
      ) {
        return null
      }
      return completed({
        resultArtifactId: version.id,
        resultVersionNumber: version.versionNumber,
      })
    }
    case "recommendations": {
      const version = await getRecommendationVersionById(
        outcome.resultArtifactId ?? "",
        engagement.id,
        scope,
        tx,
      )
      if (
        !version ||
        version.status !== "active" ||
        version.reviewState !== "accepted" ||
        version.id === reentry.sourceRecommendationVersionId
      ) {
        return null
      }
      return completed({
        resultArtifactId: version.id,
        resultVersionNumber: version.versionNumber,
      })
    }
    case "roadmap": {
      const version = await getRoadmapVersionById(
        outcome.resultArtifactId ?? "",
        engagement.id,
        scope,
        tx,
      )
      if (
        !version ||
        version.status !== "active" ||
        version.reviewState !== "accepted" ||
        version.id === reentry.sourceRoadmapVersionId
      ) {
        return null
      }
      return completed({
        resultArtifactId: version.id,
        resultVersionNumber: version.versionNumber,
      })
    }
    case "report": {
      const version = await getReportVersionById(
        outcome.resultArtifactId ?? "",
        engagement.id,
        scope,
        tx,
      )
      // `status: "active"` *is* "this is the engagement's current report
      // version" — a new version supersedes the previous one in the same write
      // — so the transactional read answers currency without consulting a stage
      // state assembled before the transaction opened.
      if (
        !version ||
        version.status !== "active" ||
        version.reviewState !== "approved" ||
        version.id === reentry.sourceReportVersionId
      ) {
        return null
      }
      return completed({
        resultArtifactId: version.id,
        resultVersionNumber: version.versionNumber,
      })
    }
  }
}

const refused = (failure: FeedbackFailure) => ({
  success: false as const,
  failure,
  messageId: FAILURE_MESSAGE[failure],
})
