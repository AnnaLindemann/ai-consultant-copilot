import assert from "node:assert/strict"
import { test } from "node:test"

import type { GeneratedConsultantReportDraft } from "../../../shared/consultant-report.schema.js"
import { parseConsultantReport } from "./parse-consultant-report.js"

// A minimal report that satisfies every required field and enum of the
// ConsultantReport contract. Optional arrays are left empty on purpose so the
// fixture exercises the required structure without extra noise.
const validReport: GeneratedConsultantReportDraft = {
  title: "Consultant Report",
  executiveSummary: "A hotel struggling with slow email support.",
  engagementContext: {
    organizationName: "Hotel Example",
    engagementTitle: "Support automation",
    department: "Operations",
    statedProblem: "Support replies are slow.",
    desiredOutcome: "Faster replies with consistent quality.",
    businessImpact: "Guest satisfaction is falling.",
  },
  assessmentSummary: "The operation is ready for assisted triage.",
  prioritizedProblems: [
    {
      opportunityId: "opp_1",
      title: "Slow response handling",
      problem: "No triage of incoming email.",
      priorityRank: 1,
      rationale: "It blocks response-time improvement.",
    },
  ],
  recommendations: [
    {
      recommendationId: "rec_1",
      title: "Email triage assistant",
      approach: "Classify and draft replies to inbound support email.",
      rationale: "Volume is high and replies are template-like.",
      expectedValue: "Faster response times.",
      effort: { level: "medium", rationale: "Requires helpdesk integration." },
      confidence: "medium",
    },
  ],
  deferredRecommendations: [],
  roadmapSummary: "Start with a triage pilot, then add reply drafting.",
  roadmapPhases: [
    {
      phaseId: "phase_1",
      sequenceOrder: 1,
      title: "Pilot",
      objective: "Validate routing categories.",
      expectedOutcome: "Measured triage quality.",
    },
  ],
  assumptions: ["Email exports are available."],
  risks: ["Incorrect auto-replies."],
  nextSteps: ["Confirm pilot owner."],
  followUpQuestions: [
    {
      question: "What is the current monthly email volume?",
      sourceType: "discovery_gap",
      sourceDescription: "Confirm monthly email volume",
      templateCode: null,
      rationale: "Sizing depends on volume.",
      status: "draft",
    },
  ],
}

test("parseConsultantReport accepts a valid report payload", () => {
  const result = parseConsultantReport(JSON.stringify(validReport))

  assert.equal(result.success, true)
  assert.equal(result.jsonParseSuccess, true)
  assert.equal(result.schemaValid, true)
  assert.ok(
    result.success &&
      result.report.executiveSummary === validReport.executiveSummary,
  )
})

test("parseConsultantReport reports a JSON parse failure for non-JSON", () => {
  const result = parseConsultantReport("this is not json { ")

  assert.equal(result.success, false)
  assert.equal(result.jsonParseSuccess, false)
  assert.equal(result.schemaValid, false)
  assert.ok(!result.success && typeof result.error === "string")
})

test("parseConsultantReport rejects valid JSON that violates the schema", () => {
  // Well-formed JSON, but `confidence` is not one of the allowed enum values.
  const invalid = {
    ...validReport,
    recommendations: [
      {
        ...validReport.recommendations[0],
        confidence: "extremely-high",
      },
    ],
  }

  const result = parseConsultantReport(JSON.stringify(invalid))

  assert.equal(result.success, false)
  assert.equal(result.jsonParseSuccess, true)
  assert.equal(result.schemaValid, false)
})

test("parseConsultantReport rejects a report missing a required section", () => {
  const { recommendations: _omitted, ...withoutSolution } = validReport

  const result = parseConsultantReport(JSON.stringify(withoutSolution))

  assert.equal(result.success, false)
  assert.equal(result.jsonParseSuccess, true)
  assert.equal(result.schemaValid, false)
})
