import {
  consultingKnowledgeFilterSchema,
  knowledgePackageSchema,
  type ConsultingKnowledgeEntry,
  type ConsultingKnowledgeFilter,
  type ConsultingKnowledgeKind,
  type ConsultingKnowledgeSearchResult,
  type KnowledgeAnchors,
  type KnowledgePackage,
  type KnowledgeRetrievalStage,
  type KnowledgeSelection,
} from "../../../../shared/consulting-knowledge.schema.js"
import { createSha256Hash } from "../../lib/create-sha256-hash.js"

// The Consulting Knowledge Base's deterministic retrieval (roadmap Phase 5).
//
// This module is pure: it takes curated entries and an engagement context and
// returns the small, ordered package a stage hands to the LLM. It performs no
// I/O, holds no engagement state, and knows nothing about Prisma, Express, or a
// model provider (architecture.md §4.4).
//
// The retrieval is **structural**, in this fixed order:
//
//   1. the consulting stage decides which *kinds* of knowledge are required,
//   2. a structured filter narrows to the domain's active, stage-scoped entries
//      of those kinds,
//   3. anchors are resolved from the engagement into *codes* — taxonomy first,
//      then the processes, problems, and use cases those taxonomy codes are
//      curated against,
//   4. entries are selected by walking the explicit curated relationships to
//      those anchors,
//   5. they are ranked by an integer score over typed relationships, with
//      curator sort order and then code as tie-breakers,
//   6. the result is capped per kind and overall.
//
// There are no embeddings, no similarity, and no semantic retrieval: those are
// Phase 10 (roadmap Phase 5 "no embeddings, no semantic retrieval at this
// phase"). Tags contribute a deliberately negligible weight and can never
// select an entry on their own.

// --- Stage → required kinds ------------------------------------------------
//
// Discovery questions and the domain's process/problem vocabulary shape
// Discovery; frameworks and AI-readiness criteria shape the Assessment (roadmap
// Phase 5 scope); AI Use Cases and Solution Patterns ground Recommendations
// (roadmap Phase 6 scope). Nothing is retrieved for a stage that does not
// consume knowledge yet.
export const REQUIRED_KINDS: Record<
  KnowledgeRetrievalStage,
  readonly ConsultingKnowledgeKind[]
> = {
  discovery: [
    "discovery_question",
    "customer_operations_taxonomy",
    "business_process",
    "business_problem",
    "follow_up_template",
  ],
  assessment: [
    "assessment_framework",
    "ai_readiness_criterion",
    "business_problem",
    "ai_use_case",
    "risk_model",
    "best_practice",
  ],
  // Exactly the two kinds Phase 6 names — "match Opportunities against the
  // Consulting Knowledge Base (**AI Use Cases**, **Solution Patterns**)". The
  // Implementation Patterns that inform sequencing are Phase 7's, and the
  // follow-up templates are Phase 8's; retrieving them here would be building
  // ahead of the phase in front of us (architecture.md §1.6).
  solution_matching: ["ai_use_case", "solution_pattern"],
  roadmap: ["implementation_pattern"],
  report: ["follow_up_template"],
}

// How much each *typed* relationship to an anchor is worth. The weights are
// ordered by how specific the relationship is: being an anchor outranks
// realizing one, which outranks sharing its process, which outranks sharing its
// taxonomy node. `tag` is last by an order of magnitude — it is an additional
// signal, never the mechanism.
const RELATIONSHIP_WEIGHT = {
  anchor: 100,
  useCase: 50,
  problem: 40,
  process: 30,
  taxonomy: 20,
  related: 10,
  tag: 2,
} as const

export const DEFAULT_PACKAGE_LIMITS = {
  maxPerKind: 4,
  maxEntries: 12,
} as const

export type KnowledgePackageLimits = {
  maxPerKind: number
  maxEntries: number
}

// The engagement facts retrieval is allowed to see. It is deliberately a plain
// value rather than the Engagement row: the domain layer must not depend on
// persistence, and the retrieval must be testable without one.
export type EngagementKnowledgeContext = {
  domainCode: string
  // Free text the consultant or client entered. It is never matched against
  // entry prose — only against the curated `matchTerms` that resolve it into
  // taxonomy and process *codes*.
  situationText: readonly string[]
}

const normalizeConsultingKnowledgeFilter = (
  filter: ConsultingKnowledgeFilter,
): ConsultingKnowledgeFilter => consultingKnowledgeFilterSchema.parse(filter)

// --- Anchor resolution -----------------------------------------------------

