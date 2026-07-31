import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"

import type { Assessment } from "../../../shared/assessment.schema.js"
import type {
  OpportunityPrioritization,
  OpportunityVersionDetail,
} from "../../../shared/opportunity.schema.js"
import type { LlmResponse } from "../lib/llm-client.js"
import type { CreateAnalysisRunInput } from "../repositories/analysis-run.repository.js"
import type { EngagementWithOrganization } from "../repositories/engagement.repository.js"
import type {
  CreateOpportunityVersionInput,
  SaveOpportunityVersionInput,
} from "../repositories/opportunity-version.repository.js"

// The stage's infrastructure is replaced at its module seams so the
// orchestration can be exercised without a database, a provider, or a live
// model (coding-standards.md §9 "determinism in tests").

let llmCall: () => Promise<LlmResponse>
let llmCallCount = 0
let assessment: Assessment | null
const recordedRuns: CreateAnalysisRunInput[] = []
const linkedRuns: { versionId: string; analysisRunId: string }[] = []

// The version store, as the service sees it: rows that are only ever added to.
type StoredVersion = OpportunityVersionDetail & { engagementId: string }
let storedVersions: StoredVersion[] = []
let createOutcome: "created" | "version_conflict" | "throws" = "created"
let saveOutcome:
  | { saved: true }
  | { saved: false; reason: string; currentRevision?: number } = { saved: true }
const saveCalls: SaveOpportunityVersionInput[] = []

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
    toAssessment: () => assessment,
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
    createOpportunityVersion: async (
      _scope: unknown,
      input: CreateOpportunityVersionInput,
    ) => {
      if (createOutcome === "throws") throw new Error("storage unavailable")
      if (createOutcome === "version_conflict") {
        return { created: false, reason: "version_conflict" }
      }

      // Superseding is the store's job; the service only asks for the next
      // version, so the fake mirrors that: earlier rows stay exactly as they
      // are and are marked superseded.
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
        createdAt: "2026-07-31T10:00:00.000Z",
        createdByUserId: input.createdByUserId,
        createdByName: "Real Manager",
        lastModifiedAt: "2026-07-31T10:00:00.000Z",
        lastModifiedByUserId: input.createdByUserId,
        lastModifiedByName: "Real Manager",
        sourceAssessmentRevision: input.sourceAssessmentRevision,
        sourceAssessmentFingerprint: input.sourceAssessmentFingerprint,
        analysisRunId: null,
        opportunityCount: input.prioritization.opportunities.length,
        prioritization: input.prioritization,
      }

      storedVersions = [...storedVersions, version]
      return { created: true, version }
    },
    linkOpportunityVersionAnalysisRun: async (
      versionId: string,
      analysisRunId: string,
    ) => {
      linkedRuns.push({ versionId, analysisRunId })
    },
    saveOpportunityVersion: async (
      _scope: unknown,
      input: SaveOpportunityVersionInput,
    ) => {
      saveCalls.push(input)
      if (!saveOutcome.saved) return saveOutcome

      const version = storedVersions.find((one) => one.id === input.versionId)
      assert.ok(version, "the test asked to save a version that was never created")

      const saved: StoredVersion = {
        ...version,
        prioritization: input.prioritization,
        reviewState: input.reviewState,
        revision: version.revision + 1,
        lastModifiedByUserId: input.modifiedByUserId,
      }
      storedVersions = storedVersions.map((one) =>
        one.id === saved.id ? saved : one,
      )

      return { saved: true, version: saved }
    },
    getActiveOpportunityVersion: async (engagementId: string) =>
      storedVersions.find(
        (one) => one.engagementId === engagementId && one.status === "active",
      ) ?? null,
    getOpportunityVersions: async (engagementId: string) =>
      storedVersions.filter((one) => one.engagementId === engagementId),
  },
})

const {
  assessmentFingerprint,
  getOpportunityVersionState,
  prioritizeOpportunities,
  saveOpportunities,
} = await import("./opportunities.service.js")

