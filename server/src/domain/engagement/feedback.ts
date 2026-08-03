import { isReportVersionStale } from "./consultant-report.js"

import {
  hasVersionedResult,
  type FeedbackImpactStage,
  type FeedbackSourceReportState,
  type FeedbackStalenessReason,
  type FeedbackStatus,
  type FeedbackTechnicalStaleness,
  type ReentryStageOutcomeInput,
} from "../../../../shared/feedback.schema.js"
import type { ReportSourceSnapshot } from "../../../../shared/consultant-report.schema.js"

export type FeedbackTransitionFailure =
  | "invalid_feedback_transition"
  | "feedback_not_classified"
  | "missing_rationale"
  | "no_impacted_stages"
  | "incomplete_reentry_outcome"

// --- Lifecycle ---------------------------------------------------------------
//
// The transitions are stated once, here, and asked for by the application and
// persistence layers. A rule that also exists as an inline condition in a
// repository is a rule that can be relaxed in one place and still pass its
// tests (coding-standards.md §5, §9).
//
//   submitted → classified → reentry_open → resolved
//   submitted | classified → closed_no_action
//
// `resolved` and `closed_no_action` are terminal. Reopening is not a supported
// operation, so it is refused rather than quietly allowed through the
// classification path.

const canClassifyFeedback = (status: FeedbackStatus): boolean =>
  status === "submitted" || status === "classified"

const canCloseFeedbackWithoutAction = (status: FeedbackStatus): boolean =>
  status === "submitted" || status === "classified"

const canOpenFeedbackReentry = (status: FeedbackStatus): boolean =>
  status === "classified"

const canCompleteFeedbackReentry = (
  status: "open" | "completed",
): boolean => status === "open"

export const validateClassificationTransition = (
  status: FeedbackStatus,
): FeedbackTransitionFailure | null =>
  canClassifyFeedback(status) ? null : "invalid_feedback_transition"

export const validateCloseNoActionTransition = (
  status: FeedbackStatus,
  reason: string,
): FeedbackTransitionFailure | null => {
  if (!canCloseFeedbackWithoutAction(status)) return "invalid_feedback_transition"
  return reason.trim() ? null : "missing_rationale"
}

// Re-entry needs a classification, not merely a status that looks late enough.
// A Feedback can only reach `classified` through the classification path, but
// the two facts are checked separately so the refusal names the real cause.
export const validateOpenReentryTransition = (
  status: FeedbackStatus,
  classification: string | null,
  impactedStages: FeedbackImpactStage[],
): FeedbackTransitionFailure | null => {
  if (status === "submitted" || classification === null) {
    return "feedback_not_classified"
  }
  if (!canOpenFeedbackReentry(status)) return "invalid_feedback_transition"
  return impactedStages.length > 0 ? null : "no_impacted_stages"
}

export const validateCompleteReentryTransition = (
  status: "open" | "completed",
): FeedbackTransitionFailure | null =>
  canCompleteFeedbackReentry(status) ? null : "invalid_feedback_transition"

// Every declared stage needs exactly one outcome, and every outcome needs the
// thing its status implies: a selected result version for a completed versioned
// stage, a Manager-authored reason otherwise. Stages the domain does not version
// (Discovery, Assessment) carry a server-derived result, so no identifier is
// expected from the caller.
export const validateReentryOutcomes = (
  impactedStages: FeedbackImpactStage[],
  outcomes: ReentryStageOutcomeInput[],
): FeedbackTransitionFailure | null => {
  const seen = new Set<FeedbackImpactStage>()

  for (const outcome of outcomes) {
    if (!impactedStages.includes(outcome.stage)) return "incomplete_reentry_outcome"
    if (seen.has(outcome.stage)) return "incomplete_reentry_outcome"
    seen.add(outcome.stage)

    if (outcome.status === "completed") {
      if (hasVersionedResult(outcome.stage) && !outcome.resultArtifactId?.trim()) {
        return "incomplete_reentry_outcome"
      }
      continue
    }

    if (!outcome.reason?.trim()) return "missing_rationale"
  }

  return impactedStages.every((stage) => seen.has(stage))
    ? null
    : "incomplete_reentry_outcome"
}

// --- Impact ------------------------------------------------------------------

// Emitted in a fixed order so the same situation always reads the same way.
const STALENESS_REASON_ORDER: FeedbackStalenessReason[] = [
  "discovery_changed",
  "assessment_changed",
  "opportunity_version_changed",
  "recommendation_version_changed",
  "roadmap_version_changed",
]