// Fold the engagement's free text into one normalized haystack. Matching is
// done on whole, delimiter-separated terms so "chat" cannot be found inside
// "chatbot-lizenz" by accident.
const normalizeText = (values: readonly string[]): string =>
  ` ${values.join(" ").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `

const containsTerm = (haystack: string, term: string): boolean => {
  const normalized = term.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  if (normalized.length === 0) return false

  return haystack.includes(` ${normalized} `)
}

const intersects = (
  left: readonly string[],
  right: ReadonlySet<string>,
): string[] => left.filter((code) => right.has(code))

// Resolve the engagement into curated codes. Every step after this one works on
// codes and relationships alone — this is the only place free text is read, and
// it produces identifiers rather than a ranking.
export const resolveKnowledgeAnchors = (
  entries: readonly ConsultingKnowledgeEntry[],
  context: EngagementKnowledgeContext,
): KnowledgeAnchors => {
  const inDomain = entries.filter(
    (entry) => entry.active && entry.domainCode === context.domainCode,
  )
  const haystack = normalizeText(context.situationText)

  const matchesSituation = (entry: ConsultingKnowledgeEntry): boolean =>
    entry.matchTerms.some((term) => containsTerm(haystack, term))

  const taxonomy = new Set(
    inDomain
      .filter(
        (entry) =>
          entry.kind === "customer_operations_taxonomy" &&
          matchesSituation(entry),
      )
      .map((entry) => entry.code),
  )

  const processes = new Set(
    inDomain
      .filter(
        (entry) =>
          entry.kind === "business_process" &&
          (matchesSituation(entry) ||
            intersects(entry.taxonomyCodes, taxonomy).length > 0),
      )
      .map((entry) => entry.code),
  )

  // A process that was matched directly pulls in the taxonomy nodes it is
  // curated against, so the graph stays connected in both directions.
  for (const entry of inDomain) {
    if (entry.kind !== "business_process" || !processes.has(entry.code)) continue
    for (const code of entry.taxonomyCodes) taxonomy.add(code)
  }

  const problems = new Set(
    inDomain
      .filter(
        (entry) =>
          entry.kind === "business_problem" &&
          (matchesSituation(entry) ||
            intersects(entry.processCodes, processes).length > 0 ||
            intersects(entry.taxonomyCodes, taxonomy).length > 0),
      )
      .map((entry) => entry.code),
  )

  const useCases = new Set(
    inDomain
      .filter(
        (entry) =>
          entry.kind === "ai_use_case" &&
          (intersects(entry.problemCodes, problems).length > 0 ||
            intersects(entry.processCodes, processes).length > 0 ||
            intersects(entry.taxonomyCodes, taxonomy).length > 0),
      )
      .map((entry) => entry.code),
  )

  return {
    taxonomyCodes: sortedCodes(taxonomy),
    processCodes: sortedCodes(processes),
    problemCodes: sortedCodes(problems),
    useCaseCodes: sortedCodes(useCases),
  }
}

// --- Scoring ---------------------------------------------------------------

type Scored = {
  entry: ConsultingKnowledgeEntry
  score: number
  reasons: string[]
}

type Match = Omit<Scored, "entry">

const scoreAgainstAnchors = (
  entry: ConsultingKnowledgeEntry,
  anchors: KnowledgeAnchors,
): Match | null => {
  const taxonomy = new Set(anchors.taxonomyCodes)
  const processes = new Set(anchors.processCodes)
  const problems = new Set(anchors.problemCodes)
  const useCases = new Set(anchors.useCaseCodes)
  const anchorCodes = new Set([
    ...anchors.taxonomyCodes,
    ...anchors.processCodes,
    ...anchors.problemCodes,
    ...anchors.useCaseCodes,
  ])

  const reasons: string[] = []
  let score = 0

  const credit = (
    weight: number,
    label: string,
    matched: readonly string[],
  ) => {
    if (matched.length === 0) return
    score += weight * matched.length
    reasons.push(`${label}:${matched.join(",")}`)
  }

  if (anchorCodes.has(entry.code)) {
    score += RELATIONSHIP_WEIGHT.anchor
    reasons.push(`anchor:${entry.code}`)
  }

  credit(RELATIONSHIP_WEIGHT.useCase, "useCase", intersects(entry.useCaseCodes, useCases))
  credit(RELATIONSHIP_WEIGHT.problem, "problem", intersects(entry.problemCodes, problems))
  credit(RELATIONSHIP_WEIGHT.process, "process", intersects(entry.processCodes, processes))
  credit(RELATIONSHIP_WEIGHT.taxonomy, "taxonomy", intersects(entry.taxonomyCodes, taxonomy))
  credit(RELATIONSHIP_WEIGHT.related, "related", intersects(entry.relatedCodes, anchorCodes))

  // Tags are the only untyped signal, and they are weighted so that no number
  // of tag hits can outrank a single typed relationship.
  credit(RELATIONSHIP_WEIGHT.tag, "tag", intersects(entry.tags, anchorCodes))

  if (score === 0) return null

  return { score, reasons }
}

