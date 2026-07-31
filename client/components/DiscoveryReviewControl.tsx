"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import {
  addButtonStyle,
  errorStyle,
  eyebrowStyle,
  hintStyle,
  inputStyle,
  introStyle,
  saveButtonStyle,
  successStyle,
  textareaStyle,
} from "./DiscoveryFields"
import { formatDateTime, formatList, t, translateServerMessage } from "../i18n"

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
  workflow: DiscoveryWorkflowState
  pathPrefix?: string
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
  workflow,
  pathPrefix = "/engagements",
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
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("common.error.unexpected"),
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
      <div>
        <p style={eyebrowStyle}>{t("discovery.review.title")}</p>
        <h3 style={{ margin: "5px 0 8px", fontSize: 22 }}>
          {statusLabel(workflow.status)}
        </h3>
        <p style={introStyle}>{t("discovery.review.intro")}</p>
      </div>

      {message && <p style={successStyle}>{message}</p>}
      {error && <p style={errorStyle}>{error}</p>}

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
          <p style={{ margin: "6px 0 0" }}>{workflow.returnNotes}</p>
        </div>
      )}

      <div>
        <p style={eyebrowStyle}>{t("discovery.review.provenance.title")}</p>
        <ul style={provenanceListStyle}>
          {provenanceEntries.map(([section, provenance]) => (
            <li key={section} style={provenanceItemStyle}>
              <span>{sectionLabel(section)}</span>
              <strong
                style={{
                  color: provenance === "client_provided" ? "#b45309" : "#374151",
                }}
              >
                {provenance === null
                  ? t("discovery.provenance.none")
                  : provenanceLabel(provenance)}
              </strong>
            </li>
          ))}
        </ul>
        <small style={hintStyle}>
          {t("discovery.review.provenance.hint")}
        </small>
      </div>

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
              style={{ ...addButtonStyle, background: "#6b7280", opacity: isWorking ? 0.6 : 1 }}
            >
              {t("discovery.review.action.reopen")}
            </button>
          </>
        )}
      </div>

      {actor === "consultant" && (
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 700, fontSize: 14 }}>
            <span>{t("discovery.review.notes.label")}</span>
            <textarea
              value={returnNotes}
              onChange={(event) => setReturnNotes(event.target.value)}
              placeholder={t("discovery.review.notes.placeholder")}
              style={textareaStyle}
            />
          </label>
          <div>
            <button
              type="button"
              onClick={() => runTransition("return")}
              disabled={isWorking || !returnNotes.trim()}
              style={{
                ...saveButtonStyle,
                background: "#b45309",
                opacity: isWorking || !returnNotes.trim() ? 0.6 : 1,
              }}
            >
              {t("discovery.review.action.return")}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ ...eyebrowStyle, color: "#6b7280" }}>{label}</dt>
      <dd style={{ margin: "4px 0 0" }}>{value}</dd>
    </div>
  )
}

const reviewStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
  border: "2px solid #e5e7eb",
  borderRadius: 18,
  padding: 20,
  background: "#fafafa",
}
const factsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
  margin: 0,
}
const notesStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#fffbeb",
  border: "1px solid #fde68a",
  padding: 14,
}
const provenanceListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: "8px 0",
  padding: 0,
  display: "grid",
  gap: 6,
}
const provenanceItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 12px",
  borderRadius: 10,
  background: "#fff",
  border: "1px solid #e5e7eb",
}
const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
}
