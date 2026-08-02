import { z } from "zod"

import { roadmapSubmissionSchema } from "../../../shared/implementation-roadmap.schema.js"

export const generateRoadmapSchema = z.object({
  replaceConsultantEdits: z.boolean().optional(),
})

export const saveRoadmapSchema = z.object({
  versionId: z.string().trim().min(1),
  expectedRevision: z.number().int().nonnegative(),
  roadmap: roadmapSubmissionSchema,
  reviewState: z.enum(["consultant_edited", "accepted"]).optional(),
})

export type GenerateRoadmapRequest = z.infer<typeof generateRoadmapSchema>
export type SaveRoadmapRequest = z.infer<typeof saveRoadmapSchema>
