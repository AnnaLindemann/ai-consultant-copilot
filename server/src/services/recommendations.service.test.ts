import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"

import {
  compliancePolicyRepositoryMock,
  compliancePolicyRowFixture,
} from "../domain/compliance/compliance-policy.fixture.js"

import type { Assessment } from "../../../shared/assessment.schema.js"
import type { KnowledgePackage } from "../../../shared/consulting-knowledge.schema.js"
import type { OpportunityVersionDetail } from "../../../shared/opportunity.schema.js"
import type {
  RecommendationSetSubmission,
  RecommendationVersionDetail,
} from "../../../shared/recommendation.schema.js"
import type { TechnologyPackage } from "../../../shared/technology-knowledge.schema.js"
import type { LlmResponse } from "../lib/llm-client.js"
import { getDefaultLlmConfig } from "../lib/llm-config.js"
import { calculateLlmCost } from "../evaluation/calculate-llm-cost.js"
import type { CreateAnalysisRunInput } from "../repositories/analysis-run.repository.js"
import type { EngagementWithOrganization } from "../repositories/engagement.repository.js"
import type {
  CreateRecommendationVersionInput,
  SaveRecommendationVersionInput,
} from "../repositories/recommendation-version.repository.js"

// The provider/model this deployment is configured to call, captured once,
// before any case mutates the environment.
//
// Nothing below names a model literally. A suite that hard-coded one asserted
// the default's *current value* rather than the stage's behaviour, so changing
// the default broke tests that have nothing to do with model selection (audit
// §12). The fixture workspace approves this same pair, which is what lets the
// "unapproved model" case below change `LLM_MODEL` and still be refused.
const configuredLlm = getDefaultLlmConfig()

// The stage's infrastructure is replaced at its module seams so the
// orchestration can be exercised without a database, a provider, or a live model
// (coding-standards.md §9 "determinism in tests").

let llmCall: () => Promise<LlmResponse>
let llmCallCount = 0
let assessment: Assessment | null
let activeOpportunityVersion: OpportunityVersionDetail | null
let activeOpportunityVersionThrows = false
let knowledgePackage: KnowledgePackage
let technologyPackage: TechnologyPackage
const recordedRuns: CreateAnalysisRunInput[] = []
const linkedRuns: { versionId: string; analysisRunId: string }[] = []

type StoredVersion = RecommendationVersionDetail & { engagementId: string }
let storedVersions: StoredVersion[] = []
let createOutcome: "created" | "version_conflict" | "throws" = "created"
let saveOutcome:
  | { saved: true }
  | { saved: false; reason: string; currentRevision?: number } = { saved: true }
const saveCalls: SaveRecommendationVersionInput[] = []

const OPPORTUNITY_ID = "opportunity_triage"
const DATA_OPPORTUNITY_ID = "opportunity_data"
const USE_CASE_CODE = "intelligent-ticket-triage"
const PATTERN_CODE = "status-and-triage-assistance"
const RISK_CODE = "trust-risk"
const TECHNOLOGY_CODE = "anthropic-claude"

mock.module("../lib/llm-client.js", {
  namedExports: {
    callLlm: async () => {
      llmCallCount += 1
      return llmCall()
    },
  },
})

mock.module("../repositories/engagement.repository.js", {
  namedExports: {
    // The compliance repository derives its reach filter from this same rule,
    // so the mock provides it too (roadmap Phase 10).
    engagementScopeWhere: () => ({}),
    toAssessment: () => assessment,
  },
})

// The Workspace Compliance Policy the AI compliance gate asks before this stage
// may send anything to a provider (roadmap Phase 10). Only the *storage* seam is
// replaced, so the real gate and the real policy rules run — a stage that
// stopped consulting them would fail here rather than pass quietly.
let compliancePolicyRow = compliancePolicyRowFixture()
const complianceAuditEntries: { eventType: string }[] = []

mock.module("../repositories/compliance.repository.js", {
  // The approved pair is pinned to the configuration captured above, not
  // re-read per call. That is what keeps the "an unapproved model is refused"
  // case honest: it changes `LLM_MODEL` inside the case, the workspace's
  // approval stays what it was, and the gate refuses the mismatch.
  namedExports: compliancePolicyRepositoryMock(
    () => compliancePolicyRow,
    () => configuredLlm,
  ),
})

mock.module("../repositories/access.repository.js", {
  namedExports: {
    appendAuditTrail: async (entry: { eventType: string }) => {
      complianceAuditEntries.push(entry)
      return entry
    },
  },
})

mock.module("../repositories/analysis-run.repository.js", {
  namedExports: {
    createAnalysisRun: async (input: CreateAnalysisRunInput) => {
      recordedRuns.push(input)
      return { id: `run_${recordedRuns.length}` }
    },
  },
})

