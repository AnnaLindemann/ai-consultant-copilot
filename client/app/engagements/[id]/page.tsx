import EngagementAnalysisPanel from "../../../components/EngagementAnalysisPanel"
import EngagementStageControl from "../../../components/EngagementStageControl"
import DiscoveryProfileEditor from "../../../components/DiscoveryProfileEditor"
import { STAGE_LABELS, type EngagementStage } from "../../../lib/engagement-stage"
import type { DiscoveryProfile } from "../../../../shared/discovery-profile.schema"

type EngagementDetails = {
  id: string
  title: string | null
  stage: EngagementStage
  statedProblem: string | null
  currentProcess: string | null
  desiredOutcome: string | null
  sensitiveData: boolean | null
  gdprConcerns: boolean | null
  department: string | null
  painPoints: string[] | null
  affectedUsers: string[] | null
  businessImpact: string | null
  urgency: DiscoveryProfile["urgency"]
  processSteps: string[] | null
  processFrequency: DiscoveryProfile["processFrequency"]
  manualWorkLevel: DiscoveryProfile["manualWorkLevel"]
  bottlenecks: string[] | null
  currentTools: string[] | null
  communicationChannels: string[] | null
  integrationNeeds: string[] | null
  dataTypes: string[] | null
  dataLocation: string[] | null
  dataAvailability: DiscoveryProfile["dataAvailability"]
  dataQuality: DiscoveryProfile["dataQuality"]
  sensitiveDataTypes: string[] | null
  budgetAmount: string | null
  budgetCurrency: DiscoveryProfile["budgetCurrency"]
  budgetNotes: string | null
  timeline: DiscoveryProfile["timeline"]
  humanApprovalRequired: boolean | null
  technicalConstraints: string[] | null
  successMetrics: string[] | null
  mvpScope: string | null
  notes: string | null
  missingInformation: DiscoveryProfile["missingInformation"] | null
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
  const discoveryProfile = toDiscoveryProfile(engagement)

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
        initialProfile={discoveryProfile}
      />
      <EngagementAnalysisPanel engagementId={engagement.id} />
    </main>
  )
}

function toDiscoveryProfile(engagement: EngagementDetails): DiscoveryProfile {
  return {
    department: engagement.department,
    statedProblem: engagement.statedProblem,
    painPoints: engagement.painPoints ?? [],
    affectedUsers: engagement.affectedUsers ?? [],
    businessImpact: engagement.businessImpact,
    urgency: engagement.urgency,
    currentProcess: engagement.currentProcess,
    processSteps: engagement.processSteps ?? [],
    processFrequency: engagement.processFrequency,
    manualWorkLevel: engagement.manualWorkLevel,
    bottlenecks: engagement.bottlenecks ?? [],
    currentTools: engagement.currentTools ?? [],
    communicationChannels: engagement.communicationChannels ?? [],
    integrationNeeds: engagement.integrationNeeds ?? [],
    dataTypes: engagement.dataTypes ?? [],
    dataLocation: engagement.dataLocation ?? [],
    dataAvailability: engagement.dataAvailability,
    dataQuality: engagement.dataQuality,
    sensitiveData: engagement.sensitiveData,
    sensitiveDataTypes: engagement.sensitiveDataTypes ?? [],
    gdprConcerns: engagement.gdprConcerns,
    budgetAmount: engagement.budgetAmount === null ? null : Number(engagement.budgetAmount),
    budgetCurrency: engagement.budgetCurrency,
    budgetNotes: engagement.budgetNotes,
    timeline: engagement.timeline,
    humanApprovalRequired: engagement.humanApprovalRequired,
    technicalConstraints: engagement.technicalConstraints ?? [],
    desiredOutcome: engagement.desiredOutcome,
    successMetrics: engagement.successMetrics ?? [],
    mvpScope: engagement.mvpScope,
    notes: engagement.notes,
    missingInformation: engagement.missingInformation ?? [],
  }
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
