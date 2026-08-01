import assert from "node:assert/strict"
import { test } from "node:test"

import { getDiscoverySectionStatus } from "./discovery-status.ts"
import { markFieldUnknown } from "./discovery-unknown.ts"

import type { DiscoveryProfile } from "../../shared/discovery-profile.schema.ts"
import type { DiscoveryWorkflowState } from "../../shared/discovery-workflow.schema.ts"

// The four section statuses, and the two things they must never say: that an
// untouched section needs attention, or that a submitted Discovery is complete.

const emptyProfile = (): DiscoveryProfile => ({
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
  valueMeasurementBaseline: {
    businessImpacts: [],
    errorProfile: {
      frequency: null,
      severity: { level: null, description: null },
      costPerOccurrence: null,
    },
    existingKpis: [],
    baselineMetrics: [],
    targetSuccessMetrics: [],
    measurementGaps: [],
  },
  missingInformation: [],
})

const workflow = (
  status: DiscoveryWorkflowState["status"],
): DiscoveryWorkflowState => ({
  status,
  submittedAt: null,
  submittedBy: null,
  reviewedAt: null,
  returnNotes: null,
  contentProvenance: {
    situation: null,
    problems: null,
    current_process: null,
    tools: null,
    data: null,
    constraints: null,
    goals: null,
    value_measurement: null,
  },
})

const completeGoals = (): DiscoveryProfile => ({
  ...emptyProfile(),
  desiredOutcome: "Die Bearbeitungszeit soll sinken.",
  successMetrics: ["Bearbeitungszeit"],
  mvpScope: "Zuerst der Support-Eingang.",
})

test("a section with nothing in it is not started", () => {
  assert.equal(
    getDiscoverySectionStatus("goals", emptyProfile(), workflow("draft")),
    "not_started",
  )
})

test("a partly answered section is in progress", () => {
  const profile = { ...emptyProfile(), desiredOutcome: "Schneller werden." }

  assert.equal(
    getDiscoverySectionStatus("goals", profile, workflow("draft")),
    "in_progress",
  )
})

test("a fully answered section with no open gap is complete", () => {
  assert.equal(
    getDiscoverySectionStatus("goals", completeGoals(), workflow("draft")),
    "complete",
  )
})

test("a fully answered section with an open gap asks for the missing detail", () => {
  const profile = completeGoals()
  profile.missingInformation = markFieldUnknown(
    profile.missingInformation,
    "successMetrics",
    "goals",
  )

  assert.equal(
    getDiscoverySectionStatus("goals", profile, workflow("draft")),
    "action_required",
  )
})

test("a returned Discovery asks for correction where something is open", () => {
  const profile = completeGoals()
  profile.missingInformation = markFieldUnknown(
    profile.missingInformation,
    "desiredOutcome",
    "goals",
  )

  assert.equal(
    getDiscoverySectionStatus("goals", profile, workflow("returned")),
    "action_required",
  )
})

test("a returned Discovery never marks an untouched section as needing action", () => {
  // The section the consultant did not object to stays neutral, whatever the
  // Discovery as a whole is doing.
  assert.equal(
    getDiscoverySectionStatus("tools", emptyProfile(), workflow("returned")),
    "not_started",
  )
})

test("marking an answer as not yet known leaves an empty section neutral", () => {
  const profile = emptyProfile()
  profile.missingInformation = markFieldUnknown(
    profile.missingInformation,
    "desiredOutcome",
    "goals",
  )

  assert.equal(
    getDiscoverySectionStatus("goals", profile, workflow("draft")),
    "not_started",
  )
})

test("submitting a Discovery does not make its sections complete", () => {
  const profile = emptyProfile()

  for (const status of ["submitted", "accepted"] as const) {
    assert.equal(
      getDiscoverySectionStatus("goals", profile, workflow(status)),
      "not_started",
      `${status} was read as completeness`,
    )
  }

  const partial = { ...emptyProfile(), desiredOutcome: "Schneller werden." }

  assert.equal(
    getDiscoverySectionStatus("goals", partial, workflow("submitted")),
    "in_progress",
  )
})

test("the consultant and the client are told the same thing", () => {
  // The status rule takes no audience: there is exactly one of it.
  const profile = completeGoals()

  assert.equal(
    getDiscoverySectionStatus("goals", profile, workflow("draft")),
    getDiscoverySectionStatus("goals", profile, workflow("draft")),
  )
})