const scope = { workspaceId: "ws_1", userId: "user_1", role: "ADMIN" as const }

const emptyDimension = (summary: string) => ({ summary, findings: [] })

const TRIAGE_FINDING_ID = "f_triage"
const DATA_FINDING_ID = "f_data"

const assessedAssessment: Assessment = {
  summary: "Support triage is manual.",
  dimensions: {
    businessProcess: {
      summary: "Triage is manual.",
      findings: [
        {
          id: TRIAGE_FINDING_ID,
          title: "Manual triage delays first response",
          detail: "Agents route every email by hand.",
          basis: "discovery_fact",
          supportingFacts: ["First response times are inconsistent."],
          assumptions: [],
          confidence: "medium",
        },
      ],
    },
    data: {
      summary: "Ticket data is split.",
      findings: [
        {
          id: DATA_FINDING_ID,
          title: "Ticket data is scattered across two systems",
          detail: "Two tools hold overlapping ticket records.",
          basis: "discovery_fact",
          supportingFacts: ["Email and live chat are separate."],
          assumptions: [],
          confidence: "medium",
        },
      ],
    },
    technology: emptyDimension("No tooling was recorded."),
    aiReadiness: emptyDimension("Readiness cannot yet be judged."),
    risks: emptyDimension("No risks are evidenced yet."),
    opportunities: emptyDimension("Triage is a candidate area."),
  },
  gaps: [],
}

const unassessedAssessment: Assessment = {
  summary: "Nothing could be assessed yet.",
  dimensions: {
    businessProcess: emptyDimension("Nothing recorded."),
    data: emptyDimension("Nothing recorded."),
    technology: emptyDimension("Nothing recorded."),
    aiReadiness: emptyDimension("Nothing recorded."),
    risks: emptyDimension("Nothing recorded."),
    opportunities: emptyDimension("Nothing recorded."),
  },
  gaps: [],
}

const unknownValue = (validationNote: string) => ({
  status: "unknown" as const,
  validationNote,
})

const successCriterion = (overrides: Record<string, unknown> = {}) => ({
  metric: "Median first response time",
  measurementMethod: "Read from the helpdesk's response-time report.",
  dataSource: "Helpdesk reporting",
  baseline: unknownValue("Ask the client for last quarter's median."),
  target: unknownValue("Agree a target once the baseline is known."),
  timeframe: unknownValue("Agree a review date with the client."),
  assumptions: [],
  ...overrides,
})

const opportunity = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  title: "Automate first-line triage",
  problem: "Manual triage delays first response.",
  improvement: "Route incoming requests by intent before an agent sees them.",
  sourceFindingIds: [TRIAGE_FINDING_ID],
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

const validOutput = (opportunities = [opportunity()]) =>
  JSON.stringify({
    summary: "Triage is where effort is best spent.",
    opportunities,
    gaps: ["Ticket volumes are unknown."],
  })

const llmResponse = (content: string): LlmResponse => ({
  content,
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  latencyMs: 1400,
  promptTokens: 1100,
  completionTokens: 700,
  totalTokens: 1800,
})

const engagementFixture = (
  overrides: Partial<EngagementWithOrganization> = {},
): EngagementWithOrganization =>
  ({
    id: "engagement_1",
    title: "Customer Operations review",
    department: "Customer Support",
    assessmentRevision: 1,
    organization: {
      name: "Northwind Support",
      industry: "Retail",
      companySize: "small",
      geography: "EU",
    },
    ...overrides,
  }) as unknown as EngagementWithOrganization

// The consultant's save shape: finding ids, and criteria they may have filled
// in from the client's own figures.
const submission = (
  overrides: Record<string, unknown> = {},
): Parameters<typeof saveOpportunities>[2]["prioritization"] =>
  ({
    summary: "Triage is where effort is best spent.",
    opportunities: [opportunity(overrides)],
    gaps: [],
  }) as unknown as Parameters<typeof saveOpportunities>[2]["prioritization"]

