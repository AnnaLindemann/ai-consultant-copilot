"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  Badge,
  EmptyState,
  InlineAlert,
  actionRowStyle,
  bodyTextStyle,
  buttonStyle,
  cardStyle,
  fieldStyle,
  inputStyle,
  metaTextStyle,
  mutedTextStyle,
  pageStackStyle,
  sectionTitleStyle,
  subSectionTitleStyle,
  textareaStyle,
  type Tone,
} from "./UiKit"
import { signInPath } from "../lib/auth-redirect"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"
import { TECHNOLOGY_PROPOSAL_STATUSES } from "../lib/technology-options"
import { formatDateTime, t, translateServerMessage } from "../i18n"

import type {
  TechnologyProposalReview as ProposalReview,
  TechnologyProposalStatus,
  TechnologyUpdateProposal,
} from "../../shared/technology-knowledge.schema"

// Technology Update Proposals (screen A11): the proposed change, the profile it
// affects, the official sources it derives from, the diff, its assumptions and
// gaps, and the approve/reject decision.
//
// This screen **is** the human-approval gate. Approving here is the only way
// anything reaches the Technology Knowledge Base, which is why the decision
// controls are deliberately plain and the diff is shown before them.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

type ProposalsResponse = {
  status: boolean
  message?: string
  data?: { proposals: TechnologyUpdateProposal[] }
}

type ReviewResponse = {
  status: boolean
  message?: string
  data?: { review: ProposalReview }
}

type DecisionResponse = {
  status: boolean
  message?: string
}

