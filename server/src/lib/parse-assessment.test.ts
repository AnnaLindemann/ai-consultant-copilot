import assert from "node:assert/strict"
import { test } from "node:test"

import { parseAssessment } from "./parse-assessment.js"

const dimension = (summary: string) => ({ summary, findings: [] })

const validAssessment = {
  summary: "Support handles a growing email volume with manual triage.",
  dimensions: {
    businessProcess: {
      summary: "Triage is manual and unevenly distributed.",
      findings: [
        {
          title: "Manual triage delays first response",
          detail:
            "Every incoming email is read and routed by an agent before work starts.",
          basis: "discovery_fact",
          supportingFacts: [
            "Current process: agents read and route each email by hand.",
          ],
          assumptions: [],
          confidence: "high",
        },
        {
          title: "Peak load likely concentrates on Mondays",
          detail: "Volume peaks probably follow the weekend backlog.",
          basis: "assumption",
          supportingFacts: [],
          assumptions: [
            "Weekend requests are only processed on the next working day.",
          ],
          confidence: "low",
        },
      ],
    },
    data: dimension("Ticket exports exist but access is unconfirmed."),
    technology: dimension("Zendesk is the system of record."),
    aiReadiness: dimension("Readiness is partial: data access is unresolved."),
    risks: dimension("Personal data handling needs review."),
    opportunities: dimension("Triage and drafting are candidate areas."),
  },
  gaps: [
    {
      dimension: "data",
      description: "Ticket export access has not been confirmed.",
    },
  ],
}

const serialize = (assessment: unknown) => JSON.stringify(assessment)

test("Assessment parses valid AI output across all dimensions", () => {
  const result = parseAssessment(serialize(validAssessment))

  assert.equal(result.success, true)
  assert.equal(result.jsonParseSuccess, true)
  assert.equal(result.schemaValid, true)
  assert.equal(result.assessment?.dimensions.aiReadiness.summary.length > 0, true)
})

test("Assessment reports unparsable AI output without a schema claim", () => {
  const result = parseAssessment("Here is your assessment: {")

  assert.equal(result.success, false)
  assert.equal(result.jsonParseSuccess, false)
  assert.equal(result.schemaValid, false)
})

test("Assessment rejects output missing a dimension", () => {
  const { aiReadiness, ...remainingDimensions } = validAssessment.dimensions

  const result = parseAssessment(
    serialize({ ...validAssessment, dimensions: remainingDimensions }),
  )

  assert.equal(result.success, false)
  assert.equal(result.jsonParseSuccess, true)
  assert.equal(result.schemaValid, false)
})

test("Assessment rejects a discovery-supported finding that cites no fact", () => {
  const result = parseAssessment(
    serialize({
      ...validAssessment,
      dimensions: {
        ...validAssessment.dimensions,
        data: {
          summary: "Data quality is good.",
          findings: [
            {
              title: "Ticket data is complete",
              detail: "All tickets carry full metadata.",
              basis: "discovery_fact",
              supportingFacts: [],
              assumptions: ["Metadata is captured automatically."],
              confidence: "high",
            },
          ],
        },
      },
    }),
  )

  assert.equal(result.success, false)
  assert.equal(result.schemaValid, false)
})

test("Assessment rejects an assumption-based finding that states no assumption", () => {
  const result = parseAssessment(
    serialize({
      ...validAssessment,
      dimensions: {
        ...validAssessment.dimensions,
        risks: {
          summary: "Adoption risk is moderate.",
          findings: [
            {
              title: "Agents may resist automation",
              detail: "Change resistance could slow adoption.",
              basis: "assumption",
              supportingFacts: ["Agents currently route email by hand."],
              assumptions: [],
              confidence: "low",
            },
          ],
        },
      },
    }),
  )

  assert.equal(result.success, false)
  assert.equal(result.schemaValid, false)
})

test("Assessment rejects an unknown confidence value", () => {
  const result = parseAssessment(
    serialize({
      ...validAssessment,
      dimensions: {
        ...validAssessment.dimensions,
        technology: {
          summary: "Tooling is standard.",
          findings: [
            {
              title: "Zendesk is in use",
              detail: "Support runs on Zendesk.",
              basis: "discovery_fact",
              supportingFacts: ["Current tools: Zendesk."],
              assumptions: [],
              confidence: "certain",
            },
          ],
        },
      },
    }),
  )

  assert.equal(result.success, false)
  assert.equal(result.schemaValid, false)
})

test("Assessment rejects a gap on an unknown dimension", () => {
  const result = parseAssessment(
    serialize({
      ...validAssessment,
      gaps: [{ dimension: "budget", description: "Budget is unknown." }],
    }),
  )

  assert.equal(result.success, false)
  assert.equal(result.schemaValid, false)
})
