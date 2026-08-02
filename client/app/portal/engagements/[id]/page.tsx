import { cookies } from "next/headers"
import Link from "next/link"
import type { CSSProperties } from "react"

import ClientDiscoveryWorkspace from "../../../../components/ClientDiscoveryWorkspace"
import ClientPortalShell from "../../../../components/ClientPortalShell"
import {
  EmptyState,
  buttonStyle,
  mutedTextStyle,
} from "../../../../components/UiKit"
import { formatDateTime, t } from "../../../../i18n"
import { uiColors, uiRadius, uiSpace } from "../../../../lib/design-tokens"
import { portalDocumentView } from "../../../../lib/portal-documents"
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

type PortalDocument = {
  id: string
  title: string
  managerMessage: string | null
  reportVersionId: string
  reportVersionNumber: number
  publishedAt: string
}

type PortalDocumentsResponse = {
  status: boolean
  data?: {
    documents: PortalDocument[]
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
  const [discovery, documents] = await Promise.all([
    loadPortalDiscovery(id, cookieHeader),
    loadPortalDocuments(id, cookieHeader),
  ])

  // Whether the access was revoked, expired, never granted, or the caller is
  // not signed in, the portal says the same thing — the server's denials are
  // uniform and non-revealing, and the page must not undo that. Published
  // documents are authorized separately and remain visible while the
  // publication itself is active.
  if (!discovery && documents.length === 0) {
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
      <DocumentsSection engagementId={id} documents={documents} />
      {discovery && (
        <ClientDiscoveryWorkspace
          engagementId={id}
          initialProfile={discovery.discoveryProfile}
          workflow={discovery.discoveryWorkflow}
        />
      )}
    </ClientPortalShell>
  )
}

async function loadPortalDiscovery(
  engagementId: string,
  cookieHeader: string,
): Promise<PortalDiscoveryResponse["data"] | null> {
  const response = await fetch(
    `${API_BASE_URL}/portal/engagements/${engagementId}/discovery`,
    {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    },
  )
  if (!response.ok) return null

  const result = (await response.json()) as PortalDiscoveryResponse
  return result.status ? result.data ?? null : null
}

async function loadPortalDocuments(
  engagementId: string,
  cookieHeader: string,
): Promise<PortalDocument[]> {
  const response = await fetch(
    `${API_BASE_URL}/portal/engagements/${engagementId}/documents`,
    {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    },
  )
  if (!response.ok) return []

  const result = (await response.json()) as PortalDocumentsResponse
  return result.data?.documents ?? []
}

function DocumentsSection({
  engagementId,
  documents,
}: {
  engagementId: string
  documents: PortalDocument[]
}) {
  return (
    <section style={documentsStyle}>
      <h2 style={documentsTitleStyle}>{t("portal.documents.title")}</h2>
      {documents.length === 0 ? (
        <p style={mutedTextStyle}>{t("portal.documents.empty")}</p>
      ) : (
        documents.map((document) => {
          const view = portalDocumentView({
            apiBaseUrl: API_BASE_URL,
            engagementId,
            document,
            formatDateTime,
            translate: t,
          })

          return (
            <div key={document.id} style={documentRowStyle}>
              <div>
                <p style={documentTitleStyle}>
                  {view.title}
                </p>
                {view.managerMessage && (
                  <p style={mutedTextStyle}>{view.managerMessage}</p>
                )}
                <p style={mutedTextStyle}>
                  {view.publishedText}
                </p>
              </div>
              <a
                href={view.pdfHref}
                target="_blank"
                rel="noreferrer"
                style={buttonStyle("secondary")}
              >
                {view.openLabel}
              </a>
            </div>
          )
        })
      )}
    </section>
  )
}

async function serializeCookies() {
  return (await cookies())
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")
}

const documentsStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.sm,
  marginBottom: uiSpace.md,
  padding: uiSpace.lg,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}

const documentsTitleStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 18,
  fontWeight: 650,
}

const documentRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: uiSpace.md,
  padding: uiSpace.md,
  borderRadius: uiRadius.control,
  background: uiColors.subtle,
  border: `1px solid ${uiColors.border}`,
}

const documentTitleStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  fontWeight: 650,
}
