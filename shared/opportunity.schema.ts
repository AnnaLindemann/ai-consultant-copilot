import { z } from "zod"

import {
  assessmentDimensionKeySchema,
  assessmentFindingIdSchema,
} from "./assessment.schema.js"

const nonEmptyString = z.string().trim().min(1)

// One three-step scale for every judgement an Opportunity carries. Value,
// effort, impact, and confidence are different questions but the same coarse
// answer, and a coarse answer is the honest one: these are the consultant's
// view, not a measurement (domain-model.md §2 "Opportunity"; roadmap Phase 4).
export const opportunityLevelSchema = z.enum(["low", "medium", "high"])

// How the Assessment's **AI Readiness** dimension qualifies this opportunity
// (roadmap Phase 4 "Qualify opportunities against the Assessment's AI Readiness
// dimension"). `conditional` is the common, honest answer: worth pursuing once
// something named is in place.
export const aiReadinessQualificationSchema = z.enum([
  "ready",
  "conditional",
  "not_ready",
])

// An Opportunity's identity. It is minted by the server when the opportunity is
// first persisted and never derived from its own text or its rank, so
// re-wording a title and re-ordering the prioritization both leave everything
// that cites the opportunity still pointing at it (architecture.md §4.3
// traceability). Recommendations cite this identifier, never a title or a rank.
export const opportunityIdSchema = nonEmptyString

// An Opportunity originates from the Assessment (domain-model.md §2), so it
// names the findings it was carried forward from.
//
// **Identity is the finding's id, never its title.** A title is editable text;
// citing it would silently break the moment a consultant re-words a finding.
// The dimension and title travel alongside as a snapshot of how the finding
// read when this version was created, so a historical version still shows what
// it cited even after the Assessment has moved on. Only `findingId` is checked
// against the Assessment; the snapshot is written by the server, never trusted
// from a caller (agent-rules.md §3, §12 "no fabricated grounding").
export const assessmentFindingCitationSchema = z.object({
  findingId: assessmentFindingIdSchema,
  dimension: assessmentDimensionKeySchema,
  findingTitle: nonEmptyString,
})

// A figure in a success criterion. It is either known — carrying the value and
// where it came from — or explicitly unknown, carrying what the consultant has
// to establish. There is no third state, so a missing baseline can never be
// stored as an empty field pretending to be an answer (domain-model.md §2:
// "an absent baseline is a finding, not an empty field").
export const unknownSuccessCriterionValueSchema = z.object({
  status: z.literal("unknown"),
  // What has to be established, and from where. This is the "explicitly marked
  // for consultant validation" state.
  validationNote: nonEmptyString,
})

export const successCriterionValueSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("known"),
    value: nonEmptyString,
    // Where the figure came from, so its reliability is visible and an estimate
    // is never read as a measurement (domain-model.md §2; agent-rules.md §2A.5).
    source: nonEmptyString,
  }),
  unknownSuccessCriterionValueSchema,
])

// How the improvement would be recognized as having worked. Every Opportunity
// carries at least one, so value and impact are not the only thing a consultant
// can say about whether pursuing it paid off.
const successCriterionContentSchema = z.object({
  metric: nonEmptyString,
  // How the metric is (or would be) measured, so a number can be trusted and
  // re-measured later.
  measurementMethod: nonEmptyString,
  // Which system, report, or conversation the figure would be read from.
  dataSource: nonEmptyString,
  // What this criterion rests on, and anything still missing around it.
  assumptions: z.array(nonEmptyString),
})

export const successCriterionSchema = successCriterionContentSchema.extend({
  baseline: successCriterionValueSchema,
  target: successCriterionValueSchema,
  timeframe: successCriterionValueSchema,
})

// What the AI is allowed to return. It proposes *what to measure and how* —
// never the numbers. Baseline, target, and timeframe are structurally forced to
// the unknown state, so "the AI must not invent baseline values, targets, or
// expected impact" is a property of the contract rather than a hope about a
// prompt (agent-rules.md §2A.5 "no invented numbers", §12). The consultant
// fills them in from the client's own figures.
export const draftSuccessCriterionSchema = successCriterionContentSchema.extend({
  baseline: unknownSuccessCriterionValueSchema,
  target: unknownSuccessCriterionValueSchema,
  timeframe: unknownSuccessCriterionValueSchema,
})

// The qualification against AI Readiness. Anything short of `ready` has to name
// what stands in the way — an opportunity that is "not ready, for reasons left
// unsaid" tells the consultant nothing they can act on.
export const opportunityAiReadinessSchema = z
  .object({
    qualification: aiReadinessQualificationSchema,
    rationale: nonEmptyString,
    blockers: z.array(nonEmptyString),
  })
  .refine(
    (aiReadiness) =>
      aiReadiness.qualification === "ready" || aiReadiness.blockers.length > 0,
    {
      message:
        "An opportunity that is not AI-ready must name at least one blocker or condition",
    },
  )

