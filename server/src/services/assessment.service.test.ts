import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"

import {
  compliancePolicyRepositoryMock,
  compliancePolicyRowFixture,
} from "../domain/compliance/compliance-policy.fixture.js"

import type { Assessment } from "../../../shared/assessment.schema.js"
import { emptyValueMeasurementBaseline } from "../../../shared/discovery-profile.schema.js"
import type { DiscoveryProfile } from "../../../shared/discovery-profile.schema.js"
import type { LlmResponse } from "../lib/llm-client.js"
import { getDefaultLlmConfig } from "../lib/llm-config.js"
import { calculateLlmCost } from "../evaluation/calculate-llm-cost.js"
import type { CreateAnalysisRunInput } from "../repositories/analysis-run.repository.js"
import type { EngagementWithOrganization } from "../repositories/engagement.repository.js"

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
// orchestration can be exercised without a database, a provider, or a live
// model (coding-standards.md §9 "determinism in tests").

let llmCall: () => Promise<LlmResponse>
let llmCallCount = 0
// What the stage actually sent, so the prompt's contents can be asserted on.
let lastPrompt = ""
let discoveryProfile: DiscoveryProfile
const recordedRuns: CreateAnalysisRunInput[] = []
const savedAssessments: {
  engagementId: string
  assessment: Assessment
  reviewState: string
}[] = []

mock.module("../lib/llm-client.js", {
  namedExports: {
    callLlm: async (prompt: string) => {
      llmCallCount += 1
      lastPrompt = prompt
      return llmCall()
    },
  },
})

mock.module("../repositories/engagement.repository.js", {
  namedExports: {
    // The compliance repository derives its reach filter from this same rule,
    // so the mock provides it too (roadmap Phase 10).
    engagementScopeWhere: () => ({}),
    toDiscoveryProfile: () => discoveryProfile,
    toAssessment: () => null,
    updateEngagementAssessment: async (
      engagementId: string,
      _scope: unknown,
      assessment: Assessment,
      reviewState: string,
    ) => {
      savedAssessments.push({ engagementId, assessment, reviewState })
      return {}
    },
  },
})

// One curated entry, so the stage retrieves a real package without a database.
// The domain's retrieval runs for real; only the storage seam is replaced.
const KNOWLEDGE_ENTRY = {
  code: "customer-operations-readiness-framework",
  kind: "assessment_framework" as const,
  domainCode: "customer-operations",
  title: "Customer-Operations-Readiness Framework",
  summary: "Ein deterministischer Bewertungsrahmen.",
  tags: [],
  matchTerms: [],
  stageScopes: ["assessment" as const],
  taxonomyCodes: [],
  processCodes: [],
  problemCodes: [],
  useCaseCodes: [],
  relatedCodes: [],
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
  sortOrder: 7,
  active: true,
  revision: 0,
}

mock.module("../repositories/consulting-knowledge.repository.js", {
  namedExports: {
    ensureConsultingKnowledgeSeeded: async () => {},
    listConsultingKnowledgeEntries: async () => [KNOWLEDGE_ENTRY],
    getConsultingKnowledgeEntryByCode: async () => null,
    // Running a stage must never reach a knowledge write path
    // (architecture.md §9.4; agent-rules.md §4).
    createConsultingKnowledgeEntry: async () => {
      throw new Error("an engagement stage wrote to the Consulting Knowledge Base")
    },
    updateConsultingKnowledgeEntry: async () => {
      throw new Error("an engagement stage wrote to the Consulting Knowledge Base")
    },
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
      return { id: "run_1" }
    },
  },
})

const { generateAssessment } = await import("./assessment.service.js")
const scope = { workspaceId: "ws_1", userId: "user_1", role: "ADMIN" as const }

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
  model: configuredLlm.model,
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
    // The engagement's own compliance state, which the AI compliance gate reads
    // before anything may be sent (roadmap Phase 10).
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

