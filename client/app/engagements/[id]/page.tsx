import EngagementAnalysisPanel from "../../../components/EngagementAnalysisPanel"
import EngagementStageControl from "../../../components/EngagementStageControl"
import DiscoveryProfileEditor from "../../../components/DiscoveryProfileEditor"
import AssessmentPanel from "../../../components/AssessmentPanel"
import { STAGE_LABELS, type EngagementStage } from "../../../lib/engagement-stage"
import type { DiscoveryProfile } from "../../../../shared/discovery-profile.schema"
import type { DiscoveryWorkflowState } from "../../../../shared/discovery-workflow.schema"
import type {
  Assessment,
  AssessmentReviewState,
} from "../../../../shared/assessment.schema"

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

  const response = await fetch(`${API_BASE_URL}/engagements/${id}`, {
    cache: "no-store",
  })

  const result = (await response.json()) as EngagementDetailsResponse

  if (!response.ok || !result.status || !result.data) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <h1>Engagement Details</h1>
          <p style={{ color: "#991b1b" }}>
            Failed to load engagement: {result.message}
          </p>
        </section>
      </main>
    )
  }

  const engagement = result.data
  const analysisRuns = await loadAnalysisRuns(id)

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <p style={eyebrowStyle}>AI Consultant Copilot · {STAGE_LABELS[engagement.stage]}</p>
        <h1 style={titleStyle}>{engagement.organization.name}</h1>
        <p style={subtitleStyle}>
          {engagement.title ?? "Untitled engagement"}
          {engagement.organization.industry
            ? ` · ${engagement.organization.industry}`
            : ""}
        </p>

        <EngagementStageControl
          engagementId={engagement.id}
          stage={engagement.stage}
        />

        <div style={gridStyle}>
          <InfoBlock title="Stated Problem" value={engagement.statedProblem} />
          <InfoBlock title="Current Process" value={engagement.currentProcess} />
          <InfoBlock title="Desired Outcome" value={engagement.desiredOutcome} />
          <InfoBlock
            title="Sensitive Data"
            value={formatBoolean(engagement.sensitiveData)}
          />
          <InfoBlock
            title="GDPR Concerns"
            value={formatBoolean(engagement.gdprConcerns)}
          />
          <InfoBlock
            title="Created"
            value={new Date(engagement.createdAt).toLocaleString()}
          />
        </div>
      </section>
      <DiscoveryProfileEditor
        engagementId={engagement.id}
        initialProfile={engagement.discoveryProfile}
        workflow={engagement.discoveryWorkflow}
      />
      <AssessmentPanel
        engagementId={engagement.id}
        initialAssessment={engagement.assessment}
        initialReviewState={engagement.assessmentReviewState}
      />
      <EngagementAnalysisPanel
        engagementId={engagement.id}
        initialRuns={analysisRuns}
      />
    </main>
  )
}

// The audit trail is a read of what the backend recorded; a failure to load it
// must not take the engagement workspace down with it.
async function loadAnalysisRuns(engagementId: string): Promise<AnalysisRun[]> {
  const response = await fetch(
    `${API_BASE_URL}/engagements/${engagementId}/analysis-runs`,
    { cache: "no-store" },
  )

  if (!response.ok) return []

  const result = (await response.json()) as AnalysisRunsResponse

  return result.data ?? []
}

function formatBoolean(value: boolean | null): string {
  if (value === null) return "Not captured"
  return value ? "Yes" : "No"
}

// Discovery content is optional in Phase 1, so a not-yet-captured field is shown
// explicitly rather than as a blank.
function InfoBlock({ title, value }: { title: string; value: string | null }) {
  return (
    <div style={infoBlockStyle}>
      <p style={labelStyle}>{title}</p>
      <p style={valueStyle}>{value ?? "Not captured"}</p>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f6f7fb",
  color: "#111827",
  padding: "40px 24px",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const cardStyle: React.CSSProperties = {
  maxWidth: 1000,
  margin: "0 auto",
  background: "#ffffff",
  borderRadius: 24,
  padding: 32,
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
  border: "1px solid #e5e7eb",
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#4f46e5",
  fontWeight: 700,
  fontSize: 14,
  textTransform: "uppercase",
  letterSpacing: 1,
}

const titleStyle: React.CSSProperties = {
  fontSize: 42,
  lineHeight: 1.1,
  margin: "8px 0 8px",
}

const subtitleStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 18,
  margin: 0,
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
  marginTop: 28,
}

const infoBlockStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
}

const labelStyle: React.CSSProperties = {
  margin: "0 0 6px",
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.5,
}

const valueStyle: React.CSSProperties = {
  margin: 0,
  color: "#111827",
  lineHeight: 1.5,
}
