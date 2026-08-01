import assert from "node:assert/strict"
import { test } from "node:test"

import type { Assessment } from "../../../../shared/assessment.schema.js"
import type { OpportunitySubmission } from "../../../../shared/opportunity.schema.js"
import {
  canonicalOpportunityContent,
  hasAssessmentToPrioritize,
  identifyOpportunities,
  inPriorityOrder,
  isOpportunityVersionStale,
  nextVersionNumber,
  opportunitiesById,
  resolveCitations,
} from "./opportunities.js"
import { canonicalAssessmentContent, identifyAssessmentFindings } from "./assessment.js"

// The prioritization stage's rules, tested as pure domain logic — no database,
// no provider, no HTTP (coding-standards.md §9 "test the domain in isolation").

const emptyDimension = (summary: string) => ({ summary, findings: [] })

const assessment = (
  overrides: Partial<Assessment["dimensions"]> = {},
): Assessment => ({
  summary: "Support triage is manual.",
  dimensions: {
    businessProcess: emptyDimension("Triage is manual."),
    data: emptyDimension("Ticket data was not described."),
    technology: emptyDimension("No tooling was recorded."),
    aiReadiness: emptyDimension("Readiness cannot yet be judged."),
    risks: emptyDimension("No risks are evidenced yet."),
    opportunities: emptyDimension("Nothing stands out yet."),
    ...overrides,
  },
  gaps: [],
})

const finding = (id: string, title: string) => ({
  id,
  title,
  detail: "Agents route every email by hand.",
  basis: "discovery_fact" as const,
  supportingFacts: ["First response times are inconsistent."],
  assumptions: [],
  confidence: "medium" as const,
})

const assessedTriage = () =>
  assessment({
    businessProcess: {
      summary: "Triage is manual.",
      findings: [finding("f_triage", "Manual triage delays first response")],
    },
  })

const successCriterion = () => ({
  metric: "Median first response time",
  measurementMethod: "Read from the helpdesk's response-time report.",
  dataSource: "Helpdesk reporting",
  baseline: {
    status: "unknown" as const,
    validationNote: "Ask the client for last quarter's median.",
  },
  target: {
    status: "unknown" as const,
    validationNote: "Agree a target with the client once the baseline is known.",
  },
  timeframe: {
    status: "unknown" as const,
    validationNote: "Agree a review date with the client.",
  },
  assumptions: [],
})

const opportunity = (
  overrides: Partial<OpportunitySubmission> = {},
): OpportunitySubmission => ({
  title: "Automate first-line triage",
  problem: "Manual triage delays first response.",
  improvement: "Route incoming requests by intent before an agent sees them.",
  sourceFindingIds: ["f_triage"],
  successCriteria: [successCriterion()],
  value: "high",
  effort: "medium",
  impact: "high",
  confidence: "medium",
  aiReadiness: {
    qualification: "conditional",
    rationale: "Readiness depends on ticket data being reachable.",
    blockers: ["Ticket volumes are unknown."],
  },
  assumptions: [],
  priorityRank: 1,
  priorityRationale: "Highest value against moderate effort.",
  ...overrides,
})

const submission = (opportunities: OpportunitySubmission[]) => ({
  summary: "One candidate.",
  opportunities,
  gaps: [],
})

// A deterministic minting source, so identity is testable without a random one
// (coding-standards.md §9 "determinism in tests").
const mintingIds = () => {
  let minted = 0
  return () => `minted_${(minted += 1)}`
}

// The two server steps a stored prioritization goes through, as the service
// applies them: citations resolved, then identity given.
const identified = (opportunities: OpportunitySubmission[]) => {
  const resolution = resolveCitations(
    submission(opportunities),
    assessedTriage(),
  )
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) throw new Error("the fixture failed to resolve")

  return identifyOpportunities(resolution.prioritization, mintingIds())
}

test("an Assessment with no findings cannot be prioritized", () => {
  assert.equal(hasAssessmentToPrioritize(null), false)
  assert.equal(hasAssessmentToPrioritize(assessment()), false)
})

test("a single finding in any dimension is enough to prioritize", () => {
  const withRisk = assessment({
    risks: {
      summary: "One risk stands out.",
      findings: [finding("f_risk", "Key-person risk")],
    },
  })

  assert.equal(hasAssessmentToPrioritize(withRisk), true)
})

test("a cited finding id is resolved into a citation carrying its snapshot", () => {
  const resolution = resolveCitations(
    submission([opportunity()]),
    assessedTriage(),
  )

  assert.equal(resolution.resolved, true)
  assert.deepEqual(
    resolution.resolved && resolution.prioritization.opportunities[0].sourceFindings,
    [
      {
        findingId: "f_triage",
        dimension: "businessProcess",
        findingTitle: "Manual triage delays first response",
      },
    ],
  )
})

test("a finding id the Assessment does not contain is refused, and named", () => {
  const invented = opportunity({ sourceFindingIds: ["f_invented"] })

  const resolution = resolveCitations(submission([invented]), assessedTriage())

  assert.equal(resolution.resolved, false)
  assert.deepEqual(
    resolution.resolved === false ? resolution.unknownFindingIds : [],
    ["f_invented"],
  )
})

test("re-wording a finding's title does not break what cites it", () => {
  // Identity is the point of the id: the citation survives the edit, and the
  // snapshot it carries is refreshed from the Assessment as it now reads.
  const reworded = assessment({
    businessProcess: {
      summary: "Triage is manual.",
      findings: [
        finding("f_triage", "First response is delayed by hand-sorting"),
      ],
    },
  })

  const resolution = resolveCitations(submission([opportunity()]), reworded)

  assert.equal(resolution.resolved, true)
  assert.deepEqual(
    resolution.resolved && resolution.prioritization.opportunities[0].sourceFindings,
    [
      {
        findingId: "f_triage",
        dimension: "businessProcess",
        findingTitle: "First response is delayed by hand-sorting",
      },
    ],
  )
})

