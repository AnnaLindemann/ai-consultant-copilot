import { z } from "zod"

// The contract of the curated Technology Knowledge Base (roadmap Phase 5A).
//
// It is a **separate subsystem** from the Consulting Knowledge Base, kept apart
// because AI technologies and models are released, revised, repriced, and
// deprecated far faster than consulting methodology knowledge changes
// (domain-model.md §4.2). Neither knowledge base depends on the other, and
// neither depends on an engagement.
//
// Four shapes live here and they are deliberately different:
//
//  - the **curated records** — Technology Categories, Technology Profiles, and
//    the Technology Source registry an administrator maintains;
//  - the **Technology Update Proposal** — the governance record of a *proposed*
//    change, approved or rejected;
//  - the **Technology Update History** — the append-only record of approved,
//    applied revisions only;
//  - the **technology package** — the small, ranked selection a later stage
//    hands to the LLM. The model never sees the knowledge base, only a package.

const nonEmptyText = z.string().trim().min(1)
const textList = z.array(nonEmptyText)
const codeList = z.array(nonEmptyText)

// A curated identifier. Everything — category membership, proposals, history
// entries, retrieval results — refers to a record by its code, never by its
// title (coding-standards.md §12A: never key off displayed text).
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "A code is lowercase words joined by single hyphens",
  })

// --- Technology Category ---------------------------------------------------
//
// The top-level organizing concept (domain-model.md §2). Categories are
// **curated data, not hard-coded types**, so the set is extensible without a
// code change (architecture.md Assumptions, coding-standards.md §6).
//
// The hierarchy is deliberately one level deep. Nesting is added "only if a
// real second level appears" (architecture.md §6, principle §1.6), so there is
// no parent code here to leave permanently null.

export const technologyCategorySchema = z.object({
  code: codeSchema,
  title: nonEmptyText,
  summary: nonEmptyText,

  // The curator's stable ordering — the first tie-breaker, and what makes an
  // equal-scoring result set reproducible.
  sortOrder: z.number().int(),
  active: z.boolean(),
  revision: z.number().int().nonnegative(),
})

export const technologyCategoryDraftSchema = technologyCategorySchema.omit({
  revision: true,
})

// --- Technology Source -----------------------------------------------------
//
// The official origin of technology information — the vendor or official
// channel an update legitimately comes from (domain-model.md §2). It is the
// provenance concept that makes updates auditable, and it is deliberately
// distinct from the **AI Providers** category: the Source is curation
// *provenance*, the AI Providers profile is curated *content*.

// Where a source officially publishes: an announcement feed, model cards,
// documentation (domain-model.md §2 "its name and official channel"). Modeled
// as records rather than a blob so a proposal can cite *which* channel it read.
export const technologyChannelSchema = z.object({
  label: nonEmptyText,
  url: z.string().trim().url(),
})

export const technologySourceSchema = z.object({
  code: codeSchema,
  name: nonEmptyText,
  summary: nonEmptyText,
  officialChannels: z.array(technologyChannelSchema).min(1),
  active: z.boolean(),
  revision: z.number().int().nonnegative(),
})

export const technologySourceDraftSchema = technologySourceSchema.omit({
  revision: true,
})

// --- Technology Profile ----------------------------------------------------
//
// The unit of knowledge the Technology Knowledge Base holds: one AI
// technology, tool, or model.
//
// The content facets are exactly the four the frozen documentation names —
// **role, strengths, limitations, and suitability** (domain-model.md §2 and
// §4.2; architecture.md §9.2; product-vision.md §6.2). Nothing else is
// modeled: hosting, pricing, deployment, integration characteristics, and
// supported-model lists are *not* in the approved model and would be invented
// fields. `suitability` is where "suitable use cases" and applicability live,
// expressed as durable consulting statements rather than comparative or
// promotional wording, so a profile stays reusable by later Recommendation,
// Roadmap, and Report stages.

export const technologyProfileDetailsSchema = z.object({
  // What this technology *is for* — the job it does in a solution.
  role: nonEmptyText,
  strengths: textList,
  limitations: textList,
  // When it fits, and for what. Durable applicability, not a sales claim.
  suitability: textList,
})

