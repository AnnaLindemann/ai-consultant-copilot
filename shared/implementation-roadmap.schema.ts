import { z } from "zod"

import { recommendationEffortLevelSchema, recommendationIdSchema } from "./recommendation.schema.js"

const nonEmptyText = z.string().trim().min(1)
const textList = z.array(nonEmptyText)

export const roadmapPhaseIdSchema = nonEmptyText
export const roadmapTemporaryPhaseKeySchema = nonEmptyText
export const roadmapReviewStateSchema = z.enum([
  "ai_draft",
  "consultant_edited",
  "accepted",
])
export const roadmapVersionStatusSchema = z.enum(["active", "superseded"])
export const roadmapRecommendationDispositionSchema = z.discriminatedUnion(
  "disposition",
  [
    z.object({
      recommendationId: recommendationIdSchema,
      disposition: z.literal("included"),
    }),
    z.object({
      recommendationId: recommendationIdSchema,
      disposition: z.literal("deferred"),
      rationale: z.string().trim(),
    }),
  ],
)

export const implementationPatternGroundingDraftSchema = z.object({
  code: nonEmptyText,
  rationale: nonEmptyText,
})

export const implementationPatternGroundingSchema =
  implementationPatternGroundingDraftSchema.extend({
    title: nonEmptyText,
    summary: nonEmptyText,
  })

const roadmapPhaseContentSchema = z.object({
  sequenceOrder: z.number().int().positive(),
  title: nonEmptyText,
  objective: nonEmptyText,
  scope: textList,
  expectedOutcome: nonEmptyText,
  linkedRecommendationIds: z.array(recommendationIdSchema).min(1),
  dependencyPhaseIds: z.array(roadmapPhaseIdSchema),
  explicitPrerequisites: textList,
  readinessConsiderations: textList,
  risks: textList,
  assumptions: textList,
  effort: z
    .object({
      level: recommendationEffortLevelSchema,
      rationale: nonEmptyText,
    })
    .nullable(),
  sequencingRationale: nonEmptyText,
})

export const roadmapPhaseDraftSchema = roadmapPhaseContentSchema.extend({
  implementationPatternGrounding: z.array(
    implementationPatternGroundingDraftSchema,
  ),
})

export const generatedRoadmapPhaseDraftSchema = roadmapPhaseContentSchema
  .omit({ dependencyPhaseIds: true })
  .extend({
    temporaryPhaseKey: roadmapTemporaryPhaseKeySchema,
    dependencyPhaseKeys: z.array(roadmapTemporaryPhaseKeySchema),
    implementationPatternGrounding: z.array(
      implementationPatternGroundingDraftSchema,
    ),
  })

export const roadmapPhaseSubmissionSchema = roadmapPhaseDraftSchema.extend({
  id: roadmapPhaseIdSchema.optional(),
})

export const roadmapPhaseSchema = roadmapPhaseContentSchema.extend({
  id: roadmapPhaseIdSchema,
  implementationPatternGrounding: z.array(implementationPatternGroundingSchema),
})

const roadmapOf = <Phase extends z.ZodType>(phase: Phase) =>
  z.object({
    summary: nonEmptyText,
    phases: z.array(phase).min(1),
    recommendationDispositions: z.array(roadmapRecommendationDispositionSchema),
    assumptions: textList,
    gaps: textList,
  })

export const generatedRoadmapDraftSchema = roadmapOf(
  generatedRoadmapPhaseDraftSchema,
)
export const roadmapDraftSchema = roadmapOf(roadmapPhaseDraftSchema)
export const roadmapSubmissionSchema = roadmapOf(roadmapPhaseSubmissionSchema)
export const roadmapSchema = roadmapOf(roadmapPhaseSchema)

export type RoadmapPhaseId = z.infer<typeof roadmapPhaseIdSchema>
export type RoadmapTemporaryPhaseKey = z.infer<
  typeof roadmapTemporaryPhaseKeySchema
>
export type RoadmapReviewState = z.infer<typeof roadmapReviewStateSchema>
export type RoadmapVersionStatus = z.infer<typeof roadmapVersionStatusSchema>
export type RoadmapRecommendationDisposition = z.infer<
  typeof roadmapRecommendationDispositionSchema
>
export type ImplementationPatternGrounding = z.infer<
  typeof implementationPatternGroundingSchema
>
export type ImplementationPatternGroundingDraft = z.infer<
  typeof implementationPatternGroundingDraftSchema
>
export type RoadmapPhaseDraft = z.infer<typeof roadmapPhaseDraftSchema>
export type GeneratedRoadmapPhaseDraft = z.infer<
  typeof generatedRoadmapPhaseDraftSchema
>
export type RoadmapPhaseSubmission = z.infer<typeof roadmapPhaseSubmissionSchema>
export type GeneratedRoadmapDraft = z.infer<typeof generatedRoadmapDraftSchema>
export type RoadmapPhase = z.infer<typeof roadmapPhaseSchema>
export type RoadmapDraft = z.infer<typeof roadmapDraftSchema>
export type RoadmapSubmission = z.infer<typeof roadmapSubmissionSchema>
export type Roadmap = z.infer<typeof roadmapSchema>

export type ResolvedRoadmapPhase = Omit<RoadmapPhase, "id"> & { id?: string }
export type ResolvedRoadmap = Omit<Roadmap, "phases"> & {
  phases: ResolvedRoadmapPhase[]
}

export type RoadmapVersionSummary = {
  id: string
  versionNumber: number
  status: RoadmapVersionStatus
  reviewState: RoadmapReviewState
  revision: number
  createdAt: string
  createdByUserId: string | null
  createdByName: string | null
  lastModifiedAt: string
  lastModifiedByUserId: string | null
  lastModifiedByName: string | null
  sourceRecommendationVersionId: string
  sourceRecommendationVersionNumber: number
  sourceRecommendationFingerprint: string
  analysisRunId: string | null
  phaseCount: number
}

export type RoadmapVersionDetail = RoadmapVersionSummary & {
  roadmap: Roadmap
}

export type RoadmapStageState = {
  activeVersion: RoadmapVersionDetail | null
  stale: boolean
  acceptedRecommendationVersionId: string | null
  acceptedRecommendationVersionNumber: number | null
  acceptedRecommendationFingerprint: string | null
  acceptedRecommendationsAvailable: boolean
  implementationPatternOptions: {
    code: string
    title: string
    summary: string
  }[]
}
