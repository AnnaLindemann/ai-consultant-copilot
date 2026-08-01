import { z } from "zod"

import { assessmentDimensionKeySchema, assessmentFindingIdSchema } from "./assessment.schema.js"
import { consultingKnowledgeKindSchema } from "./consulting-knowledge.schema.js"
import { opportunityIdSchema } from "./opportunity.schema.js"

import type { KnowledgeSelection } from "./consulting-knowledge.schema.js"
import type { TechnologySelection } from "./technology-knowledge.schema.js"

// The contract of Solution Matching & Grounded Recommendations (roadmap
// Phase 6).
//
// A Recommendation is "where explainability and traceability concentrate"
// (domain-model.md §2). Everything in this file exists to make that structural
// rather than hoped for: a recommendation carries its rationale, assumptions,
// confidence, and expected value, and it is traceable **backward** to the
// Discovery Profile facts that motivate it and **outward** to the Consulting
// Knowledge Base entries that justify its approach and the Technology Knowledge
// Base entries behind any technologies or models it names.
//
// The three shapes differ only in who owns the identifiers, which is
// deliberately never the model's and never the browser's:
//
//  - `draft`      — what the AI returns. It cites by *code* and by *opportunity
//                   id*; it writes recommendations, not identities.
//  - `submission` — what the consultant saves. Recommendations they kept carry
//                   the id they already had; ones they added carry none yet.
//  - persisted    — what is stored and read back. Every citation is resolved
//                   into a snapshot the server wrote, so a preserved version
//                   still shows what it was grounded in after the Opportunities
//                   and the knowledge bases have moved on (architecture.md
//                   §4.3, §9.4).

const nonEmptyText = z.string().trim().min(1)
const textList = z.array(nonEmptyText)

// A Recommendation's identity, minted by the server when it is first persisted
// and never derived from its own text. The Implementation Roadmap sequences
// accepted Recommendations, so what identifies one must survive re-wording.
export const recommendationIdSchema = nonEmptyText

// How strongly the grounding supports this proposal. Confidence "must not be
// inflated to make output look more authoritative than its grounding justifies"
// (agent-rules.md §6). It is this stage's own contract rather than a shared one,
// so neither stage's stored shape moves when the other's does.
export const recommendationConfidenceSchema = z.enum(["low", "medium", "high"])
export const recommendationEffortLevelSchema = z.enum(["low", "medium", "high"])

// --- Grounding: outward, into the two knowledge bases -----------------------

// What the caller supplies: a curated code and the reasoning taken from it. The
// reasoning is *copied into the engagement's own content* — the knowledge itself
// is never touched, and the record stays faithful to the knowledge as it stood
// when the work was done (domain-model.md §4.4; architecture.md §9.4).
export const knowledgeGroundingDraftSchema = z.object({
  code: nonEmptyText,
  // Why this curated entry justifies the approach for *this* client.
  rationale: nonEmptyText,
})

// What is stored: the code, the reasoning, and the kind/title snapshot the
// server read from the Consulting Knowledge Base. The snapshot is never taken
// from the caller — a fabricated title would be fabricated grounding
// (agent-rules.md §12).
export const knowledgeGroundingSchema = knowledgeGroundingDraftSchema.extend({
  kind: consultingKnowledgeKindSchema,
  title: nonEmptyText,
})

// A technology or model the recommendation names, and why it fits. The code is
// a Technology Profile's: the Technology Knowledge Base is used "only to
// recommend implementation technologies and suitable AI models, with
// explanations" (product-vision.md §6.2; agent-rules.md §4), so a named
// technology without a profile behind it is not valid output.
export const technologyGroundingDraftSchema = z.object({
  code: nonEmptyText,
  // Why this technology suits this opportunity — the explanation the vision
  // requires alongside every technology suggestion.
  fitRationale: nonEmptyText,
})

export const technologyGroundingSchema = technologyGroundingDraftSchema.extend({
  categoryCode: nonEmptyText,
  title: nonEmptyText,
})

// --- Grounding: backward, to the Discovery Profile facts --------------------

// The Assessment finding an Opportunity was carried forward from, together with
// the discovery facts behind it. The whole chain is resolved by the server from
// persisted state — recommendation → Opportunity → Assessment finding →
// discovery facts — so "traceable backward to Discovery Profile facts" is
// something the stored version *shows*, not something a reader has to
// reconstruct across three stages.
export const recommendationDiscoveryTraceSchema = z.object({
  findingId: assessmentFindingIdSchema,
  dimension: assessmentDimensionKeySchema,
  findingTitle: nonEmptyText,
  // The discovery facts the finding cited. Empty where the finding rests on an
  // assumption rather than on a discovery fact, or where the Assessment has
  // since been re-worked — an honest empty, never an invented fact.
  supportingFacts: textList,
})

