import assert from "node:assert/strict"
import { test } from "node:test"

import {
  canCloseWithoutAction,
  canCompleteReentry,
  canOpenReentry,
  canSubmitClassification,
  classificationDraftFor,
  classificationPayload,
  closePayload,
  completeReentryPayload,
  emptyClassificationDraft,
  openReentryPayload,
  outcomeForStatus,
  toggleStage,
} from "./feedback-review.ts"

import type {
  ClientFeedbackSummary,
  FeedbackReentrySummary,
} from "../../shared/feedback.schema.ts"

const feedback = (
  overrides: Partial<ClientFeedbackSummary> = {},
): ClientFeedbackSummary => ({
  id: "fb_1",
  status: "submitted",
  revision: 0,
  content: "The roadmap sequence does not match our budget cycle.",
  submittedAt: "2026-08-01T10:00:00.000Z",
  submittedByUserId: "client_1",
  submittedByName: "Client One",
  submissionKey: "key-0000-0000",
  sourcePublicationId: "pub_1",
  sourceReportVersionId: "rv_1",
  sourceReportVersionNumber: 1,
  sourceReportVersionPublishedAt: "2026-07-30T10:00:00.000Z",
  sourceSnapshotFingerprint: "fp_1",
  classification: null,
  managerSummary: null,
  managerDecision: null,
  closedNoActionReason: null,
  reviewedAt: null,
  reviewedByUserId: null,
  reviewedByName: null,
  impact: {
    declaredImpactedStages: [],
    technicalStaleness: {
      opportunities: false,
      recommendations: false,
      roadmap: false,
      report: false,
      reasons: [],
    },
    sourceReport: { superseded: false, sourcesChanged: false, reasons: [] },
    currentOpportunityVersionId: null,
    currentRecommendationVersionId: null,
    currentRoadmapVersionId: null,
    currentReportVersionId: null,
  },
  ...overrides,
})

const reentry = (
  overrides: Partial<FeedbackReentrySummary> = {},
): FeedbackReentrySummary => ({
  id: "re_1",
  feedbackId: "fb_1",
  status: "open",
  revision: 0,
  impactedStages: ["roadmap"],
  plan: "Re-check the roadmap sequencing against the budget cycle.",
  outcomes: [],
  openedAt: "2026-08-02T10:00:00.000Z",
  openedByUserId: "manager_1",
  completedAt: null,
  completedByUserId: null,
  completionNote: null,
  sourceDiscoveryFingerprint: "discovery_fp",
  sourceAssessmentRevision: 2,
  sourceAssessmentFingerprint: "assessment_fp",
  sourceOpportunityVersionId: "oppv_1",
  sourceRecommendationVersionId: "recv_1",
  sourceRoadmapVersionId: "roadv_1",
  sourceReportVersionId: "rv_1",
  resultOptions: [
    {
      stage: "roadmap",
      available: true,
      unavailableReason: null,
      resultArtifactId: "roadv_2",
      resultVersionNumber: 2,
      resultRevision: null,
      resultFingerprint: null,
    },
  ],
  ...overrides,
})

test("an untouched classification form carries no decision at all", () => {
  const draft = emptyClassificationDraft()

  assert.equal(draft.classification, "")
  assert.deepEqual(draft.impactedStages, [])
  assert.equal(canSubmitClassification(draft), false)
  // The decisive property: there is no request body to send. Nothing can be
  // recorded as the Manager's classification or declared impact by default.
  assert.equal(classificationPayload(feedback(), draft), null)
})

test("an unclassified Feedback opens on a blank draft", () => {
  const draft = classificationDraftFor(feedback())

  assert.deepEqual(draft, emptyClassificationDraft())
})

test("prose alone is not a classification", () => {
  const draft = {
    ...emptyClassificationDraft(),
    managerSummary: "The client disputes the sequencing.",
    managerDecision: "Revisit the roadmap.",
  }

  assert.equal(canSubmitClassification(draft), false)
  assert.equal(classificationPayload(feedback(), draft), null)
})

test("a classification submits exactly the stages the Manager selected", () => {
  const draft = {
    classification: "changed_condition" as const,
    impactedStages: toggleStage([], "roadmap"),
    managerSummary: "Budget cycle moved.",
    managerDecision: "Re-sequence the roadmap.",
  }

  assert.deepEqual(classificationPayload(feedback({ revision: 3 }), draft), {
    expectedRevision: 3,
    classification: "changed_condition",
    impactedStages: ["roadmap"],
    managerSummary: "Budget cycle moved.",
    managerDecision: "Re-sequence the roadmap.",
  })
})

