import assert from "node:assert/strict"
import { test } from "node:test"

import {
  feedbackSourceReportState,
  feedbackTechnicalStaleness,
  validateClassificationTransition,
  validateCloseNoActionTransition,
  validateCompleteReentryTransition,
  validateOpenReentryTransition,
  validateReentryOutcomes,
} from "./feedback.js"

import type { ReportSourceSnapshot } from "../../../../shared/consultant-report.schema.js"
import type {
  FeedbackImpactStage,
  ReentryStageOutcomeInput,
} from "../../../../shared/feedback.schema.js"

test("Feedback classification does not reopen terminal lifecycle states", () => {
  assert.equal(validateClassificationTransition("submitted"), null)
  assert.equal(validateClassificationTransition("classified"), null)
  assert.equal(
    validateClassificationTransition("reentry_open"),
    "invalid_feedback_transition",
  )
  assert.equal(
    validateClassificationTransition("resolved"),
    "invalid_feedback_transition",
  )
  assert.equal(
    validateClassificationTransition("closed_no_action"),
    "invalid_feedback_transition",
  )
})

test("closing Feedback without re-entry requires an explicit Manager rationale", () => {
  assert.equal(
    validateCloseNoActionTransition("submitted", ""),
    "missing_rationale",
  )
  assert.equal(
    validateCloseNoActionTransition("submitted", "   "),
    "missing_rationale",
  )
  assert.equal(validateCloseNoActionTransition("classified", "duplicate"), null)
  assert.equal(
    validateCloseNoActionTransition("reentry_open", "duplicate"),
    "invalid_feedback_transition",
  )
  assert.equal(
    validateCloseNoActionTransition("resolved", "duplicate"),
    "invalid_feedback_transition",
  )
})

test("re-entry opens only after classification and with declared impacted stages", () => {
  assert.equal(
    validateOpenReentryTransition("submitted", null, ["recommendations"]),
    "feedback_not_classified",
  )
  // A status that looks late enough is not a classification.
  assert.equal(
    validateOpenReentryTransition("classified", null, ["recommendations"]),
    "feedback_not_classified",
  )
  assert.equal(
    validateOpenReentryTransition("classified", "new_fact", []),
    "no_impacted_stages",
  )
  assert.equal(
    validateOpenReentryTransition("classified", "new_fact", ["report"]),
    null,
  )
  assert.equal(
    validateOpenReentryTransition("resolved", "new_fact", ["report"]),
    "invalid_feedback_transition",
  )
  assert.equal(
    validateOpenReentryTransition("reentry_open", "new_fact", ["report"]),
    "invalid_feedback_transition",
  )
})

test("only an open re-entry can be completed", () => {
  assert.equal(validateCompleteReentryTransition("open"), null)
  assert.equal(
    validateCompleteReentryTransition("completed"),
    "invalid_feedback_transition",
  )
})

test("re-entry completion requires exactly one explicit outcome per impacted stage", () => {
  const stages: FeedbackImpactStage[] = ["recommendations", "roadmap", "report"]
  const complete: ReentryStageOutcomeInput[] = [
    { stage: "recommendations", status: "completed", resultArtifactId: "rec_v2" },
    { stage: "roadmap", status: "waived", reason: "Roadmap remains valid." },
    { stage: "report", status: "completed", resultArtifactId: "report_v2" },
  ]

  assert.equal(validateReentryOutcomes(stages, complete), null)
  assert.equal(
    validateReentryOutcomes(stages, complete.slice(0, 2)),
    "incomplete_reentry_outcome",
  )
  assert.equal(
    validateReentryOutcomes(stages, [
      ...complete,
      { stage: "report", status: "no_change_confirmed", reason: "same report" },
    ]),
    "incomplete_reentry_outcome",
  )
  assert.equal(
    validateReentryOutcomes(stages, [
      { stage: "recommendations", status: "waived" },
      { stage: "roadmap", status: "waived", reason: "valid" },
      { stage: "report", status: "waived", reason: "valid" },
    ]),
    "missing_rationale",
  )
})

test("a completed versioned stage must name its result; a derived stage must not", () => {
  assert.equal(
    validateReentryOutcomes(
      ["recommendations"],
      [{ stage: "recommendations", status: "completed" }],
    ),
    "incomplete_reentry_outcome",
  )
  // Discovery and the Assessment carry no version identifier: the result is
  // derived server-side, so completing them takes no reference from the Manager.
  assert.equal(
    validateReentryOutcomes(
      ["discovery", "assessment"],
      [
        { stage: "discovery", status: "completed" },
        { stage: "assessment", status: "completed" },
      ],
    ),
    null,
  )
})

const snapshot = (
  overrides: Partial<ReportSourceSnapshot> = {},
): ReportSourceSnapshot => ({
  fingerprint: "source_fp",
  discoveryFingerprint: "discovery_fp",
  assessmentRevision: 3,
  assessmentFingerprint: "assessment_fp",
  opportunityVersionId: "oppv_1",
  opportunityVersionNumber: 1,
  opportunityFingerprint: "opp_fp",
  opportunityVersions: [],
  recommendationVersionId: "recv_1",
  recommendationVersionNumber: 1,
  recommendationFingerprint: "rec_fp",
  recommendationVersions: [],
  recommendationDispositions: [],
  roadmapVersionId: "roadv_1",
  roadmapVersionNumber: 1,
  roadmapFingerprint: "road_fp",
  gaps: [],
  followUpTemplates: [],
  ...overrides,
})

