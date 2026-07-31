import { z } from "zod"

import { opportunityPrioritizationSubmissionSchema } from "../../../shared/opportunity.schema.js"

// Regenerating only accepts the explicit overwrite confirmation. Without it,
// the server refuses to replace consultant-edited work (roadmap Phase 4;
// architecture.md §4.3, §13).
export const prioritizeOpportunitiesSchema = z.object({
  replaceConsultantEdits: z.boolean().optional(),
})

// The consultant's save is a complete prioritization snapshot, so opportunities
// can be edited, added, removed, and re-ordered on re-entry. It names which
// version it is editing and which revision of that version it was read from —
// an autosave without the revision it read cannot be told apart from one that
// has already been overtaken (architecture.md §13).
//
// `ai_draft` is deliberately not accepted here: a saved prioritization carries
// the consultant's authorship. Findings are cited by id; the server resolves
// them into stored citations after checking each one exists.
export const saveOpportunitiesSchema = z.object({
  versionId: z.string().trim().min(1),
  expectedRevision: z.number().int().nonnegative(),
  prioritization: opportunityPrioritizationSubmissionSchema,
  reviewState: z.enum(["consultant_edited", "accepted"]).optional(),
})

export type PrioritizeOpportunitiesRequest = z.infer<
  typeof prioritizeOpportunitiesSchema
>
export type SaveOpportunitiesRequest = z.infer<typeof saveOpportunitiesSchema>