// A candidate area where improvement could deliver business value, framed as an
// actionable improvement candidate and carrying the consultant's view of its
// value, effort, impact, and confidence so opportunities can be prioritized
// against one another (domain-model.md §2 "Opportunity").
const opportunityContentSchema = z.object({
  title: nonEmptyString,
  // The problem or bottleneck carried forward from the Assessment, and what
  // could be done about it. Kept as two fields so a problem is never quietly
  // restated as a solution.
  problem: nonEmptyString,
  improvement: nonEmptyString,

  value: opportunityLevelSchema,
  effort: opportunityLevelSchema,
  impact: opportunityLevelSchema,
  confidence: opportunityLevelSchema,

  aiReadiness: opportunityAiReadinessSchema,

  // What this opportunity's framing and weighting rest on beyond the cited
  // findings (agent-rules.md §5).
  assumptions: z.array(nonEmptyString),

  // Where this opportunity stands against the others, and why it stands
  // there. The rank is the prioritization; the rationale is what makes it
  // reviewable rather than asserted.
  priorityRank: z.number().int().positive(),
  priorityRationale: nonEmptyString,
})

type OpportunityContent = z.infer<typeof opportunityContentSchema>

const lowConfidenceStatesItsAssumptions = (opportunity: OpportunityContent) =>
  opportunity.confidence !== "low" || opportunity.assumptions.length > 0

const CONFIDENCE_MESSAGE = {
  message: "A low-confidence opportunity must state what its judgement rests on",
}

// Traceability backward into the Assessment. At least one citation, always: an
// opportunity unmoored from an identified problem is not valid output
// (agent-rules.md §7). Callers — the model and the consultant alike — supply
// finding *ids*; the server checks each one exists and resolves it into a
// citation itself.
const citedFindingIdsSchema = z.array(assessmentFindingIdSchema).min(1)

// The three shapes an opportunity travels in differ only in who owns the
// identifier, which is deliberately never the model's and never the browser's —
// exactly as an Assessment finding's does:
//
// - `draft`      — what the AI returns. It writes opportunities, not identities.
// - `submission` — what the consultant saves. Opportunities they kept carry the
//                  id they already had; ones they added carry none yet.
// - persisted    — what is stored and read back. Every opportunity has an id.

// What the AI returns: finding ids, and success criteria without figures.
export const opportunityDraftSchema = opportunityContentSchema
  .extend({
    sourceFindingIds: citedFindingIdsSchema,
    successCriteria: z.array(draftSuccessCriterionSchema).min(1),
  })
  .refine(lowConfidenceStatesItsAssumptions, CONFIDENCE_MESSAGE)

// What the consultant saves: finding ids, and success criteria they may have
// filled in from the client's own figures.
export const opportunitySubmissionSchema = opportunityContentSchema
  .extend({
    id: opportunityIdSchema.optional(),
    sourceFindingIds: citedFindingIdsSchema,
    successCriteria: z.array(successCriterionSchema).min(1),
  })
  .refine(lowConfidenceStatesItsAssumptions, CONFIDENCE_MESSAGE)

// What is stored and read back: an identity, and resolved citations carrying
// their snapshot.
export const opportunitySchema = opportunityContentSchema
  .extend({
    id: opportunityIdSchema,
    sourceFindings: z.array(assessmentFindingCitationSchema).min(1),
    successCriteria: z.array(successCriterionSchema).min(1),
  })
  .refine(lowConfidenceStatesItsAssumptions, CONFIDENCE_MESSAGE)

// The engagement's prioritized set of Opportunities. Ranks are checked here
// rather than left to the reader: a prioritization with a duplicate or a hole in
// its ordering is not a prioritization. The three shapes differ only in their
// opportunities, so the surrounding structure is written once.
const prioritizationOf = <Opportunity extends z.ZodType<{ priorityRank: number }>>(
  opportunity: Opportunity,
) =>
  z
    .object({
      summary: nonEmptyString,
      opportunities: z.array(opportunity),
      // What prioritization could not determine — surfaced, never filled in by
      // invention (agent-rules.md §5).
      gaps: z.array(nonEmptyString),
    })
    .refine(
      (prioritization) => hasContiguousRanks(prioritization.opportunities),
      {
        message:
          "Priority ranks must run from 1 to the number of opportunities, without gaps or duplicates",
      },
    )

export const opportunityPrioritizationDraftSchema = prioritizationOf(
  opportunityDraftSchema,
)
export const opportunityPrioritizationSubmissionSchema = prioritizationOf(
  opportunitySubmissionSchema,
)
export const opportunityPrioritizationSchema =
  prioritizationOf(opportunitySchema)