// Whether a profile is current or has been retired. A deprecated profile stays
// readable and stays citable by whatever already referenced it, but is never
// selected by retrieval — a recommendation must not be grounded in knowledge
// the curator has retired (domain-model.md §2: a proposal covers "new, revised,
// or deprecated technology/model information").
export const technologyProfileStatusSchema = z.enum(["active", "deprecated"])

// How a profile's **current content** came to be. It is origin metadata, and it
// is deliberately not approval history:
//
//  - `product_seed` — the content the product shipped in its initial catalogue.
//    No human approved it through the curator, so it has **no Technology Update
//    History entry**, and it must never be presented as though it had one.
//  - `curator` — the content was applied from an explicitly approved Technology
//    Update Proposal. From that point the append-only history is the record.
//
// The two are mutually exclusive at any moment, which is what keeps a single
// source of truth: seed content is described by the declaration below, curated
// content by its history entries.
export const technologyProfileOriginSchema = z.enum(["product_seed", "curator"])

export const technologyProfileSchema = z.object({
  code: codeSchema,

  // Exactly one category, always. This is an explicit documented invariant, not
  // a modeling convenience: domain-model.md §2, §4.2 and §8 and architecture.md
  // §9.2 each state that a profile is "classified under exactly one Technology
  // Category".
  categoryCode: codeSchema,

  title: nonEmptyText,
  summary: nonEmptyText,
  details: technologyProfileDetailsSchema,

  // The curated vocabulary by which a stage's free text is resolved into
  // *codes*. It is the only place free text meets curated technology
  // knowledge; ranking happens on codes and integer weights alone.
  matchTerms: textList,

  // A weak, additional retrieval signal. Retrieval is driven by category and
  // match terms; tags never select a profile on their own.
  tags: textList,

  status: technologyProfileStatusSchema,
  sortOrder: z.number().int(),

  origin: technologyProfileOriginSchema,

  // The official origins the **product** attributes its seeded content to.
  //
  // This is origin metadata, not approval provenance: it states which official
  // channel documents the technology, and it claims no human approval whatever.
  // It is populated only while `origin` is `product_seed`; the first approved
  // change clears it and hands the question to the Technology Update History,
  // so the two can never disagree.
  originSourceCodes: codeList,

  revision: z.number().int().nonnegative(),
})

// What a proposal carries as the profile it wants to see.
//
// A proposal describes **content**, never origin: how content arrived is
// decided by the path it arrived through, which is the curator's apply step and
// not something a drafter may assert. The revision likewise travels on the
// proposal's decision rather than inside the proposed content.
export const technologyProfileDraftSchema = technologyProfileSchema.omit({
  revision: true,
  origin: true,
  originSourceCodes: true,
})

// --- Technology Update Proposal --------------------------------------------
//
// The governance record of a *proposed* curation change (domain-model.md §2).
// It is not an engagement Analysis Run and never becomes one: an Analysis Run
// always belongs to an engagement, and curation belongs to none.

// What a proposal does to the knowledge base. These are the three changes the
// domain model names: "new, revised, or deprecated technology/model
// information".
export const technologyChangeKindSchema = z.enum([
  "create",
  "revise",
  "deprecate",
])

// Where a proposal stands. `pending` is the only state from which the knowledge
// base can still change; both decisions are terminal, so a decided proposal can
// never be re-decided or re-applied.
export const technologyProposalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
])

export const technologyUpdateProposalDraftSchema = z.object({
  changeKind: technologyChangeKindSchema,

  // Which profile the change targets, and under which category. A `create`
  // names the profile it would add; a `revise` and a `deprecate` name the one
  // they change.
  profileCode: codeSchema,
  categoryCode: codeSchema,

  // The profile as the curator proposes it should read. Absent for a
  // `deprecate`, which retires a profile rather than restating it.
  proposedProfile: technologyProfileDraftSchema.nullable(),

  // Why the change is proposed, what it rests on, and what remains unknown.
  // Assumptions and gaps are surfaced rather than resolved by invention — the
  // same honesty the product demands of AI output (agent-rules.md §5, §12).
  rationale: nonEmptyText,
  assumptions: textList,
  gaps: textList,

  // The trusted official origins this proposal derives from. At least one,
  // always: a proposal without a source is unattributable, and provenance is
  // the whole point of the Technology Source registry (domain-model.md §2;
  // architecture.md §9.3).
  sourceCodes: codeList.min(1),
})

