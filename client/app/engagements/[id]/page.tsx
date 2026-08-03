import Link from "next/link"

import EngagementAnalysisPanel from "../../../components/EngagementAnalysisPanel"
import EngagementStageControl from "../../../components/EngagementStageControl"
import AssessmentPanel from "../../../components/AssessmentPanel"
import OpportunityPanel from "../../../components/OpportunityPanel"
import RecommendationPanel from "../../../components/RecommendationPanel"
import RoadmapPanel from "../../../components/RoadmapPanel"
import ConsultantReportPanel from "../../../components/ConsultantReportPanel"
import FeedbackPanel from "../../../components/FeedbackPanel"
import ManagerShell from "../../../components/ManagerShell"
import {
  stageEyebrowStyle,
  stageHeadingStyle,
  stageSurfaceStyle,
} from "../../../components/StagePanel"
import {
  Badge,
  InlineAlert,
  buttonStyle,
  pageStackStyle,
} from "../../../components/UiKit"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { formatDateTime, t, translateServerMessage } from "../../../i18n"
import type { MessageKey } from "../../../i18n/de"
import { signInPath } from "../../../lib/auth-redirect"
import { uiColors, uiRadius, uiSpace } from "../../../lib/design-tokens"
import { stageLabel, type EngagementStage } from "../../../lib/engagement-stage"
import type { DiscoveryProfile } from "../../../../shared/discovery-profile.schema"
import type { DiscoveryWorkflowState } from "../../../../shared/discovery-workflow.schema"
import type {
  Assessment,
  AssessmentReviewState,
} from "../../../../shared/assessment.schema"
import type { OpportunityVersionState } from "../../../../shared/opportunity.schema"
import type { RecommendationStageState } from "../../../../shared/recommendation.schema"
import type { RoadmapStageState } from "../../../../shared/implementation-roadmap.schema"
import type { ReportStageState } from "../../../../shared/consultant-report.schema"
import type { FeedbackStageState } from "../../../../shared/feedback.schema"

type EngagementDetails = {
  id: string
  title: string | null
  stage: EngagementStage
  statedProblem: string | null
  currentProcess: string | null
  desiredOutcome: string | null
  sensitiveData: boolean | null
  gdprConcerns: boolean | null
  // The Discovery Profile and its review state are assembled by the backend, so
  // the client renders what was persisted rather than mapping columns itself.
  discoveryProfile: DiscoveryProfile
  discoveryWorkflow: DiscoveryWorkflowState
  assessment: Assessment | null
  assessmentReviewState: AssessmentReviewState | null
  opportunities: OpportunityVersionState
  recommendations: RecommendationStageState
  roadmap: RoadmapStageState
  report: ReportStageState
  feedback: FeedbackStageState
  createdAt: string
  updatedAt: string
  organization: {
    id: string
    name: string
    industry: string | null
  }
}

type EngagementDetailsResponse = {
  status: boolean
  message: string
  data?: EngagementDetails
}

type AnalysisRun = {
  id: string
  stage: string
  provider: string
  model: string
  promptVersion: string
  promptFingerprint: string
  latencyMs: number | null
  totalTokens: number | null
  costEstimateUsd: string | null
  jsonParseSuccess: boolean
  schemaValid: boolean
  createdAt: string
}

type AnalysisRunsResponse = {
  status: boolean
  message?: string
  data?: AnalysisRun[]
}

