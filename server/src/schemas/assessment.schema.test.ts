import assert from "node:assert/strict"
import { test } from "node:test"

import {
  generateAssessmentSchema,
  saveAssessmentSchema,
} from "./assessment.schema.js"

const dimension = (summary: string) => ({ summary, findings: [] })

const reviewedAssessment = {
  summary: "Support triage is manual and slow.",
  dimensions: {
    businessProcess: {
      summary: "Triage is manual.",
      findings: [
        {
          title: "Manual triage delays first response",
          detail: "Agents route every email by hand.",
          basis: "discovery_fact",
          supportingFacts: ["Current process: agents route each email."],
          assumptions: [],
          confidence: "high",
        },
      ],
    },
    data: dimension("Ticket exports exist."),
    technology: dimension("Zendesk is the system of record."),
    aiReadiness: dimension("Readiness is partial."),
    risks: dimension("Personal data needs review."),
    opportunities: dimension("Triage is a candidate area."),
  },
  gaps: [{ dimension: "data", description: "Export access unconfirmed." }],
}

test("saving an Assessment defaults to the consultant's authorship", () => {
  const result = saveAssessmentSchema.safeParse({
    assessment: reviewedAssessment,
  })

  assert.equal(result.success, true)
  assert.equal(result.data?.reviewState, undefined)
})

test("an Assessment can be accepted by the consultant", () => {
  const result = saveAssessmentSchema.safeParse({
    assessment: reviewedAssessment,
    reviewState: "accepted",
  })

  assert.equal(result.success, true)
})

test("a consultant save cannot be marked as an unreviewed AI draft", () => {
  const result = saveAssessmentSchema.safeParse({
    assessment: reviewedAssessment,
    reviewState: "ai_draft",
  })

  assert.equal(result.success, false)
})

test("an invalid Assessment is rejected at the boundary", () => {
  const result = saveAssessmentSchema.safeParse({
    assessment: { ...reviewedAssessment, summary: "   " },
  })

  assert.equal(result.success, false)
})

test("generating an Assessment needs no body, and edits are protected by default", () => {
  const result = generateAssessmentSchema.safeParse({})

  assert.equal(result.success, true)
  assert.equal(result.data?.replaceConsultantEdits, undefined)
})

test("regenerating over consultant edits is an explicit boolean intent", () => {
  assert.equal(
    generateAssessmentSchema.safeParse({ replaceConsultantEdits: true }).success,
    true,
  )
  assert.equal(
    generateAssessmentSchema.safeParse({ replaceConsultantEdits: "yes" })
      .success,
    false,
  )
})
