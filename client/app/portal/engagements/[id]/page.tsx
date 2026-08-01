import { cookies } from "next/headers"
import Link from "next/link"

import ClientDiscoveryWorkspace from "../../../../components/ClientDiscoveryWorkspace"
import ClientPortalShell from "../../../../components/ClientPortalShell"
import {
  EmptyState,
  buttonStyle,
  mutedTextStyle,
} from "../../../../components/UiKit"
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
      <ClientPortalShell title={t("portal.unavailable.title")}>
        <EmptyState>
          <p style={mutedTextStyle}>{t("portal.unavailable.hint")}</p>
          <p>
            <Link href="/auth" style={buttonStyle("secondary")}>
              {t("portal.unavailable.sign_in")}
            </Link>
          </p>
        </EmptyState>
      </ClientPortalShell>
    )
  }

  return (
    <ClientPortalShell
      title={t("portal.title")}
      description={t("portal.subtitle")}
    >
      <ClientDiscoveryWorkspace
        engagementId={id}
        initialProfile={result.data.discoveryProfile}
        workflow={result.data.discoveryWorkflow}
      />
    </ClientPortalShell>
  )
}

async function serializeCookies() {
  return (await cookies())
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")
}
