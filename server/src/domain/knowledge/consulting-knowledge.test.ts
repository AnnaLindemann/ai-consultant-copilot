import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DEFAULT_PACKAGE_LIMITS,
  REQUIRED_KINDS,
  buildKnowledgePackage,
  findRelationshipViolations,
  resolveKnowledgeAnchors,
  searchConsultingKnowledge,
} from "./consulting-knowledge.js"
import { consultingKnowledgeSeed } from "./consulting-knowledge-seed.js"
import { consultingKnowledgeEntrySchema } from "../../../../shared/consulting-knowledge.schema.js"

import type {
  ConsultingKnowledgeEntry,
  ConsultingKnowledgeKind,
} from "../../../../shared/consulting-knowledge.schema.js"

// The Consulting Knowledge Base's retrieval rules, tested where they live: the
// domain is pure, so none of this needs a database, a web server, or a model
// (coding-standards.md §9 "test the domain in isolation").

const DOMAIN = "customer-operations"

const entry = (
  overrides: Partial<ConsultingKnowledgeEntry> & {
    code: string
    kind: ConsultingKnowledgeKind
  },
): ConsultingKnowledgeEntry =>
  consultingKnowledgeEntrySchema.parse({
    domainCode: DOMAIN,
    title: `Title ${overrides.code}`,
    summary: `Summary ${overrides.code}`,
    tags: [],
    matchTerms: [],
    stageScopes: ["discovery", "assessment"],
    taxonomyCodes: [],
    processCodes: [],
    problemCodes: [],
    useCaseCodes: [],
    relatedCodes: [],
    details: {
      objective: null,
      applicability: [],
      questions: [],
      criteria: [],
      signals: [],
      steps: [],
      risks: [],
      mitigations: [],
      roiDrivers: [],
      bestPractices: [],
      notes: [],
    },
    sortOrder: 1,
    active: true,
    revision: 0,
    ...overrides,
  })

// A small curated world: one taxonomy node with a match vocabulary, the process
// it belongs to, a problem on that process, and a question curated against it.
const taxonomy = entry({
  code: "email-support",
  kind: "customer_operations_taxonomy",
  matchTerms: ["e-mail", "posteingang"],
  processCodes: ["inbound-support"],
})
const process = entry({
  code: "inbound-support",
  kind: "business_process",
  taxonomyCodes: ["email-support"],
})
const problem = entry({
  code: "manual-triage",
  kind: "business_problem",
  processCodes: ["inbound-support"],
})
const question = entry({
  code: "volume-question",
  kind: "discovery_question",
  processCodes: ["inbound-support"],
})
// Curated against nothing, but tagged with a code that *is* an anchor. It must
// never outrank an entry holding a real typed relationship.
const taggedOnly = entry({
  code: "tag-only-question",
  kind: "discovery_question",
  tags: ["inbound-support"],
  sortOrder: 0,
})

const world = [taxonomy, process, problem, question, taggedOnly]

const contextOf = (...situationText: string[]) => ({
  domainCode: DOMAIN,
  situationText,
})

test("the engagement's own words resolve into curated codes, not into prose matches", () => {
  const anchors = resolveKnowledgeAnchors(
    world,
    contextOf("Der Posteingang läuft über und niemand priorisiert."),
  )

  assert.deepEqual(anchors.taxonomyCodes, ["email-support"])
  assert.deepEqual(anchors.processCodes, ["inbound-support"])
  assert.deepEqual(anchors.problemCodes, ["manual-triage"])
})

test("a term is matched whole, so a longer word does not resolve an anchor", () => {
  // "chat" must not be found inside "chatbot-lizenz".
  const chat = entry({
    code: "live-chat",
    kind: "customer_operations_taxonomy",
    matchTerms: ["chat"],
  })

  const anchors = resolveKnowledgeAnchors(
    [chat],
    contextOf("Wir haben eine Chatbotlizenz gekauft."),
  )

  assert.deepEqual(anchors.taxonomyCodes, [])
})

test("retrieval is deterministic: the same inputs always produce the same ordered codes", () => {
  const context = contextOf("Posteingang mit hohem Volumen")

  const first = buildKnowledgePackage(world, "discovery", context)
  const second = buildKnowledgePackage(world, "discovery", context)
  const third = buildKnowledgePackage([...world].reverse(), "discovery", context)

  assert.deepEqual(first.codes, second.codes)
  // Row order out of the database must not change the result either.
  assert.deepEqual(first.codes, third.codes)
})