mock.module("../repositories/opportunity-version.repository.js", {
  namedExports: {
    getActiveOpportunityVersion: async () => {
      if (activeOpportunityVersionThrows) {
        throw new Error("database unavailable")
      }

      return activeOpportunityVersion
    },
    getOpportunityVersionById: async (versionId: string) =>
      activeOpportunityVersion?.id === versionId
        ? activeOpportunityVersion
        : null,
  },
})

mock.module("./consulting-knowledge.service.js", {
  namedExports: {
    retrieveKnowledgePackage: async () => knowledgePackage,
    // The consultant's citable set is deliberately wider than the retrieval: it
    // is the curated base, not the package.
    listCitableKnowledge: async () =>
      new Map([
        [USE_CASE_CODE, { kind: "ai_use_case", title: "Intelligente Ticket-Triage" }],
        [
          PATTERN_CODE,
          { kind: "solution_pattern", title: "Status- und Triage-Unterstuetzung" },
        ],
        [RISK_CODE, { kind: "risk_model", title: "Vertrauensrisiko" }],
        [
          "curated-but-not-retrieved",
          { kind: "solution_pattern", title: "Kuratiert, nicht abgerufen" },
        ],
      ]),
  },
})

mock.module("./technology-knowledge.service.js", {
  namedExports: {
    retrieveTechnologyPackage: async () => technologyPackage,
    listCitableTechnology: async () =>
      new Map([
        [TECHNOLOGY_CODE, { categoryCode: "ai-models", title: "Anthropic Claude" }],
      ]),
  },
})

mock.module("../repositories/recommendation-version.repository.js", {
  namedExports: {
    createRecommendationVersion: async (
      _scope: unknown,
      input: CreateRecommendationVersionInput,
    ) => {
      if (createOutcome === "throws") throw new Error("storage unavailable")
      if (createOutcome === "version_conflict") {
        return { created: false, reason: "version_conflict" }
      }

      // Superseding is the store's job; the service only asks for the next
      // version, so the fake mirrors that: earlier rows stay exactly as they are
      // and are marked superseded.
      storedVersions = storedVersions.map((version) =>
        version.engagementId === input.engagementId
          ? { ...version, status: "superseded" as const }
          : version,
      )

      const version: StoredVersion = {
        engagementId: input.engagementId,
        id: `version_${storedVersions.length + 1}`,
        versionNumber: storedVersions.length + 1,
        status: "active",
        reviewState: "ai_draft",
        revision: 0,
        createdAt: "2026-08-01T10:00:00.000Z",
        createdByUserId: input.createdByUserId,
        createdByName: "Real Manager",
        lastModifiedAt: "2026-08-01T10:00:00.000Z",
        lastModifiedByUserId: input.createdByUserId,
        lastModifiedByName: "Real Manager",
        sourceOpportunityVersionId: input.sourceOpportunityVersionId,
        sourceOpportunityVersionNumber: input.sourceOpportunityVersionNumber,
        sourceOpportunityFingerprint: input.sourceOpportunityFingerprint,
        analysisRunId: null,
        recommendationCount: input.recommendationSet.recommendations.length,
        recommendationSet: input.recommendationSet,
      }

      storedVersions = [...storedVersions, version]
      return { created: true, version }
    },
    linkRecommendationVersionAnalysisRun: async (
      versionId: string,
      analysisRunId: string,
    ) => {
      linkedRuns.push({ versionId, analysisRunId })
    },
    saveRecommendationVersion: async (
      _scope: unknown,
      input: SaveRecommendationVersionInput,
    ) => {
      saveCalls.push(input)
      if (!saveOutcome.saved) return saveOutcome

      const version = storedVersions.find((one) => one.id === input.versionId)
      assert.ok(version, "the test asked to save a version that was never created")

      const saved: StoredVersion = {
        ...version,
        recommendationSet: input.recommendationSet,
        reviewState: input.reviewState,
        revision: version.revision + 1,
        lastModifiedByUserId: input.modifiedByUserId,
      }
      storedVersions = storedVersions.map((one) =>
        one.id === saved.id ? saved : one,
      )

      return { saved: true, version: saved }
    },
    getActiveRecommendationVersion: async (engagementId: string) =>
      storedVersions.find(
        (one) => one.engagementId === engagementId && one.status === "active",
      ) ?? null,
    getRecommendationVersionById: async (
      versionId: string,
      engagementId: string,
    ) =>
      storedVersions.find(
        (one) => one.id === versionId && one.engagementId === engagementId,
      ) ?? null,
    getRecommendationVersions: async (engagementId: string) =>
      storedVersions.filter((one) => one.engagementId === engagementId),
  },
})

const {
  generateRecommendations,
  getRecommendationStageState,
  opportunityFingerprint,
  recommendationFingerprint,
  saveRecommendations,
} = await import("./recommendations.service.js")

