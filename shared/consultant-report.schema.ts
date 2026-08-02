import { z } from "zod"

const nonEmptyText = z.string().trim().min(1)
const textList = z.array(nonEmptyText)

export const reportReviewStateSchema = z.enum([
  "draft",
  "manager_review",
  "approved",
])

export const reportVersionStatusSchema = z.enum(["active", "superseded"])
export const documentPublicationStatusSchema = z.enum([
  "active",
  "revoked",
  "superseded",
])

export const notificationAttemptOutcomeSchema = z.enum(["pending", "sent", "failed"])

export const followUpQuestionStatusSchema = z.enum([
  "draft",
  "approved",
  "removed",
])

export const followUpQuestionSourceTypeSchema = z.enum([
  "discovery_gap",
  "measurement_gap",
  "assessment_gap",
  "opportunity_gap",
  "recommendation_gap",
  "roadmap_gap",
])

export const followUpQuestionSchema = z.object({
  id: nonEmptyText,
  question: nonEmptyText,
  sourceType: followUpQuestionSourceTypeSchema,
  sourceGapId: nonEmptyText,
  sourceFingerprint: nonEmptyText,
  sourceDescription: nonEmptyText,
  templateCode: nonEmptyText.nullable(),
  templateEntryId: nonEmptyText.nullable(),
  templateVersion: z.number().int().positive().nullable(),
  templateFingerprint: nonEmptyText.nullable(),
  templateTitle: nonEmptyText.nullable(),
  rationale: nonEmptyText,
  status: followUpQuestionStatusSchema,
})

const sourceReferenceSchema = z.object({
  id: nonEmptyText,
  versionNumber: z.number().int().positive().optional(),
  priorityRank: z.number().int().positive().optional(),
  fingerprint: nonEmptyText,
})

const recommendationDispositionSnapshotSchema = z.discriminatedUnion(
  "disposition",
  [
    z.object({
      recommendationId: nonEmptyText,
      disposition: z.literal("included"),
    }),
    z.object({
      recommendationId: nonEmptyText,
      disposition: z.literal("deferred"),
      rationale: nonEmptyText,
    }),
  ],
)

const gapSnapshotSchema = z.object({
  id: nonEmptyText,
  sourceType: followUpQuestionSourceTypeSchema,
  description: nonEmptyText,
  fingerprint: nonEmptyText,
})

const followUpTemplateSnapshotSchema = z.object({
  entryId: nonEmptyText,
  code: nonEmptyText,
  version: z.number().int().positive(),
  fingerprint: nonEmptyText,
})

export const reportSourceSnapshotSchema = z.object({
  fingerprint: nonEmptyText,
  discoveryFingerprint: nonEmptyText,
  assessmentRevision: z.number().int().nonnegative(),
  assessmentFingerprint: nonEmptyText,
  opportunityVersionId: nonEmptyText,
  opportunityVersionNumber: z.number().int().positive(),
  opportunityFingerprint: nonEmptyText,
  opportunityVersions: z.array(sourceReferenceSchema),
  recommendationVersionId: nonEmptyText,
  recommendationVersionNumber: z.number().int().positive(),
  recommendationFingerprint: nonEmptyText,
  recommendationVersions: z.array(sourceReferenceSchema),
  recommendationDispositions: z.array(recommendationDispositionSnapshotSchema),
  roadmapVersionId: nonEmptyText,
  roadmapVersionNumber: z.number().int().positive(),
  roadmapFingerprint: nonEmptyText,
  gaps: z.array(gapSnapshotSchema),
  followUpTemplates: z.array(followUpTemplateSnapshotSchema),
})

export const consultantReportContentSchema = z.object({
  title: nonEmptyText,
  executiveSummary: nonEmptyText,
  engagementContext: z.object({
    organizationName: nonEmptyText,
    engagementTitle: nonEmptyText.nullable(),
    department: nonEmptyText.nullable(),
    statedProblem: nonEmptyText.nullable(),
    desiredOutcome: nonEmptyText.nullable(),
    businessImpact: nonEmptyText.nullable(),
  }),
  assessmentSummary: nonEmptyText,
  prioritizedProblems: z.array(
    z.object({
      opportunityId: nonEmptyText,
      title: nonEmptyText,
      problem: nonEmptyText,
      priorityRank: z.number().int().positive(),
      rationale: nonEmptyText,
    }),
  ),
  recommendations: z.array(
    z.object({
      recommendationId: nonEmptyText,
      title: nonEmptyText,
      approach: nonEmptyText,
      rationale: nonEmptyText,
      expectedValue: nonEmptyText,
      effort: z
        .object({
          level: z.enum(["low", "medium", "high"]),
          rationale: nonEmptyText,
        })
        .nullable(),
      confidence: z.enum(["low", "medium", "high"]),
    }),
  ),
  deferredRecommendations: z.array(
    z.object({
      recommendationId: nonEmptyText,
      title: nonEmptyText,
      rationale: nonEmptyText,
    }),
  ),
  roadmapSummary: nonEmptyText,
  roadmapPhases: z.array(
    z.object({
      phaseId: nonEmptyText,
      sequenceOrder: z.number().int().positive(),
      title: nonEmptyText,
      objective: nonEmptyText,
      expectedOutcome: nonEmptyText,
    }),
  ),
  assumptions: textList,
  risks: textList,
  nextSteps: textList,
  followUpQuestions: z.array(followUpQuestionSchema),
  sourceSnapshot: reportSourceSnapshotSchema,
})

