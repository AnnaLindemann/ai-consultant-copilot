import { z } from "zod"

import { assessmentSchema } from "../../../shared/assessment.schema.js"

// Regenerating over an Assessment the consultant has edited or accepted needs
// their explicit intent; without this flag such a re-run is refused
// (agent-rules.md §10).
export const generateAssessmentSchema = z.object({
  replaceConsultantEdits: z.boolean().optional(),
})

// The consultant's save is a complete Assessment snapshot, so findings and gaps
// can be edited, added, or removed on re-entry. `ai_draft` is deliberately not
// accepted here: a saved Assessment carries the consultant's authorship.
export const saveAssessmentSchema = z.object({
  assessment: assessmentSchema,
  reviewState: z.enum(["consultant_edited", "accepted"]).optional(),
})

export type GenerateAssessmentRequest = z.infer<typeof generateAssessmentSchema>
export type SaveAssessmentRequest = z.infer<typeof saveAssessmentSchema>
