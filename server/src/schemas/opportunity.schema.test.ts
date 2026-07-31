import assert from "node:assert/strict"
import { test } from "node:test"

import {
  opportunityPrioritizationSchema,
  opportunitySchema,
} from "../../../shared/opportunity.schema.js"

// The Opportunity contract — what makes a prioritization valid at all. These are
// the trust rules of the stage: an opportunity is traceable to the Assessment,
// an AI-readiness qualification short of "ready" names what stands in the way,
// uncertainty is explained, and the ranking is a real ordering.

const opportunity = (overrides: Record<string, unknown> = {}) => ({
  title: "Automate first-line triage",
  problem: "Manual triage delays first response.",
  improvement: "Route incoming requests by intent before an agent sees them.",
  sourceFindings: [
    {
      findingId: "f_triage",
      dimension: "businessProcess",
      findingTitle: "Manual triage delays first response",
    },
  ],
  successCriteria: [
    {
      metric: "Median first response time",
      measurementMethod: "Read from the helpdesk's response-time report.",
      dataSource: "Helpdesk reporting",
      baseline: {
        status: "unknown",
        validationNote: "Ask the client for last quarter's median.",
      },
      target: {
        status: "unknown",
        validationNote: "Agree a target once the baseline is known.",
      },
      timeframe: {
        status: "unknown",
        validationNote: "Agree a review date with the client.",
      },
      assumptions: [],
    },
  ],
  value: "high",
  effort: "medium",
  impact: "high",
  confidence: "medium",
  aiReadiness: {
    qualification: "ready",
    rationale: "The AI Readiness dimension records no obstacle.",
    blockers: [],
  },
  assumptions: [],
  priorityRank: 1,
  priorityRationale: "Highest value against moderate effort.",
  ...overrides,
})

const prioritization = (opportunities: unknown[]) => ({
  summary: "One candidate stands out.",
  opportunities,
  gaps: [],
})

test("a complete Opportunity is accepted", () => {
  const result = opportunitySchema.safeParse(opportunity())

  assert.equal(result.success, true)
})

test("an Opportunity must cite at least one assessment finding", () => {
  const result = opportunitySchema.safeParse(opportunity({ sourceFindings: [] }))

  assert.equal(result.success, false)
})

test("an Opportunity that is not AI-ready must name a blocker", () => {
  const result = opportunitySchema.safeParse(
    opportunity({
      aiReadiness: {
        qualification: "not_ready",
        rationale: "The client has no reachable ticket data.",
        blockers: [],
      },
    }),
  )

  assert.equal(result.success, false)
})

test("a conditional qualification with its condition named is accepted", () => {
  const result = opportunitySchema.safeParse(
    opportunity({
      aiReadiness: {
        qualification: "conditional",
        rationale: "Depends on ticket data being reachable.",
        blockers: ["Ticket volumes are unknown."],
      },
    }),
  )

  assert.equal(result.success, true)
})

test("a low-confidence Opportunity must state what it rests on", () => {
  const withoutAssumptions = opportunitySchema.safeParse(
    opportunity({ confidence: "low", assumptions: [] }),
  )
  const withAssumptions = opportunitySchema.safeParse(
    opportunity({
      confidence: "low",
      assumptions: ["Volumes are assumed to be comparable across channels."],
    }),
  )

  assert.equal(withoutAssumptions.success, false)
  assert.equal(withAssumptions.success, true)
})

test("an Opportunity rank must be a positive whole number", () => {
  assert.equal(opportunitySchema.safeParse(opportunity({ priorityRank: 0 })).success, false)
  assert.equal(opportunitySchema.safeParse(opportunity({ priorityRank: 1.5 })).success, false)
})

test("a prioritization with duplicate ranks is not a prioritization", () => {
  const result = opportunityPrioritizationSchema.safeParse(
    prioritization([
      opportunity({ priorityRank: 1 }),
      opportunity({ title: "Second", priorityRank: 1 }),
    ]),
  )

  assert.equal(result.success, false)
})

test("a prioritization with a hole in its ordering is refused", () => {
  const result = opportunityPrioritizationSchema.safeParse(
    prioritization([
      opportunity({ priorityRank: 1 }),
      opportunity({ title: "Third", priorityRank: 3 }),
    ]),
  )

  assert.equal(result.success, false)
})

test("a contiguous ranking is accepted in any array order", () => {
  const result = opportunityPrioritizationSchema.safeParse(
    prioritization([
      opportunity({ title: "Second", priorityRank: 2 }),
      opportunity({ priorityRank: 1 }),
    ]),
  )

  assert.equal(result.success, true)
})

test("an Assessment that supports no opportunity yields an empty, valid set", () => {
  // An empty answer is a legitimate outcome; an invented one is not
  // (agent-rules.md §5, §12).
  const result = opportunityPrioritizationSchema.safeParse({
    summary: "The Assessment records no problem specific enough to prioritize.",
    opportunities: [],
    gaps: ["Ticket volumes are unknown."],
  })

  assert.equal(result.success, true)
})

test("a prioritization needs a summary", () => {
  const result = opportunityPrioritizationSchema.safeParse({
    summary: "   ",
    opportunities: [],
    gaps: [],
  })

  assert.equal(result.success, false)
})