const scope = { workspaceId: "ws_1", userId: "user_1", role: "ADMIN" as const }

const emptyDimension = (summary: string) => ({ summary, findings: [] })

const assessedAssessment: Assessment = {
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
          supportingFacts: ["Agents sort every incoming email by hand."],
          assumptions: [],
          confidence: "medium",
        },
      ],
    },
    data: emptyDimension("Ticket data is split."),
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

const storedOpportunity = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: OPPORTUNITY_ID,
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

const opportunityVersion = (
  opportunities = [storedOpportunity()],
): OpportunityVersionDetail =>
  ({
    id: "opportunity_version_1",
    versionNumber: 1,
    status: "active",
    reviewState: "accepted",
    revision: 1,
    createdAt: "2026-08-01T09:00:00.000Z",
    createdByUserId: "user_1",
    createdByName: "Real Manager",
    lastModifiedAt: "2026-08-01T09:00:00.000Z",
    lastModifiedByUserId: "user_1",
    lastModifiedByName: "Real Manager",
    sourceAssessmentRevision: 1,
    sourceAssessmentFingerprint: "assessment-fingerprint",
    analysisRunId: "run_0",
    opportunityCount: opportunities.length,
    prioritization: {
      summary: "Triage is where effort is best spent.",
      opportunities,
      gaps: [],
    },
  }) as unknown as OpportunityVersionDetail

const knowledgeSelection = (
  code: string,
  kind: string,
  title: string,
) => ({
  code,
  kind,
  title,
  summary: `Summary of ${title}`,
  details: {
    objective: null,
    applicability: [],
    questions: [],
    criteria: [],
    signals: [],
    steps: [],
    risks: [],
    mitigations: [],
    roiDrivers: [],
    bestPractices: [],
    notes: [],
  },
  reasons: ["anchor:test"],
  score: 100,
  rank: 1,
})

const populatedKnowledgePackage = (): KnowledgePackage =>
  ({
    stage: "solution_matching",
    domainCode: "customer-operations",
    anchors: {
      taxonomyCodes: [],
      processCodes: [],
      problemCodes: [],
      useCaseCodes: [],
    },
    entries: [
      knowledgeSelection(USE_CASE_CODE, "ai_use_case", "Intelligente Ticket-Triage"),
      knowledgeSelection(
        PATTERN_CODE,
        "solution_pattern",
        "Status- und Triage-Unterstuetzung",
      ),
      knowledgeSelection(RISK_CODE, "risk_model", "Vertrauensrisiko"),
    ],
    codes: [USE_CASE_CODE, PATTERN_CODE, RISK_CODE],
    fallback: false,
  }) as unknown as KnowledgePackage

const emptyKnowledgePackage = (): KnowledgePackage =>
  ({
    ...populatedKnowledgePackage(),
    entries: [],
    codes: [],
    fallback: true,
  }) as unknown as KnowledgePackage

const populatedTechnologyPackage = (): TechnologyPackage =>
  ({
    categoryCodes: [],
    profiles: [
      {
        code: TECHNOLOGY_CODE,
        categoryCode: "ai-models",
        title: "Anthropic Claude",
        summary: "Sprachmodellfamilie von Anthropic.",
        details: {
          role: "Sprachmodell",
          strengths: [],
          limitations: [],
          suitability: [],
        },
        provenance: {
          origin: "product_seed",
          sourceCodes: ["anthropic"],
          proposalId: null,
          appliedAt: null,
        },
        reasons: ["matchTerm:llm"],
        score: 100,
        rank: 1,
      },
    ],
    codes: [TECHNOLOGY_CODE],
    fallback: false,
  }) as unknown as TechnologyPackage

const recommendation = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  title: "Intent-based triage with human approval",
  opportunityId: OPPORTUNITY_ID,
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
    { code: USE_CASE_CODE, rationale: "The use case describes exactly this inbox." },
  ],
  technologyGrounding: [
    {
      code: TECHNOLOGY_CODE,
      fitRationale: "Follows structured output formats for routing.",
    },
  ],
  assumptions: [],
  confidence: "medium",
  ...overrides,
})

const validOutput = (recommendations = [recommendation()]) =>
  JSON.stringify({
    summary: "One grounded proposal for the prioritized triage opportunity.",
    recommendations,
    gaps: ["Ticket volumes are unknown."],
  })

const llmResponse = (content: string): LlmResponse => ({
  content,
  provider: "groq",
  model: configuredLlm.model,
  latencyMs: 1600,
  promptTokens: 2200,
  completionTokens: 900,
  totalTokens: 3100,
})