test("a typed relationship outranks any number of tag matches", () => {
  const packaged = buildKnowledgePackage(
    world,
    "discovery",
    contextOf("Posteingang"),
  )

  const curated = packaged.entries.findIndex((s) => s.code === "volume-question")
  const tagged = packaged.entries.findIndex((s) => s.code === "tag-only-question")

  assert.ok(curated >= 0, "the curated question was not selected")
  assert.ok(tagged >= 0, "the tag-only question was not selected")
  // The tag-only entry has the better sortOrder, so only the score can be
  // putting the curated one first.
  assert.ok(
    curated < tagged,
    "a tag-only match outranked an explicit curated relationship",
  )
})

test("only the kinds a stage requires are retrieved", () => {
  const discovery = buildKnowledgePackage(
    world,
    "discovery",
    contextOf("Posteingang"),
  )

  for (const selection of discovery.entries) {
    assert.ok(
      REQUIRED_KINDS.discovery.includes(selection.kind),
      `${selection.kind} is not required at the discovery stage`,
    )
  }

  // A discovery question is not assessment knowledge, however well it matches.
  const assessment = buildKnowledgePackage(
    world,
    "assessment",
    contextOf("Posteingang"),
  )
  assert.equal(
    assessment.entries.some((s) => s.kind === "discovery_question"),
    false,
  )
})

test("seeded follow-up templates are curated for report retrieval", () => {
  const followUpTemplates = consultingKnowledgeSeed.filter(
    (candidate) => candidate.kind === "follow_up_template",
  )

  assert.ok(followUpTemplates.length > 0)
  assert.deepEqual(
    followUpTemplates.map((template) => template.stageScopes),
    followUpTemplates.map(() => ["report"]),
  )

  const packaged = buildKnowledgePackage(
    consultingKnowledgeSeed,
    "report",
    contextOf("Support Posteingang mit fehlender Baseline"),
  )

  assert.ok(
    packaged.entries.some((entry) => entry.kind === "follow_up_template"),
    "report retrieval did not expose seeded follow-up templates",
  )
})

test("an entry the curator did not scope to the stage is not retrieved", () => {
  const laterStageOnly = entry({
    code: "roadmap-only-question",
    kind: "discovery_question",
    processCodes: ["inbound-support"],
    stageScopes: ["roadmap"],
  })

  const packaged = buildKnowledgePackage(
    [...world, laterStageOnly],
    "discovery",
    contextOf("Posteingang"),
  )

  assert.equal(packaged.codes.includes("roadmap-only-question"), false)
})

test("a deactivated entry is excluded from retrieval and from anchoring", () => {
  const retired = [
    { ...taxonomy, active: false },
    ...world.filter((candidate) => candidate.code !== "email-support"),
  ]

  const packaged = buildKnowledgePackage(
    retired,
    "discovery",
    contextOf("Posteingang"),
  )

  // The retired taxonomy node was the only route from these words into the
  // graph, so nothing anchors and the curated baseline is returned instead.
  assert.equal(packaged.codes.includes("email-support"), false)
  assert.equal(packaged.fallback, true)
})

test("an engagement with no resolvable anchor still receives the curated baseline", () => {
  const packaged = buildKnowledgePackage(world, "discovery", contextOf(""))

  assert.equal(packaged.fallback, true)
  assert.ok(packaged.entries.length > 0, "the baseline package was empty")
  for (const selection of packaged.entries) {
    assert.ok(REQUIRED_KINDS.discovery.includes(selection.kind))
  }
})

test("the package the LLM receives is capped, per kind and overall", () => {
  const many = Array.from({ length: 40 }, (_, index) =>
    entry({
      code: `question-${String(index).padStart(2, "0")}`,
      kind: "discovery_question",
      processCodes: ["inbound-support"],
      sortOrder: index,
    }),
  )

  const packaged = buildKnowledgePackage(
    [...world, ...many],
    "discovery",
    contextOf("Posteingang"),
  )

  assert.ok(
    packaged.entries.length <= DEFAULT_PACKAGE_LIMITS.maxEntries,
    `package held ${packaged.entries.length} entries`,
  )

  const questions = packaged.entries.filter(
    (selection) => selection.kind === "discovery_question",
  )
  assert.ok(
    questions.length <= DEFAULT_PACKAGE_LIMITS.maxPerKind,
    `package held ${questions.length} discovery questions`,
  )
})

test("the package carries its selected codes in rank order for the Analysis Run", () => {
  const packaged = buildKnowledgePackage(
    world,
    "discovery",
    contextOf("Posteingang"),
  )

  assert.deepEqual(
    packaged.codes,
    packaged.entries.map((selection) => selection.code),
  )
  assert.deepEqual(
    packaged.entries.map((selection) => selection.rank),
    packaged.entries.map((_, index) => index + 1),
  )
})

