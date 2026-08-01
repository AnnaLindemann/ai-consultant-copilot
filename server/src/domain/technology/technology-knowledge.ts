import {
  technologyPackageSchema,
  type TechnologyCategory,
  type TechnologyPackage,
  type TechnologyProfile,
  type TechnologyProfileFilter,
  type TechnologyProvenance,
  type TechnologyRetrievalContext,
  type TechnologySelection,
  type TechnologySource,
} from "../../../../shared/technology-knowledge.schema.js"

// The Technology Knowledge Base's deterministic retrieval (roadmap Phase 5A).
//
// This module is pure: it takes curated profiles, their provenance, and a
// retrieval context, and returns the small, ordered package a later stage would
// hand to the LLM. It performs no I/O, holds no engagement state, and knows
// nothing about Prisma, Express, or a model provider (architecture.md §4.4).
//
// It follows the same pattern as the Consulting Knowledge Base's retrieval over
// a separate store (architecture.md §9.2), in this fixed order:
//
//   1. a structured filter narrows to *active* profiles, optionally within the
//      requested categories,
//   2. each surviving profile is scored on curated `matchTerms` against the
//      context's free text, with `tags` as a deliberately negligible signal,
//   3. profiles are ranked by an integer score, with the curator's sort order
//      and then the code as tie-breakers,
//   4. the result is capped per category and overall.
//
// There are no embeddings, no similarity, and no semantic retrieval. The
// Technology Knowledge Base stays structured — RAG over it is not part of
// Phase 10 (architecture.md §9.2).

// How much each signal is worth. A curated match term is the mechanism; a tag
// is an additional hint that can never outrank one, and an explicitly requested
// category is a modest, constant nudge rather than a selector — the category
// filter has already done the selecting.
const SIGNAL_WEIGHT = {
  matchTerm: 100,
  requestedCategory: 25,
  tag: 2,
} as const

export const DEFAULT_TECHNOLOGY_PACKAGE_LIMITS = {
  maxPerCategory: 3,
  maxProfiles: 10,
} as const

export type TechnologyPackageLimits = {
  maxPerCategory: number
  maxProfiles: number
}

// The **approval** provenance of each profile that has any, keyed by profile
// code. It is supplied rather than derived here because it lives in the
// Technology Update History, which is persistence — the domain is handed the
// answer, not the query (D5).
//
// A profile absent from this index has not been through the approval gate. That
// is not the same as having unknown origin: the profile carries its own origin
// declaration, which `provenanceOf` falls back to below.
export type TechnologyProvenanceIndex = ReadonlyMap<
  string,
  TechnologyProvenance
>

// Where a retrieved profile's information comes from.
//
// The approved history wins whenever it exists; otherwise the product's own
// declaration about content it shipped is used. The two are mutually exclusive
// by construction — the curator's apply path clears the declaration as it
// writes the history entry — so there is exactly one answer at any moment and
// nothing to drift.
//
// A seeded profile therefore reports its official source **and** an explicitly
// null proposal: it says where the information came from without ever implying
// that a human approved it.
const provenanceOf = (
  profile: TechnologyProfile,
  approved: TechnologyProvenanceIndex,
): TechnologyProvenance =>
  approved.get(profile.code) ?? {
    origin: profile.origin,
    sourceCodes: profile.originSourceCodes,
    proposalId: null,
    appliedAt: null,
  }

// --- Text matching ---------------------------------------------------------
//
// Whole, delimiter-separated terms only, so "chat" cannot be found inside
// "chatbot-lizenz" by accident. This mirrors the Consulting Knowledge Base's
// matching exactly; the two retrievals must not disagree about what a match is.

const normalizeText = (values: readonly string[]): string =>
  ` ${values.join(" ").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `

const containsTerm = (haystack: string, term: string): boolean => {
  const normalized = term.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  if (normalized.length === 0) return false

  return haystack.includes(` ${normalized} `)
}

// --- Scoring ---------------------------------------------------------------

type Scored = {
  profile: TechnologyProfile
  score: number
  reasons: string[]
}

const scoreProfile = (
  profile: TechnologyProfile,
  haystack: string,
  requestedCategories: ReadonlySet<string>,
): Omit<Scored, "profile"> | null => {
  const reasons: string[] = []
  let score = 0

  const matchedTerms = profile.matchTerms.filter((term) =>
    containsTerm(haystack, term),
  )
  if (matchedTerms.length > 0) {
    score += SIGNAL_WEIGHT.matchTerm * matchedTerms.length
    reasons.push(`matchTerm:${matchedTerms.join(",")}`)
  }

  const matchedTags = profile.tags.filter((tag) => containsTerm(haystack, tag))
  if (matchedTags.length > 0) {
    score += SIGNAL_WEIGHT.tag * matchedTags.length
    reasons.push(`tag:${matchedTags.join(",")}`)
  }

  if (requestedCategories.has(profile.categoryCode)) {
    score += SIGNAL_WEIGHT.requestedCategory
    reasons.push(`category:${profile.categoryCode}`)
  }

  if (score === 0) return null

  return { score, reasons }
}

// --- The package -----------------------------------------------------------