beforeEach(() => {
  // The stage runs against configured LLM settings; the provider itself is
  // replaced above, so nothing is called.
  process.env.LLM_PROVIDER = configuredLlm.provider
  process.env.LLM_MODEL = configuredLlm.model
  recordedRuns.length = 0
  savedAssessments.length = 0
  llmCallCount = 0
  complianceAuditEntries.length = 0
  compliancePolicyRow = compliancePolicyRowFixture()
  discoveryProfile = capturedDiscoveryProfile
  llmCall = async () => llmResponse(validAssessmentOutput)
})

test("a generated Assessment is persisted as an unreviewed AI draft", async () => {
  const result = await generateAssessment(engagementFixture(), scope, { replaceConsultantEdits: false })

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
  await generateAssessment(engagementFixture(), scope, { replaceConsultantEdits: false })

  assert.equal(recordedRuns.length, 1)

  const run = recordedRuns[0]
  assert.equal(run.engagementId, "engagement_1")
  assert.equal(run.stage, "assessment")
  assert.equal(run.provider, "groq")
  assert.equal(run.model, configuredLlm.model)
  assert.equal(run.promptVersion, "assessment-v1")
  assert.equal(typeof run.promptFingerprint, "string")
  assert.equal(run.promptFingerprint.length > 0, true)
  assert.equal(run.latencyMs, 1200)
  assert.equal(run.totalTokens, 1500)
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
  // The curated entries the run was grounded in, by code and in package order
  // (roadmap Phase 5 traceability).
  assert.deepEqual(run.knowledgeEntryCodes, [
    "customer-operations-readiness-framework",
  ])
  assert.equal(run.errorMessage, undefined)
})

test("unusable AI output leaves the Assessment untouched but still records the run", async () => {
  llmCall = async () => llmResponse("Here is the assessment you asked for:")

  const result = await generateAssessment(engagementFixture(), scope, { replaceConsultantEdits: false })

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

  const result = await generateAssessment(engagementFixture(), scope, { replaceConsultantEdits: false })

  assert.equal(result.success, false)
  assert.equal(savedAssessments.length, 0)
  assert.equal(recordedRuns[0].jsonParseSuccess, true)
  assert.equal(recordedRuns[0].schemaValid, false)
})

test("a provider failure is recorded as a run and changes no engagement state", async () => {
  llmCall = async () => {
    throw new Error("provider unavailable")
  }

  const result = await generateAssessment(engagementFixture(), scope, { replaceConsultantEdits: false })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_step_failed")
  assert.equal(savedAssessments.length, 0)
  assert.equal(recordedRuns.length, 1)
  assert.equal(recordedRuns[0].stage, "assessment")
  assert.equal(recordedRuns[0].errorMessage, "provider unavailable")
  // What the model was *given* belongs to the audit trail whether or not it
  // answered (coding-standards.md §7 "the audit trail survives failure").
  assert.deepEqual(recordedRuns[0].knowledgeEntryCodes, [
    "customer-operations-readiness-framework",
  ])
})

test("the Assessment prompt carries only the retrieved package, not the knowledge base", async () => {
  llmCall = async () => llmResponse(validAssessmentOutput)

  await generateAssessment(engagementFixture(), scope, { replaceConsultantEdits: false })

  assert.ok(
    lastPrompt.includes("customer-operations-readiness-framework"),
    "the retrieved entry did not reach the prompt",
  )
  // One entry was retrieved, so its code may appear exactly once. A prompt
  // carrying more than the package would repeat or exceed it.
  assert.equal(
    lastPrompt.split("customer-operations-readiness-framework").length - 1,
    1,
  )
})

test("an empty Discovery Profile is refused before any AI call is made", async () => {
  discoveryProfile = emptyDiscoveryProfile

  const result = await generateAssessment(engagementFixture(), scope, { replaceConsultantEdits: false })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "discovery_not_ready")
  assert.equal(llmCallCount, 0)
  assert.equal(recordedRuns.length, 0)
  assert.equal(savedAssessments.length, 0)
})

