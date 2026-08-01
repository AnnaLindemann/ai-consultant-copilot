import assert from "node:assert/strict"
import { test } from "node:test"

import { de } from "../i18n/de.ts"
import {
  DISCOVERY_FIELD_GUIDANCE,
  guidanceHintKeys,
  type DiscoveryFieldId,
} from "./discovery-guidance.ts"

// The field guidance is configuration, so it is checkable as configuration: no
// explanation may point at a string that does not exist, the two audiences must
// genuinely differ, and a suggestion list must never become a closed set of
// allowed answers.

const catalogue: Record<string, string> = de
const has = (key: string) => Object.hasOwn(catalogue, key)

const fields = Object.keys(DISCOVERY_FIELD_GUIDANCE) as DiscoveryFieldId[]

test("every guided field points at strings the catalogue actually has", () => {
  const missing: string[] = []

  for (const field of fields) {
    const guidance = DISCOVERY_FIELD_GUIDANCE[field]
    const keys = [
      guidance.labelKey,
      guidance.hintKey,
      guidance.consultantHintKey,
      guidance.suggestionsKey,
      ...(guidance.exampleKeys ?? []),
      ...(guidance.suggestions ?? []).flatMap((suggestion) => [
        suggestion.labelKey,
        suggestion.insertKey,
        suggestion.descriptionKey,
      ]),
    ]

    for (const key of keys) {
      if (key !== undefined && !has(key)) missing.push(`${field}: ${key}`)
    }
  }

  assert.deepEqual(missing, [], "guidance names a string that does not exist")
})

test("every Discovery section the reference names has guided questions", () => {
  // One field per section is the floor: a section with no guidance at all is a
  // section the reader is left alone with.
  const perSection: Record<string, DiscoveryFieldId[]> = {
    situation: ["department", "affectedUsers", "notes"],
    problems: ["statedProblem", "painPoints", "businessImpact"],
    current_process: ["currentProcess", "processSteps", "bottlenecks"],
    tools: ["currentTools", "communicationChannels", "integrationNeeds"],
    data: ["dataTypes", "dataLocation", "sensitiveDataTypes"],
    constraints: ["technicalConstraints", "budgetNotes"],
    goals: ["desiredOutcome", "successMetrics", "mvpScope"],
  }

  for (const [section, sectionFields] of Object.entries(perSection)) {
    for (const field of sectionFields) {
      assert.ok(
        Object.hasOwn(DISCOVERY_FIELD_GUIDANCE, field),
        `${section}: ${field} carries no guidance`,
      )
    }
  }
})

test("the client is never shown the consulting context", () => {
  for (const field of fields) {
    const guidance = DISCOVERY_FIELD_GUIDANCE[field]
    const clientKeys = guidanceHintKeys(field, "client")

    assert.deepEqual(clientKeys, [guidance.hintKey])

    if (guidance.consultantHintKey) {
      assert.ok(
        !clientKeys.includes(guidance.consultantHintKey),
        `${field} leaks its consulting context to the client`,
      )
    }
  }
})

test("the consultant sees the same explanation plus the consulting context", () => {
  const withContext = fields.filter(
    (field) => DISCOVERY_FIELD_GUIDANCE[field].consultantHintKey !== undefined,
  )

  assert.ok(withContext.length > 0, "no field explains how its answer is used")

  for (const field of withContext) {
    const guidance = DISCOVERY_FIELD_GUIDANCE[field]

    assert.deepEqual(guidanceHintKeys(field, "consultant"), [
      guidance.hintKey,
      guidance.consultantHintKey,
    ])
  }
})

test("the desired result offers editable sentences, not codes", () => {
  const outcome = DISCOVERY_FIELD_GUIDANCE.desiredOutcome

  assert.ok(outcome.suggestions && outcome.suggestions.length >= 10)

  for (const suggestion of outcome.suggestions) {
    assert.ok(
      suggestion.insertKey !== undefined,
      `${suggestion.id} inserts nothing a person could edit`,
    )
    // What lands in the field is a sentence, not the chip's own short label.
    assert.notEqual(catalogue[suggestion.insertKey], catalogue[suggestion.labelKey])
    assert.ok(catalogue[suggestion.insertKey].length > 20)
  }
})

test("every success metric is explained rather than abbreviated at the reader", () => {
  const metrics = DISCOVERY_FIELD_GUIDANCE.successMetrics.suggestions

  assert.ok(metrics && metrics.length >= 10)

  for (const metric of metrics) {
    assert.ok(
      metric.descriptionKey !== undefined,
      `${metric.id} is offered without an explanation`,
    )
    assert.ok(catalogue[metric.descriptionKey].length > 20)
    // An unexplained abbreviation is exactly what this rule exists to prevent.
    assert.doesNotMatch(catalogue[metric.labelKey], /\bCSAT\b|\bNPS\b|\bAHT\b/)
  }
})

test("suggestion identifiers are stable, English, and unique per field", () => {
  for (const field of fields) {
    const suggestions = DISCOVERY_FIELD_GUIDANCE[field].suggestions ?? []
    const ids = suggestions.map((suggestion) => suggestion.id)

    assert.equal(new Set(ids).size, ids.length, `${field} repeats a suggestion id`)

    for (const id of ids) {
      assert.match(id, /^[a-z][a-z0-9_]*$/, `${id} is not a stable identifier`)
    }
  }
})

test("questions that may have no answer yet can say so", () => {
  const answerable: DiscoveryFieldId[] = [
    "desiredOutcome",
    "successMetrics",
    "businessImpact",
    "dataTypes",
    "technicalConstraints",
  ]

  for (const field of answerable) {
    assert.ok(
      DISCOVERY_FIELD_GUIDANCE[field].unknownGapCategory !== undefined,
      `${field} offers no way to say the answer is not known yet`,
    )
  }
})
