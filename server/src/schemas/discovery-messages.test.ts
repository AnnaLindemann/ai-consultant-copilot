import assert from "node:assert/strict"
import { test } from "node:test"

import {
  discoveryMessageIds,
  discoveryTransitionMessageIds,
  isDiscoveryMessageId,
} from "../../../shared/discovery-messages.js"
import { discoveryTransitionSchema } from "../../../shared/discovery-workflow.schema.js"

// These identifiers are an API contract the frontend localizes against: they
// must stay unique, English, and complete (architecture.md §7.1;
// coding-standards.md §12A).

test("every Discovery message identifier is unique", () => {
  assert.equal(new Set(discoveryMessageIds).size, discoveryMessageIds.length)
})

test("Discovery message identifiers are English identifiers, not prose", () => {
  for (const id of discoveryMessageIds) {
    assert.match(
      id,
      /^discovery\.(message|error)\.[a-z0-9_]+$/,
      `${id} is not a stable English identifier`,
    )
  }
})

test("every review transition has a registered success identifier", () => {
  for (const transition of discoveryTransitionSchema.options) {
    const messageId = discoveryTransitionMessageIds[transition]

    assert.ok(messageId, `${transition} has no message identifier`)
    assert.equal(isDiscoveryMessageId(messageId), true)
    assert.match(messageId, /^discovery\.message\./)
  }
})

test("an unknown identifier is not mistaken for a registered one", () => {
  assert.equal(isDiscoveryMessageId("discovery.error.does_not_exist"), false)
  assert.equal(isDiscoveryMessageId("Engagement not found"), false)
})
