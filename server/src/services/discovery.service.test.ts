import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"

import {
  emptyValueMeasurementBaseline,
  type DiscoveryProfile,
  type ValueMeasurementBaseline,
} from "../../../shared/discovery-profile.schema.js"
import {
  emptyDiscoveryContentProvenance,
  type DiscoveryContentProvenance,
  type DiscoveryStatus,
  type DiscoveryWorkflowState,
} from "../../../shared/discovery-workflow.schema.js"
import { isDiscoveryMessageId } from "../../../shared/discovery-messages.js"
import type { EngagementWithOrganization } from "../repositories/engagement.repository.js"

// Persistence is replaced at its module seam so the stage's orchestration can be
// exercised without a database (coding-standards.md §9).

let persistedProfile: DiscoveryProfile
let persistedWorkflow: DiscoveryWorkflowState

const discoveryWrites: {
  profile: DiscoveryProfile
  workflow: { status: DiscoveryStatus; contentProvenance: DiscoveryContentProvenance }
}[] = []

const workflowWrites: {
  status: DiscoveryStatus
  submittedBy?: string
  submittedAt?: Date
  reviewedAt?: Date
  returnNotes?: string
}[] = []

mock.module("../repositories/engagement.repository.js", {
  namedExports: {
    toDiscoveryProfile: () => persistedProfile,
    toDiscoveryWorkflowState: () => persistedWorkflow,
    updateEngagementDiscovery: async (
      _id: string,
      profile: DiscoveryProfile,
      workflow: {
        status: DiscoveryStatus
        contentProvenance: DiscoveryContentProvenance
      },
    ) => {
      discoveryWrites.push({ profile, workflow })
      return {}
    },
    updateEngagementDiscoveryWorkflow: async (
      _id: string,
      workflow: { status: DiscoveryStatus },
    ) => {
      workflowWrites.push(workflow)
      return {}
    },
  },
})

const { saveDiscoveryProfile, transitionDiscovery } = await import(
  "./discovery.service.js"
)

const engagement = { id: "eng_1" } as unknown as EngagementWithOrganization

const emptyProfile: DiscoveryProfile = {
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

// Every baseline subject either answered or recorded as a gap with its reason.
const explainedBaseline = (): ValueMeasurementBaseline => ({
  ...emptyValueMeasurementBaseline(),
  baselineMetrics: [
    {
      name: "First response time",
      current: {
        value: "12 minutes",
        basis: "measured",
        measurementMethod: "Help desk report, monthly average",
        dataSource: { kind: "system", detail: "Zendesk" },
      },
      notes: null,
    },
  ],
  measurementGaps: [
    { subject: "business_impact", reason: "not_measured", description: null },
    { subject: "error_frequency", reason: "not_measured", description: null },
    { subject: "error_severity", reason: "unknown", description: null },
    { subject: "error_cost", reason: "not_available", description: null },
    { subject: "existing_kpis", reason: "not_measured", description: null },
    {
      subject: "target_success_metrics",
      reason: "unknown",
      description: "The client has not agreed a target yet.",
    },
  ],
})

const workflowState = (
  status: DiscoveryStatus,
  contentProvenance: DiscoveryContentProvenance = emptyDiscoveryContentProvenance(),
): DiscoveryWorkflowState => ({
  status,
  submittedAt: null,
  submittedBy: null,
  reviewedAt: null,
  returnNotes: null,
  contentProvenance,
})

beforeEach(() => {
  persistedProfile = emptyProfile
  persistedWorkflow = workflowState("draft")
  discoveryWrites.length = 0
  workflowWrites.length = 0
})

test("a client's contribution is attributed to them and returns discovery to draft", async () => {
  persistedWorkflow = workflowState("accepted")

  await saveDiscoveryProfile(
    engagement,
    { ...emptyProfile, dataTypes: ["Tickets"] },
    "client",
  )

  assert.equal(discoveryWrites.length, 1)
  assert.equal(discoveryWrites[0].workflow.status, "draft")
  assert.equal(
    discoveryWrites[0].workflow.contentProvenance.data,
    "client_provided",
  )
})

test("a consultant save keeps the client's attribution on content they did not touch", async () => {
  persistedProfile = { ...emptyProfile, dataTypes: ["Tickets"] }
  persistedWorkflow = workflowState("draft", {
    ...emptyDiscoveryContentProvenance(),
    data: "client_provided",
  })

  await saveDiscoveryProfile(
    engagement,
    { ...persistedProfile, gdprConcerns: true },
    "consultant",
  )

  assert.equal(
    discoveryWrites[0].workflow.contentProvenance.data,
    "client_provided",
  )
  assert.equal(
    discoveryWrites[0].workflow.contentProvenance.constraints,
    "consultant_captured",
  )
})

test("discovery cannot be submitted while part of the baseline is silently empty", async () => {
  const result = await transitionDiscovery(engagement, {
    transition: "submit",
    actor: "client",
  })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "baseline_not_explained")
  // The refusal names itself with an identifier and parameters, never prose.
  assert.equal(
    result.success === false && result.messageId,
    "discovery.error.baseline_not_explained",
  )
  assert.deepEqual(
    result.success === false && result.messageParams,
    { subjectCount: "7" },
  )
  assert.deepEqual(
    result.success === false && result.unexplainedBaselineSubjects,
    [
      "business_impact",
      "error_frequency",
      "error_severity",
      "error_cost",
      "existing_kpis",
      "baseline_metrics",
      "target_success_metrics",
    ],
  )
  assert.equal(workflowWrites.length, 0, "a refused submission changes nothing")
})