const engagementFixture = (
  overrides: Partial<EngagementWithOrganization> = {},
): EngagementWithOrganization =>
  ({
    id: "engagement_1",
    title: "Customer Operations review",
    department: "Customer Support",
    statedProblem: "Support triage is manual.",
    workspaceId: "ws_1",
    dataClassification: "internal",
    aiProcessingPermission: "allowed",
    processingPurpose: null,
    legalBasis: "not_assessed",
    dpiaScreening: "not_assessed",
    organization: {
      name: "Northwind Support",
      industry: "Retail",
      companySize: "small",
      geography: "EU",
    },
    ...overrides,
  }) as unknown as EngagementWithOrganization

const submission = (
  overrides: Record<string, unknown> = {},
): RecommendationSetSubmission =>
  ({
    summary: "One grounded proposal for the prioritized triage opportunity.",
    recommendations: [recommendation(overrides)],
    gaps: [],
  }) as unknown as RecommendationSetSubmission

beforeEach(() => {
  // The stage runs against configured LLM settings; the provider itself is
  // replaced above, so nothing is called.
  process.env.LLM_PROVIDER = configuredLlm.provider
  process.env.LLM_MODEL = configuredLlm.model
  recordedRuns.length = 0
  linkedRuns.length = 0
  saveCalls.length = 0
  storedVersions = []
  createOutcome = "created"
  saveOutcome = { saved: true }
  llmCallCount = 0
  assessment = assessedAssessment
  activeOpportunityVersionThrows = false
  activeOpportunityVersion = opportunityVersion()
  knowledgePackage = populatedKnowledgePackage()
  technologyPackage = populatedTechnologyPackage()
  llmCall = async () => llmResponse(validOutput())
})

// --- Generation creates a version ------------------------------------------

test("the first generation creates version 1 as an unreviewed AI draft", async () => {
  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success, true)
  assert.equal(result.success && result.version.versionNumber, 1)
  assert.equal(result.success && result.version.status, "active")
  assert.equal(result.success && result.version.reviewState, "ai_draft")
  assert.equal(result.success && result.version.revision, 0)
})

test("a version records the Opportunities it was matched against", async () => {
  const result = await generateRecommendations(engagementFixture(), scope)
  assert.equal(result.success, true)
  if (!result.success) return

  assert.equal(result.version.sourceOpportunityVersionId, "opportunity_version_1")
  assert.equal(result.version.sourceOpportunityVersionNumber, 1)
  assert.equal(
    result.version.sourceOpportunityFingerprint,
    opportunityFingerprint(opportunityVersion()),
  )
  assert.equal(result.version.createdByUserId, "user_1")
  assert.equal(result.version.analysisRunId, "run_1")
})

test("a stored recommendation carries its grounding, resolved by the server", async () => {
  const result = await generateRecommendations(engagementFixture(), scope)
  assert.equal(result.success, true)
  if (!result.success) return

  const [stored] = result.version.recommendationSet.recommendations
  assert.deepEqual(stored.effort, {
    level: "medium",
    rationale: "The approach reuses existing support workflows but needs integration.",
  })

  // Outward, into the Consulting Knowledge Base — with the kind and title the
  // server read, not something the model asserted.
  assert.deepEqual(stored.knowledgeGrounding, [
    {
      code: USE_CASE_CODE,
      kind: "ai_use_case",
      title: "Intelligente Ticket-Triage",
      rationale: "The use case describes exactly this inbox.",
    },
  ])

  // Outward, into the Technology Knowledge Base.
  assert.deepEqual(stored.technologyGrounding, [
    {
      code: TECHNOLOGY_CODE,
      categoryCode: "ai-models",
      title: "Anthropic Claude",
      fitRationale: "Follows structured output formats for routing.",
    },
  ])

  // Backward, to the Opportunity and the discovery facts behind it.
  assert.equal(stored.opportunity.opportunityId, OPPORTUNITY_ID)
  assert.deepEqual(stored.opportunity.discoveryTrace[0].supportingFacts, [
    "Agents sort every incoming email by hand.",
  ])
})

test("a matching run records its Analysis Run with the stage's trust signals", async () => {
  await generateRecommendations(engagementFixture(), scope)

  assert.equal(recordedRuns.length, 1)

  const run = recordedRuns[0]
  assert.equal(run.engagementId, "engagement_1")
  assert.equal(run.workspaceId, "ws_1")
  assert.equal(run.stage, "solution_matching")
  assert.equal(run.provider, "groq")
  assert.equal(run.model, configuredLlm.model)
  assert.equal(run.promptVersion, "recommendations-v1")
  assert.equal(typeof run.promptFingerprint, "string")
  assert.equal(run.promptFingerprint!.length > 0, true)
  assert.equal(run.latencyMs, 1600)
  assert.equal(run.totalTokens, 3100)
  // The cost the rate table yields for the model that actually answered —
  // which is `undefined` for a model whose rate has not been confirmed. The run
  // records what the table says rather than a fallback figure
  // (`evaluation/llm-rates.ts`).
  assert.equal(
    run.costEstimateUsd,
    calculateLlmCost({
      provider: configuredLlm.provider,
      model: configuredLlm.model,
      promptTokens: run.promptTokens,
      completionTokens: run.completionTokens,
    }),
  )
  assert.equal(run.jsonParseSuccess, true)
  assert.equal(run.schemaValid, true)
  assert.equal(run.errorMessage, undefined)
  assert.equal(run.compliance?.outputScanOutcome, "clean")
  assert.equal(run.compliance?.outputClassification, "internal")

  // Both knowledge bases are recorded, separately and by name.
  assert.deepEqual(run.knowledgeEntryCodes, [USE_CASE_CODE, PATTERN_CODE, RISK_CODE])
  assert.deepEqual(run.technologyProfileCodes, [TECHNOLOGY_CODE])
})

