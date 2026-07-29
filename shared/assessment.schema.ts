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

// A finding may never claim support it does not carry: a discovery-supported
// finding cites the facts behind it, and an assumption-based finding states the
// assumptions it rests on (agent-rules.md §3 "grounding is captured, not merely
// claimed", §12 "no fabricated grounding").
export const assessmentFindingSchema = z
  .object({
    title: nonEmptyString,
    detail: nonEmptyString,
    basis: assessmentFindingBasisSchema,
    supportingFacts: z.array(nonEmptyString),
    assumptions: z.array(nonEmptyString),
    confidence: assessmentConfidenceSchema,
  })
  .refine(
    (finding) =>
      finding.basis === "discovery_fact"
        ? finding.supportingFacts.length > 0
        : finding.assumptions.length > 0,
    {
      message:
        "A discovery_fact finding must cite at least one supporting fact; an assumption finding must state at least one assumption",
    },
  )

export const assessmentDimensionSchema = z.object({
  summary: nonEmptyString,
  findings: z.array(assessmentFindingSchema),
})

// What the Assessment could not determine, kept visible per dimension rather
// than filled in by invention (agent-rules.md §5 "gaps are surfaced").
export const assessmentGapSchema = z.object({
  dimension: assessmentDimensionKeySchema,
  description: nonEmptyString,
})

// All dimensions are required, so an Assessment always covers every documented
// perspective; a dimension the discovery cannot support carries an empty
// findings list and says so in its summary rather than being omitted.
export const assessmentSchema = z.object({
  summary: nonEmptyString,
  dimensions: z.object({
    businessProcess: assessmentDimensionSchema,
    data: assessmentDimensionSchema,
    technology: assessmentDimensionSchema,
    aiReadiness: assessmentDimensionSchema,
    risks: assessmentDimensionSchema,
    opportunities: assessmentDimensionSchema,
  }),
  gaps: z.array(assessmentGapSchema),
})

// Where the Assessment stands in the human-in-the-loop cycle: AI output lands as
// an unreviewed draft, and consultant edits are first-class state that a re-run
// may not silently overwrite (architecture.md §5, §7; agent-rules.md §10).
export const assessmentReviewStateSchema = z.enum([
  "ai_draft",
  "consultant_edited",
  "accepted",
])

export type Assessment = z.infer<typeof assessmentSchema>
export type AssessmentDimension = z.infer<typeof assessmentDimensionSchema>
export type AssessmentDimensionKey = z.infer<typeof assessmentDimensionKeySchema>
export type AssessmentFinding = z.infer<typeof assessmentFindingSchema>
export type AssessmentFindingBasis = z.infer<typeof assessmentFindingBasisSchema>
export type AssessmentGap = z.infer<typeof assessmentGapSchema>
export type AssessmentConfidence = z.infer<typeof assessmentConfidenceSchema>
export type AssessmentReviewState = z.infer<typeof assessmentReviewStateSchema>
