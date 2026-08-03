import { z } from "zod"

const nonEmptyText = z.string().trim().min(1)

export const feedbackStatusSchema = z.enum([
  "submitted",
  "classified",
  "reentry_open",
  "resolved",
  "closed_no_action",
])

export const feedbackClassificationSchema = z.enum([
  "new_fact",
  "fact_correction",
  "changed_condition",
  "disagreement",
  "clarification",
  "request",
  "duplicate",
  "no_engagement_change_required",
])

export const feedbackImpactStageSchema = z.enum([
  "discovery",
  "assessment",
  "opportunities",
  "recommendations",
  "roadmap",
  "report",
])

export const reentryStatusSchema = z.enum(["open", "completed"])

// Why a stage is *technically* stale: each identifier names the artifact that
// actually changed beneath the dependent stage, never the dependent stage
// itself. A Manager declaring a stage impacted does not produce any of these
// (coding-standards.md §6; agent-rules.md §15).
export const feedbackStalenessReasonSchema = z.enum([
  "discovery_changed",
  "assessment_changed",
  "opportunity_version_changed",
  "recommendation_version_changed",
  "roadmap_version_changed",
])

// How the published ReportVersion this Feedback was given on stands against the
// engagement now. Kept separate from per-stage technical staleness: "the client
// commented on an older report" is not the same fact as "a stage's source moved
// on beneath it".
export const feedbackSourceReportReasonSchema = z.enum([
  "source_report_superseded",
  "source_report_sources_changed",
])

export const reentryOutcomeStatusSchema = z.enum([
  "completed",
  "waived",
  "no_change_confirmed",
])

// Why a stage cannot currently be recorded as `completed`. Returned with the
// re-entry so the Manager sees *why* the option is unavailable rather than
// discovering it through a refusal.
export const reentryResultUnavailableReasonSchema = z.enum([
  "artifact_missing",
  "not_accepted",
  "unchanged_since_source",
])

// Stages whose result is an addressable version the Manager selects. The
// selection is made from the server-supplied option; the identity is submitted,
// never composed by hand.
export const VERSIONED_RESULT_STAGES = [
  "opportunities",
  "recommendations",
  "roadmap",
  "report",
] as const

// Stages the domain does not version separately. Their result identity
// (Discovery content fingerprint; Assessment revision and fingerprint) is
// derived server-side from the accepted engagement state at completion time —
// the Manager never types a fingerprint (coding-standards.md §6).
export const DERIVED_RESULT_STAGES = ["discovery", "assessment"] as const

export const hasVersionedResult = (stage: FeedbackImpactStage): boolean =>
  (VERSIONED_RESULT_STAGES as readonly string[]).includes(stage)

// What the Manager submits for one impacted stage. Deliberately narrower than
// what is stored: revisions and fingerprints are server-derived, so they are not
// accepted here at all.
export const reentryStageOutcomeInputSchema = z
  .object({
    stage: feedbackImpactStageSchema,
    status: reentryOutcomeStatusSchema,
    resultArtifactId: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .superRefine((outcome, ctx) => {
    if (outcome.status === "completed") {
      if (outcome.reason !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: "A completed stage carries its result, not a reason.",
        })
      }

      if (hasVersionedResult(outcome.stage)) {
        if (!outcome.resultArtifactId) {
          ctx.addIssue({
            code: "custom",
            path: ["resultArtifactId"],
            message: "A completed stage must name the accepted result version.",
          })
        }
        return
      }

      if (outcome.resultArtifactId !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["resultArtifactId"],
          message: "This stage's result identity is derived from accepted engagement state.",
        })
      }
      return
    }

    if (!outcome.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is required when a stage is waived or confirmed unchanged.",
      })
    }

    if (outcome.resultArtifactId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["resultArtifactId"],
        message: "Only a completed stage carries a result version.",
      })
    }
  })

const distinctStages = (stages: FeedbackImpactStage[]) =>
  new Set(stages).size === stages.length

export const submitClientFeedbackSchema = z.object({
  publicationId: nonEmptyText,
  submissionKey: z.string().trim().min(8).max(120),
  content: z.string().trim().min(1).max(20_000),
})

export const classifyFeedbackSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  classification: feedbackClassificationSchema,
  impactedStages: z
    .array(feedbackImpactStageSchema)
    .refine(distinctStages, { message: "A stage may be declared impacted only once." }),
  managerSummary: nonEmptyText,
  managerDecision: nonEmptyText,
})

export const openFeedbackReentrySchema = z.object({
  feedbackId: nonEmptyText,
  expectedRevision: z.number().int().nonnegative(),
  impactedStages: z
    .array(feedbackImpactStageSchema)
    .min(1)
    .refine(distinctStages, { message: "A stage may be declared impacted only once." }),
  plan: nonEmptyText,
})

export const completeFeedbackReentrySchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  outcomes: z.array(reentryStageOutcomeInputSchema).min(1),
  completionNote: nonEmptyText,
})

export const closeFeedbackSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  reason: nonEmptyText,
})

export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>
export type FeedbackClassification = z.infer<typeof feedbackClassificationSchema>
export type FeedbackImpactStage = z.infer<typeof feedbackImpactStageSchema>
export type FeedbackReentryStatus = z.infer<typeof reentryStatusSchema>
export type FeedbackStalenessReason = z.infer<typeof feedbackStalenessReasonSchema>
export type FeedbackSourceReportReason = z.infer<
  typeof feedbackSourceReportReasonSchema
