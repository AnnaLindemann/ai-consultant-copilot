import assert from "node:assert/strict"
import { test } from "node:test"

import type { ConsultantReport } from "../../../shared/consultant-report.schema.js"
import { parseConsultantReport } from "./parse-consultant-report.js"

// A minimal report that satisfies every required field and enum of the
// ConsultantReport contract. Optional arrays are left empty on purpose so the
// fixture exercises the required structure without extra noise.
const validReport: ConsultantReport = {
  clientSummary: "A hotel struggling with slow email support.",
  detectedProblems: [
    {
      statedProblem: "Support replies are slow.",
      hiddenProblemHypothesis: "No triage of incoming email.",
      confidence: "medium",
    },
  ],
  aiOpportunities: [
    {
      title: "Email triage assistant",
      description: "Classify and draft replies to inbound support email.",
      businessValue: "Faster response times.",
      complexity: "medium",
      impact: "high",
      recommendedApproach: "LLM",
    },
  ],
  recommendedSolution: {
    mainUseCase: "Automated email triage and drafting.",
    approach: "LLM",
    reason: "Volume is high and replies are template-like.",
    suggestedTools: ["Groq"],
    architectureSummary: "Inbound webhook -> classifier -> draft reply.",
  },
  risks: [
    {
      title: "Incorrect auto-replies",
      severity: "medium",
      mitigation: "Human approval before sending.",
    },
  ],
  validationPlan: [
    {
      hypothesis: "Most email falls into a few categories.",
      whatToCheck: ["Category distribution"],
      requiredData: ["30 days of support email"],
      dataSource: ["Help desk export"],
      method: "email-analysis",
      description: "Sample and categorize historic email.",
      successCriteria: "80% of email maps to five categories.",
      priority: "high",
    },
  ],
  followUpQuestions: ["What is the current monthly email volume?"],
  mvpPlan: [
    {
      step: "Build classifier",
      goal: "Route email to the right queue.",
      estimatedEffort: "2 weeks",
    },
  ],
}

test("parseConsultantReport accepts a valid report payload", () => {
  const result = parseConsultantReport(JSON.stringify(validReport))

  assert.equal(result.success, true)
  assert.equal(result.jsonParseSuccess, true)
  assert.equal(result.schemaValid, true)
  assert.ok(result.success && result.report.clientSummary === validReport.clientSummary)
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
    detectedProblems: [
      {
        statedProblem: "Support replies are slow.",
        hiddenProblemHypothesis: "No triage of incoming email.",
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
  const { recommendedSolution: _omitted, ...withoutSolution } = validReport

  const result = parseConsultantReport(JSON.stringify(withoutSolution))

  assert.equal(result.success, false)
  assert.equal(result.jsonParseSuccess, true)
  assert.equal(result.schemaValid, false)
})