export const generatedConsultantReportDraftSchema =
  consultantReportContentSchema.omit({ sourceSnapshot: true }).extend({
  followUpQuestions: z.array(
      followUpQuestionSchema.omit({
        id: true,
        sourceGapId: true,
        sourceFingerprint: true,
        templateEntryId: true,
        templateVersion: true,
        templateFingerprint: true,
        templateTitle: true,
      }),
    ),
    deferredRecommendations: z.array(
      z.object({
        recommendationId: nonEmptyText,
        title: nonEmptyText,
        rationale: nonEmptyText,
      }),
    ),
  })

export const consultantReportSubmissionSchema =
  consultantReportContentSchema.omit({ sourceSnapshot: true }).extend({
    followUpQuestions: z.array(
      followUpQuestionSchema
        .omit({
          sourceGapId: true,
          sourceFingerprint: true,
          templateEntryId: true,
          templateVersion: true,
          templateFingerprint: true,
          templateTitle: true,
        })
        .extend({ id: nonEmptyText.optional() }),
    ),
  })

export const generateConsultantReportSchema = z.object({
  replaceConsultantEdits: z.boolean().optional(),
})

export const saveConsultantReportSchema = z.object({
  versionId: nonEmptyText,
  expectedRevision: z.number().int().nonnegative(),
  report: consultantReportSubmissionSchema,
  reviewState: z.enum(["draft", "manager_review"]).optional(),
})

export const approveConsultantReportSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
})

export const publishConsultantReportSchema = z.object({
  title: nonEmptyText.optional(),
  managerMessage: nonEmptyText.nullable().optional(),
  notifyClient: z.boolean().optional(),
})

export const notifyReportPublicationSchema = z.object({
  requestKey: nonEmptyText,
})

export type ReportReviewState = z.infer<typeof reportReviewStateSchema>
export type ReportVersionStatus = z.infer<typeof reportVersionStatusSchema>
export type DocumentPublicationStatus = z.infer<
  typeof documentPublicationStatusSchema
>
export type NotificationAttemptOutcome = z.infer<
  typeof notificationAttemptOutcomeSchema
>
export type FollowUpQuestion = z.infer<typeof followUpQuestionSchema>
export type FollowUpQuestionStatus = z.infer<
  typeof followUpQuestionStatusSchema
>
export type FollowUpQuestionSourceType = z.infer<
  typeof followUpQuestionSourceTypeSchema
>
export type ConsultantReportContent = z.infer<
  typeof consultantReportContentSchema
>
export type ConsultantReport = ConsultantReportContent
export type GeneratedConsultantReportDraft = z.infer<
  typeof generatedConsultantReportDraftSchema
>
export type ConsultantReportSubmission = z.infer<
  typeof consultantReportSubmissionSchema
>
export type ReportSourceSnapshot = z.infer<typeof reportSourceSnapshotSchema>

export type DocumentPublicationSummary = {
  id: string
  reportVersionId: string
  reportVersionNumber: number
  status: DocumentPublicationStatus
  publishedAt: string
  publishedByUserId: string
  revokedAt: string | null
  revokedByUserId: string | null
  emailNotificationAttemptedAt: string | null
  emailNotificationDeliveredAt: string | null
  emailNotificationFailure: string | null
  clientUserId: string | null
  title: string
  managerMessage: string | null
  pdfArtifactId: string | null
  notificationAttempts: NotificationAttemptSummary[]
}

export type NotificationAttemptSummary = {
  id: string
  requestKey: string
  outcome: NotificationAttemptOutcome
  errorCategory: string | null
  attemptedAt: string
}

export type ReportVersionSummary = {
  id: string
  versionNumber: number
  status: ReportVersionStatus
  reviewState: ReportReviewState
  revision: number
  approvedAt: string | null
  approvedByUserId: string | null
  approvedSourceFingerprint: string | null
  createdAt: string
  createdByUserId: string | null
  createdByName: string | null
  lastModifiedAt: string
  lastModifiedByUserId: string | null
  lastModifiedByName: string | null
  sourceSnapshot: ReportSourceSnapshot
  analysisRunId: string | null
  followUpQuestionCount: number
  publication: DocumentPublicationSummary | null
}

export type ReportVersionDetail = ReportVersionSummary & {
  report: ConsultantReportContent
}

export type ReportPublicationRecipient = {
  userId: string
  email: string
  displayName: string | null
}

export type ReportStageState = {
  activeVersion: ReportVersionDetail | null
  stale: boolean
  eligible: boolean
  missingAcceptedSources: string[]
  currentSourceSnapshot: ReportSourceSnapshot | null
  followUpTemplateOptions: {
    code: string
    title: string
    summary: string
  }[]
  activePublication: DocumentPublicationSummary | null
  publicationRecipient: ReportPublicationRecipient | null
}