export const technologyUpdateProposalSchema =
  technologyUpdateProposalDraftSchema.extend({
    id: nonEmptyText,
    status: technologyProposalStatusSchema,

    createdAt: nonEmptyText,
    createdByUserId: nonEmptyText.nullable(),
    createdByName: nonEmptyText.nullable(),

    // The explicit human decision. Nothing changes without it.
    decidedAt: nonEmptyText.nullable(),
    decidedByUserId: nonEmptyText.nullable(),
    decidedByName: nonEmptyText.nullable(),
    decisionNote: nonEmptyText.nullable(),

    // When the approved change actually reached the knowledge base. Approval
    // and application are recorded separately so "approved but not applied" is
    // never mistaken for "applied".
    appliedAt: nonEmptyText.nullable(),
  })

// The review surface's side-by-side (UI Kit A11 "diff"). It is computed from
// the stored current profile and the proposal's content at read time, never
// persisted: a stored diff would go stale the moment the profile moved.
export const technologyProposalFieldDiffSchema = z.object({
  field: nonEmptyText,
  before: z.array(z.string()),
  after: z.array(z.string()),
  changed: z.boolean(),
})

export const technologyProposalReviewSchema = z.object({
  proposal: technologyUpdateProposalSchema,
  // Null when the proposal creates a profile that does not exist yet.
  currentProfile: technologyProfileSchema.nullable(),
  diff: z.array(technologyProposalFieldDiffSchema),
  sources: z.array(technologySourceSchema),
})

// --- Technology Update History ---------------------------------------------
//
// The append-only audit log of **approved, applied** revisions only
// (domain-model.md §2). It never records a rejected proposal, it is never
// rewritten or deleted, and it is distinct from both the engagement-scoped
// Analysis Run and the workspace-scoped Audit Trail.

export const technologyUpdateHistoryEntrySchema = z.object({
  id: nonEmptyText,

  // The approved proposal this entry originates from. Exactly one.
  proposalId: nonEmptyText,

  profileCode: codeSchema,
  categoryCode: codeSchema,
  changeKind: technologyChangeKindSchema,

  // The Technology Source references, **preserved** on the entry rather than
  // read back through the proposal. The history has to keep answering "from
  // which official origin did this come?" even if the proposal record or the
  // source registry later changes (architecture.md §9.3).
  sourceCodes: codeList,

  // What the profile read as immediately after the change was applied. The
  // history is the record of how the knowledge base came to say what it says,
  // so it keeps the content, not only the fact that something changed.
  appliedProfile: technologyProfileSchema,

  approvedByUserId: nonEmptyText.nullable(),
  approvedByName: nonEmptyText.nullable(),
  appliedAt: nonEmptyText,
})

// --- Retrieval -------------------------------------------------------------
//
// `TechnologyRetrieval` (architecture.md §3, §9.2): deterministic and
// structured, filtering by **category** and matching on curated terms, over a
// separate store from the Consulting Knowledge Base. It stays structured —
// RAG over the Technology Knowledge Base is not part of Phase 10.

export const technologyRetrievalContextSchema = z.object({
  // Which kinds of technology are wanted. Empty means "any category".
  categoryCodes: codeList,
  // Free text a later stage supplies. It is never matched against profile
  // prose — only against curated `matchTerms`, which resolve it into codes.
  situationText: z.array(z.string()),
})

// The provenance travelling with a retrieved profile.
//
// Two kinds of answer, told apart by `origin` rather than blurred together:
//
//  - **`curator`** — resolved from the profile's most recent applied Technology
//    Update History entry, carrying the approving proposal and when it landed.
//    The audit record is the single source of truth here; it is never
//    duplicated onto the profile, so nothing can drift from a copy.
//  - **`product_seed`** — the product's own declared attribution for content it
//    shipped. `proposalId` and `appliedAt` stay `null`, because no approval
//    happened and none may be implied.
//
// A consumer that needs "has a human vouched for this?" reads `origin`; one
// that needs "where did the information come from?" reads `sourceCodes`. Both
// questions are answerable for every profile, and neither answer is invented.
export const technologyProvenanceSchema = z.object({
  origin: technologyProfileOriginSchema,
  sourceCodes: codeList,
  proposalId: nonEmptyText.nullable(),
  appliedAt: nonEmptyText.nullable(),
})

