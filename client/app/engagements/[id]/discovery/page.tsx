import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import DiscoveryWorkspace from "../../../../components/DiscoveryWorkspace"
import ManagerShell from "../../../../components/ManagerShell"
import { t, translateServerMessage } from "../../../../i18n"
import { signInPath } from "../../../../lib/auth-redirect"
import { stageLabel } from "../../../../lib/engagement-stage"
import { uiColors, uiRadius, uiSpace } from "../../../../lib/design-tokens"
import type { DiscoveryProfile } from "../../../../../shared/discovery-profile.schema"
import type { DiscoveryWorkflowState } from "../../../../../shared/discovery-workflow.schema"

// The consultant's Discovery screen. Discovery has its own route so the stage
// owns the page header — its breadcrumbs, its title, and its one primary
// action — and the workspace can use the whole width instead of sitting in a
// column of unrelated stage panels.

type DiscoveryPageData = {
  id: string
  title: string | null
  discoveryProfile: DiscoveryProfile
  discoveryWorkflow: DiscoveryWorkflowState
  organization: {
    id: string
    name: string
    industry: string | null
  }
}

type DiscoveryPageResponse = {
  status: boolean
  message: string
  data?: DiscoveryPageData
}

type DiscoveryPageProps = {
  params: Promise<{
    id: string
  }>
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

export default async function EngagementDiscoveryPage({
  params,
}: DiscoveryPageProps) {
  const { id } = await params
  const cookieHeader = await serializeCookies()

  const response = await fetch(`${API_BASE_URL}/engagements/${id}`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  })

  // Not signed in — or signed in with a session the server no longer accepts,
  // which the cookie-only check in `proxy.ts` cannot see. A refusal that is
  // *about the engagement* (403, 404) is left alone: it is a real answer.
  if (response.status === 401) {
    redirect(signInPath(`/engagements/${id}/discovery`))
  }

  const result = (await response.json()) as DiscoveryPageResponse

  if (!response.ok || !result.status || !result.data) {
    return (
      <ManagerShell
        breadcrumbs={[{ label: t("engagements.title"), href: "/engagements" }]}
        title={stageLabel("discovery")}
      >
        <section style={failureStyle}>
          <h2 style={failureTitleStyle}>
            {t("engagement.detail.load_failed_title")}
          </h2>
          {/* The refusal the server named, rendered. Its identifier is for
              this page to act on, never for the consultant to read. */}
          <p style={failureTextStyle}>
            {translateServerMessage(
              result.message,
              undefined,
              "engagement.detail.load_failed",
            )}
          </p>
        </section>
      </ManagerShell>
    )
  }

  const engagement = result.data

  return (
    <DiscoveryWorkspace
      engagementId={engagement.id}
      organizationName={engagement.organization.name}
      engagementSubtitle={
        engagement.title ??
        engagement.organization.industry ??
        t("engagement.untitled")
      }
      initialProfile={engagement.discoveryProfile}
      workflow={engagement.discoveryWorkflow}
    />
  )
}

async function serializeCookies() {
  return (await cookies())
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")
}

const failureStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  padding: uiSpace.lg,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}

const failureTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 650,
}

const failureTextStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.danger,
  fontSize: 14,
}