// --- The package -----------------------------------------------------------

export const buildKnowledgePackage = (
  entries: readonly ConsultingKnowledgeEntry[],
  stage: KnowledgeRetrievalStage,
  context: EngagementKnowledgeContext,
  limits: KnowledgePackageLimits = DEFAULT_PACKAGE_LIMITS,
): KnowledgePackage => {
  const requiredKinds = new Set<string>(REQUIRED_KINDS[stage])

  // Step 2: the structured filter. Inactive entries, other domains, other
  // kinds, and entries the curator did not scope to this stage never reach the
  // ranking at all.
  const candidates = entries.filter(
    (entry) =>
      entry.active &&
      entry.domainCode === context.domainCode &&
      requiredKinds.has(entry.kind) &&
      entry.stageScopes.includes(stage),
  )

  const anchors = resolveKnowledgeAnchors(entries, context)

  const scored = candidates
    .map((entry) => {
      const match = scoreAgainstAnchors(entry, anchors)
      return match === null ? null : { entry, ...match }
    })
    .filter((item): item is Scored => item !== null)

  // Step 6 (fallback): an engagement whose situation resolves to no anchor is a
  // real, working state — an empty discovery, for instance. It still gets the
  // curated per-stage baseline rather than nothing, ordered by the curator.
  const fallback = scored.length === 0
  const ranked = fallback
    ? candidates.map((entry) => ({
        entry,
        score: 0,
        reasons: ["baseline:stage"],
      }))
    : scored

  const ordered = [...ranked].sort(compareScored)

  const perKind = new Map<string, number>()
  const selected: KnowledgeSelection[] = []

  for (const item of ordered) {
    if (selected.length >= limits.maxEntries) break

    const taken = perKind.get(item.entry.kind) ?? 0
    if (taken >= limits.maxPerKind) continue
    perKind.set(item.entry.kind, taken + 1)

    selected.push({
      code: item.entry.code,
      kind: item.entry.kind,
      title: item.entry.title,
      summary: item.entry.summary,
      revision: item.entry.revision,
      fingerprint: knowledgeEntryFingerprint(item.entry),
      details: item.entry.details,
      reasons: item.reasons,
      score: item.score,
      rank: selected.length + 1,
    })
  }

  return knowledgePackageSchema.parse({
    stage,
    domainCode: context.domainCode,
    anchors,
    entries: selected,
    codes: selected.map((selection) => selection.code),
    fallback,
  })
}

const knowledgeEntryFingerprint = (entry: ConsultingKnowledgeEntry): string =>
  createSha256Hash(
    JSON.stringify({
      code: entry.code,
      kind: entry.kind,
      domainCode: entry.domainCode,
      title: entry.title,
      summary: entry.summary,
      tags: entry.tags,
      matchTerms: entry.matchTerms,
      stageScopes: entry.stageScopes,
      taxonomyCodes: entry.taxonomyCodes,
      processCodes: entry.processCodes,
      problemCodes: entry.problemCodes,
      useCaseCodes: entry.useCaseCodes,
      relatedCodes: entry.relatedCodes,
      details: entry.details,
      sortOrder: entry.sortOrder,
      active: entry.active,
      revision: entry.revision,
    }),
  )

