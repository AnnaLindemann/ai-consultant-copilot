import assert from "node:assert/strict"
import { test } from "node:test"

import {
  canReplaceRecommendationVersion,
  canonicalRecommendationContent,
  hasKnowledgeToGroundWith,
  hasOpportunitiesToMatch,
  identifyRecommendations,
  inOpportunityOrder,
  isRecommendationVersionStale,
  resolveRecommendationGrounding,
  type CitableKnowledge,
  type CitableTechnology,
} from "./recommendations.js"

import type { Assessment } from "../../../../shared/assessment.schema.js"
import type {
  Opportunity,
  OpportunityPrioritization,
} from "../../../../shared/opportunity.schema.js"
import type {
  RecommendationSetSubmission,
  RecommendationSubmission,
} from "../../../../shared/recommendation.schema.js"

// The solution-matching stage's rules, tested as pure domain logic — no
// database, no provider, no HTTP (coding-standards.md §9 "test the domain in
// isolation"). What is tested here is the grounding invariant: a recommendation
// is valid only if it is traceable backward to Discovery facts and outward to
// the knowledge that justifies it.

const emptyDimension = (summary: string) => ({ summary, findings: [] })

const assessment: Assessment = {
  summary: "Support triage is manual.",
  dimensions: {
    businessProcess: {
      summary: "Triage is manual.",
      findings: [
        {
          id: "f_triage",
          title: "Manual triage delays first response",
          detail: "Agents route every email by hand.",
          basis: "discovery_fact",
          supportingFacts: [
            "Agents sort every incoming email by hand.",
            "First response times are inconsistent.",
          ],
          assumptions: [],
          confidence: "medium",
        },
      ],
    },
    data: emptyDimension("Ticket data was not described."),
    technology: emptyDimension("No tooling was recorded."),
    aiReadiness: emptyDimension("Readiness cannot yet be judged."),
    risks: emptyDimension("No risks are evidenced yet."),
    opportunities: emptyDimension("Triage is a candidate area."),
  },
  gaps: [],
}

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
    validationNote: "Agree a target once the baseline is known.",
  },
  timeframe: {
    status: "unknown" as const,
    validationNote: "Agree a review date with the client.",
  },
  assumptions: [],
})

const opportunity = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  id: "opportunity_triage",
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
  successCriteria: [successCriterion()],
  value: "high",
  effort: "medium",
  impact: "high",
  confidence: "medium",
  aiReadiness: {
    qualification: "conditional",
    rationale: "Depends on ticket data being reachable.",
    blockers: ["Ticket data is scattered."],
  },
  assumptions: [],
  priorityRank: 1,
  priorityRationale: "Highest value against moderate effort.",
  ...overrides,
})

const prioritization = (
  opportunities: Opportunity[] = [opportunity()],
): OpportunityPrioritization => ({
  summary: "Triage is where effort is best spent.",
  opportunities,
  gaps: [],
})

const knowledge: CitableKnowledge = new Map([
  [
    "intelligent-ticket-triage",
    { kind: "ai_use_case" as const, title: "Intelligente Ticket-Triage" },
  ],
  [
    "status-and-triage-assistance",
    { kind: "solution_pattern" as const, title: "Status- und Triage-Unterstützung" },
  ],
  [
    "trust-risk",
    { kind: "risk_model" as const, title: "Vertrauensrisiko" },
  ],
])

const technology: CitableTechnology = new Map([
  ["anthropic-claude", { categoryCode: "ai-models", title: "Anthropic Claude" }],
])

const recommendation = (
  overrides: Partial<RecommendationSubmission> = {},
): RecommendationSubmission => ({
  title: "Intent-based triage with human approval",
  opportunityId: "opportunity_triage",
  approach: "Classify incoming requests by intent and route them before triage.",
  rationale: "The curated triage pattern fits an inbox sorted entirely by hand.",
  expectedValue: {
    summary: "Agents spend their first minutes answering rather than sorting.",
    drivers: ["Fewer manual routing decisions per request"],
  },
  effort: {
    level: "medium",
    rationale: "The approach reuses existing support workflows but needs integration.",
  },
  knowledgeGrounding: [
    {
      code: "intelligent-ticket-triage",
      rationale: "The use case describes exactly this inbox.",
    },
  ],
  technologyGrounding: [],
  assumptions: [],
  confidence: "medium",
  ...overrides,
})

