import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

import { de } from "./de.ts"
import { discoveryMessageIds } from "../../shared/discovery-messages.ts"
import {
  businessImpactCategorySchema,
  dataSourceKindSchema,
  discoveryGapCategorySchema,
  measurementBasisSchema,
  measurementGapReasonSchema,
  measurementGapSubjectSchema,
} from "../../shared/discovery-profile.schema.ts"
import {
  DISCOVERY_SECTIONS,
  discoveryActorSchema,
  discoveryProvenanceSchema,
  discoveryStatusSchema,
  discoveryTransitionSchema,
} from "../../shared/discovery-workflow.schema.ts"

// The localization gate (implementation-workflow §13.6b): every string the
// Discovery surface shows is looked up by key, every identifier it renders has
// a German label, and nothing the server can send is left untranslated.

const catalogue: Record<string, string> = de
const componentsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "components",
)

const has = (key: string) => Object.hasOwn(catalogue, key)

const labelledIdentifiers: [string, readonly string[]][] = [
  ["discovery.status", discoveryStatusSchema.options],
  ["discovery.status.short", discoveryStatusSchema.options],
  ["discovery.actor", discoveryActorSchema.options],
  ["discovery.transition", discoveryTransitionSchema.options],
  ["discovery.provenance", discoveryProvenanceSchema.options],
  ["discovery.section", DISCOVERY_SECTIONS],
  ["discovery.basis", measurementBasisSchema.options],
  ["discovery.data_source", dataSourceKindSchema.options],
  ["discovery.impact_category", businessImpactCategorySchema.options],
  ["discovery.gap_category", discoveryGapCategorySchema.options],
  [
    "discovery.frequency",
    [
      "rarely",
      "monthly",
      "weekly",
      "daily",
      "many_times_per_day",
    ] as const,
  ],
  [
    "discovery.data_availability",
    ["none", "unknown", "restricted", "available"] as const,
  ],
  ["discovery.data_quality", ["poor", "mixed", "good", "unknown"] as const],
  ["discovery.timeline", ["asap", "this_quarter", "this_year", "unknown"] as const],
  ["common.currency", ["eur", "usd", "gbp", "other"] as const],
  ["discovery.gap_subject", measurementGapSubjectSchema.options],
  ["discovery.gap_reason", measurementGapReasonSchema.options],
]

test("every Discovery outcome the server reports has a German message", () => {
  for (const messageId of discoveryMessageIds) {
    assert.equal(has(messageId), true, `${messageId} has no German message`)
  }
})

test("every Discovery identifier the interface renders has a German label", () => {
  for (const [keyPrefix, identifiers] of labelledIdentifiers) {
    for (const identifier of identifiers) {
      assert.equal(
        has(`${keyPrefix}.${identifier}`),
        true,
        `${keyPrefix}.${identifier} has no German label`,
      )
    }
  }
})

test("every key the Discovery components look up exists in the catalogue", () => {
  const files = readdirSync(componentsDir).filter((file) =>
    file.startsWith("Discovery"),
  )

  assert.ok(files.length > 0, "no Discovery components were found to check")

  const missing: string[] = []

  for (const file of files) {
    const source = readFileSync(path.join(componentsDir, file), "utf8")

    // Static lookups: t("some.key"). Keys built from an identifier at runtime
    // (t(`discovery.section.${section}`)) are covered by the test above.
    for (const [, key] of source.matchAll(/\bt\(\s*"([^"]+)"/g)) {
      if (!has(key)) missing.push(`${file}: ${key}`)
    }
  }

  assert.deepEqual(missing, [], "keys are looked up but not translated")
})

test("no Discovery message is left empty or untranslated", () => {
  for (const [key, value] of Object.entries(catalogue)) {
    assert.equal(typeof value, "string")
    assert.notEqual(value.trim(), "", `${key} has no German text`)
    assert.notEqual(value, key, `${key} still renders as its own identifier`)
  }
})

test("message placeholders are named, so a translation can reorder them", () => {
  // A positional placeholder would tie the German wording to the parameter
  // order; named ones let a translation put the actor before the transition.
  for (const [key, value] of Object.entries(catalogue)) {
    for (const [, name] of value.matchAll(/\{(\w*)\}/g)) {
      assert.match(name, /^[a-zA-Z][a-zA-Z0-9]*$/, `${key} has an unnamed slot`)
    }
  }
})
