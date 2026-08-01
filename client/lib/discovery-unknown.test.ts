import assert from "node:assert/strict"
import { test } from "node:test"

import {
  clearFieldUnknown,
  isFieldUnknown,
  markFieldUnknown,
  unknownGapDescription,
  unknownGapField,
} from "./discovery-unknown.ts"

import type { DiscoveryGap } from "../../shared/discovery-profile.schema.ts"

// "Ich weiß es noch nicht" is a recorded finding, not an empty field. These are
// the rules that keep it distinguishable from a blank answer and from a gap a
// person wrote in their own words.

test("marking a field records one explicit gap", () => {
  const gaps = markFieldUnknown([], "desiredOutcome", "goals")

  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].category, "goals")
  assert.equal(isFieldUnknown(gaps, "desiredOutcome"), true)
})

test("the gap description carries the field identifier, never its label", () => {
  const description = unknownGapDescription("successMetrics")

  assert.equal(unknownGapField(description), "successMetrics")
  // English identifier, so nothing keys off the German a reader happens to see.
  assert.doesNotMatch(description, /[äöüßÄÖÜ]/)
})

test("marking twice records one gap, not two", () => {
  const once = markFieldUnknown([], "dataTypes", "data")
  const twice = markFieldUnknown(once, "dataTypes", "data")

  assert.equal(twice.length, 1)
})

test("clearing a mark removes only that field's gap", () => {
  const gaps = markFieldUnknown(
    markFieldUnknown([], "desiredOutcome", "goals"),
    "successMetrics",
    "goals",
  )

  const cleared = clearFieldUnknown(gaps, "desiredOutcome")

  assert.equal(isFieldUnknown(cleared, "desiredOutcome"), false)
  assert.equal(isFieldUnknown(cleared, "successMetrics"), true)
})

test("a gap somebody wrote is never mistaken for an unknown mark", () => {
  const written: DiscoveryGap[] = [
    { category: "goals", description: "Zielwerte fehlen noch" },
    { category: "data", description: "unknown:" },
    { category: "data", description: "unknown:notAField" },
  ]

  for (const gap of written) {
    assert.equal(unknownGapField(gap.description), null)
  }

  assert.equal(isFieldUnknown(written, "desiredOutcome"), false)
})

test("clearing a field that was never marked leaves the gaps alone", () => {
  const written: DiscoveryGap[] = [
    { category: "goals", description: "Zielwerte fehlen noch" },
  ]

  assert.deepEqual(clearFieldUnknown(written, "desiredOutcome"), written)
})
