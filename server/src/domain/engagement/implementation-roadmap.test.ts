import assert from "node:assert/strict"
import { test } from "node:test"

import {
  canReplaceRoadmapVersion,
  canEditRoadmapVersionInPlace,
  canonicalRoadmapContent,
  canonicalRoadmapSourceContent,
  identifyRoadmapPhases,
  inRoadmapOrder,
  isRoadmapVersionStale,
  resolveGeneratedRoadmap,
  resolveRoadmap,
  type CitableImplementationPattern,
} from "./implementation-roadmap.js"

import type {
  GeneratedRoadmapDraft,
  RoadmapSubmission,
  RoadmapPhaseSubmission,
} from "../../../../shared/implementation-roadmap.schema.js"
import type { RecommendationSet } from "../../../../shared/recommendation.schema.js"

const recommendations: RecommendationSet = {
  summary: "Accepted recommendations.",
  gaps: [],
  recommendations: [
    {
      id: "rec_triage",
      title: "Automate triage",
      approach: "Classify and route incoming support requests.",
      rationale: "The support team sorts requests manually.",
      expectedValue: {
        summary: "Agents spend more time answering.",
        drivers: ["Less manual routing"],
      },
      effort: {
        level: "medium",
        rationale: "Integration with the helpdesk is required.",
      },
      assumptions: [],
      confidence: "medium",
      opportunity: {
        opportunityId: "opp_triage",
        opportunityTitle: "Automate first-line triage",
        priorityRank: 1,
        discoveryTrace: [],
      },
      knowledgeGrounding: [
        {
          code: "triage-use-case",
          kind: "ai_use_case",
          title: "Ticket triage",
          rationale: "Matches the inbox problem.",
        },
      ],
      technologyGrounding: [],
    },
    {
      id: "rec_knowledge",
      title: "Create response knowledge base",
      approach: "Curate answer snippets before automation expands.",
      rationale: "Triage needs reliable answer material.",
      expectedValue: {
        summary: "Response quality becomes more consistent.",
        drivers: ["Shared answer source"],
      },
      effort: {
        level: "low",
        rationale: "Mostly curation work.",
      },
      assumptions: [],
      confidence: "medium",
      opportunity: {
        opportunityId: "opp_knowledge",
        opportunityTitle: "Improve response consistency",
        priorityRank: 2,
        discoveryTrace: [],
      },
      knowledgeGrounding: [
        {
          code: "kb-use-case",
          kind: "ai_use_case",
          title: "Support knowledge",
          rationale: "Matches response consistency.",
        },
      ],
      technologyGrounding: [],
    },
  ],
}

const patterns: CitableImplementationPattern = new Map([
  [
    "pilot-before-scale",
    {
      kind: "implementation_pattern",
      title: "Pilot before scale",
      summary: "Start with a bounded pilot and expand after review.",
    },
  ],
  [
    "risk-register",
    {
      kind: "risk_model",
      title: "Risk register",
      summary: "A risk model cannot ground roadmap implementation.",
    },
  ],
])

const phase = (
  overrides: Partial<RoadmapPhaseSubmission> = {},
): RoadmapPhaseSubmission => ({
  id: "phase_1",
  sequenceOrder: 1,
  title: "Prepare support knowledge",
  objective: "Create the prerequisite answer material.",
  scope: ["Review existing macros"],
  expectedOutcome: "A reviewed support knowledge base exists.",
  linkedRecommendationIds: ["rec_knowledge"],
  dependencyPhaseIds: [],
  explicitPrerequisites: [],
  readinessConsiderations: ["Requires access to current support macros."],
  risks: ["Knowledge may be incomplete."],
  assumptions: ["The helpdesk exports macros."],
  effort: {
    level: "low",
    rationale: "Recommendation effort is low and no delivery estimate is invented.",
  },
  sequencingRationale: "Reliable knowledge should precede triage automation.",
  implementationPatternGrounding: [
    {
      code: "pilot-before-scale",
      rationale: "The pattern supports a bounded first step.",
    },
  ],
  ...overrides,
})

const roadmap = (
  phases: RoadmapPhaseSubmission[] = [
    phase(),
    phase({
      id: "phase_2",
      sequenceOrder: 2,
      title: "Pilot triage automation",
      linkedRecommendationIds: ["rec_triage"],
      dependencyPhaseIds: ["phase_1"],
    }),
  ],
): RoadmapSubmission => ({
  summary: "Prepare knowledge, then pilot triage.",
  phases,
  recommendationDispositions: [
    { recommendationId: "rec_knowledge", disposition: "included" },
    { recommendationId: "rec_triage", disposition: "included" },
  ],
  assumptions: ["The client can provide helpdesk access."],
  gaps: ["Baseline response-time data is missing."],
})

