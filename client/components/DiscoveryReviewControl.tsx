"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import {
  addButtonStyle,
  errorStyle,
  eyebrowStyle,
  hintStyle,
  saveButtonStyle,
  successStyle,
  textareaStyle,
} from "./DiscoveryFields"
import { formatDateTime, formatList, t, translateServerMessage } from "../i18n"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"

import type { DiscoveryAudience } from "../lib/discovery-guidance"
import type { MeasurementGapSubject } from "../../shared/discovery-profile.schema"
import type {
  DiscoveryActor,
  DiscoveryProvenance,
  DiscoverySection,
  DiscoveryWorkflowState,
} from "../../shared/discovery-workflow.schema"

type DiscoveryReviewControlProps = {
  engagementId: string
  actor: DiscoveryActor
  /**
   * Which surface is asking. The client sees the state of their own Discovery
   * and the note it came back with; the per-section provenance is the
   * consultant's review material and stays on the consultant's surface.
   */
  audience: DiscoveryAudience
  workflow: DiscoveryWorkflowState
  pathPrefix?: string
  /** A refusal the server named — the surface may point at what is still open. */
  onTransitionRefused?: () => void
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

// Identifiers stay English on the wire and in storage; only their rendering is
// German, looked up by key (coding-standards.md §12A).
const statusLabel = (status: DiscoveryWorkflowState["status"]) =>
  t(`discovery.status.${status}`)

const sectionLabel = (section: DiscoverySection) =>
  t(`discovery.section.${section}`)

const provenanceLabel = (provenance: DiscoveryProvenance) =>
  t(`discovery.provenance.${provenance}`)

export default function DiscoveryReviewControl({
  engagementId,
  actor,
  audience,
  workflow,
  pathPrefix = "/engagements",
  onTransitionRefused,
}: DiscoveryReviewControlProps) {
  const router = useRouter()
  const [returnNotes, setReturnNotes] = useState("")
  const [isWorking, setIsWorking] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function runTransition(
    transition: "submit" | "return" | "accept" | "reopen",
  ) {
    setIsWorking(true)
    setMessage("")
    setError("")

    try {
      const response = await fetch(
        `${API_BASE_URL}${pathPrefix}/${engagementId}/discovery/${transition}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            transition === "return"
              ? { actor, notes: returnNotes }
              : { actor },
          ),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        onTransitionRefused?.()
        // The server decides every transition and names its refusal with an
        // identifier; the wording is ours, in the user's language.
        const refusal = translateServerMessage(
          result.message,
          result.data?.messageParams,
          "discovery.review.transition_failed",
        )
        // The server reports the still-unexplained baseline subjects as
        // identifiers, which are rendered here in the user's language.
        const subjects: MeasurementGapSubject[] =
          result.data?.unexplainedBaselineSubjects ?? []

        throw new Error(
          subjects.length > 0
            ? `${refusal} ${t("discovery.review.open_subjects", {
                subjects: formatList(
                  subjects.map((subject) => t(`discovery.gap_subject.${subject}`)),
                ),
              })}`
            : refusal,
        )
      }

      setMessage(translateServerMessage(result.message))
      if (transition === "return") setReturnNotes("")
      router.refresh()
    } catch {
      setError(
        t("common.error.unexpected"),
      )
    } finally {
      setIsWorking(false)
    }
  }

  const provenanceEntries = Object.entries(workflow.contentProvenance) as [
    DiscoverySection,
    DiscoveryProvenance | null,
  ][]

  return (
    <section style={reviewStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>{t("discovery.review.title")}</h2>
        <span style={statusBadgeStyle}>{statusLabel(workflow.status)}</span>
      </div>

      <p style={{ ...hintStyle, margin: 0, lineHeight: 1.45 }}>
        {t("discovery.review.intro")}
      </p>

      {message && (
        <p role="status" style={successStyle}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}

      <dl style={factsStyle}>
        <Fact
          label={t("discovery.review.submitted.label")}
          value={
            workflow.submittedAt
              ? t("discovery.review.submitted.value", {
                  date: formatDateTime(workflow.submittedAt),
                  actor: workflow.submittedBy
                    ? t(`discovery.actor.${workflow.submittedBy}`)
                    : t("common.field.not_captured"),
                })
              : t("discovery.review.submitted.none")
          }
        />
        <Fact
          label={t("discovery.review.reviewed.label")}
          value={
            workflow.reviewedAt
              ? formatDateTime(workflow.reviewedAt)
              : t("discovery.review.reviewed.none")
          }
        />
      </dl>

      {workflow.returnNotes && (
        <div style={notesStyle}>
          <p style={eyebrowStyle}>{t("discovery.review.return_notes.title")}</p>
          <p style={notesTextStyle}>{workflow.returnNotes}</p>
        </div>
      )}

      {/* Who contributed what stays available without dominating the rail: it
          is consulted when a submission is reviewed, not while typing. */}
      {audience === "consultant" && (
      <details>
        <summary style={summaryStyle}>
          {t("discovery.review.provenance.title")}
        </summary>
        <ul style={provenanceListStyle}>
          {provenanceEntries.map(([section, provenance]) => (
            <li key={section} style={provenanceItemStyle}>
              <span style={provenanceSectionStyle}>{sectionLabel(section)}</span>
              <strong
                style={{
                  ...provenanceValueStyle,
                  color:
                    provenance === "client_provided"
                      ? uiColors.warning
                      : uiColors.textSecondary,
                }}
              >
                {provenance === null
                  ? t("discovery.provenance.none")
                  : provenanceLabel(provenance)}
              </strong>
            </li>
          ))}
        </ul>
        <p style={{ ...hintStyle, margin: 0, lineHeight: 1.45 }}>
          {t("discovery.review.provenance.hint")}
        </p>
      </details>
      )}

      <div style={actionsStyle}>
        <button
          type="button"
          onClick={() => runTransition("submit")}
          disabled={isWorking}
          style={{ ...saveButtonStyle, opacity: isWorking ? 0.6 : 1 }}
        >
          {t("discovery.review.action.submit")}
        </button>

        {/* Accepting, returning, and reopening are the consultant's authority.
            Hiding them from a client is a convenience — the server refuses them
            regardless of what the interface shows. */}
        {actor === "consultant" && (
          <>
            <button
              type="button"
              onClick={() => runTransition("accept")}
              disabled={isWorking}
              style={{ ...addButtonStyle, opacity: isWorking ? 0.6 : 1 }}
            >
              {t("discovery.review.action.accept")}
            </button>
            <button
              type="button"
              onClick={() => runTransition("reopen")}
              disabled={isWorking}
              style={{ ...addButtonStyle, opacity: isWorking ? 0.6 : 1 }}
            >
              {t("discovery.review.action.reopen")}
            </button>
          </>
        )}
      </div>

      {actor === "consultant" && (
        <div style={returnBlockStyle}>
          <label style={returnLabelStyle}>
            <span>{t("discovery.review.notes.label")}</span>
            <textarea
              value={returnNotes}
              onChange={(event) => setReturnNotes(event.target.value)}
              placeholder={t("discovery.review.notes.placeholder")}
              style={textareaStyle}
            />
          </label>
          <button
            type="button"
            onClick={() => runTransition("return")}
            disabled={isWorking || !returnNotes.trim()}
            style={{
              ...addButtonStyle,
              color: uiColors.warning,
              opacity: isWorking || !returnNotes.trim() ? 0.6 : 1,
            }}
          >
            {t("discovery.review.action.return")}
          </button>
        </div>
      )}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={eyebrowStyle}>{label}</dt>
      <dd style={factValueStyle}>{value}</dd>
    </div>
  )
}

const reviewStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.sm,
  alignContent: "start",
  border: `1px solid ${uiColors.border}`,
  borderRadius: uiRadius.card,
  padding: uiSpace.sm,
  background: uiColors.surface,
}
const headerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: uiSpace.xs,
}
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 650,
  color: uiColors.textPrimary,
}
const statusBadgeStyle: React.CSSProperties = {
  borderRadius: uiRadius.pill,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.subtle,
  padding: `2px ${uiSpace.xs}`,
  color: uiColors.textSecondary,
  fontSize: 12,
  fontWeight: 600,
}
const factsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: uiSpace.xs,
  margin: 0,
}
const factValueStyle: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 12,
  lineHeight: 1.4,
  color: uiColors.textPrimary,
}
const notesStyle: React.CSSProperties = {
  padding: uiSpace.xs,
  borderRadius: uiRadius.control,
  background: uiColors.warningTint,
  border: `1px solid ${uiColors.border}`,
}
const notesTextStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  lineHeight: 1.45,
  color: uiColors.textPrimary,
}
const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 650,
  color: uiColors.textPrimary,
}
const provenanceListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: `${uiSpace.xs} 0`,
  padding: 0,
  display: "grid",
  gap: 2,
}
const provenanceItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: uiSpace.xs,
  padding: `4px ${uiSpace.xs}`,
  borderRadius: uiRadius.control,
  background: uiColors.subtle,
}
const provenanceSectionStyle: React.CSSProperties = {
  fontSize: 12,
  color: uiColors.textSecondary,
}
const provenanceValueStyle: React.CSSProperties = {
  fontSize: 12,
  textAlign: "right",
}
const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: uiSpace.xs,
  flexWrap: "wrap",
}
const returnBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  justifyItems: "start",
}
const returnLabelStyle: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gap: uiSpace.xxs,
  fontSize: 12,
  fontWeight: 600,
  color: uiColors.textPrimary,
}