export const technologySelectionSchema = z.object({
  code: codeSchema,
  categoryCode: codeSchema,
  title: nonEmptyText,
  summary: nonEmptyText,
  details: technologyProfileDetailsSchema,
  provenance: technologyProvenanceSchema,
  // Why this profile was selected, as the signals that matched. It is what
  // makes a package explainable rather than merely ranked.
  reasons: z.array(nonEmptyText),
  score: z.number().int(),
  rank: z.number().int().positive(),
})

export const technologyPackageSchema = z.object({
  categoryCodes: codeList,
  profiles: z.array(technologySelectionSchema),
  // The selected codes in package order — the stable references a later stage
  // records for traceability.
  codes: codeList,
  // True when nothing matched and the curated per-category baseline was used.
  fallback: z.boolean(),
})

// --- Curation browsing -----------------------------------------------------
//
// The administrator's own lookup surface, deliberately separate from retrieval:
// a curator may search by text, and that freedom must never leak into what is
// sent to a model.

export const technologyProfileFilterSchema = z.object({
  categoryCode: codeSchema.optional(),
  status: technologyProfileStatusSchema.optional(),
  query: nonEmptyText.optional(),
  limit: z.number().int().positive().max(100).optional(),
})

export const technologyProposalFilterSchema = z.object({
  status: technologyProposalStatusSchema.optional(),
  profileCode: codeSchema.optional(),
  limit: z.number().int().positive().max(100).optional(),
})

export const technologyHistoryFilterSchema = z.object({
  profileCode: codeSchema.optional(),
  categoryCode: codeSchema.optional(),
  limit: z.number().int().positive().max(200).optional(),
})

// The decision an administrator records on a pending proposal. A rejection may
// carry a note; an approval applies the change and appends history.
export const technologyProposalDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: nonEmptyText.optional(),
})

export type TechnologyCategory = z.infer<typeof technologyCategorySchema>
export type TechnologyCategoryDraft = z.infer<
  typeof technologyCategoryDraftSchema
>
export type TechnologyChannel = z.infer<typeof technologyChannelSchema>
export type TechnologySource = z.infer<typeof technologySourceSchema>
export type TechnologySourceDraft = z.infer<typeof technologySourceDraftSchema>
export type TechnologyProfileDetails = z.infer<
  typeof technologyProfileDetailsSchema
>
export type TechnologyProfileStatus = z.infer<
  typeof technologyProfileStatusSchema
>
export type TechnologyProfileOrigin = z.infer<
  typeof technologyProfileOriginSchema
>
export type TechnologyProfile = z.infer<typeof technologyProfileSchema>
export type TechnologyProfileDraft = z.infer<typeof technologyProfileDraftSchema>
export type TechnologyChangeKind = z.infer<typeof technologyChangeKindSchema>
export type TechnologyProposalStatus = z.infer<
  typeof technologyProposalStatusSchema
>
export type TechnologyUpdateProposalDraft = z.infer<
  typeof technologyUpdateProposalDraftSchema
>
export type TechnologyUpdateProposal = z.infer<
  typeof technologyUpdateProposalSchema
>
export type TechnologyProposalFieldDiff = z.infer<
  typeof technologyProposalFieldDiffSchema
>
export type TechnologyProposalReview = z.infer<
  typeof technologyProposalReviewSchema
>
export type TechnologyUpdateHistoryEntry = z.infer<
  typeof technologyUpdateHistoryEntrySchema
>
export type TechnologyRetrievalContext = z.infer<
  typeof technologyRetrievalContextSchema
>
export type TechnologyProvenance = z.infer<typeof technologyProvenanceSchema>
export type TechnologySelection = z.infer<typeof technologySelectionSchema>
export type TechnologyPackage = z.infer<typeof technologyPackageSchema>
export type TechnologyProfileFilter = z.infer<
  typeof technologyProfileFilterSchema
>
export type TechnologyProposalFilter = z.infer<
  typeof technologyProposalFilterSchema
>
export type TechnologyHistoryFilter = z.infer<
  typeof technologyHistoryFilterSchema
>
export type TechnologyProposalDecision = z.infer<
  typeof technologyProposalDecisionSchema
>