test("a submission records who submitted it and touches no discovery content", async () => {
  persistedProfile = {
    ...emptyProfile,
    valueMeasurementBaseline: explainedBaseline(),
  }

  const result = await transitionDiscovery(engagement, {
    transition: "submit",
    actor: "client",
  })

  assert.equal(result.success, true)
  assert.equal(workflowWrites[0].status, "submitted")
  assert.equal(workflowWrites[0].submittedBy, "client")
  assert.ok(workflowWrites[0].submittedAt instanceof Date)
  assert.equal(discoveryWrites.length, 0, "a transition never rewrites content")
})

test("a client cannot accept their own submission", async () => {
  persistedWorkflow = workflowState("submitted")

  const result = await transitionDiscovery(engagement, {
    transition: "accept",
    actor: "client",
  })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "actor_not_permitted")
  assert.equal(
    result.success === false && result.messageId,
    "discovery.error.actor_not_permitted",
  )
  assert.deepEqual(result.success === false && result.messageParams, {
    actor: "client",
    transition: "accept",
  })
  assert.equal(workflowWrites.length, 0)
})

test("returning discovery carries the consultant's notes back to the contributor", async () => {
  persistedWorkflow = workflowState("submitted")

  const result = await transitionDiscovery(engagement, {
    transition: "return",
    actor: "consultant",
    notes: "Please add the ticket volumes we discussed.",
  })

  assert.equal(result.success, true)
  assert.equal(workflowWrites[0].status, "returned")
  assert.equal(
    workflowWrites[0].returnNotes,
    "Please add the ticket volumes we discussed.",
  )
  assert.equal(discoveryWrites.length, 0)
})

test("accepted discovery can be reopened for revision without losing content", async () => {
  persistedWorkflow = workflowState("accepted")

  const result = await transitionDiscovery(engagement, {
    transition: "reopen",
    actor: "consultant",
  })

  assert.equal(result.success, true)
  assert.equal(workflowWrites[0].status, "draft")
  assert.equal(discoveryWrites.length, 0)
})

test("an illegal transition reports the status it was refused in", async () => {
  persistedWorkflow = workflowState("accepted")

  const result = await transitionDiscovery(engagement, {
    transition: "return",
    actor: "consultant",
  })

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "illegal_transition")
  assert.equal(
    result.success === false && result.messageId,
    "discovery.error.illegal_transition",
  )
  assert.deepEqual(result.success === false && result.messageParams, {
    transition: "return",
    status: "accepted",
  })
  assert.equal(workflowWrites.length, 0)
})

test("no refusal carries user-facing prose", async () => {
  // Every refusal the client can provoke must name itself with an identifier
  // the frontend localizes (coding-standards.md §12A).
  persistedWorkflow = workflowState("submitted")

  const refusals = [
    await transitionDiscovery(engagement, { transition: "accept", actor: "client" }),
    await transitionDiscovery(engagement, { transition: "submit", actor: "client" }),
    await transitionDiscovery(engagement, { transition: "reopen", actor: "client" }),
  ]

  for (const refusal of refusals) {
    assert.equal(refusal.success, false)
    if (refusal.success) continue

    assert.equal(isDiscoveryMessageId(refusal.messageId), true)
    assert.equal(
      Object.hasOwn(refusal, "error"),
      false,
      "a refusal must not carry a prose error",
    )
  }
})