beforeEach(() => {
  // The stage runs against configured LLM settings; the provider itself is
  // replaced above, so nothing is called.
  process.env.LLM_PROVIDER = "groq"
  process.env.LLM_MODEL = "llama-3.3-70b-versatile"
  recordedRuns.length = 0
  linkedRuns.length = 0
  saveCalls.length = 0
  storedVersions = []
  createOutcome = "created"
  saveOutcome = { saved: true }
  llmCallCount = 0
  assessment = assessedAssessment
  llmCall = async () => llmResponse(validOutput())
})

// --- Generation creates a version ------------------------------------------

test("the first generation creates version 1 as an unreviewed AI draft", async () => {
  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(result.success, true)
  assert.equal(result.success && result.version.versionNumber, 1)
  assert.equal(result.success && result.version.status, "active")
  assert.equal(result.success && result.version.reviewState, "ai_draft")
  assert.equal(result.success && result.version.revision, 0)
})

test("a version records what it was generated from and who generated it", async () => {
  const result = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(result.success, true)
  if (!result.success) return

  assert.equal(result.version.sourceAssessmentRevision, 1)
  assert.equal(
    result.version.sourceAssessmentFingerprint,
    assessmentFingerprint(assessedAssessment),
  )
  assert.equal(result.version.createdByUserId, "user_1")
  assert.equal(result.version.analysisRunId, "run_1")
})

test("every generated version is linked to its Analysis Run", async () => {
  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(recordedRuns.length, 1)
  assert.deepEqual(linkedRuns, [
    { versionId: result.success ? result.version.id : "", analysisRunId: "run_1" },
  ])
})

test("re-running over consultant-edited work is refused without explicit replacement", async () => {
  const generated = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  storedVersions = storedVersions.map((version) =>
    version.id === generated.version.id
      ? { ...version, reviewState: "consultant_edited" as const }
      : version,
  )

  llmCallCount = 0
  recordedRuns.length = 0

  const refused = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(refused.success, false)
  assert.equal(
    refused.success === false && refused.failure,
    "consultant_edits_protected",
  )
  assert.equal(llmCallCount, 0)
  assert.equal(recordedRuns.length, 0)
})

test("explicit replacement allows regeneration over consultant-edited work", async () => {
  const generated = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  storedVersions = storedVersions.map((version) =>
    version.id === generated.version.id
      ? { ...version, reviewState: "consultant_edited" as const }
      : version,
  )

  const result = await prioritizeOpportunities(
    engagementFixture(),
    scope,
    { replaceConsultantEdits: true },
  )

  assert.equal(result.success, true)
  assert.equal(recordedRuns.length, 2)
  assert.equal(storedVersions.length, 2)
  assert.equal(storedVersions[0].status, "superseded")
  assert.equal(storedVersions[1].status, "active")
})

test("the stored version is in priority order", async () => {
  llmCall = async () =>
    llmResponse(
      validOutput([
        opportunity({
          title: "Consolidate ticket data",
          priorityRank: 2,
          sourceFindingIds: [DATA_FINDING_ID],
        }),
        opportunity({ title: "Automate first-line triage", priorityRank: 1 }),
      ]),
    )

  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.deepEqual(
    result.success
      ? result.version.prioritization.opportunities.map((one) => one.title)
      : [],
    ["Automate first-line triage", "Consolidate ticket data"],
  )
})

test("a prioritization records its Analysis Run with the stage's trust signals", async () => {
  await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(recordedRuns.length, 1)

  const run = recordedRuns[0]
  assert.equal(run.engagementId, "engagement_1")
  assert.equal(run.workspaceId, "ws_1")
  assert.equal(run.stage, "prioritization")
  assert.equal(run.provider, "groq")
  assert.equal(run.model, "llama-3.3-70b-versatile")
  assert.equal(run.promptVersion, "opportunities-v2")
  assert.equal(typeof run.promptFingerprint, "string")
  assert.equal(run.promptFingerprint!.length > 0, true)
  assert.equal(run.latencyMs, 1400)
  assert.equal(run.totalTokens, 1800)
  assert.equal(typeof run.costEstimateUsd, "number")
  assert.equal(run.jsonParseSuccess, true)
  assert.equal(run.schemaValid, true)
  assert.equal(run.errorMessage, undefined)
})