type EngagementDetailsPageProps = {
  params: Promise<{
    id: string
  }>
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

export default async function EngagementDetailsPage({
  params,
}: EngagementDetailsPageProps) {
  const { id } = await params
  const cookieHeader = await serializeCookies()

  const response = await fetch(`${API_BASE_URL}/engagements/${id}`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  })

  // Not signed in — or signed in with a session the server no longer accepts,
  // which the cookie-only check in `proxy.ts` cannot see. A refusal that is
  // *about the engagement* (403, 404) is left alone: it is a real answer, and
  // sending an authenticated consultant to sign in again would not help them.
  if (response.status === 401) redirect(signInPath(`/engagements/${id}`))

  const result = (await response.json()) as EngagementDetailsResponse

  // A refusal about the engagement (403, 404) is a real answer and is shown in
  // the shell, so the consultant keeps their navigation and is not stranded.
  if (!response.ok || !result.status || !result.data) {
    return (
      <ManagerShell
        breadcrumbs={[{ label: t("engagements.title"), href: "/engagements" }]}
        title={t("engagement.detail.load_failed_title")}
      >
        <div style={pageStackStyle}>
          <InlineAlert tone="danger">
            {/* The refusal the server named, rendered. Its identifier is for
                this page to act on, never for the consultant to read. */}
            {translateServerMessage(
              result.message,
              undefined,
              "engagement.detail.load_failed",
            )}
          </InlineAlert>
        </div>
      </ManagerShell>
    )
  }

  const engagement = result.data
  const analysisRuns = await loadAnalysisRuns(id)

  return (
    <ManagerShell
      breadcrumbs={[
        { label: t("engagements.title"), href: "/engagements" },
        { label: engagement.organization.name },
      ]}
      title={engagement.organization.name}
      description={
        engagement.title ?? engagement.organization.industry ?? t("engagement.untitled")
      }
      actions={
        <EngagementStageControl
          engagementId={engagement.id}
          stage={engagement.stage}
        />
      }
    >
      {/* One container for every stage, so they share an edge, a width and a
          vertical rhythm instead of each carrying its own. The order is the
          consulting order: overview and Discovery, then Assessment, then the
          prioritized Opportunities, then the engagement's AI run history. */}
      <div style={stagesStyle}>
        <section style={cardStyle}>
          <div style={overviewHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>{t("engagement.detail.overview")}</p>
              <h2 style={titleStyle}>
                {engagement.title ?? t("engagement.untitled")}
              </h2>
              {engagement.organization.industry && (
                <p style={subtitleStyle}>{engagement.organization.industry}</p>
              )}
            </div>
            <Badge tone="neutral" label={stageLabel(engagement.stage)} />
          </div>

          {/* Discovery is captured on its own screen, where the stage owns the
              page header and the workspace has the full width. */}
          <div style={discoveryLinkStyle}>
            <div>
              <p style={discoveryLinkTitleStyle}>
                {t("engagement.discovery.card.title")}
              </p>
              <p style={discoveryLinkHintStyle}>
                {t("engagement.discovery.card.hint")}
              </p>
            </div>
            <Link
              href={`/engagements/${engagement.id}/discovery`}
              style={discoveryLinkActionStyle}
            >
              {t("engagement.discovery.card.open")}
            </Link>
          </div>

          <div style={gridStyle}>
            <InfoBlock
              titleKey="engagement.info.stated_problem"
              value={engagement.statedProblem}
            />
            <InfoBlock
              titleKey="engagement.info.current_process"
              value={engagement.currentProcess}
            />
            <InfoBlock
              titleKey="engagement.info.desired_outcome"
              value={engagement.desiredOutcome}
            />
            <InfoBlock
              titleKey="engagement.info.sensitive_data"
              value={formatBoolean(engagement.sensitiveData)}
            />
            <InfoBlock
              titleKey="engagement.info.gdpr_concerns"
              value={formatBoolean(engagement.gdprConcerns)}
            />
            <InfoBlock
              titleKey="engagement.info.created"
              value={formatDateTime(engagement.createdAt)}
            />
          </div>
        </section>
        {/* The Consulting Knowledge Base is the material the assessment is
            grounded in, not a stage of the client's engagement. It is reached
            through its own navigation entry; rendering it here made internal
            support material read as a step in the customer process. */}
        <AssessmentPanel
          engagementId={engagement.id}
          initialAssessment={engagement.assessment}
          initialReviewState={engagement.assessmentReviewState}
        />
        <OpportunityPanel
          key={`${engagement.opportunities.activeVersion?.id ?? "none"}:${engagement.opportunities.activeVersion?.revision ?? "0"}:${engagement.opportunities.currentAssessmentRevision}:${engagement.opportunities.stale ? "1" : "0"}`}
          engagementId={engagement.id}
          assessment={engagement.assessment}
          initialVersionState={engagement.opportunities}
        />
        <RecommendationPanel
          key={`${engagement.recommendations.activeVersion?.id ?? "none"}:${engagement.recommendations.activeVersion?.revision ?? "0"}:${engagement.recommendations.currentOpportunityVersionId ?? "none"}:${engagement.recommendations.stale ? "1" : "0"}`}
          engagementId={engagement.id}
          initialStageState={engagement.recommendations}
          opportunities={engagement.opportunities}
        />
        <RoadmapPanel
          key={`${engagement.roadmap.activeVersion?.id ?? "none"}:${engagement.roadmap.activeVersion?.revision ?? "0"}:${engagement.roadmap.acceptedRecommendationVersionId ?? "none"}:${engagement.roadmap.stale ? "1" : "0"}`}
          engagementId={engagement.id}
          initialStageState={engagement.roadmap}
          recommendations={
            engagement.recommendations.activeVersion?.reviewState === "accepted"
              ? engagement.recommendations.activeVersion.recommendationSet
                  .recommendations
              : []
          }
        />
        <ConsultantReportPanel
          key={`${engagement.report.activeVersion?.id ?? "none"}:${engagement.report.activeVersion?.revision ?? "0"}:${engagement.report.stale ? "1" : "0"}:${engagement.report.activePublication?.id ?? "none"}`}
          engagementId={engagement.id}
          initialStageState={engagement.report}
        />
        <FeedbackPanel
          key={`feedback:${engagement.feedback.feedback.length}:${engagement.feedback.openReentries.length}:${engagement.report.activeVersion?.id ?? "none"}`}
          engagementId={engagement.id}
          initialStageState={engagement.feedback}
        />
        <EngagementAnalysisPanel
          engagementId={engagement.id}
          initialRuns={analysisRuns}
        />
      </div>
    </ManagerShell>
  )
}

// The audit trail is a read of what the backend recorded; a failure to load it
// must not take the engagement workspace down with it.
async function loadAnalysisRuns(engagementId: string): Promise<AnalysisRun[]> {
  const cookieHeader = await serializeCookies()
  const response = await fetch(
    `${API_BASE_URL}/engagements/${engagementId}/analysis-runs`,
    {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    },
  )

  if (!response.ok) return []

  const result = (await response.json()) as AnalysisRunsResponse

  return result.data ?? []
}

async function serializeCookies() {
  return (await cookies())
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")
}

function formatBoolean(value: boolean | null): string {
  if (value === null) return t("common.field.not_captured")
  return value ? t("common.field.yes") : t("common.field.no")
}

// Discovery content is optional in Phase 1, so a not-yet-captured field is shown
// explicitly rather than as a blank.
function InfoBlock({
  titleKey,
  value,
}: {
  titleKey: MessageKey
  value: string | null
}) {
  return (
    <div style={infoBlockStyle}>
      <p style={labelStyle}>{t(titleKey)}</p>
      <p style={valueStyle}>{value ?? t("common.field.not_captured")}</p>
    </div>
  )
}

const stagesStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  alignContent: "start",
}

const cardStyle: React.CSSProperties = stageSurfaceStyle

const overviewHeaderStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: uiSpace.sm,
}

const eyebrowStyle: React.CSSProperties = stageEyebrowStyle

const titleStyle: React.CSSProperties = stageHeadingStyle

const subtitleStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 14,
  margin: 0,
}

const discoveryLinkStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: uiSpace.md,
  marginTop: uiSpace.md,
  padding: uiSpace.md,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.primaryTint,
}

const discoveryLinkTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 650,
}

const discoveryLinkHintStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: uiColors.textSecondary,
  fontSize: 13,
}

const discoveryLinkActionStyle: React.CSSProperties = buttonStyle("primary")

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: uiSpace.sm,
  marginTop: uiSpace.md,
}

const infoBlockStyle: React.CSSProperties = {
  padding: uiSpace.sm,
  borderRadius: uiRadius.control,
  background: uiColors.subtle,
  border: `1px solid ${uiColors.border}`,
}

const labelStyle: React.CSSProperties = {
  margin: "0 0 4px",
  color: uiColors.textSecondary,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
}

const valueStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  lineHeight: 1.5,
}