export default function TechnologyProposalReview() {
  const router = useRouter()
  const [proposals, setProposals] = useState<TechnologyUpdateProposal[]>([])
  const [statusFilter, setStatusFilter] =
    useState<TechnologyProposalStatus | "">("pending")
  const [review, setReview] = useState<ProposalReview | null>(null)
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    void loadProposals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  function refused(status: number) {
    if (status === 401) {
      router.replace(signInPath("/technology/proposals"))
      return true
    }

    if (status === 403) {
      setAccessDenied(true)
      return true
    }

    return false
  }

  async function loadProposals() {
    setLoading(true)
    setError("")

    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set("status", statusFilter)

      const response = await fetch(
        `${API_BASE_URL}/technology/proposals?${params}`,
        { credentials: "include" },
      )

      if (refused(response.status)) return

      const result = (await response.json()) as ProposalsResponse
      if (!response.ok || !result.data) {
        throw new Error(t("technology.proposals.error"))
      }

      setProposals(result.data.proposals)
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setLoading(false)
    }
  }

  async function openReview(id: string) {
    setError("")
    setNotice("")
    setNote("")

    try {
      const response = await fetch(`${API_BASE_URL}/technology/proposals/${id}`, {
        credentials: "include",
      })

      if (refused(response.status)) return

      const result = (await response.json()) as ReviewResponse
      if (!response.ok || !result.data) {
        throw new Error(t("technology.proposals.error"))
      }

      setReview(result.data.review)
    } catch {
      setError(t("common.error.unexpected"))
    }
  }

  async function decide(decision: "approve" | "reject") {
    if (!review) return

    setDeciding(true)
    setError("")
    setNotice("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/technology/proposals/${review.proposal.id}/decision`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            ...(note.trim() ? { note: note.trim() } : {}),
          }),
        },
      )

      if (refused(response.status)) return

      const result = (await response.json()) as DecisionResponse

      if (!response.ok || !result.status) {
        setError(
          translateServerMessage(
            result.message,
            undefined,
            "technology.proposals.error",
          ),
        )
        return
      }

      setNotice(
        translateServerMessage(
          result.message,
          undefined,
          "technology.proposals.decided",
        ),
      )
      setReview(null)
      await loadProposals()
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setDeciding(false)
    }
  }

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
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t("technology.proposals.title")}</h2>
        <p style={mutedTextStyle}>{t("technology.proposals.hint")}</p>

        <label style={fieldStyle}>
          {t("technology.proposals.filter.status")}
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as TechnologyProposalStatus | "")
            }
            style={inputStyle}
          >
            <option value="">{t("technology.proposals.filter.all")}</option>
            {TECHNOLOGY_PROPOSAL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`technology.proposal_status.${status}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </label>

        {loading ? (
          <p style={mutedTextStyle}>{t("common.state.loading")}</p>
        ) : proposals.length === 0 ? (
          <EmptyState title={t("technology.proposals.empty.title")}>
            <p style={mutedTextStyle}>
              {t("technology.proposals.empty.description")}
            </p>
          </EmptyState>
        ) : (
          <ul style={listStyle}>
            {proposals.map((proposal) => (
              <li key={proposal.id} style={listItemStyle}>
                <button
                  type="button"
                  onClick={() => void openReview(proposal.id)}
                  style={listButtonStyle}
                >
                  <span style={listTitleStyle}>{proposal.profileCode}</span>
                  <span style={listMetaStyle}>
                    {t(
                      `technology.change_kind.${proposal.changeKind}` as Parameters<
                        typeof t
                      >[0],
                    )}
                  </span>
                  <span style={listMetaStyle}>
                    {formatDateTime(proposal.createdAt)}
                  </span>
                  <Badge
                    tone={statusTone(proposal.status)}
                    label={t(
                      `technology.proposal_status.${proposal.status}` as Parameters<
                        typeof t
                      >[0],
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {review && (
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>{t("technology.review.title")}</h2>

          <dl style={factGridStyle}>
            <Fact
              labelKey="technology.review.profile"
              value={review.proposal.profileCode}
            />
            <Fact
              labelKey="technology.review.category"
              value={review.proposal.categoryCode}
            />
            <Fact
              labelKey="technology.review.change_kind"
              value={t(
                `technology.change_kind.${review.proposal.changeKind}` as Parameters<
                  typeof t
                >[0],
              )}
            />
            <Fact
              labelKey="technology.review.created"
              value={formatDateTime(review.proposal.createdAt)}
            />
          </dl>

          <div style={detailBlockStyle}>
            <p style={subSectionTitleStyle}>{t("technology.review.rationale")}</p>
            <p style={bodyTextStyle}>{review.proposal.rationale}</p>
          </div>

          <ListBlock
            titleKey="technology.review.assumptions"
            values={review.proposal.assumptions}
            emptyKey="technology.review.none_stated"
          />
          <ListBlock
            titleKey="technology.review.gaps"
            values={review.proposal.gaps}
            emptyKey="technology.review.none_stated"
          />

          <div style={detailBlockStyle}>
            <p style={subSectionTitleStyle}>{t("technology.review.sources")}</p>
            <ul style={detailListStyle}>
              {review.sources.map((source) => (
                <li key={source.code} style={bodyTextStyle}>
                  {source.name}
                  <ul style={detailListStyle}>
                    {source.officialChannels.map((channel) => (
                      <li key={channel.url} style={metaTextStyle}>
                        {channel.label}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>

          <div style={detailBlockStyle}>
            <p style={subSectionTitleStyle}>{t("technology.review.diff")}</p>
            <div style={diffTableWrapStyle}>
              <table style={diffTableStyle}>
                <thead>
                  <tr>
                    <th style={diffHeadStyle}>{t("technology.review.diff.field")}</th>
                    <th style={diffHeadStyle}>{t("technology.review.diff.before")}</th>
                    <th style={diffHeadStyle}>{t("technology.review.diff.after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {review.diff.map((row) => (
                    <tr key={row.field} style={row.changed ? changedRowStyle : undefined}>
                      <td style={diffCellStyle}>
                        {t(
                          `technology.field.${row.field}` as Parameters<typeof t>[0],
                        )}
                      </td>
                      <td style={diffCellStyle}>
                        {row.before.length === 0
                          ? t("technology.review.diff.empty")
                          : row.before.join(" · ")}
                      </td>
                      <td style={diffCellStyle}>
                        {row.after.length === 0
                          ? t("technology.review.diff.empty")
                          : row.after.join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {review.proposal.status === "pending" ? (
            <>
              <label style={fieldStyle}>
                {t("technology.review.note")}
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  style={textareaStyle}
                />
              </label>

              <p style={mutedTextStyle}>{t("technology.review.gate_hint")}</p>

              <div style={actionRowStyle}>
                <button
                  type="button"
                  onClick={() => void decide("approve")}
                  disabled={deciding}
                  style={buttonStyle("primary")}
                >
                  {t("technology.review.approve")}
                </button>
                <button
                  type="button"
                  onClick={() => void decide("reject")}
                  disabled={deciding}
                  style={buttonStyle("danger")}
                >
                  {t("technology.review.reject")}
                </button>
                <button
                  type="button"
                  onClick={() => setReview(null)}
                  style={buttonStyle("ghost")}
                >
                  {t("common.action.close")}
                </button>
              </div>
            </>
          ) : (
            <InlineAlert tone="info">
              {t("technology.review.already_decided", {
                status: t(
                  `technology.proposal_status.${review.proposal.status}` as Parameters<
                    typeof t
                  >[0],
                ),
              })}
            </InlineAlert>
          )}
        </section>
      )}
    </div>
  )
}

function Fact({
  labelKey,
  value,
}: {
  labelKey: Parameters<typeof t>[0]
  value: string
}) {
  return (
    <div>
      <dt style={factLabelStyle}>{t(labelKey)}</dt>
      <dd style={factValueStyle}>{value}</dd>
    </div>
  )
}

function ListBlock({
  titleKey,
  values,
  emptyKey,
}: {
  titleKey: Parameters<typeof t>[0]
  values: readonly string[]
  emptyKey: Parameters<typeof t>[0]
}) {
  return (
    <div style={detailBlockStyle}>
      <p style={subSectionTitleStyle}>{t(titleKey)}</p>
      {values.length === 0 ? (
        <p style={metaTextStyle}>{t(emptyKey)}</p>
      ) : (
        <ul style={detailListStyle}>
          {values.map((value) => (
            <li key={value} style={bodyTextStyle}>
              {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const statusTone = (status: TechnologyProposalStatus): Tone => {
  switch (status) {
    case "pending":
      return "warning"
    case "approved":
      return "success"
    case "rejected":
      return "neutral"
  }
}

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: `${uiSpace.sm} 0 0`,
  padding: 0,
  display: "grid",
  gap: uiSpace.xs,
}

const listItemStyle: React.CSSProperties = {
  border: `1px solid ${uiColors.border}`,
  borderRadius: uiRadius.control,
  overflow: "hidden",
}

const listButtonStyle: React.CSSProperties = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  gap: uiSpace.sm,
  padding: uiSpace.sm,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  flexWrap: "wrap",
}

const listTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 650,
  color: uiColors.textPrimary,
}

const listMetaStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 13,
}

const factGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: uiSpace.sm,
  margin: `${uiSpace.sm} 0 0`,
}

const factLabelStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
}

const factValueStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: uiColors.textPrimary,
  fontSize: 14,
}

const detailBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  marginTop: uiSpace.sm,
}

const detailListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: uiSpace.md,
  display: "grid",
  gap: 2,
}

const diffTableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
}

const diffTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
}

const diffHeadStyle: React.CSSProperties = {
  textAlign: "left",
  padding: uiSpace.xs,
  borderBottom: `1px solid ${uiColors.border}`,
  color: uiColors.textSecondary,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
}

const diffCellStyle: React.CSSProperties = {
  padding: uiSpace.xs,
  borderBottom: `1px solid ${uiColors.border}`,
  verticalAlign: "top",
}

const changedRowStyle: React.CSSProperties = {
  background: uiColors.primaryTint,
}