// The Opportunity this recommendation addresses, resolved into the snapshot the
// stored version keeps. Identity is the opportunity's id, never its title and
// never its rank: both are editable, and citing either would silently break the
// moment a consultant re-words or re-orders the prioritization.
export const recommendationOpportunityCitationSchema = z.object({
  opportunityId: opportunityIdSchema,
  opportunityTitle: nonEmptyText,
  priorityRank: z.number().int().positive(),
  discoveryTrace: z.array(recommendationDiscoveryTraceSchema),
})

// --- Expected value ---------------------------------------------------------

// What the client would gain, in their own operational terms. It carries **no
// figures**: baselines and targets belong to the Opportunity's success criteria
// and to the Discovery Profile's value & measurement baseline, where they arrive
// from the client with a measurement method and a data source. A figure the AI
// supplied here would be an invented one (agent-rules.md §2A.5, §12).
export const recommendationExpectedValueSchema = z.object({
  summary: nonEmptyText,
  // What actually produces the value, so the claim can be checked rather than
  // merely read.
  drivers: textList.min(1),
})

// A bounded qualitative implementation effort signal for the consultant to
// review. Detailed estimates and sequencing belong to the Roadmap stage; this
// stage only records the rough level and why the recommendation is judged that
// way.
export const recommendationEffortSchema = z.object({
  level: recommendationEffortLevelSchema,
  rationale: nonEmptyText,
})

// --- The Recommendation -----------------------------------------------------

const recommendationContentSchema = z.object({
  title: nonEmptyText,
  // What to do. Kept apart from the rationale so a proposal is never quietly
  // restated as its own justification.
  approach: nonEmptyText,
  // Why it fits *this* opportunity and *this* client. "A recommendation without
  // a stated reason is incomplete" (agent-rules.md §7).
  rationale: nonEmptyText,
  expectedValue: recommendationExpectedValueSchema,
  effort: recommendationEffortSchema,
  // What the proposal rests on beyond the grounding it cites (agent-rules.md §5).
  assumptions: textList,
  confidence: recommendationConfidenceSchema,
})

type RecommendationContent = z.infer<typeof recommendationContentSchema>

const lowConfidenceStatesItsAssumptions = (
  recommendation: RecommendationContent,
) => recommendation.confidence !== "low" || recommendation.assumptions.length > 0

const CONFIDENCE_MESSAGE = {
  message:
    "A low-confidence recommendation must state what its proposal rests on",
}

// At least one Consulting Knowledge Base entry, always: "a recommendation that
// is not traceable to Consulting Knowledge Base knowledge is not valid output"
// (agent-rules.md §3). That the entry is of a *grounding* kind — an AI Use Case
// or a Solution Pattern — is checked where the kinds are known, on the server.
const citedKnowledgeSchema = z.array(knowledgeGroundingDraftSchema).min(1)

// Technologies are optional: a recommendation may name none. What it may not do
// is name one without a Technology Profile behind it, which is why they are
// modelled as coded citations rather than as free text.
const citedTechnologySchema = z.array(technologyGroundingDraftSchema)

// What the AI returns.
export const recommendationDraftSchema = recommendationContentSchema
  .extend({
    opportunityId: opportunityIdSchema,
    knowledgeGrounding: citedKnowledgeSchema,
    technologyGrounding: citedTechnologySchema,
  })
  .refine(lowConfidenceStatesItsAssumptions, CONFIDENCE_MESSAGE)

// What the consultant saves.
export const recommendationSubmissionSchema = recommendationContentSchema
  .extend({
    id: recommendationIdSchema.optional(),
    opportunityId: opportunityIdSchema,
    knowledgeGrounding: citedKnowledgeSchema,
    technologyGrounding: citedTechnologySchema,
  })
  .refine(lowConfidenceStatesItsAssumptions, CONFIDENCE_MESSAGE)

// What is stored and read back.
export const recommendationSchema = recommendationContentSchema
  .extend({
    id: recommendationIdSchema,
    opportunity: recommendationOpportunityCitationSchema,
    knowledgeGrounding: z.array(knowledgeGroundingSchema).min(1),
    technologyGrounding: z.array(technologyGroundingSchema),
  })
  .refine(lowConfidenceStatesItsAssumptions, CONFIDENCE_MESSAGE)

// The engagement's set of grounded Recommendations. The three shapes differ only
// in their recommendations, so the surrounding structure is written once.
const recommendationSetOf = <Recommendation extends z.ZodType>(
  recommendation: Recommendation,
) =>
  z.object({
    summary: nonEmptyText,
    recommendations: z.array(recommendation),
    // What solution matching could not determine — surfaced, never filled in by
    // invention (agent-rules.md §5). A prioritized Opportunity for which the
    // curated knowledge supports no proposal belongs here, not in an invented
    // recommendation.
    gaps: textList,
  })

export const recommendationSetDraftSchema = recommendationSetOf(
  recommendationDraftSchema,
)
export const recommendationSetSubmissionSchema = recommendationSetOf(
  recommendationSubmissionSchema,
)
export const recommendationSetSchema = recommendationSetOf(recommendationSchema)

