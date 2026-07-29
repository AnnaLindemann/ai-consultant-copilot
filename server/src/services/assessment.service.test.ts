import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"

import type { Assessment } from "../../../shared/assessment.schema.js"
import { emptyValueMeasurementBaseline } from "../../../shared/discovery-profile.schema.js"
import type { DiscoveryProfile } from "../../../shared/discovery-profile.schema.js"
import type { LlmResponse } from "../lib/llm-client.js"
import type { CreateAnalysisRunInput } from "../repositories/analysis-run.repository.js"
import type { EngagementWithOrganization } from "../repositories/engagement.repository.js"

// The stage's infrastructure is replaced at its module seams so the
// orchestration can be exercised without a database, a provider, or a live
// model (coding-standards.md §9 "determinism in tests").

let llmCall: () => Promise<LlmResponse>
let llmCallCount = 0
let discoveryProfile: DiscoveryProfile
const recordedRuns: CreateAnalysisRunInput[] = []
const savedAssessments: {
  engagementId: string
  assessment: Assessment
  reviewState: string
}[] = []

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
    toDiscoveryProfile: () => discoveryProfile,
    updateEngagementAssessment: async (
      engagementId: string,
      assessment: Assessment,
      reviewState: string,
    ) => {
      savedAssessments.push({ engagementId, assessment, reviewState })
      return {}
    },
  },
})

mock.module("../repositories/analysis-run.repository.js", {
  namedExports: {
    createAnalysisRun: async (input: CreateAnalysisRunInput) => {
      recordedRuns.push(input)
      return { id: "run_1" }
    },
  },
})

const { generateAssessment } = await import("./assessment.service.js")

const emptyDiscoveryProfile: DiscoveryProfile = {
  department: null,
  statedProblem: null,
  painPoints: [],
  affectedUsers: [],
  businessImpact: null,
  urgency: null,
  currentProcess: null,
  processSteps: [],
  processFrequency: null,
  manualWorkLevel: null,
  bottlenecks: [],
  currentTools: [],
  communicationChannels: [],
  integrationNeeds: [],
  dataTypes: [],
  dataLocation: [],
  dataAvailability: null,
  dataQuality: null,
  sensitiveData: null,
  sensitiveDataTypes: [],
  gdprConcerns: null,
  budgetAmount: null,
  budgetCurrency: null,
  budgetNotes: null,
  timeline: null,
  humanApprovalRequired: null,
  technicalConstraints: [],
  desiredOutcome: null,
  successMetrics: [],
  mvpScope: null,
  notes: null,
  valueMeasurementBaseline: emptyValueMeasurementBaseline(),
  missingInformation: [],
}

const capturedDiscoveryProfile: DiscoveryProfile = {
  ...emptyDiscoveryProfile,
  department: "Customer Support",
  statedProblem: "First response times are inconsistent.",
  communicationChannels: ["Email", "Live chat"],
}

const dimension = (summary: string) => ({ summary, findings: [] })

const validAssessmentOutput = JSON.stringify({
  summary: "Support triage is manual.",
  dimensions: {
    businessProcess: {
      summary: "Triage is manual.",
      findings: [
        {
          title: "Manual triage delays first response",
          detail: "Agents route every email by hand.",
          basis: "discovery_fact",
          supportingFacts: ["First response times are inconsistent."],
          assumptions: [],
          confidence: "medium",
        },
      ],
    },
    data: dimension("Ticket data was not described."),
    technology: dimension("No tooling was recorded."),
    aiReadiness: dimension("Readiness cannot yet be judged."),
    risks: dimension("No risks are evidenced yet."),
    opportunities: dimension("Triage is a candidate area."),
  },
  gaps: [{ dimension: "data", description: "Ticket volumes are unknown." }],
})

const llmResponse = (content: string): LlmResponse => ({
  content,
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  latencyMs: 1200,
  promptTokens: 900,
  completionTokens: 600,
  totalTokens: 1500,
})

const engagementFixture = (
  overrides: Partial<EngagementWithOrganization> = {},
): EngagementWithOrganization =>
  ({
    id: "engagement_1",
    title: "Customer Operations review",
    department: "Customer Support",
    assessmentReviewState: null,
    organization: {
      name: "Northwind Support",
      industry: "Retail",
      companySize: "small",
      geography: "EU",
    },
    ...overrides,
  }) as unknown as EngagementWithOrganization

