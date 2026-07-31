import Link from "next/link"
import { cookies } from "next/headers"

import { STAGE_LABELS } from "../../lib/engagement-stage"

type EngagementSummary = {
  id: string
  title: string | null
  stage: keyof typeof STAGE_LABELS
  createdAt: string
  organization: {
    id: string
    name: string
    industry: string | null
  }
}

type EngagementsResponse = {
  status: boolean
  message: string
  data?: EngagementSummary[]
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

export default async function EngagementsPage() {
  const cookieHeader = await serializeCookies()
  const response = await fetch(`${API_BASE_URL}/engagements`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  })

  const result = (await response.json()) as EngagementsResponse

  if (!response.ok || !result.status || !result.data) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <h1>Engagements</h1>
          <p style={{ color: "#991b1b" }}>
            Failed to load engagements: {result.message}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <p style={eyebrowStyle}>AI Consultant Copilot</p>
        <h1 style={titleStyle}>Engagements</h1>
        <p style={subtitleStyle}>
          Open an existing engagement and resume where it stands, or{" "}
          <Link href="/" style={inlineLinkStyle}>
            start a new one
          </Link>
          .
        </p>
      </section>

      {result.data.length === 0 ? (
        <section style={{ ...cardStyle, maxWidth: 1180, margin: "0 auto" }}>
          <p style={mutedStyle}>
            No engagements yet.{" "}
            <Link href="/" style={inlineLinkStyle}>
              Create your first engagement
            </Link>
            .
          </p>
        </section>
      ) : (
        <section style={gridStyle}>
          {result.data.map((engagement) => (
            <article key={engagement.id} style={cardStyle}>
              <span style={stageBadgeStyle}>{STAGE_LABELS[engagement.stage]}</span>
              <h2 style={engagementTitleStyle}>{engagement.organization.name}</h2>
              <p style={mutedStyle}>
                {engagement.title ?? "Untitled engagement"}
                {engagement.organization.industry
                  ? ` · ${engagement.organization.industry}`
                  : ""}
              </p>

              <p style={metaStyle}>
                Created: {new Date(engagement.createdAt).toLocaleDateString()}
              </p>

              <p style={idStyle}>{engagement.id}</p>
              <Link href={`/engagements/${engagement.id}`} style={linkStyle}>
                Open →
              </Link>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}

async function serializeCookies() {
  return (await cookies())
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")
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

const engagementTitleStyle: React.CSSProperties = {
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

const inlineLinkStyle: React.CSSProperties = {
  color: "#4f46e5",
  fontWeight: 700,
  textDecoration: "none",
}

const stageBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#3730a3",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 12,
}