test("every selection explains why it was selected", () => {
  const packaged = buildKnowledgePackage(
    world,
    "discovery",
    contextOf("Posteingang"),
  )

  for (const selection of packaged.entries) {
    assert.ok(
      selection.reasons.length > 0,
      `${selection.code} was selected without a reason`,
    )
  }
})

// --- Curation validity -----------------------------------------------------

const knownKinds = new Map<string, ConsultingKnowledgeKind>(
  world.map((existing) => [existing.code, existing.kind]),
)

test("a relationship to a code that does not exist is rejected", () => {
  const violations = findRelationshipViolations(
    entry({
      code: "new-question",
      kind: "discovery_question",
      processCodes: ["does-not-exist"],
    }),
    knownKinds,
  )

  assert.deepEqual(violations, [
    { slot: "processCodes", code: "does-not-exist", reason: "unknown_code" },
  ])
})

test("a relationship pointing at the wrong kind is rejected", () => {
  const violations = findRelationshipViolations(
    entry({
      code: "new-question",
      kind: "discovery_question",
      // A taxonomy node is not a process.
      processCodes: ["email-support"],
    }),
    knownKinds,
  )

  assert.deepEqual(violations, [
    { slot: "processCodes", code: "email-support", reason: "wrong_kind" },
  ])
})

test("an entry may not be curated against itself", () => {
  const violations = findRelationshipViolations(
    entry({
      code: "inbound-support",
      kind: "business_process",
      relatedCodes: ["inbound-support"],
    }),
    knownKinds,
  )

  assert.deepEqual(violations, [
    { slot: "relatedCodes", code: "inbound-support", reason: "self_reference" },
  ])
})

test("a fully curated entry passes validation", () => {
  assert.deepEqual(findRelationshipViolations(question, knownKinds), [])
})

// --- The curation browser --------------------------------------------------

test("the curation browser hides deactivated entries unless they are asked for", () => {
  const retired = entry({
    code: "retired-question",
    kind: "discovery_question",
    active: false,
  })

  const hidden = searchConsultingKnowledge([...world, retired], {
    domainCode: DOMAIN,
  })
  assert.equal(hidden.some((r) => r.entry.code === "retired-question"), false)

  const shown = searchConsultingKnowledge([...world, retired], {
    domainCode: DOMAIN,
    includeInactive: true,
  })
  assert.equal(shown.some((r) => r.entry.code === "retired-question"), true)
})

test("the curation browser honours its limit", () => {
  const limited = searchConsultingKnowledge(world, {
    domainCode: DOMAIN,
    limit: 2,
  })

  assert.equal(limited.length, 2)
})

// --- The shipped content ---------------------------------------------------

test("every seeded entry satisfies the curated contract", () => {
  for (const seeded of consultingKnowledgeSeed) {
    assert.doesNotThrow(
      () => consultingKnowledgeEntrySchema.parse(seeded),
      `${seeded.code} does not satisfy the entry contract`,
    )
  }
})

test("seeded codes are unique", () => {
  const codes = consultingKnowledgeSeed.map((seeded) => seeded.code)
  assert.equal(new Set(codes).size, codes.length)
})

test("the shipped content covers every approved kind of consulting knowledge", () => {
  const kinds = new Set(consultingKnowledgeSeed.map((seeded) => seeded.kind))

  for (const kind of consultingKnowledgeEntrySchema.shape.kind.options) {
    assert.equal(kinds.has(kind), true, `no seeded entry of kind ${kind}`)
  }
})

test("every seeded relationship resolves to a real entry of the right kind", () => {
  const known = new Map<string, ConsultingKnowledgeKind>(
    consultingKnowledgeSeed.map((seeded) => [seeded.code, seeded.kind]),
  )

  const violations = consultingKnowledgeSeed.flatMap((seeded) =>
    findRelationshipViolations(seeded, known).map(
      (violation) => `${seeded.code}.${violation.slot} → ${violation.code} (${violation.reason})`,
    ),
  )

  assert.deepEqual(violations, [])
})

test("the shipped content anchors a realistic Customer Operations engagement", () => {
  const packaged = buildKnowledgePackage(
    consultingKnowledgeSeed,
    "assessment",
    contextOf(
      "Der Kundenservice bearbeitet Anfragen im Posteingang und im Ticketsystem.",
      "Erstattungen und Reklamationen brauchen eine Freigabe.",
    ),
  )

  assert.equal(packaged.fallback, false, "no anchor resolved from real content")
  assert.ok(packaged.codes.length > 0)
  assert.ok(packaged.entries.length <= DEFAULT_PACKAGE_LIMITS.maxEntries)
})