test("AI output containing recognized PII creates no Recommendation version", async () => {
  llmCall = async () =>
    llmResponse(
      validOutput([
        recommendation({
          title: "Contact support@nordwind.example before routing",
        }),
      ]),
    )

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(
    result.success === false && result.messageId,
    "compliance.ai.output_rejected.output_personal_data_detected",
  )
  assert.equal(storedVersions.length, 0)
  assert.equal(linkedRuns.length, 0)
  assert.equal(
    recordedRuns[0].compliance?.outputScanOutcome,
    "personal_data_detected",
  )
  assert.equal(recordedRuns[0].compliance?.outputClassification, "personal_data")
  assert.equal(
    complianceAuditEntries.some(
      (entry) => entry.eventType === "ai_output_personal_data_detected",
    ),
    true,
  )
  assert.equal(JSON.stringify(recordedRuns).includes("support@nordwind.example"), false)
  assert.equal(JSON.stringify(complianceAuditEntries).includes("support@nordwind.example"), false)
})

test("every generated version is linked to its Analysis Run", async () => {
  const result = await generateRecommendations(engagementFixture(), scope)

  assert.deepEqual(linkedRuns, [
    { versionId: result.success ? result.version.id : "", analysisRunId: "run_1" },
  ])
})

test("the stored set is in the order the Opportunities were prioritized", async () => {
  activeOpportunityVersion = opportunityVersion([
    storedOpportunity(),
    storedOpportunity({
      id: DATA_OPPORTUNITY_ID,
      title: "Consolidate ticket data",
      priorityRank: 2,
    }),
  ])

  llmCall = async () =>
    llmResponse(
      validOutput([
        recommendation({
          title: "For the second opportunity",
          opportunityId: DATA_OPPORTUNITY_ID,
        }),
        recommendation({ title: "For the first opportunity" }),
      ]),
    )

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.deepEqual(
    result.success
      ? result.version.recommendationSet.recommendations.map((one) => one.title)
      : [],
    ["For the first opportunity", "For the second opportunity"],
  )
})

// --- Regeneration adds; it never overwrites --------------------------------

test("regenerating creates the next version and leaves the previous one exactly as it was", async () => {
  const first = await generateRecommendations(engagementFixture(), scope)
  assert.equal(first.success, true)
  if (!first.success) return

  const before = structuredClone(
    storedVersions.find((one) => one.id === first.version.id),
  )

  llmCall = async () =>
    llmResponse(validOutput([recommendation({ title: "A different proposal" })]))

  const second = await generateRecommendations(engagementFixture(), scope)
  assert.equal(second.success, true)
  if (!second.success) return

  assert.equal(second.version.versionNumber, 2)
  assert.equal(second.version.status, "active")
  assert.notEqual(second.version.id, first.version.id)

  const after = storedVersions.find((one) => one.id === first.version.id)
  assert.ok(after)
  assert.equal(after.status, "superseded")
  assert.deepEqual(after.recommendationSet, before?.recommendationSet)
})

test("re-running over consultant-reviewed work is refused without explicit replacement", async () => {
  const generated = await generateRecommendations(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  storedVersions = storedVersions.map((version) =>
    version.id === generated.version.id
      ? { ...version, reviewState: "consultant_edited" as const }
      : version,
  )

  llmCallCount = 0
  recordedRuns.length = 0

  const refused = await generateRecommendations(engagementFixture(), scope)

  assert.equal(refused.success, false)
  assert.equal(
    refused.success === false && refused.failure,
    "consultant_edits_protected",
  )
  assert.equal(llmCallCount, 0)
  assert.equal(recordedRuns.length, 0)
})

test("two generations racing each other do not both win", async () => {
  createOutcome = "version_conflict"

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "version_conflict")
  assert.equal(storedVersions.length, 0)
  assert.equal(recordedRuns.length, 1)
  assert.match(String(recordedRuns[0].errorMessage), /same time/)
})

