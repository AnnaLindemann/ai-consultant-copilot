import assert from "node:assert/strict"
import { test } from "node:test"

import { discoveryProfileSchema } from "../../../shared/discovery-profile.schema.js"

const completeEmptyProfile = {
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
  missingInformation: [],
}

test("Discovery Profile accepts known facts and explicit gaps", () => {
  const result = discoveryProfileSchema.safeParse({
    ...completeEmptyProfile,
    department: "Customer Support",
    communicationChannels: ["Email", "Live chat"],
    statedProblem: "Response times are inconsistent.",
    missingInformation: [
      { category: "data", description: "Confirm ticket export access." },
    ],
  })

  assert.equal(result.success, true)
})

test("Discovery Profile accepts a cleared profile for re-entry", () => {
  assert.equal(discoveryProfileSchema.safeParse(completeEmptyProfile).success, true)
})

test("Discovery Profile rejects blank gap descriptions", () => {
  const result = discoveryProfileSchema.safeParse({
    ...completeEmptyProfile,
    missingInformation: [{ category: "goals", description: "   " }],
  })

  assert.equal(result.success, false)
})

test("Discovery Profile rejects unknown gap categories", () => {
  const result = discoveryProfileSchema.safeParse({
    ...completeEmptyProfile,
    missingInformation: [{ category: "assessment", description: "Unknown" }],
  })

  assert.equal(result.success, false)
})