// --- Regeneration adds; it never overwrites --------------------------------

test("regenerating creates the next version and leaves the previous one exactly as it was", async () => {
  const first = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(first.success, true)
  if (!first.success) return

  const before = structuredClone(
    storedVersions.find((one) => one.id === first.version.id),
  )

  llmCall = async () =>
    llmResponse(
      validOutput([
        opportunity({
          title: "Consolidate ticket data",
          priorityRank: 1,
          sourceFindingIds: [DATA_FINDING_ID],
        }),
      ]),
    )

  const second = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(second.success, true)
  if (!second.success) return

  assert.equal(second.version.versionNumber, 2)
  assert.equal(second.version.status, "active")
  assert.notEqual(second.version.id, first.version.id)

  // Version 1 is still there, still says what it said, and is no longer the one
  // being worked on.
  const after = storedVersions.find((one) => one.id === first.version.id)
  assert.ok(after)
  assert.equal(after.status, "superseded")
  assert.deepEqual(after.prioritization, before?.prioritization)
  assert.deepEqual(
    after.prioritization.opportunities.map((one) => one.title),
    ["Automate first-line triage"],
  )
  assert.equal(after.sourceAssessmentFingerprint, before?.sourceAssessmentFingerprint)
})

test("two regenerations racing each other do not both win", async () => {
  createOutcome = "version_conflict"

  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "version_conflict")
  assert.equal(storedVersions.length, 0)
  // The lost race belongs on the run, like any other failed outcome.
  assert.equal(recordedRuns.length, 1)
  assert.match(String(recordedRuns[0].errorMessage), /same time/)
})

test("a generation that cannot be stored leaves the previous version active", async () => {
  const first = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(first.success, true)

  createOutcome = "throws"
  const second = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(second.success, false)
  assert.equal(second.success === false && second.failure, "persistence_failed")
  assert.equal(storedVersions.length, 1)
  assert.equal(storedVersions[0].status, "active")
  assert.equal(recordedRuns.length, 2)
  assert.match(String(recordedRuns[1].errorMessage), /could not be stored/)
})

// --- Failure paths ---------------------------------------------------------

test("unusable AI output creates no version but still records the run", async () => {
  llmCall = async () => llmResponse("Here are the opportunities you asked for:")

  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_output_invalid")
  assert.equal(storedVersions.length, 0)
  assert.equal(recordedRuns.length, 1)
  assert.equal(recordedRuns[0].jsonParseSuccess, false)
  assert.equal(typeof recordedRuns[0].errorMessage, "string")
})

test("AI output that breaks the Opportunity contract creates no version", async () => {
  // A ranking with a duplicate is not a prioritization.
  llmCall = async () =>
    llmResponse(
      validOutput([
        opportunity({ priorityRank: 1 }),
        opportunity({ title: "Consolidate ticket data", priorityRank: 1 }),
      ]),
    )

  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(storedVersions.length, 0)
  assert.equal(recordedRuns[0].jsonParseSuccess, true)
  assert.equal(recordedRuns[0].schemaValid, false)
})

test("AI output supplying a baseline figure is refused by the contract", async () => {
  // The model proposes what to measure; it never supplies the number
  // (agent-rules.md §2A.5).
  llmCall = async () =>
    llmResponse(
      validOutput([
        opportunity({
          successCriteria: [
            successCriterion({
              baseline: {
                status: "known",
                value: "18 hours",
                source: "industry benchmark",
              },
            }),
          ],
        }),
      ]),
    )

  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_output_invalid")
  assert.equal(storedVersions.length, 0)
})

