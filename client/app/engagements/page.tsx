import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import ManagerShell from "../../components/ManagerShell"
import {
  Badge,
  EmptyState,
  InlineAlert,
  buttonStyle,
  cardStyle,
  compactButtonStyle,
  metaTextStyle,
  mutedTextStyle,
  pageStackStyle,
  tableCellStyle,
  tableHeadCellStyle,
  tableScrollStyle,
  tableStyle,
} from "../../components/UiKit"
import { formatDateTime, t, translateServerMessage } from "../../i18n"
import { signInPath } from "../../lib/auth-redirect"
import { uiColors } from "../../lib/design-tokens"
import { stageLabel, type EngagementStage } from "../../lib/engagement-stage"

// The engagement list. A Manager compares several records at once, so this is a
// table rather than a wall of cards (UI-KIT §M02) — and every column is
// something the list endpoint already returns. There is deliberately no status,
// no next action and no filter here: the list contract carries none of them,
// and a column filled with a guess is worse than a column that is absent.

type EngagementSummary = {
  id: string
  title: string | null
  stage: EngagementStage
  createdAt: string
  updatedAt: string
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

  // Not signed in — or signed in with a session the server no longer accepts,
  // which the cookie-only check in `proxy.ts` cannot see. Either way the answer
  // is the sign-in page, not the server's identifier rendered as prose.
  if (response.status === 401) redirect(signInPath("/engagements"))

  const result = (await response.json()) as EngagementsResponse

  if (!response.ok || !result.status || !result.data) {
    return (
      <ManagerShell
        title={t("engagements.title")}
        description={t("engagements.intro")}
      >
        <div style={pageStackStyle}>
          <InlineAlert tone="danger">
            <span>
              <strong>{t("engagements.load_failed.title")}</strong>{" "}
              {/* The refusal the server named, rendered. Its identifier is for
                  this page to act on, never for the consultant to read. */}
              {translateServerMessage(
                result.message,
                undefined,
                "engagements.load_failed",
              )}
            </span>
          </InlineAlert>
        </div>
      </ManagerShell>
    )
  }

  const engagements = result.data

  return (
    <ManagerShell
      title={t("engagements.title")}
      description={t("engagements.intro")}
      actions={
        <Link href="/" style={buttonStyle("primary")}>
          {t("engagements.action.start_new")}
        </Link>
      }
    >
      <div style={pageStackStyle}>
        {engagements.length === 0 ? (
          <EmptyState title={t("engagements.empty.title")}>
            <p style={mutedTextStyle}>{t("engagements.empty")}</p>
            <p style={mutedTextStyle}>
              <Link href="/" style={linkStyle}>
                {t("engagements.action.create_first")}
              </Link>
            </p>
          </EmptyState>
        ) : (
          <section style={cardStyle}>
            <p style={metaTextStyle}>
              {engagements.length === 1
                ? t("engagements.count.one")
                : t("engagements.count", { count: engagements.length })}
            </p>

            <div style={tableScrollStyle}>
              <table
                style={tableStyle}
                aria-label={t("engagements.table.aria_label")}
              >
                <thead>
                  <tr>
                    <th scope="col" style={tableHeadCellStyle}>
                      {t("engagements.column.organization")}
                    </th>
                    <th scope="col" style={tableHeadCellStyle}>
                      {t("engagements.column.engagement")}
                    </th>
                    <th scope="col" style={tableHeadCellStyle}>
                      {t("engagements.column.stage")}
                    </th>
                    <th scope="col" style={tableHeadCellStyle}>
                      {t("engagements.column.updated")}
                    </th>
                    <th scope="col" style={tableHeadCellStyle}>
                      {t("engagements.column.created")}
                    </th>
                    <th scope="col" style={tableHeadCellStyle}>
                      <span className="visually-hidden">
                        {t("engagements.column.action")}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {engagements.map((engagement) => (
                    <tr key={engagement.id}>
                      <td style={tableCellStyle}>
                        <span style={organizationNameStyle}>
                          {engagement.organization.name}
                        </span>
                        {engagement.organization.industry && (
                          <span style={industryStyle}>
                            {engagement.organization.industry}
                          </span>
                        )}
                      </td>
                      <td style={tableCellStyle}>
                        {engagement.title ?? t("engagement.untitled")}
                      </td>
                      <td style={tableCellStyle}>
                        <Badge
                          tone="neutral"
                          label={stageLabel(engagement.stage)}
                        />
                      </td>
                      <td style={numericCellStyle}>
                        {formatDateTime(engagement.updatedAt)}
                      </td>
                      <td style={numericCellStyle}>
                        {formatDateTime(engagement.createdAt)}
                      </td>
                      <td style={actionCellStyle}>
                        <Link
                          href={`/engagements/${engagement.id}`}
                          style={compactButtonStyle("secondary")}
                        >
                          {t("engagements.action.open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </ManagerShell>
  )
}

async function serializeCookies() {
  return (await cookies())
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")
}

const organizationNameStyle: React.CSSProperties = {
  display: "block",
  color: uiColors.textPrimary,
  fontWeight: 600,
}

const industryStyle: React.CSSProperties = {
  display: "block",
  marginTop: 2,
  color: uiColors.textSecondary,
  fontSize: 12,
}

const numericCellStyle: React.CSSProperties = {
  ...tableCellStyle,
  color: uiColors.textSecondary,
  fontSize: 13,
  whiteSpace: "nowrap",
}

const actionCellStyle: React.CSSProperties = {
  ...tableCellStyle,
  paddingRight: 0,
  textAlign: "right",
  whiteSpace: "nowrap",
}

const linkStyle: React.CSSProperties = {
  color: uiColors.primary,
  fontWeight: 600,
  textDecoration: "none",
}