// Build the ranked technology package for a retrieval context.
//
// Deterministic by construction: identical profiles and an identical context
// always produce the same profiles in the same order, because every step after
// text matching works on integer weights and byte-wise code comparison.
//
// **A deprecated profile is never selected.** A recommendation must not be
// grounded in knowledge the curator has retired, and silently ranking a retired
// profile lower would be a quieter version of the same defect.
export const buildTechnologyPackage = (
  profiles: readonly TechnologyProfile[],
  provenance: TechnologyProvenanceIndex,
  context: TechnologyRetrievalContext,
  limits: TechnologyPackageLimits = DEFAULT_TECHNOLOGY_PACKAGE_LIMITS,
): TechnologyPackage => {
  const requestedCategories = new Set(context.categoryCodes)

  const candidates = profiles.filter(
    (profile) =>
      profile.status === "active" &&
      (requestedCategories.size === 0 ||
        requestedCategories.has(profile.categoryCode)),
  )

  const haystack = normalizeText(context.situationText)

  const scored = candidates
    .map((profile) => {
      const match = scoreProfile(profile, haystack, requestedCategories)
      return match === null ? null : { profile, ...match }
    })
    .filter((item): item is Scored => item !== null)

  // A context whose text resolves to no curated term is a real, working state —
  // an early engagement, or a caller asking only for a category. It still gets
  // the curated baseline for the categories in scope, ordered by the curator,
  // rather than nothing.
  const fallback = scored.length === 0
  const ranked: Scored[] = fallback
    ? candidates.map((profile) => ({
        profile,
        score: 0,
        reasons: ["baseline:category"],
      }))
    : scored

  const ordered = [...ranked].sort(compareScored)

  const perCategory = new Map<string, number>()
  const selected: TechnologySelection[] = []

  for (const item of ordered) {
    if (selected.length >= limits.maxProfiles) break

    const taken = perCategory.get(item.profile.categoryCode) ?? 0
    if (taken >= limits.maxPerCategory) continue
    perCategory.set(item.profile.categoryCode, taken + 1)

    selected.push({
      code: item.profile.code,
      categoryCode: item.profile.categoryCode,
      title: item.profile.title,
      summary: item.profile.summary,
      details: item.profile.details,
      provenance: provenanceOf(item.profile, provenance),
      reasons: item.reasons,
      score: item.score,
      rank: selected.length + 1,
    })
  }

  return technologyPackageSchema.parse({
    categoryCodes: [...requestedCategories].sort(compareCodes),
    profiles: selected,
    codes: selected.map((selection) => selection.code),
    fallback,
  })
}

// --- The curation browser --------------------------------------------------
//
// A separate path from retrieval, on purpose: an administrator looking a
// profile up by hand may search by text, and that freedom must never leak into
// what a stage sends to a model.
export const searchTechnologyProfiles = (
  profiles: readonly TechnologyProfile[],
  filter: TechnologyProfileFilter,
): TechnologyProfile[] => {
  const queryTerms =
    filter.query === undefined
      ? []
      : filter.query
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((token) => token.length > 1)

  const matched = profiles.filter((profile) => {
    if (
      filter.categoryCode !== undefined &&
      profile.categoryCode !== filter.categoryCode
    ) {
      return false
    }

    if (filter.status !== undefined && profile.status !== filter.status) {
      return false
    }

    if (queryTerms.length === 0) return true

    const haystack = normalizeText([
      profile.code,
      profile.title,
      profile.summary,
      ...profile.tags,
      ...profile.matchTerms,
    ])

    return queryTerms.some((term) => containsTerm(haystack, term))
  })

  const ordered = matched.sort((left, right) =>
    compareScored(
      { profile: left, score: 0, reasons: [] },
      { profile: right, score: 0, reasons: [] },
    ),
  )

  return filter.limit === undefined ? ordered : ordered.slice(0, filter.limit)
}

// --- Curation validity -----------------------------------------------------

export type TechnologyCategoryViolation =
  | { reason: "unknown_category"; code: string }
  | { reason: "inactive_category"; code: string }

// Every profile is classified under **exactly one** Technology Category, and
// that category has to exist and be usable. This is an explicit documented
// invariant (domain-model.md §2, §4.2, §8; architecture.md §9.2), so a profile
// pointing at a category that is missing or retired is refused at curation time
// rather than silently degrading retrieval later.
export const findCategoryViolation = (
  categoryCode: string,
  categories: readonly TechnologyCategory[],
): TechnologyCategoryViolation | null => {
  const category = categories.find((one) => one.code === categoryCode)

  if (category === undefined) {
    return { reason: "unknown_category", code: categoryCode }
  }

  if (!category.active) {
    return { reason: "inactive_category", code: categoryCode }
  }

  return null
}

// The source codes a proposal cites that the trusted-source registry does not
// contain. A proposal may cite only sources that actually exist: inventing a
// provenance is a form of fabricated grounding (agent-rules.md §4.1, §12).
export const unknownSourceCodes = (
  sourceCodes: readonly string[],
  sources: readonly TechnologySource[],
): string[] => {
  const known = new Set(
    sources.filter((source) => source.active).map((source) => source.code),
  )

  return [...new Set(sourceCodes.filter((code) => !known.has(code)))].sort(
    compareCodes,
  )
}

// --- Ordering --------------------------------------------------------------

// Byte-wise, not `localeCompare`: a locale-sensitive comparison would make the
// order depend on the host's collation, and "identical inputs produce identical
// ordered results" has to hold everywhere, not just on one machine.
const compareCodes = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const compareScored = (left: Scored, right: Scored): number => {
  if (left.score !== right.score) return right.score - left.score
  if (left.profile.sortOrder !== right.profile.sortOrder) {
    return left.profile.sortOrder - right.profile.sortOrder
  }

  return compareCodes(left.profile.code, right.profile.code)
}
