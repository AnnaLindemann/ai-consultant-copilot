import Link from "next/link"

type CaseSummary = {
  id: string
  companyName: string
  industry: string
  createdAt: string
}

type CasesResponse = {
  status: boolean
  message: string
  data?: CaseSummary[]
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

export default async function CasesPage() {
  const response = await fetch(`${API_BASE_URL}/cases`, {
    cache: "no-store",
  })

  const result = (await response.json()) as CasesResponse

  if (!response.ok || !result.status || !result.data) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <h1>Cases</h1>
          <p style={{ color: "#991b1b" }}>
            Failed to load cases: {result.message}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <p style={eyebrowStyle}>AI Consultant Copilot</p>
        <h1 style={titleStyle}>Client Cases</h1>
        <p style={subtitleStyle}>
          Select an existing consulting case and continue analysis workflow.
        </p>
      </section>

      <section style={gridStyle}>
        {result.data.map((clientCase) => (
          <article key={clientCase.id} style={cardStyle}>
            <h2 style={caseTitleStyle}>{clientCase.companyName}</h2>
            <p style={mutedStyle}>{clientCase.industry}</p>

            <p style={metaStyle}>
              Created: {new Date(clientCase.createdAt).toLocaleDateString()}
            </p>

            <p style={idStyle}>{clientCase.id}</p>
            <Link href={`/cases/${clientCase.id}`} style={linkStyle}>
  Open →
</Link>
          </article>
        ))}
      </section>
    </main>
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

const headerStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto 32px",
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
  margin: "8px 0 12px",
}

const subtitleStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 18,
  maxWidth: 760,
}

const gridStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 20,
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 24,
  padding: 24,
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
  border: "1px solid #e5e7eb",
}

const caseTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
}

const mutedStyle: React.CSSProperties = {
  color: "#6b7280",
  margin: "8px 0 16px",
}

const metaStyle: React.CSSProperties = {
  color: "#374151",
  fontSize: 14,
  margin: 0,
}

const idStyle: React.CSSProperties = {
  marginTop: 12,
  color: "#9ca3af",
  fontSize: 12,
  wordBreak: "break-all",
}
const linkStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 16,
  color: "#4f46e5",
  fontWeight: 800,
  textDecoration: "none",
}