test("the snapshot on a citation is read from the Assessment, not from the caller", () => {
  // A caller cannot smuggle in a title the Assessment never carried: only the
  // id is theirs to supply.
  const resolution = resolveCitations(submission([opportunity()]), assessedTriage())

  assert.equal(
    resolution.resolved &&
      resolution.prioritization.opportunities[0].sourceFindings[0].findingTitle,
    "Manual triage delays first response",
  )
})

test("the prioritization is ordered by rank, whatever order it arrived in", () => {
  const prioritization = identified([
    opportunity({ title: "Second", priorityRank: 2 }),
    opportunity({ title: "First", priorityRank: 1 }),
  ])

  assert.deepEqual(
    inPriorityOrder(prioritization).opportunities.map((one) => one.title),
    ["First", "Second"],
  )
})

test("ordering copies rather than mutates what it was given", () => {
  const prioritization = identified([
    opportunity({ title: "Second", priorityRank: 2 }),
    opportunity({ title: "First", priorityRank: 1 }),
  ])

  inPriorityOrder(prioritization)

  assert.deepEqual(
    prioritization.opportunities.map((one) => one.title),
    ["Second", "First"],
  )
})

// --- Identity ---------------------------------------------------------------

test("an opportunity the AI wrote is given an identity on the server", () => {
  const prioritization = identified([opportunity()])

  assert.deepEqual(
    prioritization.opportunities.map((one) => one.id),
    ["minted_1"],
  )
})

test("an opportunity the consultant kept keeps the identity it already had", () => {
  const resolution = resolveCitations(
    submission([opportunity({ id: "opportunity_from_an_earlier_save" })]),
    assessedTriage(),
  )
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  assert.deepEqual(
    identifyOpportunities(
      resolution.prioritization,
      mintingIds(),
    ).opportunities.map((one) => one.id),
    ["opportunity_from_an_earlier_save"],
  )
})

test("identity does not depend on a title or a rank, so both may change freely", () => {
  const resolution = resolveCitations(
    submission([
      opportunity({ id: "opportunity_1", title: "Re-worded", priorityRank: 2 }),
      opportunity({ id: "opportunity_2", title: "Promoted", priorityRank: 1 }),
    ]),
    assessedTriage(),
  )
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  const reordered = inPriorityOrder(
    identifyOpportunities(resolution.prioritization, mintingIds()),
  )

  // A Recommendation citing "opportunity_1" still finds it after the re-wording
  // and the re-ordering that moved it to second place.
  assert.equal(
    opportunitiesById(reordered).get("opportunity_1")?.title,
    "Re-worded",
  )
  assert.deepEqual(
    reordered.opportunities.map((one) => one.id),
    ["opportunity_2", "opportunity_1"],
  )
})

test("the canonical content is stable across key order and changes with content", () => {
  const one = identified([opportunity({ id: "opportunity_1" })])
  const other = identified([
    { ...opportunity({ id: "opportunity_1" }), title: "Automate first-line triage" },
  ])

  assert.equal(
    canonicalOpportunityContent(one),
    canonicalOpportunityContent(other),
  )
  assert.notEqual(
    canonicalOpportunityContent(one),
    canonicalOpportunityContent(
      identified([opportunity({ id: "opportunity_1", title: "Something else" })]),
    ),
  )
})

test("a version is stale exactly when the Assessment's content has changed", () => {
  const before = fingerprintOf(assessedTriage())

  const edited = assessment({
    businessProcess: {
      summary: "Triage is manual.",
      findings: [
        finding("f_triage", "Manual triage delays first response"),
        finding("f_second", "Escalations are missed"),
      ],
    },
  })

  assert.equal(isOpportunityVersionStale(before, before), false)
  assert.equal(isOpportunityVersionStale(before, fingerprintOf(edited)), true)
})

test("the fingerprint ignores the order the Assessment object was built in", () => {
  const one = assessedTriage()
  const other: Assessment = {
    gaps: one.gaps,
    dimensions: one.dimensions,
    summary: one.summary,
  }

  assert.equal(fingerprintOf(one), fingerprintOf(other))
})

test("versions are numbered from one and never reused", () => {
  assert.equal(nextVersionNumber(null), 1)
  assert.equal(nextVersionNumber(1), 2)
  // Numbering follows the highest that ever existed, so a number is never
  // handed out twice even after the earlier versions have been superseded.
  assert.equal(nextVersionNumber(7), 8)
})

test("identity is minted only for findings that do not already carry one", () => {
  let minted = 0
  const identified = identifyAssessmentFindings(
    {
      ...assessment(),
      dimensions: {
        ...assessment().dimensions,
        businessProcess: {
          summary: "Triage is manual.",
          findings: [
            finding("f_kept", "Manual triage delays first response"),
            { ...finding("", "Escalations are missed"), id: undefined },
          ],
        },
      },
    },
    () => `f_minted_${(minted += 1)}`,
  )

  assert.deepEqual(
    identified.dimensions.businessProcess.findings.map((one) => one.id),
    ["f_kept", "f_minted_1"],
  )
})

// The fingerprint the service records is a hash of this canonical form; the
// domain rule under test is that the canonical form reflects content and
// nothing else.
const fingerprintOf = (one: Assessment) => canonicalAssessmentContent(one)