beforeEach(() => {
  // The stage runs against configured LLM settings; the provider itself is
  // replaced above, so nothing is called.
  process.env.LLM_PROVIDER = "groq"
  process.env.LLM_MODEL = "llama-3.3-70b-versatile"
  recordedRuns.length = 0
  savedAssessments.length = 0
  llmCallCount = 0
  discoveryProfile = capturedDiscoveryProfile
  llmCall = async () => llmResponse(validAssessmentOutput)
})

test("a generated Assessment is persisted as an unreviewed AI draft", async () => {
  const result = await generateAssessment(engagementFixture(), {
    replaceConsultantEdits: false,
  })

  assert.equal(result.success, true)
  assert.equal(savedAssessments.length, 1)
  assert.equal(savedAssessments[0].reviewState, "ai_draft")
  assert.equal(savedAssessments[0].engagementId, "engagement_1")
  assert.equal(
    savedAssessments[0].assessment.dimensions.businessProcess.findings[0].basis,
    "discovery_fact",
  )
})

test("a generated Assessment records its Analysis Run with the stage's trust signals", async () => {
  await generateAssessment(engagementFixture(), {
    replaceConsultantEdits: false,
  })

  assert.equal(recordedRuns.length, 1)

  const run = recordedRuns[0]
  assert.equal(run.engagementId, "engagement_1")
  assert.equal(run.stage, "assessment")
  assert.equal(run.provider, "groq")
  assert.equal(run.model, "llama-3.3-70b-versatile")
  assert.equal(run.promptVersion, "assessment-v1")
  assert.equal(typeof run.promptFingerprint, "string")
  assert.equal(run.promptFingerprint.length > 0, true)
  assert.equal(run.latencyMs, 1200)
  assert.equal(run.totalTokens, 1500)
  assert.equal(typeof run.costEstimateUsd, "number")
  assert.equal(run.jsonParseSuccess, true)
  assert.equal(run.schemaValid, true)
  assert.equal(run.errorMessage, undefined)
})

test("unusable AI output leaves the Assessment untouched but still records the run", async () => {
  llmCall = async () => llmResponse("Here is the assessment you asked for:")

  const result = await generateAssessment(engagementFixture(), {
    replaceConsultantEdits: false,
  })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_output_invalid")
  assert.equal(savedAssessments.length, 0)
  assert.equal(recordedRuns.length, 1)
  assert.equal(recordedRuns[0].jsonParseSuccess, false)
  assert.equal(typeof recordedRuns[0].errorMessage, "string")
})

test("AI output that breaks the Assessment contract is not persisted", async () => {
  llmCall = async () =>
    llmResponse(JSON.stringify({ summary: "Looks fine.", dimensions: {} }))

  const result = await generateAssessment(engagementFixture(), {
    replaceConsultantEdits: false,
  })

  assert.equal(result.success, false)
  assert.equal(savedAssessments.length, 0)
  assert.equal(recordedRuns[0].jsonParseSuccess, true)
  assert.equal(recordedRuns[0].schemaValid, false)
})

test("a provider failure is recorded as a run and changes no engagement state", async () => {
  llmCall = async () => {
    throw new Error("provider unavailable")
  }

  const result = await generateAssessment(engagementFixture(), {
    replaceConsultantEdits: false,
  })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_step_failed")
  assert.equal(savedAssessments.length, 0)
  assert.equal(recordedRuns.length, 1)
  assert.equal(recordedRuns[0].stage, "assessment")
  assert.equal(recordedRuns[0].errorMessage, "provider unavailable")
})

test("an empty Discovery Profile is refused before any AI call is made", async () => {
  discoveryProfile = emptyDiscoveryProfile

  const result = await generateAssessment(engagementFixture(), {
    replaceConsultantEdits: false,
  })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "discovery_not_ready")
  assert.equal(llmCallCount, 0)
  assert.equal(recordedRuns.length, 0)
  assert.equal(savedAssessments.length, 0)
})

test("a re-run never silently replaces the consultant's own Assessment", async () => {
  const result = await generateAssessment(
    engagementFixture({ assessmentReviewState: "consultant_edited" }),
    { replaceConsultantEdits: false },
  )

  assert.equal(result.success, false)
  assert.equal(
    result.success === false && result.failure,
    "consultant_edits_protected",
  )
  assert.equal(llmCallCount, 0)
  assert.equal(savedAssessments.length, 0)
})

test("the consultant can explicitly regenerate over an accepted Assessment", async () => {
  const result = await generateAssessment(
    engagementFixture({ assessmentReviewState: "accepted" }),
    { replaceConsultantEdits: true },
  )

  assert.equal(result.success, true)
  assert.equal(savedAssessments.length, 1)
  assert.equal(savedAssessments[0].reviewState, "ai_draft")
})