test("a generation that cannot be stored leaves the previous version active", async () => {
  const first = await generateRecommendations(engagementFixture(), scope)
  assert.equal(first.success, true)

  createOutcome = "throws"
  const second = await generateRecommendations(engagementFixture(), scope)

  assert.equal(second.success, false)
  assert.equal(second.success === false && second.failure, "persistence_failed")
  assert.equal(storedVersions.length, 1)
  assert.equal(storedVersions[0].status, "active")
  assert.match(String(recordedRuns[1].errorMessage), /could not be stored/)
})

// --- Failure paths ---------------------------------------------------------

test("an engagement with no prioritized Opportunities is refused before any AI call", async () => {
  activeOpportunityVersion = null

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(
    result.success === false && result.failure,
    "opportunities_not_ready",
  )
  assert.equal(llmCallCount, 0)
  assert.equal(recordedRuns.length, 0)
  assert.equal(storedVersions.length, 0)
})

test("an empty prioritization is refused before any AI call", async () => {
  activeOpportunityVersion = opportunityVersion([])

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(
    result.success === false && result.failure,
    "opportunities_not_ready",
  )
  assert.equal(llmCallCount, 0)
})

test("no curated knowledge to ground with is refused before any AI call", async () => {
  // Grounding is what makes a recommendation valid, so an empty knowledge
  // package is a refusal rather than a licence to generate ungroundable output
  // (agent-rules.md §4).
  knowledgePackage = emptyKnowledgePackage()

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(
    result.success === false && result.failure,
    "knowledge_unavailable",
  )
  assert.equal(llmCallCount, 0)
  assert.equal(recordedRuns.length, 0)
})

test("unusable AI output creates no version but still records the run", async () => {
  llmCall = async () => llmResponse("Here are the recommendations you asked for:")

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_output_invalid")
  assert.equal(storedVersions.length, 0)
  assert.equal(recordedRuns.length, 1)
  assert.equal(recordedRuns[0].jsonParseSuccess, false)
  assert.equal(typeof recordedRuns[0].errorMessage, "string")
})

test("AI output with no grounding at all is refused by the contract", async () => {
  llmCall = async () =>
    llmResponse(validOutput([recommendation({ knowledgeGrounding: [] })]))

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_output_invalid")
  assert.equal(storedVersions.length, 0)
  assert.equal(recordedRuns[0].jsonParseSuccess, true)
  assert.equal(recordedRuns[0].schemaValid, false)
})

test("AI output without qualitative effort is refused by the contract", async () => {
  llmCall = async () =>
    llmResponse(validOutput([recommendation({ effort: undefined })]))

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_output_invalid")
  assert.equal(storedVersions.length, 0)
  assert.equal(recordedRuns[0].jsonParseSuccess, true)
  assert.equal(recordedRuns[0].schemaValid, false)
})

test("a recommendation citing knowledge that was not retrieved is refused", async () => {
  llmCall = async () =>
    llmResponse(
      validOutput([
        recommendation({
          knowledgeGrounding: [
            { code: "invented-use-case", rationale: "Sounds plausible." },
          ],
        }),
      ]),
    )

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_output_ungrounded")
  assert.deepEqual(
    result.success === false ? result.unknownKnowledgeCodes : undefined,
    ["invented-use-case"],
  )
  assert.equal(storedVersions.length, 0)

  // Fabricated grounding is a broken contract, and the run says so.
  assert.equal(recordedRuns[0].jsonParseSuccess, true)
  assert.equal(recordedRuns[0].schemaValid, false)
  assert.match(String(recordedRuns[0].errorMessage), /invented-use-case/)
})

test("a recommendation naming a technology that was not retrieved is refused", async () => {
  llmCall = async () =>
    llmResponse(
      validOutput([
        recommendation({
          technologyGrounding: [
            { code: "some-model-9", fitRationale: "It would fit nicely." },
          ],
        }),
      ]),
    )

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success === false && result.failure, "ai_output_ungrounded")
  assert.deepEqual(
    result.success === false ? result.unknownTechnologyCodes : undefined,
    ["some-model-9"],
  )
  assert.equal(storedVersions.length, 0)
})

test("a recommendation addressing an Opportunity that does not exist is refused", async () => {
  llmCall = async () =>
    llmResponse(
      validOutput([recommendation({ opportunityId: "opportunity_invented" })]),
    )

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success === false && result.failure, "ai_output_ungrounded")
  assert.deepEqual(
    result.success === false ? result.unknownOpportunityIds : undefined,
    ["opportunity_invented"],
  )
  assert.equal(storedVersions.length, 0)
})

test("a recommendation grounded in nothing that justifies an approach is refused", async () => {
  llmCall = async () =>
    llmResponse(
      validOutput([
        recommendation({
          title: "Only a risk model behind it",
          knowledgeGrounding: [
            { code: RISK_CODE, rationale: "There is a trust risk here." },
          ],
        }),
      ]),
    )

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success === false && result.failure, "ai_output_ungrounded")
  assert.deepEqual(
    result.success === false ? result.ungroundedRecommendationTitles : undefined,
    ["Only a risk model behind it"],
  )
  assert.equal(storedVersions.length, 0)
})

