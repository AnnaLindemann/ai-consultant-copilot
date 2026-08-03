import type {
  ClientFeedbackSummary,
  FeedbackClassification,
  FeedbackImpactStage,
  FeedbackReentrySummary,
  ReentryOutcomeStatus,
  ReentryStageOutcomeInput,
  ReentryStageResultOption,
} from "../../shared/feedback.schema"

// What the Manager has entered for one Feedback, before anything is sent.
//
// `classification` is `""` until the Manager picks one, and `impactedStages`
// starts empty: an untouched form is not a decision, and the workbench must not
// attribute a classification or a declared impact to a Manager who never chose
// it (agent-rules.md §2 "the consultant has final authority").
export type ClassificationDraft = {
  classification: FeedbackClassification | ""
  impactedStages: FeedbackImpactStage[]
  managerSummary: string
  managerDecision: string
}

export const emptyClassificationDraft = (): ClassificationDraft => ({
  classification: "",
  impactedStages: [],
  managerSummary: "",
  managerDecision: "",
})

// A Feedback already classified reopens on what was actually recorded, so
// re-classifying starts from the Manager's own previous answer rather than from
// a fresh guess.
export const classificationDraftFor = (
  feedback: ClientFeedbackSummary,
): ClassificationDraft => ({
  classification: feedback.classification ?? "",
  impactedStages: feedback.impact.declaredImpactedStages,
  managerSummary: feedback.managerSummary ?? "",
  managerDecision: feedback.managerDecision ?? "",
})

export const canSubmitClassification = (draft: ClassificationDraft): boolean =>
  draft.classification !== "" &&
  draft.managerSummary.trim().length > 0 &&
  draft.managerDecision.trim().length > 0

// The classification request body, or `null` when the Manager has not supplied
// enough to make a decision. Returning `null` rather than a defaulted payload is
// the point: there is no request that says "whatever was pre-selected".
export const classificationPayload = (
  feedback: ClientFeedbackSummary,
  draft: ClassificationDraft,
): {
  expectedRevision: number
  classification: FeedbackClassification
  impactedStages: FeedbackImpactStage[]
  managerSummary: string
  managerDecision: string
} | null => {
  if (!canSubmitClassification(draft) || draft.classification === "") return null

  return {
    expectedRevision: feedback.revision,
    classification: draft.classification,
    impactedStages: draft.impactedStages,
    managerSummary: draft.managerSummary.trim(),
    managerDecision: draft.managerDecision.trim(),
  }
}

// Re-entry runs against what the Manager *declared* when classifying, not
// against the draft still open in the form, so the plan and the declared impact
// cannot disagree.
export const canOpenReentry = (
  feedback: ClientFeedbackSummary,
  plan: string,
): boolean =>
  feedback.status === "classified" &&
  feedback.classification !== null &&
  feedback.impact.declaredImpactedStages.length > 0 &&
  plan.trim().length > 0

export const openReentryPayload = (
  feedback: ClientFeedbackSummary,
  plan: string,
): {
  feedbackId: string
  expectedRevision: number
  impactedStages: FeedbackImpactStage[]
  plan: string
} | null => {
  if (!canOpenReentry(feedback, plan)) return null

  return {
    feedbackId: feedback.id,
    expectedRevision: feedback.revision,
    impactedStages: feedback.impact.declaredImpactedStages,
    plan: plan.trim(),
  }
}

// Closing without action needs its own Manager-authored reason. It never falls
// back to the decision field: they are two different statements.
export const canCloseWithoutAction = (
  feedback: ClientFeedbackSummary,
  reason: string,
): boolean =>
  (feedback.status === "submitted" || feedback.status === "classified") &&
  reason.trim().length > 0

export const closePayload = (
  feedback: ClientFeedbackSummary,
  reason: string,
): { expectedRevision: number; reason: string } | null =>
  canCloseWithoutAction(feedback, reason)
    ? { expectedRevision: feedback.revision, reason: reason.trim() }
    : null

export const resultOptionFor = (
  reentry: FeedbackReentrySummary,
  stage: FeedbackImpactStage,
): ReentryStageResultOption | undefined =>
  reentry.resultOptions.find((option) => option.stage === stage)

// A completed outcome carries only what its stage's contract admits: the
// server-offered version identifier where one exists, and nothing at all where
// the server derives the identity from accepted engagement state. Nothing here
// is composed by hand.
export const outcomeForStatus = (
  stage: FeedbackImpactStage,
  status: ReentryOutcomeStatus,
  option: ReentryStageResultOption | undefined,
  reason: string | undefined,
): ReentryStageOutcomeInput => {
  if (status !== "completed") return { stage, status, reason: reason ?? "" }

  return option?.resultArtifactId
    ? { stage, status, resultArtifactId: option.resultArtifactId }
    : { stage, status }
}

export const recordedOutcomes = (
  reentry: FeedbackReentrySummary,
  outcomes: Partial<Record<FeedbackImpactStage, ReentryStageOutcomeInput>>,
): ReentryStageOutcomeInput[] =>
  reentry.impactedStages
    .map((stage) => outcomes[stage])
    .filter((outcome): outcome is ReentryStageOutcomeInput => outcome !== undefined)

export const canCompleteReentry = (
  reentry: FeedbackReentrySummary,
  outcomes: Partial<Record<FeedbackImpactStage, ReentryStageOutcomeInput>>,
  completionNote: string,
): boolean => {
  const recorded = recordedOutcomes(reentry, outcomes)
  if (completionNote.trim().length === 0) return false
  if (recorded.length !== reentry.impactedStages.length) return false

  return recorded.every((outcome) =>
    outcome.status === "completed"
      ? resultOptionFor(reentry, outcome.stage)?.available === true
      : Boolean(outcome.reason?.trim()),
  )
}

export const completeReentryPayload = (
  reentry: FeedbackReentrySummary,
  outcomes: Partial<Record<FeedbackImpactStage, ReentryStageOutcomeInput>>,
  completionNote: string,
): {
  expectedRevision: number
  outcomes: ReentryStageOutcomeInput[]
  completionNote: string
} | null =>
  canCompleteReentry(reentry, outcomes, completionNote)
    ? {
        expectedRevision: reentry.revision,
        outcomes: recordedOutcomes(reentry, outcomes),
        completionNote: completionNote.trim(),
      }
    : null

export const toggleStage = (
  stages: FeedbackImpactStage[],
  stage: FeedbackImpactStage,
): FeedbackImpactStage[] =>
  stages.includes(stage)
    ? stages.filter((existing) => existing !== stage)
    : [...stages, stage]