test("an Opportunity citing a finding the Assessment does not contain is refused", async () => {
  llmCall = async () =>
    llmResponse(validOutput([opportunity({ sourceFindingIds: ["f_invented"] })]))

  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_output_ungrounded")
  assert.deepEqual(
    result.success === false ? result.unknownFindingIds : undefined,
    ["f_invented"],
  )
  assert.equal(storedVersions.length, 0)

  // Fabricated grounding is a broken contract, and the run says so.
  assert.equal(recordedRuns.length, 1)
  assert.equal(recordedRuns[0].jsonParseSuccess, true)
  assert.equal(recordedRuns[0].schemaValid, false)
  assert.match(String(recordedRuns[0].errorMessage), /f_invented/)
})

test("a provider failure is recorded as a run and creates no version", async () => {
  llmCall = async () => {
    throw new Error("provider unavailable")
  }

  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_step_failed")
  assert.equal(storedVersions.length, 0)
  assert.equal(recordedRuns.length, 1)
  assert.equal(recordedRuns[0].stage, "prioritization")
  assert.equal(recordedRuns[0].errorMessage, "provider unavailable")
})

test("an engagement with no Assessment is refused before any AI call is made", async () => {
  assessment = null

  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "assessment_not_ready")
  assert.equal(llmCallCount, 0)
  assert.equal(recordedRuns.length, 0)
  assert.equal(storedVersions.length, 0)
})

test("an Assessment that found nothing is refused before any AI call is made", async () => {
  assessment = unassessedAssessment

  const result = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "assessment_not_ready")
  assert.equal(llmCallCount, 0)
})

test("no refusal carries user-facing prose", async () => {
  // The server names an outcome; the frontend renders it in the user's
  // language (coding-standards.md §12A).
  assessment = null
  const refused = await prioritizeOpportunities(engagementFixture(), scope)

  assert.equal(
    refused.success === false && refused.messageId,
    "opportunity.error.assessment_not_ready",
  )
})

// --- Saving into the active version ----------------------------------------

test("saving edits the active version rather than creating one", async () => {
  const generated = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  const saved = await saveOpportunities(engagementFixture(), scope, {
    versionId: generated.version.id,
    expectedRevision: 0,
    prioritization: submission({ title: "Automate triage, revised" }),
    reviewState: "consultant_edited",
  })

  assert.equal(saved.success, true)
  assert.equal(storedVersions.length, 1)
  assert.equal(saved.success && saved.version.versionNumber, 1)
  assert.equal(saved.success && saved.version.reviewState, "consultant_edited")
  // The revision moves with every save, which is what a later save is checked
  // against.
  assert.equal(saved.success && saved.version.revision, 1)
})

test("a save carries the revision it read, so a stale one can be refused", async () => {
  const generated = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  await saveOpportunities(engagementFixture(), scope, {
    versionId: generated.version.id,
    expectedRevision: 0,
    prioritization: submission(),
    reviewState: "consultant_edited",
  })

  assert.deepEqual(
    saveCalls.map((call) => call.expectedRevision),
    [0],
  )
  assert.equal(saveCalls[0].modifiedByUserId, "user_1")
})

test("a save that lost a race is refused with the revision to re-read", async () => {
  saveOutcome = { saved: false, reason: "stale_update", currentRevision: 4 }

  const result = await saveOpportunities(engagementFixture(), scope, {
    versionId: "version_1",
    expectedRevision: 2,
    prioritization: submission(),
    reviewState: "consultant_edited",
  })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "stale_update")
  assert.equal(result.success === false && result.currentRevision, 4)
  assert.equal(
    result.success === false && result.messageId,
    "opportunity.error.stale_update",
  )
})