const generatedRoadmap = (): GeneratedRoadmapDraft => ({
  summary: "Prepare knowledge, then pilot triage.",
  phases: [
    {
      ...phase({
        id: undefined,
        linkedRecommendationIds: ["rec_knowledge"],
      }),
      temporaryPhaseKey: "prepare",
      dependencyPhaseKeys: [],
    },
    {
      ...phase({
        id: undefined,
        sequenceOrder: 2,
        title: "Pilot triage automation",
        linkedRecommendationIds: ["rec_triage"],
      }),
      temporaryPhaseKey: "pilot",
      dependencyPhaseKeys: ["prepare"],
    },
  ].map(({ id: _id, dependencyPhaseIds: _deps, ...item }) => item),
  recommendationDispositions: [
    { recommendationId: "rec_knowledge", disposition: "included" },
    { recommendationId: "rec_triage", disposition: "included" },
  ],
  assumptions: ["The client can provide helpdesk access."],
  gaps: ["Baseline response-time data is missing."],
})

const resolve = (submission: RoadmapSubmission) =>
  resolveRoadmap(submission, { recommendations, implementationPatterns: patterns })

test("roadmap resolution stores Implementation Pattern snapshots", () => {
  const resolution = resolve(roadmap())

  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  assert.deepEqual(
    resolution.roadmap.phases[0].implementationPatternGrounding[0],
    {
      code: "pilot-before-scale",
      rationale: "The pattern supports a bounded first step.",
      title: "Pilot before scale",
      summary: "Start with a bounded pilot and expand after review.",
    },
  )
})

test("all accepted recommendations must have a disposition", () => {
  const resolution = resolve({
    ...roadmap([phase()]),
    recommendationDispositions: [
      { recommendationId: "rec_knowledge", disposition: "included" },
    ],
  })

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.missingRecommendationIds, ["rec_triage"])
})

test("deferred recommendations are preserved with a mandatory rationale", () => {
  const resolution = resolve({
    ...roadmap([phase()]),
    recommendationDispositions: [
      { recommendationId: "rec_knowledge", disposition: "included" },
      {
        recommendationId: "rec_triage",
        disposition: "deferred",
        rationale: "The client must first confirm triage ownership.",
      },
    ],
  })

  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return
  assert.deepEqual(resolution.roadmap.recommendationDispositions, [
    { recommendationId: "rec_knowledge", disposition: "included" },
    {
      recommendationId: "rec_triage",
      disposition: "deferred",
      rationale: "The client must first confirm triage ownership.",
    },
  ])
})

test("a recommendation cannot be both included and deferred", () => {
  const resolution = resolve({
    ...roadmap(),
    recommendationDispositions: [
      { recommendationId: "rec_knowledge", disposition: "included" },
      {
        recommendationId: "rec_triage",
        disposition: "deferred",
        rationale: "Deferred despite being linked.",
      },
    ],
  })

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.dispositionErrors, [
    "recommendation_included_and_deferred",
  ])
})

test("unsupported recommendation ids and fabricated pattern codes are refused", () => {
  const resolution = resolve(
    roadmap([
      phase({
        linkedRecommendationIds: ["rec_missing"],
        implementationPatternGrounding: [
          { code: "invented-pattern", rationale: "Claims a missing pattern." },
        ],
      }),
    ]),
  )

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.unknownRecommendationIds, ["rec_missing"])
  assert.deepEqual(resolution.unknownImplementationPatternCodes, [
    "invented-pattern",
  ])
})

test("non-Implementation Pattern citations are refused", () => {
  const resolution = resolve(
    roadmap([
      phase({
        linkedRecommendationIds: ["rec_knowledge", "rec_triage"],
        implementationPatternGrounding: [
          { code: "risk-register", rationale: "Wrong kind." },
        ],
      }),
    ]),
  )

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.nonImplementationPatternCodes, ["risk-register"])
})

test("dependency references must point to earlier phases and cannot cycle", () => {
  const resolution = resolve(
    roadmap([
      phase({
        id: "phase_1",
        sequenceOrder: 1,
        linkedRecommendationIds: ["rec_knowledge"],
        dependencyPhaseIds: ["phase_2"],
      }),
      phase({
        id: "phase_2",
        sequenceOrder: 2,
        linkedRecommendationIds: ["rec_triage"],
        dependencyPhaseIds: ["phase_1"],
      }),
    ]),
  )

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.dependencyErrors, [
    "dependency_cycle",
    "dependency_not_earlier",
  ])
})

test("generated roadmap dependencies use temporary keys and persist permanent ids", () => {
  const minted = ["permanent-1", "permanent-2"]
  const resolution = resolveGeneratedRoadmap(
    generatedRoadmap(),
    { recommendations, implementationPatterns: patterns },
    () => minted.shift()!,
  )

  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return
  assert.deepEqual(
    resolution.roadmap.phases.map((item) => item.id),
    ["permanent-1", "permanent-2"],
  )
  assert.deepEqual(resolution.roadmap.phases[1].dependencyPhaseIds, [
    "permanent-1",
  ])
  assert.equal(
    JSON.stringify(resolution.roadmap).includes("temporaryPhaseKey"),
    false,
  )
})

