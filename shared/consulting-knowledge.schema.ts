import { z } from "zod"

// The contract of the curated Consulting Knowledge Base (roadmap Phase 5).
//
// Two things live here and they are deliberately different shapes:
//
//  - the **curated entry** — everything an administrator maintains, including
//    the explicit relationships retrieval walks;
//  - the **knowledge package** — the small, ranked selection a stage hands to
//    the LLM. The model never sees the knowledge base, only a package.

const nonEmptyText = z.string().trim().min(1)
const textList = z.array(nonEmptyText)
const codeList = z.array(nonEmptyText)

// The named kinds of consulting knowledge (domain-model.md §4.1). Technology
// Profiles are deliberately absent: they belong to the Technology Knowledge
// Base (Phase 5A), not here.
export const consultingKnowledgeKindSchema = z.enum([
  "business_domain",
  "business_process",
  "business_problem",
  "customer_operations_taxonomy",
  "discovery_question",
  "assessment_framework",
  "ai_readiness_criterion",
  "ai_use_case",
  "solution_pattern",
  "implementation_pattern",
  "roi_model",
  "risk_model",
  "best_practice",
  "follow_up_template",
])

// Which methodology stages an entry is curated for. The full methodology is
// listed so curation does not have to be revisited when a later phase starts
// consuming knowledge; only the stages in `knowledgeRetrievalStageSchema`
// actually retrieve today.
export const consultingKnowledgeStageSchema = z.enum([
  "discovery",
  "assessment",
  "prioritization",
  "solution_matching",
  "roadmap",
  "report",
])

// The stages that retrieve today: discovery questions shape Discovery,
// frameworks and AI-readiness criteria shape Assessment, AI Use Cases and
// Solution Patterns ground Recommendations, Implementation Patterns inform the
// Implementation Roadmap, and Follow-up Templates shape Report questions.
export const knowledgeRetrievalStageSchema = z.enum([
  "discovery",
  "assessment",
  "solution_matching",
  "roadmap",
  "report",
])

export const consultingKnowledgeDetailsSchema = z.object({
  objective: z.string().trim().nullable(),
  applicability: textList,
  questions: textList,
  criteria: textList,
  signals: textList,
  steps: textList,
  risks: textList,
  mitigations: textList,
  roiDrivers: textList,
  bestPractices: textList,
  notes: textList,
})

export const consultingKnowledgeEntrySchema = z.object({
  // A stable curated identifier. Everything — relationships, retrieval results,
  // Analysis Run traceability — refers to an entry by this code, never by title
  // (coding-standards.md §12A: never key off displayed text).
  code: nonEmptyText,
  kind: consultingKnowledgeKindSchema,
  domainCode: nonEmptyText,
  title: nonEmptyText,
  summary: nonEmptyText,

  // A weak, additional retrieval signal only. Retrieval is driven by codes,
  // taxonomy, and explicit relationships; tags never select an entry on their
  // own (roadmap Phase 5 "curated, structured, deterministic retrieval").
  tags: textList,

  // The curated vocabulary by which an engagement's free-text situation is
  // resolved into *codes*. It is used only to seed the anchor set; ranking is
  // done on relationships, never on these terms.
  matchTerms: textList,

  stageScopes: z.array(consultingKnowledgeStageSchema),

  // The explicit, typed relationships. These — not tags — are what retrieval
  // traverses. Each slot holds codes of exactly one kind.
  taxonomyCodes: codeList,
  processCodes: codeList,
  problemCodes: codeList,
  useCaseCodes: codeList,

  // Curated cross-links that do not fit one of the typed slots above (a use
  // case to its solution pattern, a pattern to its ROI model).
  relatedCodes: codeList,

  details: consultingKnowledgeDetailsSchema,

  // The curator's stable ordering within a kind. It is the first tie-breaker,
  // which is what makes an equal-scoring result set reproducible.
  sortOrder: z.number().int(),
  active: z.boolean(),

  // Bumped on every curated write; a stale revision is refused rather than
  // silently overwriting another curator's change.
  revision: z.number().int().nonnegative(),
})

