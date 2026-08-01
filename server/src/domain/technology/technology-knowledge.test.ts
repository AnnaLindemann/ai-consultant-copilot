import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildTechnologyPackage,
  findCategoryViolation,
  searchTechnologyProfiles,
  unknownSourceCodes,
  type TechnologyProvenanceIndex,
} from "./technology-knowledge.js"

import type {
  TechnologyCategory,
  TechnologyProfile,
  TechnologyProvenance,
  TechnologySource,
} from "../../../../shared/technology-knowledge.schema.js"

// The Technology Knowledge Base's retrieval, tested as the pure function it is:
// no database, no provider, no engagement (coding-standards.md §9 "test the
// domain in isolation").

const profile = (
  overrides: Partial<TechnologyProfile> & Pick<TechnologyProfile, "code">,
): TechnologyProfile => ({
  categoryCode: "ai-models",
  title: overrides.code,
  summary: "A curated technology profile.",
  details: {
    role: "Does one job in a solution.",
    strengths: ["Understands unstructured text"],
    limitations: ["Output is not deterministic"],
    suitability: ["Triage of inbound requests"],
  },
  matchTerms: [],
  tags: [],
  status: "active",
  sortOrder: 1,
  origin: "product_seed",
  originSourceCodes: [],
  revision: 0,
  ...overrides,
})

const noProvenance: TechnologyProvenanceIndex = new Map()

const context = (
  situationText: string[] = [],
  categoryCodes: string[] = [],
) => ({ categoryCodes, situationText })

test("a profile is selected by a curated match term, not by its prose", () => {
  const profiles = [
    profile({ code: "matching", matchTerms: ["ticketsystem"] }),
    // The word appears in the summary, which retrieval never reads.
    profile({ code: "prose-only", summary: "Passt zu jedem Ticketsystem." }),
  ]

  const result = buildTechnologyPackage(
    profiles,
    noProvenance,
    context(["Wir nutzen ein Ticketsystem"]),
  )

  assert.deepEqual(result.codes, ["matching"])
  assert.equal(result.fallback, false)
})

test("a match term is found as a whole word, never inside a longer one", () => {
  const profiles = [profile({ code: "chat", matchTerms: ["chat"] })]

  const found = buildTechnologyPackage(
    profiles,
    noProvenance,
    context(["Wir bieten Chat an"]),
  )
  const notFound = buildTechnologyPackage(
    profiles,
    noProvenance,
    context(["Wir zahlen eine Chatbot-Lizenz"]),
  )

  assert.deepEqual(found.codes, ["chat"])
  assert.equal(notFound.fallback, true)
})

test("no number of tag hits outranks a single curated match term", () => {
  const profiles = [
    profile({ code: "by-term", matchTerms: ["workflow"], sortOrder: 9 }),
    profile({
      code: "by-tags",
      tags: ["workflow", "automatisierung", "orchestrierung"],
      sortOrder: 1,
    }),
  ]

  const result = buildTechnologyPackage(
    profiles,
    noProvenance,
    context(["workflow automatisierung orchestrierung"]),
  )

  assert.equal(result.profiles[0]?.code, "by-term")
})

test("a deprecated profile is never retrieved, whatever it matches", () => {
  const profiles = [
    profile({
      code: "retired",
      status: "deprecated",
      matchTerms: ["ticketsystem"],
    }),
  ]

  const result = buildTechnologyPackage(
    profiles,
    noProvenance,
    context(["Wir nutzen ein Ticketsystem"]),
  )

  assert.deepEqual(result.codes, [])
  // Nothing active was available to fall back to either.
  assert.equal(result.fallback, true)
})

test("requesting categories excludes every profile outside them", () => {
  const profiles = [
    profile({ code: "model", categoryCode: "ai-models", matchTerms: ["suche"] }),
    profile({
      code: "store",
      categoryCode: "vector-databases",
      matchTerms: ["suche"],
    }),
  ]

  const result = buildTechnologyPackage(
    profiles,
    noProvenance,
    context(["semantische suche"], ["vector-databases"]),
  )

  assert.deepEqual(result.codes, ["store"])
  assert.deepEqual(result.categoryCodes, ["vector-databases"])
})

test("a context that resolves to nothing still gets the curated baseline", () => {
  const profiles = [
    profile({ code: "second", sortOrder: 2 }),
    profile({ code: "first", sortOrder: 1 }),
  ]

  const result = buildTechnologyPackage(
    profiles,
    noProvenance,
    context(["etwas völlig unverwandtes"]),
  )

  assert.equal(result.fallback, true)
  assert.deepEqual(result.codes, ["first", "second"])
})

test("identical inputs produce identical ordered results", () => {
  const profiles = [
    profile({ code: "b", matchTerms: ["suche"], sortOrder: 1 }),
    profile({ code: "a", matchTerms: ["suche"], sortOrder: 1 }),
    profile({ code: "c", matchTerms: ["suche"], sortOrder: 0 }),
  ]

  const first = buildTechnologyPackage(profiles, noProvenance, context(["suche"]))
  const second = buildTechnologyPackage(
    [...profiles].reverse(),
    noProvenance,
    context(["suche"]),
  )

  // Equal scores fall back to the curator's sort order, then to the code —
  // byte-wise, so the ordering does not depend on the host's collation.
  assert.deepEqual(first.codes, ["c", "a", "b"])
  assert.deepEqual(second.codes, first.codes)
})

test("the package is capped per category and overall", () => {
  const profiles = Array.from({ length: 6 }, (_unused, index) =>
    profile({
      code: `p${index}`,
      categoryCode: "ai-models",
      matchTerms: ["suche"],
      sortOrder: index,
    }),
  )

  const result = buildTechnologyPackage(
    profiles,
    noProvenance,
    context(["suche"]),
    { maxPerCategory: 2, maxProfiles: 10 },
  )

  assert.deepEqual(result.codes, ["p0", "p1"])
})

