"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  Badge,
  EmptyState,
  InlineAlert,
  cardStyle,
  metaTextStyle,
  mutedTextStyle,
  pageStackStyle,
  sectionTitleStyle,
  tableCellStyle,
  tableHeadCellStyle,
  tableScrollStyle,
  tableStyle,
} from "./UiKit"
import { signInPath } from "../lib/auth-redirect"
import { uiColors, uiSpace } from "../lib/design-tokens"
import { formatDateTime, t } from "../i18n"

import type { TechnologyUpdateHistoryEntry } from "../../shared/technology-knowledge.schema"

// Technology Update History (screen A12): the append-only record of approved,
// applied changes, with the official sources behind each one and the
// administrator who approved it.
//
// Read-only by construction, not by styling: there is no route that edits or
// removes an entry, and no repository function that could. The surface reflects
// that rather than creating it.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

type HistoryResponse = {
  status: boolean
  message?: string
  data?: { entries: TechnologyUpdateHistoryEntry[] }
}

export default function TechnologyUpdateHistoryView() {
  const router = useRouter()
  const [entries, setEntries] = useState<TechnologyUpdateHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [error, setError] = useState("")

  // The history is read once, on mount. It is loaded inside the effect rather
  // than by a hoisted helper because nothing else here reloads it: this surface
  // has no action that could change what it shows.
  //
  // The component already mounts in the loading state, so nothing is set before
  // the first `await`.
  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/technology/history`, {
          credentials: "include",
        })

        if (cancelled) return

        if (response.status === 401) {
          router.replace(signInPath("/technology/history"))
          return
        }

        if (response.status === 403) {
          setAccessDenied(true)
          return
        }

        const result = (await response.json()) as HistoryResponse
        if (cancelled) return

        if (!response.ok || !result.data) {
          throw new Error(t("technology.history.error"))
        }

        setEntries(result.data.entries)
      } catch {
        if (!cancelled) setError(t("common.error.unexpected"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadHistory()

    return () => {
      cancelled = true
    }
  }, [router])

  if (accessDenied) {
    return (
      <div style={pageStackStyle}>
        <InlineAlert tone="warning">{t("technology.access_denied")}</InlineAlert>
      </div>
    )
  }

  return (
    <div style={pageStackStyle}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t("technology.history.title")}</h2>
        <p style={mutedTextStyle}>{t("technology.history.hint")}</p>

        {loading ? (
          <p style={mutedTextStyle}>{t("common.state.loading")}</p>
        ) : entries.length === 0 ? (
          <EmptyState title={t("technology.history.empty.title")}>
            <p style={mutedTextStyle}>
              {t("technology.history.empty.description")}
            </p>
          </EmptyState>
        ) : (
          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeadCellStyle}>
                    {t("technology.history.column.applied_at")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("technology.history.column.profile")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("technology.history.column.change")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("technology.history.column.sources")}
                  </th>
                  <th style={tableHeadCellStyle}>
                    {t("technology.history.column.approver")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={tableCellStyle}>{formatDateTime(entry.appliedAt)}</td>
                    <td style={tableCellStyle}>
                      <span style={profileCodeStyle}>{entry.profileCode}</span>
                      <span style={metaTextStyle}>{entry.categoryCode}</span>
                    </td>
                    <td style={tableCellStyle}>
                      <Badge
                        tone="info"
                        label={t(
                          `technology.change_kind.${entry.changeKind}` as Parameters<
                            typeof t
                          >[0],
                        )}
                      />
                    </td>
                    <td style={tableCellStyle}>
                      {entry.sourceCodes.length === 0
                        ? t("technology.history.no_sources")
                        : entry.sourceCodes.join(", ")}
                    </td>
                    <td style={tableCellStyle}>
                      {entry.approvedByName ?? t("technology.history.unknown_approver")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const profileCodeStyle: React.CSSProperties = {
  display: "block",
  color: uiColors.textPrimary,
  fontWeight: 650,
  marginBottom: 2,
  marginRight: uiSpace.xs,
}