test("a provider failure is recorded as a run and creates no version", async () => {
  llmCall = async () => {
    throw new Error("provider unavailable")
  }

  const result = await generateRecommendations(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_step_failed")
  assert.equal(storedVersions.length, 0)
  assert.equal(recordedRuns.length, 1)
  assert.equal(recordedRuns[0].stage, "solution_matching")
  assert.equal(recordedRuns[0].errorMessage, "provider unavailable")
  // What the model was *given* belongs on the record whether or not it answered.
  assert.deepEqual(recordedRuns[0].technologyProfileCodes, [TECHNOLOGY_CODE])
})

test("no refusal carries user-facing prose", async () => {
  activeOpportunityVersion = null
  const refused = await generateRecommendations(engagementFixture(), scope)

  assert.equal(
    refused.success === false && refused.messageId,
    "recommendation.error.opportunities_not_ready",
  )
})

test("a repository outage before an AI attempt is not reported as a domain refusal", async () => {
  activeOpportunityVersionThrows = true

  await assert.rejects(
    generateRecommendations(engagementFixture(), scope),
    /database unavailable/,
  )

  assert.equal(llmCallCount, 0)
  assert.equal(recordedRuns.length, 0)
  assert.equal(storedVersions.length, 0)
})

// --- Saving into the active version ----------------------------------------

test("saving edits the active version rather than creating one", async () => {
  const generated = await generateRecommendations(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return
  const originalId =
    generated.version.recommendationSet.recommendations[0].id

  const saved = await saveRecommendations(engagementFixture(), scope, {
    versionId: generated.version.id,
    expectedRevision: 0,
    recommendationSet: submission({
      id: originalId,
      title: "Revised by the consultant",
    }),
    reviewState: "consultant_edited",
  })

  assert.equal(saved.success, true)
  assert.equal(storedVersions.length, 1)
  assert.equal(saved.success && saved.version.versionNumber, 1)
  assert.equal(saved.success && saved.version.reviewState, "consultant_edited")
  assert.equal(saved.success && saved.version.revision, 1)
  assert.equal(
    saved.success && saved.version.recommendationSet.recommendations[0].id,
    originalId,
  )
  assert.deepEqual(
    saveCalls.map((call) => call.expectedRevision),
    [0],
  )
  assert.equal(saveCalls[0].modifiedByUserId, "user_1")
})

test("accepted Recommendations remain distinguishable from drafts for downstream stages", async () => {
  const generated = await generateRecommendations(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  const accepted = await saveRecommendations(engagementFixture(), scope, {
    versionId: generated.version.id,
    expectedRevision: 0,
    recommendationSet: submission({ id: generated.version.recommendationSet.recommendations[0].id }),
    reviewState: "accepted",
  })

  assert.equal(accepted.success, true)
  if (!accepted.success) return

  const state = await getRecommendationStageState(engagementFixture(), scope)
  assert.equal(state.activeVersion?.reviewState, "accepted")
  assert.deepEqual(
    state.activeVersion?.recommendationSet.recommendations.map((one) => one.id),
    accepted.version.recommendationSet.recommendations.map((one) => one.id),
  )

  const acceptedForRoadmap =
    state.activeVersion?.reviewState === "accepted"
      ? state.activeVersion.recommendationSet.recommendations
      : []
  assert.equal(acceptedForRoadmap.length, 1)
})

test("recommendation fingerprints change only with canonical recommendation content", async () => {
  const generated = await generateRecommendations(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  const sameContentDifferentMetadata: RecommendationVersionDetail = {
    ...generated.version,
    id: "another-version-row",
    versionNumber: 99,
    status: "superseded",
    reviewState: "accepted",
    revision: 12,
    lastModifiedAt: "2026-08-01T11:00:00.000Z",
    analysisRunId: "run_other",
  }

  assert.equal(
    recommendationFingerprint(sameContentDifferentMetadata),
    recommendationFingerprint(generated.version),
  )

  const changedContent: RecommendationVersionDetail = {
    ...generated.version,
    recommendationSet: {
      ...generated.version.recommendationSet,
      recommendations: generated.version.recommendationSet.recommendations.map(
        (one) => ({ ...one, title: `${one.title} revised` }),
      ),
    },
  }

  assert.notEqual(
    recommendationFingerprint(changedContent),
    recommendationFingerprint(generated.version),
  )
})

test("the consultant may ground in curated knowledge the retrieval did not surface", async () => {
  // The model may cite only what was retrieved for it; the consultant is the
  // expert reviewing that draft and may re-ground a proposal in any active
  // curated entry (agent-rules.md §4 constrains the AI, not the reviewer).
  const generated = await generateRecommendations(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  const saved = await saveRecommendations(engagementFixture(), scope, {
    versionId: generated.version.id,
    expectedRevision: 0,
    recommendationSet: submission({
      knowledgeGrounding: [
        {
          code: "curated-but-not-retrieved",
          rationale: "This pattern is the one that actually fits.",
        },
      ],
    }),
    reviewState: "consultant_edited",
  })

  assert.equal(saved.success, true)
  assert.equal(
    saved.success &&
      saved.version.recommendationSet.recommendations[0].knowledgeGrounding[0]
        .title,
    "Kuratiert, nicht abgerufen",
  )
})

test("the consultant's citations are checked too", async () => {
  const generated = await generateRecommendations(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  const result = await saveRecommendations(engagementFixture(), scope, {
    versionId: generated.version.id,
    expectedRevision: 0,
    recommendationSet: submission({
      knowledgeGrounding: [
        { code: "no-such-entry", rationale: "Typed by hand." },
      ],
    }),
    reviewState: "consultant_edited",
  })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_output_ungrounded")
  assert.deepEqual(
    result.success === false ? result.unknownKnowledgeCodes : undefined,
    ["no-such-entry"],
  )
  // Nothing reached the store.
  assert.equal(saveCalls.length, 0)
})

test("a save aimed at a version outside the caller's reach is refused as not found", async () => {
  await generateRecommendations(engagementFixture(), scope)

  const result = await saveRecommendations(engagementFixture(), scope, {
    versionId: "version_from_another_engagement",
    expectedRevision: 0,
    recommendationSet: submission(),
    reviewState: "consultant_edited",
  })

  assert.equal(result.success === false && result.failure, "version_not_found")
  assert.equal(saveCalls.length, 0)
})

test("a save aimed at a preserved version is refused as read-only, not as absent", async () => {
  // The consultant's next step differs: a version they cannot see is gone, a
  // preserved one is still there and they should open the active version.
  const first = await generateRecommendations(engagementFixture(), scope)
  assert.equal(first.success, true)
  if (!first.success) return

  await generateRecommendations(engagementFixture(), scope)
  saveOutcome = { saved: false, reason: "historical_version_readonly" }

  const result = await saveRecommendations(engagementFixture(), scope, {
    versionId: first.version.id,
    expectedRevision: first.version.revision,
    recommendationSet: submission(),
    reviewState: "consultant_edited",
  })

  assert.equal(
    result.success === false && result.failure,
    "historical_version_readonly",
  )
})

test("a save that lost a race is refused with the revision to re-read", async () => {
  await generateRecommendations(engagementFixture(), scope)
  saveOutcome = { saved: false, reason: "stale_update", currentRevision: 4 }

  const result = await saveRecommendations(engagementFixture(), scope, {
    versionId: "version_1",
    expectedRevision: 2,
    recommendationSet: submission(),
    reviewState: "consultant_edited",
  })

  assert.equal(result.success === false && result.failure, "stale_update")
  assert.equal(result.success === false && result.currentRevision, 4)
  assert.equal(
    result.success === false && result.messageId,
    "recommendation.error.stale_update",
  )
})

// --- Staleness -------------------------------------------------------------

test("the active version is not stale while the Opportunities are unchanged", async () => {
  await generateRecommendations(engagementFixture(), scope)

  const state = await getRecommendationStageState(engagementFixture(), scope)

  assert.equal(state.stale, false)
  assert.equal(state.activeVersion?.versionNumber, 1)
  assert.equal(state.currentOpportunityVersionNumber, 1)
  // The grounding the consultant reviews is the same material the model was
  // given.
  assert.deepEqual(
    state.groundingOptions.knowledge.map((entry) => entry.code),
    [USE_CASE_CODE, PATTERN_CODE, RISK_CODE],
  )
  assert.deepEqual(
    state.groundingOptions.technology.map((profile) => profile.code),
    [TECHNOLOGY_CODE],
  )
})

test("re-prioritizing marks the active version stale without changing it", async () => {
  const generated = await generateRecommendations(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  const storedBefore = structuredClone(storedVersions[0])

  activeOpportunityVersion = opportunityVersion([
    storedOpportunity({ improvement: "Route by intent, and escalate by SLA." }),
  ])

  const state = await getRecommendationStageState(engagementFixture(), scope)

  assert.equal(state.stale, true)
  // Recognizing staleness changes nothing: the version still says exactly what
  // it said (agent-rules.md §15).
  assert.deepEqual(storedVersions[0], storedBefore)
})

test("an engagement with no version yet is not stale", async () => {
  const state = await getRecommendationStageState(engagementFixture(), scope)

  assert.equal(state.activeVersion, null)
  assert.equal(state.stale, false)
})
