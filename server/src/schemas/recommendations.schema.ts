import { z } from "zod"

import { recommendationSetSubmissionSchema } from "../../../shared/recommendation.schema.js"

// Regenerating only accepts the explicit overwrite confirmation. Without it, the
// server refuses to replace consultant-reviewed work (roadmap Phase 6;
// architecture.md §4.3, §13).
export const generateRecommendationsSchema = z.object({
  replaceConsultantEdits: z.boolean().optional(),
})

// The consultant's save is a complete recommendation set, so recommendations can
// be edited, added, removed, and re-grounded on re-entry. It names which version
// it is editing and which revision of that version it was read from — an autosave
// without the revision it read cannot be told apart from one that has already
// been overtaken (architecture.md §13).
//
// `ai_draft` is deliberately not accepted here: a saved set carries the
// consultant's authorship. Opportunities and curated knowledge are cited by
// code; the server resolves them into stored grounding after checking each one
// exists.
export const saveRecommendationsSchema = z.object({
  versionId: z.string().trim().min(1),
  expectedRevision: z.number().int().nonnegative(),
  recommendationSet: recommendationSetSubmissionSchema,
  reviewState: z.enum(["consultant_edited", "accepted"]).optional(),
})

export type GenerateRecommendationsRequest = z.infer<
  typeof generateRecommendationsSchema
>
export type SaveRecommendationsRequest = z.infer<
  typeof saveRecommendationsSchema
>