// Where the prioritized Opportunities stand in the human-in-the-loop cycle. AI
// output lands as an unreviewed draft; the consultant's edits are first-class
// state (architecture.md §5; agent-rules.md §10). It mirrors the Assessment's
// review state deliberately and is kept as this stage's own contract rather
// than shared, so neither stage's contract moves when the other's does.
export const opportunityReviewStateSchema = z.enum([
  "ai_draft",
  "consultant_edited",
  "accepted",
])

// A version is either the one being worked on or a preserved record of what was
// prioritized earlier. There is no third state and no deletion: a superseded
// version is kept exactly as it stood (architecture.md §4.3 on append-only
// versions; roadmap Phase 4 "prioritization is re-runnable").
export const opportunityVersionStatusSchema = z.enum(["active", "superseded"])

const hasContiguousRanks = (opportunities: { priorityRank: number }[]) => {
  const ranks = new Set(opportunities.map((one) => one.priorityRank))

  return (
    ranks.size === opportunities.length &&
    opportunities.every((one) => one.priorityRank <= opportunities.length)
  )
}

export type Opportunity = z.infer<typeof opportunitySchema>
export type OpportunityId = z.infer<typeof opportunityIdSchema>
export type OpportunityDraft = z.infer<typeof opportunityDraftSchema>
export type OpportunitySubmission = z.infer<typeof opportunitySubmissionSchema>
export type OpportunityLevel = z.infer<typeof opportunityLevelSchema>
export type OpportunityAiReadiness = z.infer<typeof opportunityAiReadinessSchema>
export type AiReadinessQualification = z.infer<
  typeof aiReadinessQualificationSchema
>
export type AssessmentFindingCitation = z.infer<
  typeof assessmentFindingCitationSchema
>
export type SuccessCriterion = z.infer<typeof successCriterionSchema>
export type SuccessCriterionValue = z.infer<typeof successCriterionValueSchema>
export type OpportunityPrioritization = z.infer<
  typeof opportunityPrioritizationSchema
>
export type OpportunityPrioritizationDraft = z.infer<
  typeof opportunityPrioritizationDraftSchema
>
export type OpportunityPrioritizationSubmission = z.infer<
  typeof opportunityPrioritizationSubmissionSchema
>
export type OpportunityReviewState = z.infer<typeof opportunityReviewStateSchema>
export type OpportunityVersionStatus = z.infer<
  typeof opportunityVersionStatusSchema
>

// The shape between the two server steps: citations resolved, identity not yet
// given. It is a type rather than a schema because nothing crosses a boundary
// in it — it exists only between `resolveCitations` and `identifyOpportunities`,
// and what is validated is what enters (draft/submission) and what is stored
// (persisted).
export type ResolvedOpportunity = Omit<Opportunity, "id"> & { id?: string }
export type ResolvedOpportunityPrioritization = Omit<
  OpportunityPrioritization,
  "opportunities"
> & { opportunities: ResolvedOpportunity[] }

// What a reader is told *about* one version, as opposed to what the version
// says: which number it is, whether it is the one being worked on, what
// produced it, which Assessment it was derived from, and when it was last
// touched and by whom (roadmap Phase 4; architecture.md §8 for the Analysis Run
// link).
export type OpportunityVersionSummary = {
  id: string
  versionNumber: number
  status: OpportunityVersionStatus
  reviewState: OpportunityReviewState
  // The optimistic-concurrency token. A save carries the revision it read and
  // is refused if the version has moved on since (architecture.md §13).
  revision: number
  createdAt: string
  createdByUserId: string | null
  createdByName: string | null
  lastModifiedAt: string
  lastModifiedByUserId: string | null
  lastModifiedByName: string | null
  // The Assessment this version was generated from — its revision for reading,
  // its fingerprint for deciding whether the version has since gone stale.
  sourceAssessmentRevision: number
  sourceAssessmentFingerprint: string
  // The Analysis Run behind the generation that produced this version.
  analysisRunId: string | null
  opportunityCount: number
}

export type OpportunityVersionDetail = OpportunityVersionSummary & {
  prioritization: OpportunityPrioritization
}

// Where the engagement's Opportunities stand, as one reader-facing answer: the
// version being worked on, whether the Assessment has moved on beneath it, and
// what the current Assessment fingerprints to.
export type OpportunityVersionState = {
  activeVersion: OpportunityVersionDetail | null
  // True when the Assessment has changed since the active version was
  // generated. It is a recommendation to regenerate, never an automatic
  // regeneration (agent-rules.md §15: "recommend regeneration — do not silently
  // change them").
  stale: boolean
  currentAssessmentRevision: number
  currentAssessmentFingerprint: string | null
}
