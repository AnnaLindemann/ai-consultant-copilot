import assert from "node:assert/strict"
import { test } from "node:test"

import {
  canReplaceAssessment,
  hasDiscoveryContentToAssess,
} from "./assessment.js"

import {
  emptyValueMeasurementBaseline,
  type DiscoveryProfile,
} from "../../../../shared/discovery-profile.schema.js"

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

test("an empty Discovery Profile cannot be assessed", () => {
  assert.equal(hasDiscoveryContentToAssess(emptyProfile), false)
})

test("recorded gaps alone are not discovery content to assess", () => {
  const profile: DiscoveryProfile = {
    ...emptyProfile,
    missingInformation: [
      { category: "data", description: "Ticket volumes are unknown." },
    ],
  }

  assert.equal(hasDiscoveryContentToAssess(profile), false)
})

test("a single captured fact makes a Discovery Profile assessable", () => {
  assert.equal(
    hasDiscoveryContentToAssess({
      ...emptyProfile,
      statedProblem: "Response times are inconsistent.",
    }),
    true,
  )

  assert.equal(
    hasDiscoveryContentToAssess({
      ...emptyProfile,
      communicationChannels: ["Email"],
    }),
    true,
  )

  // `false` is a captured answer, not an absence of one.
  assert.equal(
    hasDiscoveryContentToAssess({ ...emptyProfile, sensitiveData: false }),
    true,
  )
})

test("a first Assessment and an unreviewed draft may be replaced by a re-run", () => {
  assert.equal(canReplaceAssessment(null, false), true)
  assert.equal(canReplaceAssessment("ai_draft", false), true)
})

test("consultant edits are never replaced by a re-run without explicit intent", () => {
  assert.equal(canReplaceAssessment("consultant_edited", false), false)
  assert.equal(canReplaceAssessment("accepted", false), false)
})

test("the consultant can explicitly choose to regenerate over their own work", () => {
  assert.equal(canReplaceAssessment("consultant_edited", true), true)
  assert.equal(canReplaceAssessment("accepted", true), true)
})