// Where the Recommendations stand in the human-in-the-loop cycle. AI output
// lands as an unreviewed draft; the consultant's edits are first-class state
// (architecture.md §5; agent-rules.md §10). It mirrors the Assessment's and the
// Opportunities' review states deliberately, and is kept as this stage's own
// contract so neither stage's contract moves when the other's does.
export const recommendationReviewStateSchema = z.enum([
  "ai_draft",
  "consultant_edited",
  "accepted",
])

// A version is either the one being worked on or a preserved record of what was
// recommended earlier. There is no third state and no deletion: a superseded
// version is kept exactly as it stood (architecture.md §4.3).
export const recommendationVersionStatusSchema = z.enum([
  "active",
  "superseded",
])

export type Recommendation = z.infer<typeof recommendationSchema>
export type RecommendationId = z.infer<typeof recommendationIdSchema>
export type RecommendationDraft = z.infer<typeof recommendationDraftSchema>
export type RecommendationSubmission = z.infer<
  typeof recommendationSubmissionSchema
>
export type RecommendationConfidence = z.infer<
  typeof recommendationConfidenceSchema
>
export type RecommendationExpectedValue = z.infer<
  typeof recommendationExpectedValueSchema
>
export type RecommendationEffort = z.infer<typeof recommendationEffortSchema>
export type RecommendationEffortLevel = z.infer<
  typeof recommendationEffortLevelSchema
>
export type KnowledgeGrounding = z.infer<typeof knowledgeGroundingSchema>
export type KnowledgeGroundingDraft = z.infer<
  typeof knowledgeGroundingDraftSchema
>
export type TechnologyGrounding = z.infer<typeof technologyGroundingSchema>
export type TechnologyGroundingDraft = z.infer<
  typeof technologyGroundingDraftSchema
>
export type RecommendationDiscoveryTrace = z.infer<
  typeof recommendationDiscoveryTraceSchema
>
export type RecommendationOpportunityCitation = z.infer<
  typeof recommendationOpportunityCitationSchema
>
export type RecommendationSet = z.infer<typeof recommendationSetSchema>
export type RecommendationSetDraft = z.infer<typeof recommendationSetDraftSchema>
export type RecommendationSetSubmission = z.infer<
  typeof recommendationSetSubmissionSchema
>
export type RecommendationReviewState = z.infer<
  typeof recommendationReviewStateSchema
>
export type RecommendationVersionStatus = z.infer<
  typeof recommendationVersionStatusSchema
>

// The shape between the two server steps: grounding resolved, identity not yet
// given. A type rather than a schema because nothing crosses a boundary in it.
export type ResolvedRecommendation = Omit<Recommendation, "id"> & { id?: string }
export type ResolvedRecommendationSet = Omit<
  RecommendationSet,
  "recommendations"
> & { recommendations: ResolvedRecommendation[] }

// What a reader is told *about* one version, as opposed to what the version
// says: which number it is, whether it is the one being worked on, what produced
// it, which Opportunities it was matched against, and when it was last touched
// and by whom (architecture.md §8 for the Analysis Run link).
export type RecommendationVersionSummary = {
  id: string
  versionNumber: number
  status: RecommendationVersionStatus
  reviewState: RecommendationReviewState
  // The optimistic-concurrency token. A save carries the revision it read and is
  // refused if the version has moved on since (architecture.md §13).
  revision: number
  createdAt: string
  createdByUserId: string | null
  createdByName: string | null
  lastModifiedAt: string
  lastModifiedByUserId: string | null
  lastModifiedByName: string | null
  // The Opportunity version this was matched against — its number for reading,
  // its fingerprint for deciding whether this version has since gone stale.
  sourceOpportunityVersionId: string
  sourceOpportunityVersionNumber: number
  sourceOpportunityFingerprint: string
  // The Analysis Run behind the generation that produced this version.
  analysisRunId: string | null
  recommendationCount: number
}

export type RecommendationVersionDetail = RecommendationVersionSummary & {
  recommendationSet: RecommendationSet
}

// Where the engagement's Recommendations stand, as one reader-facing answer: the
// version being worked on, whether the Opportunities have moved on beneath it,
// and the deterministically retrieved knowledge the stage is grounded in — so
// what the consultant reads is what the model was given (architecture.md §5).
export type RecommendationStageState = {
  activeVersion: RecommendationVersionDetail | null
  // True when the prioritized Opportunities have changed since the active
  // version was generated. It is a recommendation to regenerate, never an
  // automatic regeneration (agent-rules.md §15).
  stale: boolean
  currentOpportunityVersionId: string | null
  currentOpportunityVersionNumber: number | null
  currentOpportunityFingerprint: string | null
  // The deterministically retrieved knowledge this engagement's recommendations
  // may be grounded in — the same packages the model is given, carrying why each
  // entry was selected. It is what makes the grounding reviewable: the
  // consultant sees the material the draft was built from, and can re-ground a
  // recommendation by hand rather than only accept or reject the model's choice.
  groundingOptions: {
    knowledge: KnowledgeSelection[]
    technology: TechnologySelection[]
  }
}