const submission = (
  recommendations: RecommendationSubmission[] = [recommendation()],
): RecommendationSetSubmission => ({
  summary: "One grounded proposal.",
  recommendations,
  gaps: [],
})

const resolve = (
  set: RecommendationSetSubmission,
  sources: Partial<Parameters<typeof resolveRecommendationGrounding>[1]> = {},
) =>
  resolveRecommendationGrounding(set, {
    opportunities: prioritization(),
    assessment,
    knowledge,
    technology,
    ...sources,
  })

const mintingIds = () => {
  let minted = 0
  return () => `minted_${(minted += 1)}`
}

// --- Readiness --------------------------------------------------------------

test("an engagement with no prioritized Opportunities has nothing to match", () => {
  assert.equal(hasOpportunitiesToMatch(null), false)
  assert.equal(hasOpportunitiesToMatch(prioritization([])), false)
  assert.equal(hasOpportunitiesToMatch(prioritization()), true)
})

test("an engagement with no retrieved knowledge has nothing to ground with", () => {
  assert.equal(hasKnowledgeToGroundWith([]), false)
  assert.equal(hasKnowledgeToGroundWith(["intelligent-ticket-triage"]), true)
})

test("re-running over consultant-reviewed work needs explicit replacement", () => {
  assert.equal(canReplaceRecommendationVersion(null, false), true)
  assert.equal(canReplaceRecommendationVersion("ai_draft", false), true)
  assert.equal(canReplaceRecommendationVersion("consultant_edited", false), false)
  assert.equal(canReplaceRecommendationVersion("accepted", false), false)
  assert.equal(canReplaceRecommendationVersion("accepted", true), true)
})

// --- Grounding: outward, into the knowledge bases ---------------------------

test("a citation is resolved into the kind and title snapshot the version stores", () => {
  const resolution = resolve(submission())

  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  assert.deepEqual(resolution.recommendationSet.recommendations[0].knowledgeGrounding, [
    {
      code: "intelligent-ticket-triage",
      kind: "ai_use_case",
      title: "Intelligente Ticket-Triage",
      rationale: "The use case describes exactly this inbox.",
    },
  ])
})

test("the snapshot is read from the knowledge base, not from the caller", () => {
  // A caller cannot smuggle in a title or a kind the knowledge base never
  // carried: only the code is theirs to supply.
  const resolution = resolve(
    submission([
      recommendation({
        knowledgeGrounding: [
          {
            code: "intelligent-ticket-triage",
            rationale: "Grounded here.",
            // A caller-supplied title is simply not part of the contract, so
            // there is nothing to strip — the resolved snapshot always comes
            // from the citable set.
          },
        ],
      }),
    ]),
  )

  assert.equal(
    resolution.resolved &&
      resolution.recommendationSet.recommendations[0].knowledgeGrounding[0].title,
    "Intelligente Ticket-Triage",
  )
})

test("a curated code that was not citable is refused, and named", () => {
  const resolution = resolve(
    submission([
      recommendation({
        knowledgeGrounding: [
          { code: "invented-use-case", rationale: "Sounds plausible." },
        ],
      }),
    ]),
  )

  assert.equal(resolution.resolved, false)
  assert.deepEqual(
    resolution.resolved === false ? resolution.unknownKnowledgeCodes : [],
    ["invented-use-case"],
  )
})