test("generated temporary dependency graph is fully validated", () => {
  const invalid = generatedRoadmap()
  invalid.phases[1].temporaryPhaseKey = "prepare"
  invalid.phases[1].dependencyPhaseKeys = ["prepare", "prepare", "missing"]

  const resolution = resolveGeneratedRoadmap(
    invalid,
    { recommendations, implementationPatterns: patterns },
    () => "unused",
  )

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.dependencyErrors, [
    "dependency_cycle",
    "dependency_not_earlier",
    "duplicate_dependency",
    "duplicate_phase_key",
    "self_dependency",
    "unknown_dependency",
  ])
})

test("phase identities are preserved and minted only when absent", () => {
  const resolution = resolve(
    roadmap([
      phase({ id: "kept", linkedRecommendationIds: ["rec_knowledge"] }),
      phase({
        id: undefined,
        sequenceOrder: 2,
        linkedRecommendationIds: ["rec_triage"],
      }),
    ]),
  )

  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  const identified = identifyRoadmapPhases(resolution.roadmap, () => "minted")
  assert.equal(identified.phases[0].id, "kept")
  assert.equal(identified.phases[1].id, "minted")
})

test("ordering and canonical fingerprint respond to semantic content", () => {
  const resolution = resolve(roadmap())
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved) return

  const ordered = inRoadmapOrder(
    identifyRoadmapPhases(
      {
        ...resolution.roadmap,
        phases: [...resolution.roadmap.phases].reverse(),
      },
      () => "unused",
    ),
  )
  assert.deepEqual(
    ordered.phases.map((item) => item.sequenceOrder),
    [1, 2],
  )

  const before = canonicalRoadmapContent(ordered)
  const after = canonicalRoadmapContent({
    ...ordered,
    recommendationDispositions: [
      { recommendationId: "rec_knowledge", disposition: "included" },
      {
        recommendationId: "rec_triage",
        disposition: "deferred",
        rationale: "Sequencing changed after consultant review.",
      },
    ],
  })
  assert.notEqual(before, after)
})

test("source canonical content changes for recommendation version and disposition changes", () => {
  const includedSource = canonicalRoadmapSourceContent({
    recommendationVersionId: "recommendation-version-1",
    recommendationVersionNumber: 1,
    recommendations,
    recommendationDispositions: [
      { recommendationId: "rec_knowledge", disposition: "included" },
      { recommendationId: "rec_triage", disposition: "included" },
    ],
  })
  const newRecommendationVersion = canonicalRoadmapSourceContent({
    recommendationVersionId: "recommendation-version-2",
    recommendationVersionNumber: 2,
    recommendations,
    recommendationDispositions: [
      { recommendationId: "rec_knowledge", disposition: "included" },
      { recommendationId: "rec_triage", disposition: "included" },
    ],
  })
  const deferredSource = canonicalRoadmapSourceContent({
    recommendationVersionId: "recommendation-version-1",
    recommendationVersionNumber: 1,
    recommendations,
    recommendationDispositions: [
      { recommendationId: "rec_knowledge", disposition: "included" },
      {
        recommendationId: "rec_triage",
        disposition: "deferred",
        rationale: "Wait for process ownership.",
      },
    ],
  })
  const changedDeferredRationale = canonicalRoadmapSourceContent({
    recommendationVersionId: "recommendation-version-1",
    recommendationVersionNumber: 1,
    recommendations,
    recommendationDispositions: [
      { recommendationId: "rec_knowledge", disposition: "included" },
      {
        recommendationId: "rec_triage",
        disposition: "deferred",
        rationale: "Wait for confirmed helpdesk ownership.",
      },
    ],
  })

  assert.notEqual(includedSource, newRecommendationVersion)
  assert.notEqual(includedSource, deferredSource)
  assert.notEqual(deferredSource, changedDeferredRationale)
})

test("staleness and overwrite protection mirror the stage lifecycle", () => {
  assert.equal(isRoadmapVersionStale("old", "new"), true)
  assert.equal(isRoadmapVersionStale("same", "same"), false)
  assert.equal(canReplaceRoadmapVersion("consultant_edited", false), false)
  assert.equal(canReplaceRoadmapVersion("accepted", true), true)
  assert.equal(canEditRoadmapVersionInPlace("ai_draft"), true)
  assert.equal(canEditRoadmapVersionInPlace("consultant_edited"), true)
  assert.equal(canEditRoadmapVersionInPlace("accepted"), false)
})