>
export type ReentryOutcomeStatus = z.infer<typeof reentryOutcomeStatusSchema>
export type ReentryResultUnavailableReason = z.infer<
  typeof reentryResultUnavailableReasonSchema
>
export type ReentryStageOutcomeInput = z.infer<typeof reentryStageOutcomeInputSchema>
export type SubmitClientFeedbackInput = z.infer<typeof submitClientFeedbackSchema>
export type ClassifyFeedbackInput = z.infer<typeof classifyFeedbackSchema>
export type OpenFeedbackReentryInput = z.infer<typeof openFeedbackReentrySchema>
export type CompleteFeedbackReentryInput = z.infer<
  typeof completeFeedbackReentrySchema
>
export type CloseFeedbackInput = z.infer<typeof closeFeedbackSchema>

// What was actually recorded for one impacted stage. The result identity is
// always server-derived, so this is the lineage `Feedback → source version →
// result version`, not a copy of what the Manager typed.
export type ReentryStageOutcome = {
  stage: FeedbackImpactStage
  status: ReentryOutcomeStatus
  reason: string | null
  resultArtifactId: string | null
  resultVersionNumber: number | null
  resultRevision: number | null
  resultFingerprint: string | null
}

// The one result a stage could be completed with right now, as the server knows
// it. There is at most one, because a completed outcome must reference the
// *active*, accepted (approved, for a report) version.
export type ReentryStageResultOption = {
  stage: FeedbackImpactStage
  available: boolean
  unavailableReason: ReentryResultUnavailableReason | null
  resultArtifactId: string | null
  resultVersionNumber: number | null
  resultRevision: number | null
  resultFingerprint: string | null
}

// Whether a dependent stage's recorded source has moved on beneath it. Computed
// from the same domain predicates the Opportunity, Recommendation, Roadmap and
// Report stages already use, so Phase 9 reports the staleness the rest of the
// workbench reports rather than a second opinion.
export type FeedbackTechnicalStaleness = {
  opportunities: boolean
  recommendations: boolean
  roadmap: boolean
  report: boolean
  reasons: FeedbackStalenessReason[]
}

export type FeedbackSourceReportState = {
  superseded: boolean
  sourcesChanged: boolean
  reasons: FeedbackSourceReportReason[]
}

// The three separate answers a Manager needs, kept apart on purpose: what they
// declared, what is technically stale, and how the report the client commented
// on stands against the engagement now.
export type FeedbackImpactView = {
  declaredImpactedStages: FeedbackImpactStage[]
  technicalStaleness: FeedbackTechnicalStaleness
  sourceReport: FeedbackSourceReportState
  currentOpportunityVersionId: string | null
  currentRecommendationVersionId: string | null
  currentRoadmapVersionId: string | null
  currentReportVersionId: string | null
}

// The Manager-facing view. Everything here is internal; none of it may reach the
// Client Portal (coding-standards.md §6A).
export type ClientFeedbackSummary = {
  id: string
  status: FeedbackStatus
  revision: number
  content: string
  submittedAt: string
  submittedByUserId: string
  submittedByName: string | null
  submissionKey: string
  sourcePublicationId: string
  sourceReportVersionId: string
  sourceReportVersionNumber: number
  sourceReportVersionPublishedAt: string
  sourceSnapshotFingerprint: string
  classification: FeedbackClassification | null
  managerSummary: string | null
  managerDecision: string | null
  closedNoActionReason: string | null
  reviewedAt: string | null
  reviewedByUserId: string | null
  reviewedByName: string | null
  impact: FeedbackImpactView
}

// The Client-facing view. It is the *whole* answer a Client ever receives about
// their own Feedback: what they wrote, when, against which published version,
// and a lifecycle status. Every internal field — classification, declared
// impact, Manager prose, reviewer identity, artifact identifiers, fingerprints,
// revision counters, technical staleness, re-entry — is absent by construction
// rather than hidden by the UI (architecture.md §7A.5).
export type ClientPortalFeedbackSummary = {
  id: string
  status: FeedbackStatus
  content: string
  submittedAt: string
  sourcePublicationId: string
  sourceReportVersionNumber: number
}

export type FeedbackReentrySummary = {
  id: string
  feedbackId: string
  status: FeedbackReentryStatus
  revision: number
  impactedStages: FeedbackImpactStage[]
  plan: string
  outcomes: ReentryStageOutcome[]
  openedAt: string
  openedByUserId: string
  completedAt: string | null
  completedByUserId: string | null
  completionNote: string | null
  sourceDiscoveryFingerprint: string
  sourceAssessmentRevision: number
  sourceAssessmentFingerprint: string
  sourceOpportunityVersionId: string | null
  sourceRecommendationVersionId: string | null
  sourceRoadmapVersionId: string | null
  sourceReportVersionId: string
  // What each impacted stage could be completed with right now. Supplied so the
  // Manager selects a server-known result instead of typing an identifier.
  resultOptions: ReentryStageResultOption[]
}

export type FeedbackStageState = {
  feedback: ClientFeedbackSummary[]
  openReentries: FeedbackReentrySummary[]
}
