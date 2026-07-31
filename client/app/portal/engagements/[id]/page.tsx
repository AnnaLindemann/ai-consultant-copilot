import { cookies } from "next/headers"
import Link from "next/link"

import DiscoveryProfileEditor from "../../../../components/DiscoveryProfileEditor"
import { t } from "../../../../i18n"
import type { DiscoveryProfile } from "../../../../../shared/discovery-profile.schema"
import type { DiscoveryWorkflowState } from "../../../../../shared/discovery-workflow.schema"

type PortalDiscoveryResponse = {
  status: boolean
  data?: {
    discoveryProfile: DiscoveryProfile
    discoveryWorkflow: DiscoveryWorkflowState
  }
  message?: string
}

type PortalPageProps = {
  params: Promise<{
    id: string
  }>
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

export default async function PortalEngagementDiscoveryPage({
  params,
}: PortalPageProps) {
  const { id } = await params
  const cookieHeader = await serializeCookies()
  const response = await fetch(`${API_BASE_URL}/portal/engagements/${id}/discovery`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  })

  const result = (await response.json()) as PortalDiscoveryResponse

  // Whether the access was revoked, expired, never granted, or the caller is
  // not signed in, the portal says the same thing — the server's denials are
  // uniform and non-revealing, and the page must not undo that.
  if (!response.ok || !result.status || !result.data) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <p style={eyebrowStyle}>{t("portal.eyebrow")}</p>
          <h1 style={titleStyle}>{t("portal.unavailable.title")}</h1>
          <p style={subtitleStyle}>{t("portal.unavailable.hint")}</p>
          <p style={{ marginTop: 18 }}>
            <Link href="/auth">{t("portal.unavailable.sign_in")}</Link>
          </p>
        </section>
      </main>
    )
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <p style={eyebrowStyle}>{t("portal.eyebrow")}</p>
        <h1 style={titleStyle}>{t("portal.title")}</h1>
        <p style={subtitleStyle}>{t("portal.subtitle")}</p>

        <DiscoveryProfileEditor
          engagementId={id}
          initialProfile={result.data.discoveryProfile}
          workflow={result.data.discoveryWorkflow}
          pathPrefix="/portal/engagements"
          lockContributor="client"
        />
      </section>
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
  background:
    "radial-gradient(circle at top left, #fefce8 0%, #fffaf0 40%, #f8fafc 100%)",
  padding: "40px 24px",
  color: "#111827",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const cardStyle: React.CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: 32,
  borderRadius: 28,
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#b45309",
  fontWeight: 800,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1,
}

const titleStyle: React.CSSProperties = {
  margin: "8px 0 12px",
  fontSize: 38,
  lineHeight: 1.1,
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: 17,
  lineHeight: 1.5,
}
