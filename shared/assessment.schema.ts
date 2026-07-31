import { z } from "zod"

const nonEmptyString = z.string().trim().min(1)

export const assessmentConfidenceSchema = z.enum(["low", "medium", "high"])

// The assessment dimensions of domain-model.md §2 "Assessment". They are values
// *within* the Assessment — AI Readiness included — never separate entities
// (coding-standards.md §6; architecture.md §4.2).
export const assessmentDimensionKeySchema = z.enum([
  "businessProcess",
  "data",
  "technology",
  "aiReadiness",
  "risks",
  "opportunities",
])

// Whether a finding is supported by the Discovery Profile or rests on reasoning
// that goes beyond it. The distinction has to be explicit so the consultant can
// tell facts from inferences (roadmap Phase 3; agent-rules.md §5).
export const assessmentFindingBasisSchema = z.enum([
  "discovery_fact",
  "assumption",
])

// A finding's identity. It is minted by the server when the finding is first
// persisted and never derived from the finding's own text, so re-wording a
// title leaves everything that cites the finding still pointing at it
// (architecture.md §4.3 traceability). Downstream stages cite this identifier,
// never a title.
export const assessmentFindingIdSchema = nonEmptyString

const assessmentFindingContentSchema = z.object({
  title: nonEmptyString,
  detail: nonEmptyString,
  basis: assessmentFindingBasisSchema,
  supportingFacts: z.array(nonEmptyString),
  assumptions: z.array(nonEmptyString),
  confidence: assessmentConfidenceSchema,
})

type AssessmentFindingContent = z.infer<typeof assessmentFindingContentSchema>

// A finding may never claim support it does not carry: a discovery-supported
// finding cites the facts behind it, and an assumption-based finding states the
// assumptions it rests on (agent-rules.md §3 "grounding is captured, not merely
// claimed", §12 "no fabricated grounding").
const carriesItsOwnSupport = (finding: AssessmentFindingContent) =>
  finding.basis === "discovery_fact"
    ? finding.supportingFacts.length > 0
    : finding.assumptions.length > 0

const SUPPORT_MESSAGE = {
  message:
    "A discovery_fact finding must cite at least one supporting fact; an assumption finding must state at least one assumption",
}

// The three shapes a finding travels in. They differ only in who owns the
// identifier, which is deliberately never the model's and never the browser's:
//
// - `draft`      — what the AI returns. It writes findings, not identities.
// - `submitted`  — what the consultant saves. Findings they kept carry the id
//                  they already had; findings they added carry none yet.
// - persisted    — what is stored and read back. Every finding has an id.
export const assessmentDraftFindingSchema = assessmentFindingContentSchema
  .refine(carriesItsOwnSupport, SUPPORT_MESSAGE)

export const assessmentSubmittedFindingSchema = assessmentFindingContentSchema
  .extend({ id: assessmentFindingIdSchema.optional() })
  .refine(carriesItsOwnSupport, SUPPORT_MESSAGE)

export const assessmentFindingSchema = assessmentFindingContentSchema
  .extend({ id: assessmentFindingIdSchema })
  .refine(carriesItsOwnSupport, SUPPORT_MESSAGE)

// What the Assessment could not determine, kept visible per dimension rather
// than filled in by invention (agent-rules.md §5 "gaps are surfaced").
export const assessmentGapSchema = z.object({
  dimension: assessmentDimensionKeySchema,
  description: nonEmptyString,
})

// The Assessment differs across the three shapes only in its findings, so the
// surrounding structure is written once rather than three times. All dimensions
// are required, so an Assessment always covers every documented perspective; a
// dimension the discovery cannot support carries an empty findings list and
// says so in its summary rather than being omitted.
const assessmentOf = <Finding extends z.ZodType>(finding: Finding) => {
  const dimension = z.object({
    summary: nonEmptyString,
    findings: z.array(finding),
  })

  return z.object({
    summary: nonEmptyString,
    dimensions: z.object({
      businessProcess: dimension,
      data: dimension,
      technology: dimension,
      aiReadiness: dimension,
      risks: dimension,
      opportunities: dimension,
    }),
    gaps: z.array(assessmentGapSchema),
  })
}

export const assessmentDraftSchema = assessmentOf(assessmentDraftFindingSchema)
export const assessmentSubmissionSchema = assessmentOf(
  assessmentSubmittedFindingSchema,
)
export const assessmentSchema = assessmentOf(assessmentFindingSchema)

export const assessmentDimensionSchema =
  assessmentSchema.shape.dimensions.shape.businessProcess

// Where the Assessment stands in the human-in-the-loop cycle: AI output lands as
// an unreviewed draft, and consultant edits are first-class state that a re-run
// may not silently overwrite (architecture.md §5, §7; agent-rules.md §10).
export const assessmentReviewStateSchema = z.enum([
  "ai_draft",
  "consultant_edited",
  "accepted",
])

export type Assessment = z.infer<typeof assessmentSchema>
export type AssessmentDraft = z.infer<typeof assessmentDraftSchema>
export type AssessmentSubmission = z.infer<typeof assessmentSubmissionSchema>
export type AssessmentDimension = z.infer<typeof assessmentDimensionSchema>
export type AssessmentDimensionKey = z.infer<typeof assessmentDimensionKeySchema>
export type AssessmentFinding = z.infer<typeof assessmentFindingSchema>
export type AssessmentFindingId = z.infer<typeof assessmentFindingIdSchema>
export type AssessmentFindingBasis = z.infer<typeof assessmentFindingBasisSchema>
export type AssessmentGap = z.infer<typeof assessmentGapSchema>
export type AssessmentConfidence = z.infer<typeof assessmentConfidenceSchema>
export type AssessmentReviewState = z.infer<typeof assessmentReviewStateSchema>