test("a technology that was not citable is refused, and named", () => {
  const resolution = resolve(
    submission([
      recommendation({
        technologyGrounding: [
          { code: "some-model-9", fitRationale: "It would be a good fit." },
        ],
      }),
    ]),
  )

  assert.equal(resolution.resolved, false)
  assert.deepEqual(
    resolution.resolved === false ? resolution.unknownTechnologyCodes : [],
    ["some-model-9"],
  )
})

test("a named technology carries its Technology Profile snapshot", () => {
  const resolution = resolve(
    submission([
      recommendation({
        technologyGrounding: [
          {
            code: "anthropic-claude",
            fitRationale: "Follows structured output formats for routing.",
          },
        ],
      }),
    ]),
  )

  assert.equal(resolution.resolved, true)
  assert.deepEqual(
    resolution.resolved
      ? resolution.recommendationSet.recommendations[0].technologyGrounding
      : [],
    [
      {
        code: "anthropic-claude",
        categoryCode: "ai-models",
        title: "Anthropic Claude",
        fitRationale: "Follows structured output formats for routing.",
      },
    ],
  )
})

test("naming no technology at all is valid — a recommendation need not name one", () => {
  const resolution = resolve(submission([recommendation({ technologyGrounding: [] })]))

  assert.equal(resolution.resolved, true)
})

test("grounding only in knowledge that does not justify an approach is refused", () => {
  // A risk model qualifies a proposal; it does not justify one. The
  // documentation is specific that an approach is grounded in an AI Use Case or
  // its Solution Pattern (agent-rules.md §3, §7).
  const resolution = resolve(
    submission([
      recommendation({
        title: "Ungrounded proposal",
        knowledgeGrounding: [
          { code: "trust-risk", rationale: "There is a trust risk." },
        ],
      }),
    ]),
  )

  assert.equal(resolution.resolved, false)
  assert.deepEqual(
    resolution.resolved === false
      ? resolution.ungroundedRecommendationTitles
      : [],
    ["Ungrounded proposal"],
  )
})

test("a Solution Pattern alone justifies an approach", () => {
  const resolution = resolve(
    submission([
      recommendation({
        knowledgeGrounding: [
          {
            code: "status-and-triage-assistance",
            rationale: "The pattern describes the shape of the solution.",
          },
          { code: "trust-risk", rationale: "And this is what to watch for." },
        ],
      }),
    ]),
  )

  assert.equal(resolution.resolved, true)
})

// --- Grounding: backward, to the Discovery Profile facts --------------------

test("a recommendation carries the Opportunity it addresses, by identity", () => {
  const resolution = resolve(submission())

  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  const { opportunity: citation } =
    resolution.recommendationSet.recommendations[0]
  assert.equal(citation.opportunityId, "opportunity_triage")
  assert.equal(citation.opportunityTitle, "Automate first-line triage")
  assert.equal(citation.priorityRank, 1)
})

test("the citation carries the discovery facts behind the Opportunity", () => {
  // This is the backward trace the roadmap requires: recommendation →
  // Opportunity → Assessment finding → discovery facts, resolved by the server
  // so the stored version *shows* it rather than leaving it to be reconstructed.
  const resolution = resolve(submission())

  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  assert.deepEqual(
    resolution.recommendationSet.recommendations[0].opportunity.discoveryTrace,
    [
      {
        findingId: "f_triage",
        dimension: "businessProcess",
        findingTitle: "Manual triage delays first response",
        supportingFacts: [
          "Agents sort every incoming email by hand.",
          "First response times are inconsistent.",
        ],
      },
    ],
  )
})

test("a finding the Assessment no longer holds traces to an honest empty, not an invention", () => {
  const resolution = resolve(submission(), { assessment: null })

  assert.equal(resolution.resolved, true)
  assert.deepEqual(
    resolution.resolved
      ? resolution.recommendationSet.recommendations[0].opportunity
          .discoveryTrace[0].supportingFacts
      : undefined,
    [],
  )
})

test("an Opportunity the prioritization does not contain is refused, and named", () => {
  const resolution = resolve(
    submission([recommendation({ opportunityId: "opportunity_invented" })]),
  )

  assert.equal(resolution.resolved, false)
  assert.deepEqual(
    resolution.resolved === false ? resolution.unknownOpportunityIds : [],
    ["opportunity_invented"],
  )
})