// What an administrator submits. The revision travels separately on an update
// so a create cannot smuggle one in.
export const consultingKnowledgeEntryDraftSchema =
  consultingKnowledgeEntrySchema.omit({ revision: true })

// The curation browser's filter. This is the *curation* surface — an
// administrator looking things up by hand — and is deliberately not the stage
// retrieval path.
export const consultingKnowledgeFilterSchema = z.object({
  kind: consultingKnowledgeKindSchema.optional(),
  domainCode: nonEmptyText.optional(),
  stage: consultingKnowledgeStageSchema.optional(),
  taxonomyCode: nonEmptyText.optional(),
  processCode: nonEmptyText.optional(),
  problemCode: nonEmptyText.optional(),
  useCaseCode: nonEmptyText.optional(),
  query: nonEmptyText.optional(),
  limit: z.number().int().positive().max(100).optional(),
  includeInactive: z.boolean().optional(),
})

export const consultingKnowledgeSearchResultSchema = z.object({
  entry: consultingKnowledgeEntrySchema,
  score: z.number().int(),
  reasons: z.array(nonEmptyText),
})

// --- The knowledge package ------------------------------------------------
//
// The only knowledge shape that ever reaches a prompt. It carries the entries
// the retrieval selected and nothing else — the LLM does not search the
// knowledge base, it reasons over what was supplied (agent-rules.md §4).

export const knowledgeAnchorsSchema = z.object({
  taxonomyCodes: codeList,
  processCodes: codeList,
  problemCodes: codeList,
  useCaseCodes: codeList,
})

export const knowledgeSelectionSchema = z.object({
  code: nonEmptyText,
  kind: consultingKnowledgeKindSchema,
  title: nonEmptyText,
  summary: nonEmptyText,
  revision: z.number().int().nonnegative(),
  fingerprint: nonEmptyText,
  details: consultingKnowledgeDetailsSchema,
  // Why this entry was selected, expressed as the relationships that matched.
  // It is what makes a package explainable rather than merely ranked.
  reasons: z.array(nonEmptyText),
  score: z.number().int(),
  rank: z.number().int().positive(),
})

export const knowledgePackageSchema = z.object({
  stage: knowledgeRetrievalStageSchema,
  domainCode: nonEmptyText,
  anchors: knowledgeAnchorsSchema,
  entries: z.array(knowledgeSelectionSchema),
  // The selected codes in package order — the traceability record an Analysis
  // Run stores (roadmap Cross-cutting Capabilities; architecture.md §8).
  codes: codeList,
  // True when no anchor resolved and the curated per-stage baseline was used.
  fallback: z.boolean(),
})

export type ConsultingKnowledgeKind = z.infer<
  typeof consultingKnowledgeKindSchema
>
export type ConsultingKnowledgeStage = z.infer<
  typeof consultingKnowledgeStageSchema
>
export type KnowledgeRetrievalStage = z.infer<
  typeof knowledgeRetrievalStageSchema
>
export type ConsultingKnowledgeDetails = z.infer<
  typeof consultingKnowledgeDetailsSchema
>
export type ConsultingKnowledgeEntry = z.infer<
  typeof consultingKnowledgeEntrySchema
>
export type ConsultingKnowledgeEntryDraft = z.infer<
  typeof consultingKnowledgeEntryDraftSchema
>
export type ConsultingKnowledgeFilter = z.infer<
  typeof consultingKnowledgeFilterSchema
>
export type ConsultingKnowledgeSearchResult = z.infer<
  typeof consultingKnowledgeSearchResultSchema
>
export type KnowledgeAnchors = z.infer<typeof knowledgeAnchorsSchema>
export type KnowledgeSelection = z.infer<typeof knowledgeSelectionSchema>
export type KnowledgePackage = z.infer<typeof knowledgePackageSchema>