const noStaleness = {
  opportunitiesStale: false,
  recommendationsStale: false,
  roadmapStale: false,
  reportStale: false,
  reportVersionSnapshot: null,
  currentSnapshot: null,
}

test("an absent current artifact is not technical staleness", () => {
  // The stage predicates are null-safe, so "nothing generated yet" reaches this
  // function as `false`. Nothing here may invent staleness from a missing id.
  const impact = feedbackTechnicalStaleness(noStaleness)

  assert.deepEqual(impact, {
    opportunities: false,
    recommendations: false,
    roadmap: false,
    report: false,
    reasons: [],
  })
})

test("declaring a stage impacted does not make anything technically stale", () => {
  // A Manager declaring every stage impacted is an input this function never
  // sees: declared impact and technical staleness are separate answers.
  const impact = feedbackTechnicalStaleness(noStaleness)

  assert.equal(impact.reasons.length, 0)
  assert.equal(impact.opportunities, false)
  assert.equal(impact.report, false)
})

test("each stale stage names the artifact that actually changed beneath it", () => {
  assert.deepEqual(
    feedbackTechnicalStaleness({ ...noStaleness, opportunitiesStale: true }).reasons,
    ["assessment_changed"],
  )
  assert.deepEqual(
    feedbackTechnicalStaleness({ ...noStaleness, recommendationsStale: true }).reasons,
    ["opportunity_version_changed"],
  )
  assert.deepEqual(
    feedbackTechnicalStaleness({ ...noStaleness, roadmapStale: true }).reasons,
    ["recommendation_version_changed"],
  )
})

test("a changed Opportunity version never reports the Assessment as changed", () => {
  const impact = feedbackTechnicalStaleness({
    ...noStaleness,
    reportStale: true,
    reportVersionSnapshot: snapshot(),
    currentSnapshot: snapshot({
      opportunityVersionId: "oppv_2",
      opportunityFingerprint: "opp_fp_2",
    }),
  })

  assert.deepEqual(impact.reasons, ["opportunity_version_changed"])
  assert.equal(impact.reasons.includes("assessment_changed"), false)
})

test("a stale Report names each upstream artifact that moved", () => {
  assert.deepEqual(
    feedbackTechnicalStaleness({
      ...noStaleness,
      reportStale: true,
      reportVersionSnapshot: snapshot(),
      currentSnapshot: snapshot({ roadmapVersionId: "roadv_2" }),
    }).reasons,
    ["roadmap_version_changed"],
  )
  assert.deepEqual(
    feedbackTechnicalStaleness({
      ...noStaleness,
      reportStale: true,
      reportVersionSnapshot: snapshot(),
      currentSnapshot: snapshot({ discoveryFingerprint: "discovery_fp_2" }),
    }).reasons,
    ["discovery_changed"],
  )
  assert.deepEqual(
    feedbackTechnicalStaleness({
      ...noStaleness,
      reportStale: true,
      reportVersionSnapshot: snapshot(),
      currentSnapshot: snapshot({
        assessmentRevision: 4,
        recommendationVersionId: "recv_2",
      }),
    }).reasons,
    ["assessment_changed", "recommendation_version_changed"],
  )
})

test("the source report's own state is separate from per-stage staleness", () => {
  // Nothing moved: the client commented on what is still current.
  assert.deepEqual(
    feedbackSourceReportState({
      sourceReportVersionId: "rv_1",
      activeReportVersionId: "rv_1",
      sourceReportSnapshot: snapshot(),
      currentSnapshot: snapshot(),
    }),
    { superseded: false, sourcesChanged: false, reasons: [] },
  )

  // A completed re-entry produced a newer approved ReportVersion. The feedback's
  // source report is superseded — which is not the same fact as its sources
  // having drifted.
  assert.deepEqual(
    feedbackSourceReportState({
      sourceReportVersionId: "rv_1",
      activeReportVersionId: "rv_2",
      sourceReportSnapshot: snapshot(),
      currentSnapshot: snapshot(),
    }),
    {
      superseded: true,
      sourcesChanged: false,
      reasons: ["source_report_superseded"],
    },
  )

  // The report is still the active one, but the engagement moved beneath it.
  assert.deepEqual(
    feedbackSourceReportState({
      sourceReportVersionId: "rv_1",
      activeReportVersionId: "rv_1",
      sourceReportSnapshot: snapshot(),
      currentSnapshot: snapshot({ roadmapVersionId: "roadv_2" }),
    }),
    {
      superseded: false,
      sourcesChanged: true,
      reasons: ["source_report_sources_changed"],
    },
  )
})

test("an engagement with no report yet reports no source-report drift", () => {
  assert.deepEqual(
    feedbackSourceReportState({
      sourceReportVersionId: "rv_1",
      activeReportVersionId: null,
      sourceReportSnapshot: snapshot(),
      currentSnapshot: null,
    }),
    { superseded: false, sourcesChanged: false, reasons: [] },
  )
})