test("re-wording an Opportunity's title does not break what cites it", () => {
  const resolution = resolve(submission(), {
    opportunities: prioritization([
      opportunity({ title: "Sort the inbox before an agent sees it" }),
    ]),
  })

  assert.equal(
    resolution.resolved &&
      resolution.recommendationSet.recommendations[0].opportunity
        .opportunityTitle,
    "Sort the inbox before an agent sees it",
  )
})

// --- Identity and ordering --------------------------------------------------

test("a recommendation the AI wrote is given an identity on the server", () => {
  const resolution = resolve(submission())
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  assert.deepEqual(
    identifyRecommendations(
      resolution.recommendationSet,
      mintingIds(),
    ).recommendations.map((one) => one.id),
    ["minted_1"],
  )
})

test("a recommendation the consultant kept keeps the identity it already had", () => {
  const resolution = resolve(
    submission([recommendation({ id: "recommendation_from_an_earlier_save" })]),
  )
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  assert.deepEqual(
    identifyRecommendations(
      resolution.recommendationSet,
      mintingIds(),
    ).recommendations.map((one) => one.id),
    ["recommendation_from_an_earlier_save"],
  )
})

test("the set is read in the order the consultant prioritized the Opportunities", () => {
  const second = opportunity({
    id: "opportunity_data",
    title: "Consolidate ticket data",
    priorityRank: 2,
  })

  const resolution = resolve(
    submission([
      recommendation({
        title: "For the second opportunity",
        opportunityId: "opportunity_data",
      }),
      recommendation({ title: "For the first opportunity" }),
    ]),
    { opportunities: prioritization([opportunity(), second]) },
  )
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  const ordered = inOpportunityOrder(
    identifyRecommendations(resolution.recommendationSet, mintingIds()),
  )

  assert.deepEqual(
    ordered.recommendations.map((one) => one.title),
    ["For the first opportunity", "For the second opportunity"],
  )
})

test("ordering copies rather than mutates what it was given", () => {
  const resolution = resolve(
    submission([
      recommendation({
        title: "Second",
        opportunityId: "opportunity_data",
      }),
      recommendation({ title: "First" }),
    ]),
    {
      opportunities: prioritization([
        opportunity(),
        opportunity({
          id: "opportunity_data",
          title: "Consolidate ticket data",
          priorityRank: 2,
        }),
      ]),
    },
  )
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  const identified = identifyRecommendations(
    resolution.recommendationSet,
    mintingIds(),
  )
  inOpportunityOrder(identified)

  assert.deepEqual(
    identified.recommendations.map((one) => one.title),
    ["Second", "First"],
  )
})

// --- Staleness --------------------------------------------------------------

test("a version is stale exactly when the Opportunities' content has changed", () => {
  assert.equal(isRecommendationVersionStale("abc", "abc"), false)
  assert.equal(isRecommendationVersionStale("abc", "def"), true)
  // Nothing to compare against is not staleness: an engagement with no version,
  // or none prioritized, is a working state rather than a warning.
  assert.equal(isRecommendationVersionStale(null, "abc"), false)
  assert.equal(isRecommendationVersionStale("abc", null), false)
})

test("the canonical content is stable across key order and changes with content", () => {
  const resolution = resolve(submission())
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  const set = identifyRecommendations(
    resolution.recommendationSet,
    mintingIds(),
  )
  const sameContentBuiltDifferently = {
    gaps: set.gaps,
    recommendations: set.recommendations,
    summary: set.summary,
  }

  assert.equal(
    canonicalRecommendationContent(set),
    canonicalRecommendationContent(sameContentBuiltDifferently),
  )
  assert.notEqual(
    canonicalRecommendationContent(set),
    canonicalRecommendationContent({ ...set, summary: "Reconsidered." }),
  )
})
