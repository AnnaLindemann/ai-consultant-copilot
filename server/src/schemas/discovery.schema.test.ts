import assert from "node:assert/strict"
import { test } from "node:test"

import {
  returnDiscoverySchema,
  reviewDiscoverySchema,
  saveDiscoveryProfileSchema,
  submitDiscoverySchema,
} from "./discovery.schema.js"

import { emptyValueMeasurementBaseline } from "../../../shared/discovery-profile.schema.js"

const profile = {
  department: "Customer Support",
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

test("a discovery save states who contributed the content", () => {
  const result = saveDiscoveryProfileSchema.safeParse({
    contributor: "client",
    profile,
  })

  assert.equal(result.success, true)
})

test("a discovery save without a contributor is refused", () => {
  // Defaulting would attribute a client's own words to the consultant.
  assert.equal(saveDiscoveryProfileSchema.safeParse({ profile }).success, false)
})

test("an unknown contributor is refused", () => {
  const result = saveDiscoveryProfileSchema.safeParse({
    contributor: "administrator",
    profile,
  })

  assert.equal(result.success, false)
})

test("submitting states who is submitting", () => {
  assert.equal(submitDiscoverySchema.safeParse({ actor: "client" }).success, true)
  assert.equal(submitDiscoverySchema.safeParse({}).success, false)
})

test("returning discovery requires the consultant's notes", () => {
  assert.equal(
    returnDiscoverySchema.safeParse({
      actor: "consultant",
      notes: "Please add the ticket volumes we discussed.",
    }).success,
    true,
  )
  assert.equal(
    returnDiscoverySchema.safeParse({ actor: "consultant" }).success,
    false,
  )
  assert.equal(
    returnDiscoverySchema.safeParse({ actor: "consultant", notes: "   " })
      .success,
    false,
  )
})

test("accepting and reopening carry only who is acting", () => {
  assert.equal(
    reviewDiscoverySchema.safeParse({ actor: "consultant" }).success,
    true,
  )
  assert.equal(reviewDiscoverySchema.safeParse({}).success, false)
})