test("a save aimed at a preserved version is refused", async () => {
  saveOutcome = { saved: false, reason: "historical_version_readonly" }

  const result = await saveOpportunities(engagementFixture(), scope, {
    versionId: "version_1",
    expectedRevision: 0,
    prioritization: submission(),
    reviewState: "consultant_edited",
  })

  assert.equal(result.success, false)
  assert.equal(
    result.success === false && result.failure,
    "historical_version_readonly",
  )
})

test("the consultant's citations are checked against the Assessment too", async () => {
  const result = await saveOpportunities(engagementFixture(), scope, {
    versionId: "version_1",
    expectedRevision: 0,
    prioritization: submission({ sourceFindingIds: ["f_deleted"] }),
    reviewState: "consultant_edited",
  })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_output_ungrounded")
  assert.deepEqual(
    result.success === false ? result.unknownFindingIds : undefined,
    ["f_deleted"],
  )
  // Nothing reached the store.
  assert.equal(saveCalls.length, 0)
})

test("placeholder success criteria are refused before saving", async () => {
  const generated = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  const result = await saveOpportunities(engagementFixture(), scope, {
    versionId: generated.version.id,
    expectedRevision: 0,
    prioritization: submission({
      successCriteria: [
        {
          metric: "Zu definieren",
          measurementMethod: "Zu definieren",
          dataSource: "Zu definieren",
          baseline: unknownValue("Zu definieren"),
          target: unknownValue("Zu definieren"),
          timeframe: unknownValue("Zu definieren"),
          assumptions: [],
        },
      ],
    }),
    reviewState: "consultant_edited",
  })

  assert.equal(result.success, false)
  assert.equal(
    result.success === false && result.failure,
    "success_criteria_placeholder",
  )
  assert.equal(saveCalls.length, 0)
})

test("the consultant's manual ordering is what gets stored", async () => {
  const generated = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  const reordered = {
    summary: "Data first, after all.",
    opportunities: [
      opportunity({ title: "Automate first-line triage", priorityRank: 2 }),
      opportunity({
        title: "Consolidate ticket data",
        priorityRank: 1,
        sourceFindingIds: [DATA_FINDING_ID],
      }),
    ],
    gaps: [],
  } as unknown as Parameters<typeof saveOpportunities>[2]["prioritization"]

  const saved = await saveOpportunities(engagementFixture(), scope, {
    versionId: generated.version.id,
    expectedRevision: 0,
    prioritization: reordered,
    reviewState: "consultant_edited",
  })

  assert.deepEqual(
    saved.success
      ? saved.version.prioritization.opportunities.map((one) => one.title)
      : [],
    ["Consolidate ticket data", "Automate first-line triage"],
  )
})

// --- Staleness -------------------------------------------------------------

test("the active version is not stale while the Assessment is unchanged", async () => {
  await prioritizeOpportunities(engagementFixture(), scope)

  const state = await getOpportunityVersionState(engagementFixture(), scope)

  assert.equal(state.stale, false)
  assert.equal(state.activeVersion?.versionNumber, 1)
  assert.equal(state.currentAssessmentRevision, 1)
})

test("editing the Assessment marks the active version stale without changing it", async () => {
  const generated = await prioritizeOpportunities(engagementFixture(), scope)
  assert.equal(generated.success, true)
  if (!generated.success) return

  const storedBefore = structuredClone(storedVersions[0])

  assessment = {
    ...assessedAssessment,
    summary: "Support triage is manual, and escalations are missed.",
  }

  const state = await getOpportunityVersionState(
    engagementFixture({ assessmentRevision: 2 } as Partial<EngagementWithOrganization>),
    scope,
  )

  assert.equal(state.stale, true)
  assert.equal(state.currentAssessmentRevision, 2)
  // Recognizing staleness changes nothing: the version still says exactly what
  // it said (agent-rules.md §15).
  assert.deepEqual(storedVersions[0], storedBefore)
})

test("an engagement with no version yet is not stale", async () => {
  const state = await getOpportunityVersionState(engagementFixture(), scope)

  assert.equal(state.activeVersion, null)
  assert.equal(state.stale, false)
})