// --- The curation browser --------------------------------------------------
//
// A separate path from stage retrieval, on purpose: an administrator looking an
// entry up by hand may search by text, and that freedom must never leak into
// what a stage sends to a model.
export const searchConsultingKnowledge = (
  entries: readonly ConsultingKnowledgeEntry[],
  rawFilter: ConsultingKnowledgeFilter,
): ConsultingKnowledgeSearchResult[] => {
  const filter = normalizeConsultingKnowledgeFilter(rawFilter)
  const queryTerms =
    filter.query === undefined
      ? []
      : filter.query
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((token) => token.length > 1)

  const results: ConsultingKnowledgeSearchResult[] = []

  for (const entry of entries) {
    if (!entry.active && filter.includeInactive !== true) continue
    if (filter.kind !== undefined && entry.kind !== filter.kind) continue
    if (filter.domainCode !== undefined && entry.domainCode !== filter.domainCode) {
      continue
    }
    if (filter.stage !== undefined && !entry.stageScopes.includes(filter.stage)) {
      continue
    }
    if (
      filter.taxonomyCode !== undefined &&
      !entry.taxonomyCodes.includes(filter.taxonomyCode) &&
      entry.code !== filter.taxonomyCode
    ) {
      continue
    }
    if (
      filter.processCode !== undefined &&
      !entry.processCodes.includes(filter.processCode) &&
      entry.code !== filter.processCode
    ) {
      continue
    }
    if (
      filter.problemCode !== undefined &&
      !entry.problemCodes.includes(filter.problemCode) &&
      entry.code !== filter.problemCode
    ) {
      continue
    }
    if (
      filter.useCaseCode !== undefined &&
      !entry.useCaseCodes.includes(filter.useCaseCode) &&
      entry.code !== filter.useCaseCode
    ) {
      continue
    }

    const reasons: string[] = []
    let score = 0

    if (filter.kind !== undefined) reasons.push(`kind:${filter.kind}`)
    if (filter.stage !== undefined) reasons.push(`stage:${filter.stage}`)

    if (queryTerms.length > 0) {
      const haystack = normalizeText([
        entry.code,
        entry.title,
        entry.summary,
        ...entry.tags,
        ...entry.matchTerms,
      ])
      const hits = queryTerms.filter((term) => containsTerm(haystack, term))
      if (hits.length === 0) continue

      score += hits.length
      reasons.push(`query:${hits.join(",")}`)
    }

    results.push({
      entry,
      score,
      reasons: reasons.length > 0 ? reasons : ["browse:all"],
    })
  }

  const ordered = results.sort((left, right) =>
    compareScored(
      { entry: left.entry, score: left.score, reasons: left.reasons },
      { entry: right.entry, score: right.score, reasons: right.reasons },
    ),
  )

  return filter.limit === undefined ? ordered : ordered.slice(0, filter.limit)
}

// --- Curation validity -----------------------------------------------------

export type KnowledgeRelationshipViolation = {
  slot: "taxonomyCodes" | "processCodes" | "problemCodes" | "useCaseCodes" | "relatedCodes"
  code: string
  reason: "unknown_code" | "wrong_kind" | "self_reference"
}

// Which kind a typed relationship slot is allowed to point at. `relatedCodes`
// is deliberately untyped — it is the slot for cross-links that do not fit the
// graph — but it must still resolve to a real entry.
const SLOT_KIND: Record<
  Exclude<KnowledgeRelationshipViolation["slot"], "relatedCodes">,
  ConsultingKnowledgeKind
> = {
  taxonomyCodes: "customer_operations_taxonomy",
  processCodes: "business_process",
  problemCodes: "business_problem",
  useCaseCodes: "ai_use_case",
}

// A curated relationship that points at nothing, or at the wrong kind of thing,
// is a broken graph — and a broken graph silently degrades retrieval rather
// than failing loudly. It is refused at curation time instead.
export const findRelationshipViolations = (
  entry: ConsultingKnowledgeEntry,
  known: ReadonlyMap<string, ConsultingKnowledgeKind>,
): KnowledgeRelationshipViolation[] => {
  const violations: KnowledgeRelationshipViolation[] = []

  const check = (
    slot: KnowledgeRelationshipViolation["slot"],
    codes: readonly string[],
  ) => {
    for (const code of codes) {
      if (code === entry.code) {
        violations.push({ slot, code, reason: "self_reference" })
        continue
      }

      const kind = known.get(code)
      if (kind === undefined) {
        violations.push({ slot, code, reason: "unknown_code" })
        continue
      }

      if (slot !== "relatedCodes" && kind !== SLOT_KIND[slot]) {
        violations.push({ slot, code, reason: "wrong_kind" })
      }
    }
  }

  check("taxonomyCodes", entry.taxonomyCodes)
  check("processCodes", entry.processCodes)
  check("problemCodes", entry.problemCodes)
  check("useCaseCodes", entry.useCaseCodes)
  check("relatedCodes", entry.relatedCodes)

  return violations
}

// --- Ordering --------------------------------------------------------------

// Byte-wise, not `localeCompare`: a locale-sensitive comparison would make the
// order depend on the host's collation, and "identical inputs produce identical
// ordered results" has to hold everywhere, not just on one machine.
const compareCodes = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const sortedCodes = (codes: ReadonlySet<string>): string[] =>
  [...codes].sort(compareCodes)

const compareScored = (left: Scored, right: Scored): number => {
  if (left.score !== right.score) return right.score - left.score
  if (left.entry.sortOrder !== right.entry.sortOrder) {
    return left.entry.sortOrder - right.entry.sortOrder
  }

  return compareCodes(left.entry.code, right.entry.code)
}
