import CaseAnalysisPanel from "../../../components/CaseAnalysisPanel"

type ClientCaseDetails = {
  id: string
  companyName: string
  industry: string
  statedProblem: string
  currentProcess: string
  desiredOutcome: string
  sensitiveData: boolean
  gdprConcerns: boolean
  createdAt: string
  updatedAt: string
}

type CaseDetailsResponse = {
  status: boolean
  message: string
  data?: ClientCaseDetails
}

type CaseDetailsPageProps = {
  params: Promise<{
    id: string
  }>
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

export default async function CaseDetailsPage({ params }: CaseDetailsPageProps) {
  const { id } = await params

  const response = await fetch(`${API_BASE_URL}/cases/${id}`, {
    cache: "no-store",
  })

  const result = (await response.json()) as CaseDetailsResponse

  if (!response.ok || !result.status || !result.data) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <h1>Case Details</h1>
          <p style={{ color: "#991b1b" }}>
            Failed to load case: {result.message}
          </p>
        </section>
      </main>
    )
  }

  const clientCase = result.data

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <p style={eyebrowStyle}>AI Consultant Copilot</p>
        <h1 style={titleStyle}>{clientCase.companyName}</h1>
        <p style={subtitleStyle}>{clientCase.industry}</p>

        <div style={gridStyle}>
          <InfoBlock title="Stated Problem" value={clientCase.statedProblem} />
          <InfoBlock title="Current Process" value={clientCase.currentProcess} />
          <InfoBlock title="Desired Outcome" value={clientCase.desiredOutcome} />
          <InfoBlock
            title="Sensitive Data"
            value={clientCase.sensitiveData ? "Yes" : "No"}
          />
          <InfoBlock
            title="GDPR Concerns"
            value={clientCase.gdprConcerns ? "Yes" : "No"}
          />
          <InfoBlock
            title="Created"
            value={new Date(clientCase.createdAt).toLocaleString()}
          />
        </div>
      </section>
      <CaseAnalysisPanel caseId={clientCase.id} />
    </main>
  )
}

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div style={infoBlockStyle}>
      <p style={labelStyle}>{title}</p>
      <p style={valueStyle}>{value}</p>
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