test("an engagement that prohibits AI is refused before any provider call", async () => {
  // The engagement's own restriction is enforced by the stage, not merely
  // recorded on it: no prompt leaves, no Analysis Run is written because
  // nothing ran, and the Assessment is untouched (roadmap Phase 10).
  const result = await generateAssessment(
    engagementFixture({ aiProcessingPermission: "prohibited" } as never),
    scope,
    { replaceConsultantEdits: false },
  )

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "ai_not_permitted")
  assert.equal(
    result.success === false && result.messageId,
    "compliance.ai.denied.engagement_ai_processing_prohibited",
  )
  assert.equal(llmCallCount, 0)
  assert.equal(recordedRuns.length, 0)
  assert.equal(savedAssessments.length, 0)

  // And the refusal is a denied AI request in the append-only Audit Trail,
  // which is where the roadmap puts it.
  assert.equal(
    complianceAuditEntries.some(
      (entry) => entry.eventType === "ai_request_denied",
    ),
    true,
  )
})

test("an unapproved model is refused, and the refusal names that rule", async () => {
  process.env.LLM_MODEL = "some-other-model"

  try {
    const result = await generateAssessment(engagementFixture(), scope, {
      replaceConsultantEdits: false,
    })

    assert.equal(result.success === false && result.failure, "ai_not_permitted")
    assert.equal(
      result.success === false && result.messageId,
      "compliance.ai.denied.provider_model_not_approved",
    )
    assert.equal(llmCallCount, 0)
  } finally {
    process.env.LLM_MODEL = configuredLlm.model
  }
})

test("the prompt that is sent is the one the compliance gate returned", async () => {
  // Personal data is removed before AI processing where the policy requires it,
  // and what the provider receives is the redacted text — never the original
  // (roadmap Phase 10 Definition of Done).
  discoveryProfile = {
    ...capturedDiscoveryProfile,
    statedProblem: "Anfragen an support@nordwind.example bleiben liegen.",
  }

  await generateAssessment(engagementFixture(), scope, {
    replaceConsultantEdits: false,
  })

  assert.equal(llmCallCount, 1)
  assert.equal(lastPrompt.includes("support@nordwind.example"), false)
  assert.equal(lastPrompt.includes("[EMAIL_1]"), true)

  // And the run records what was done about it.
  assert.equal(recordedRuns[0].compliance?.piiRedactionStatus, "applied")
  assert.equal(recordedRuns[0].compliance?.purpose, "assessment_generation")
  assert.equal(recordedRuns[0].compliance?.inputClassification, "internal")
  assert.equal(recordedRuns[0].compliance?.outputScanOutcome, "clean")
  assert.equal(recordedRuns[0].compliance?.outputClassification, "internal")
  assert.equal(recordedRuns[0].compliance?.humanReviewStatus, "pending")
})

test("AI output containing recognized PII is rejected before Assessment persistence", async () => {
  llmCall = async () =>
    llmResponse(
      validAssessmentOutput.replace(
        "Support triage is manual.",
        "Contact support@nordwind.example before changing triage.",
      ),
    )

  const result = await generateAssessment(engagementFixture(), scope, {
    replaceConsultantEdits: false,
  })

  assert.equal(result.success, false)
  assert.equal(
    result.success === false && result.messageId,
    "compliance.ai.output_rejected.output_personal_data_detected",
  )
  assert.equal(savedAssessments.length, 0)
  assert.equal(recordedRuns[0].compliance?.outputScanOutcome, "personal_data_detected")
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

test("a re-run never silently replaces the consultant's own Assessment", async () => {
  const result = await generateAssessment(engagementFixture({ assessmentReviewState: "consultant_edited" }), scope, { replaceConsultantEdits: false })

  assert.equal(result.success, false)
  assert.equal(
    result.success === false && result.failure,
    "consultant_edits_protected",
  )
  assert.equal(llmCallCount, 0)
  assert.equal(savedAssessments.length, 0)
})

test("the consultant can explicitly regenerate over an accepted Assessment", async () => {
  const result = await generateAssessment(engagementFixture({ assessmentReviewState: "accepted" }), scope, { replaceConsultantEdits: true })

  assert.equal(result.success, true)
  assert.equal(savedAssessments.length, 1)
  assert.equal(savedAssessments[0].reviewState, "ai_draft")
})