test("selecting a classification never implies an impacted stage", () => {
  const draft = {
    classification: "no_engagement_change_required" as const,
    impactedStages: [],
    managerSummary: "Already covered by the current roadmap.",
    managerDecision: "No revision needed.",
  }

  assert.deepEqual(classificationPayload(feedback(), draft)?.impactedStages, [])
})

test("a re-classified Feedback reopens on what was actually recorded", () => {
  const draft = classificationDraftFor(
    feedback({
      classification: "disagreement",
      managerSummary: "Recorded summary.",
      managerDecision: "Recorded decision.",
      impact: { ...feedback().impact, declaredImpactedStages: ["recommendations"] },
    }),
  )

  assert.equal(draft.classification, "disagreement")
  assert.deepEqual(draft.impactedStages, ["recommendations"])
})

test("re-entry needs a classified Feedback, a declared stage and its own plan", () => {
  const classified = feedback({
    status: "classified",
    classification: "new_fact",
    impact: { ...feedback().impact, declaredImpactedStages: ["roadmap"] },
  })

  assert.equal(canOpenReentry(feedback(), "A plan."), false)
  assert.equal(canOpenReentry(classified, "   "), false)
  assert.equal(
    canOpenReentry(
      feedback({ status: "classified", classification: "new_fact" }),
      "A plan.",
    ),
    false,
  )
  assert.equal(canOpenReentry(classified, "A plan."), true)
  assert.deepEqual(openReentryPayload(classified, " A plan. "), {
    feedbackId: "fb_1",
    expectedRevision: 0,
    impactedStages: ["roadmap"],
    plan: "A plan.",
  })
})

test("closing without action carries its own reason and never the decision field", () => {
  const classified = feedback({
    status: "classified",
    classification: "duplicate",
    managerDecision: "Re-sequence the roadmap.",
  })

  assert.equal(canCloseWithoutAction(classified, ""), false)
  assert.equal(closePayload(classified, "   "), null)
  assert.deepEqual(closePayload(classified, " Duplicate of FB-4. "), {
    expectedRevision: 0,
    reason: "Duplicate of FB-4.",
  })
  assert.equal(
    canCloseWithoutAction(feedback({ status: "resolved" }), "Anything."),
    false,
  )
})

test("a completed outcome carries the server-offered version, never typed text", () => {
  const option = reentry().resultOptions[0]

  assert.deepEqual(outcomeForStatus("roadmap", "completed", option, undefined), {
    stage: "roadmap",
    status: "completed",
    resultArtifactId: "roadv_2",
  })
  // Discovery and the Assessment have no version identifier to offer; the
  // outcome carries nothing and the server derives the result.
  assert.deepEqual(
    outcomeForStatus(
      "discovery",
      "completed",
      {
        stage: "discovery",
        available: true,
        unavailableReason: null,
        resultArtifactId: null,
        resultVersionNumber: null,
        resultRevision: null,
        resultFingerprint: "discovery_fp_2",
      },
      undefined,
    ),
    { stage: "discovery", status: "completed" },
  )
  assert.deepEqual(outcomeForStatus("roadmap", "waived", option, "Still valid."), {
    stage: "roadmap",
    status: "waived",
    reason: "Still valid.",
  })
})

test("completion needs every stage, a Manager-authored note, and an available result", () => {
  const open = reentry()
  const completed = { roadmap: outcomeForStatus("roadmap", "completed", open.resultOptions[0], undefined) }

  assert.equal(canCompleteReentry(open, {}, "Done."), false)
  // The note is the Manager's own sentence; there is no default to fall back on.
  assert.equal(canCompleteReentry(open, completed, "   "), false)
  assert.equal(canCompleteReentry(open, completed, "Done."), true)

  assert.deepEqual(completeReentryPayload(open, completed, " Done. "), {
    expectedRevision: 0,
    outcomes: [{ stage: "roadmap", status: "completed", resultArtifactId: "roadv_2" }],
    completionNote: "Done.",
  })
})

test("a stage whose result is unavailable cannot be recorded as completed", () => {
  const blocked = reentry({
    resultOptions: [
      {
        stage: "roadmap",
        available: false,
        unavailableReason: "not_accepted",
        resultArtifactId: null,
        resultVersionNumber: null,
        resultRevision: null,
        resultFingerprint: null,
      },
    ],
  })

  assert.equal(
    canCompleteReentry(
      blocked,
      { roadmap: { stage: "roadmap", status: "completed" } },
      "Done.",
    ),
    false,
  )
  assert.equal(
    canCompleteReentry(
      blocked,
      { roadmap: { stage: "roadmap", status: "waived", reason: "Still valid." } },
      "Done.",
    ),
    true,
  )
})