test("ranks run from one, in package order", () => {
  const profiles = [
    profile({ code: "a", matchTerms: ["suche"], sortOrder: 1 }),
    profile({ code: "b", matchTerms: ["suche"], sortOrder: 2 }),
  ]

  const result = buildTechnologyPackage(profiles, noProvenance, context(["suche"]))

  assert.deepEqual(
    result.profiles.map((one) => one.rank),
    [1, 2],
  )
})

test("provenance travels with a retrieved profile", () => {
  const provenance: TechnologyProvenanceIndex = new Map<
    string,
    TechnologyProvenance
  >([
    [
      "known",
      {
        origin: "curator",
        sourceCodes: ["openai"],
        proposalId: "prop_1",
        appliedAt: "2026-08-01T10:00:00.000Z",
      },
    ],
  ])

  const result = buildTechnologyPackage(
    [profile({ code: "known", matchTerms: ["suche"] })],
    provenance,
    context(["suche"]),
  )

  assert.deepEqual(result.profiles[0]?.provenance.sourceCodes, ["openai"])
  assert.equal(result.profiles[0]?.provenance.proposalId, "prop_1")
})

test("a seeded profile reports its declared origin, and claims no approval", () => {
  const result = buildTechnologyPackage(
    [
      profile({
        code: "seeded",
        matchTerms: ["suche"],
        origin: "product_seed",
        originSourceCodes: ["openai"],
      }),
    ],
    noProvenance,
    context(["suche"]),
  )

  assert.deepEqual(result.profiles[0]?.provenance, {
    origin: "product_seed",
    // Where the information came from — a true statement about shipped content.
    sourceCodes: ["openai"],
    // And no approval whatsoever is implied.
    proposalId: null,
    appliedAt: null,
  })
})

test("an approved change supersedes the seed declaration rather than joining it", () => {
  const approved = new Map([
    [
      "seeded",
      {
        origin: "curator" as const,
        sourceCodes: ["anthropic"],
        proposalId: "prop_7",
        appliedAt: "2026-08-01T12:00:00.000Z",
      },
    ],
  ])

  const result = buildTechnologyPackage(
    [
      profile({
        code: "seeded",
        matchTerms: ["suche"],
        // A stale declaration must never be merged with, or preferred over, the
        // approved record. In practice the apply path clears it; this proves the
        // resolution order holds even if one were left behind.
        origin: "product_seed",
        originSourceCodes: ["openai"],
      }),
    ],
    approved,
    context(["suche"]),
  )

  assert.equal(result.profiles[0]?.provenance.origin, "curator")
  assert.deepEqual(result.profiles[0]?.provenance.sourceCodes, ["anthropic"])
  assert.equal(result.profiles[0]?.provenance.proposalId, "prop_7")
})

test("retrieval returns only stored profile codes", () => {
  const profiles = [profile({ code: "stored", matchTerms: ["suche"] })]

  const result = buildTechnologyPackage(profiles, noProvenance, context(["suche"]))

  const storedCodes = new Set(profiles.map((one) => one.code))
  assert.ok(result.codes.every((code) => storedCodes.has(code)))
})

// --- Curation validity -----------------------------------------------------

const category = (
  overrides: Partial<TechnologyCategory> & Pick<TechnologyCategory, "code">,
): TechnologyCategory => ({
  title: overrides.code,
  summary: "A curated category.",
  sortOrder: 1,
  active: true,
  revision: 0,
  ...overrides,
})

test("a profile pointing at an unknown category is refused", () => {
  const violation = findCategoryViolation("does-not-exist", [
    category({ code: "ai-models" }),
  ])

  assert.deepEqual(violation, {
    reason: "unknown_category",
    code: "does-not-exist",
  })
})

test("a profile pointing at a retired category is refused", () => {
  const violation = findCategoryViolation("retired", [
    category({ code: "retired", active: false }),
  ])

  assert.deepEqual(violation, { reason: "inactive_category", code: "retired" })
})

test("a known, active category is accepted", () => {
  assert.equal(
    findCategoryViolation("ai-models", [category({ code: "ai-models" })]),
    null,
  )
})

const source = (
  overrides: Partial<TechnologySource> & Pick<TechnologySource, "code">,
): TechnologySource => ({
  name: overrides.code,
  summary: "A trusted origin.",
  officialChannels: [{ label: "Docs", url: "https://example.com/docs" }],
  active: true,
  revision: 0,
  ...overrides,
})

test("a cited source the registry does not contain is named", () => {
  const unknown = unknownSourceCodes(
    ["openai", "invented"],
    [source({ code: "openai" })],
  )

  assert.deepEqual(unknown, ["invented"])
})

test("a retired source cannot be cited", () => {
  const unknown = unknownSourceCodes(
    ["retired"],
    [source({ code: "retired", active: false })],
  )

  assert.deepEqual(unknown, ["retired"])
})

// --- The curation browser --------------------------------------------------

test("the curation browser may search text, which retrieval never does", () => {
  const profiles = [
    profile({ code: "pinecone", title: "Pinecone", summary: "Vektordatenbank." }),
    profile({ code: "n8n", title: "n8n", summary: "Workflow-Automatisierung." }),
  ]

  const found = searchTechnologyProfiles(profiles, { query: "vektordatenbank" })

  assert.deepEqual(
    found.map((one) => one.code),
    ["pinecone"],
  )
})

test("the curation browser can reach a deprecated profile retrieval would not", () => {
  const profiles = [profile({ code: "retired", status: "deprecated" })]

  assert.equal(
    searchTechnologyProfiles(profiles, { status: "deprecated" }).length,
    1,
  )
})