// Technical staleness is *not* derived here — it is taken from the per-stage
// predicates the Opportunity, Recommendation, Roadmap and Report stages already
// answer with, so Phase 9 cannot drift into a second opinion about what is
// stale (coding-standards.md §2). This function only names the artifact that
// caused each one, which is the part the reason identifiers get wrong when they
// are assigned by position rather than by cause.
//
// A stage with no current artifact is never stale: the existing predicates are
// null-safe, and "nothing there yet" is not "moved on beneath you".
export const feedbackTechnicalStaleness = (input: {
  opportunitiesStale: boolean
  recommendationsStale: boolean
  roadmapStale: boolean
  reportStale: boolean
  reportVersionSnapshot: ReportSourceSnapshot | null
  currentSnapshot: ReportSourceSnapshot | null
}): FeedbackTechnicalStaleness => {
  const reasons = new Set<FeedbackStalenessReason>()

  // Opportunities are derived from the Assessment, so the Assessment is what
  // changed beneath them — and so on down the chain.
  if (input.opportunitiesStale) reasons.add("assessment_changed")
  if (input.recommendationsStale) reasons.add("opportunity_version_changed")
  if (input.roadmapStale) reasons.add("recommendation_version_changed")

  // A report is derived from all five stages at once, so its cause is read off
  // the snapshot rather than assumed.
  if (input.reportStale) {
    for (const reason of snapshotChanges(
      input.reportVersionSnapshot,
      input.currentSnapshot,
    )) {
      reasons.add(reason)
    }
  }

  return {
    opportunities: input.opportunitiesStale,
    recommendations: input.recommendationsStale,
    roadmap: input.roadmapStale,
    report: input.reportStale,
    reasons: STALENESS_REASON_ORDER.filter((reason) => reasons.has(reason)),
  }
}

// Where the published ReportVersion the client actually commented on stands
// against the engagement now. This is a property of *this Feedback*, unlike
// technical staleness, which is a property of the engagement.
export const feedbackSourceReportState = (input: {
  sourceReportVersionId: string
  activeReportVersionId: string | null
  sourceReportSnapshot: ReportSourceSnapshot | null
  currentSnapshot: ReportSourceSnapshot | null
}): FeedbackSourceReportState => {
  const superseded =
    input.activeReportVersionId !== null &&
    input.activeReportVersionId !== input.sourceReportVersionId
  const sourcesChanged = isReportVersionStale(
    input.sourceReportSnapshot,
    input.currentSnapshot,
  )

  return {
    superseded,
    sourcesChanged,
    reasons: [
      ...(superseded ? (["source_report_superseded"] as const) : []),
      ...(sourcesChanged ? (["source_report_sources_changed"] as const) : []),
    ],
  }
}

// Which upstream artifacts differ between two report source snapshots. Both
// halves of a stage's identity are compared — the version identifier and its
// content fingerprint — because either moving is a real change.
const snapshotChanges = (
  versionSnapshot: ReportSourceSnapshot | null,
  currentSnapshot: ReportSourceSnapshot | null,
): FeedbackStalenessReason[] => {
  if (versionSnapshot === null || currentSnapshot === null) return []

  const changes: FeedbackStalenessReason[] = []

  if (versionSnapshot.discoveryFingerprint !== currentSnapshot.discoveryFingerprint) {
    changes.push("discovery_changed")
  }
  if (
    versionSnapshot.assessmentRevision !== currentSnapshot.assessmentRevision ||
    versionSnapshot.assessmentFingerprint !== currentSnapshot.assessmentFingerprint
  ) {
    changes.push("assessment_changed")
  }
  if (
    versionSnapshot.opportunityVersionId !== currentSnapshot.opportunityVersionId ||
    versionSnapshot.opportunityFingerprint !== currentSnapshot.opportunityFingerprint
  ) {
    changes.push("opportunity_version_changed")
  }
  if (
    versionSnapshot.recommendationVersionId !==
      currentSnapshot.recommendationVersionId ||
    versionSnapshot.recommendationFingerprint !==
      currentSnapshot.recommendationFingerprint
  ) {
    changes.push("recommendation_version_changed")
  }
  if (
    versionSnapshot.roadmapVersionId !== currentSnapshot.roadmapVersionId ||
    versionSnapshot.roadmapFingerprint !== currentSnapshot.roadmapFingerprint
  ) {
    changes.push("roadmap_version_changed")
  }

  return changes
}
