import assert from "node:assert/strict"
import { test } from "node:test"

import {
  createEngagementSchema,
  updateEngagementSchema,
} from "./engagement.schema.js"

test("createEngagementSchema accepts an empty engagement under an organization", () => {
  // Phase 1: an engagement needs only its owning organization; all discovery
  // content is optional, so an empty engagement is a valid, working state.
  const result = createEngagementSchema.safeParse({
    organizationId: "org_123",
  })

  assert.equal(result.success, true)
})

test("createEngagementSchema accepts optional discovery content", () => {
  const result = createEngagementSchema.safeParse({
    organizationId: "org_123",
    title: "Support automation review",
    statedProblem: "Email support is too slow.",
    currentProcess: "Agents answer email manually.",
    desiredOutcome: "Faster, consistent replies.",
    sensitiveData: false,
    gdprConcerns: true,
  })

  assert.equal(result.success, true)
})

test("createEngagementSchema rejects a missing organizationId", () => {
  const result = createEngagementSchema.safeParse({
    title: "Orphan engagement",
  })

  assert.equal(result.success, false)
})

test("createEngagementSchema rejects a blank organizationId", () => {
  const result = createEngagementSchema.safeParse({
    organizationId: "   ",
  })

  assert.equal(result.success, false)
})

test("createEngagementSchema rejects an out-of-range enum value", () => {
  const result = createEngagementSchema.safeParse({
    organizationId: "org_123",
    urgency: "critical",
  })

  assert.equal(result.success, false)
})

test("updateEngagementSchema accepts a stage-only save", () => {
  const result = updateEngagementSchema.safeParse({ stage: "assessment" })

  assert.equal(result.success, true)
})

test("updateEngagementSchema rejects an unknown stage", () => {
  const result = updateEngagementSchema.safeParse({ stage: "delivery" })

  assert.equal(result.success, false)
})

test("updateEngagementSchema rejects an empty save", () => {
  // A save with no fields is meaningless and is rejected at the boundary.
  const result = updateEngagementSchema.safeParse({})

  assert.equal(result.success, false)
})
