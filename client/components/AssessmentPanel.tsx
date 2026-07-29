"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import type {
  Assessment,
  AssessmentDimension,
  AssessmentDimensionKey,
  AssessmentFinding,
  AssessmentReviewState,
} from "../../shared/assessment.schema"

type AssessmentPanelProps = {
  engagementId: string
  initialAssessment: Assessment | null
  initialReviewState: AssessmentReviewState | null
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

const DIMENSION_LABELS: Record<AssessmentDimensionKey, string> = {
  businessProcess: "Business Process",
  data: "Data",
  technology: "Technology",
  aiReadiness: "AI Readiness",
  risks: "Risks",
  opportunities: "Opportunities",
}

const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS) as AssessmentDimensionKey[]

// The draft is always labelled for what it is, so an unreviewed AI output is
// never mistaken for the consultant's own conclusion.
const REVIEW_STATE_LABELS: Record<AssessmentReviewState, string> = {
  ai_draft: "AI draft · not yet reviewed",
  consultant_edited: "Edited by you",
  accepted: "Accepted by you",
}

const confidenceOptions = ["low", "medium", "high"] as const
const basisOptions = ["discovery_fact", "assumption"] as const

const BASIS_LABELS: Record<(typeof basisOptions)[number], string> = {
  discovery_fact: "Supported by discovery",
  assumption: "Rests on an assumption",
}

const emptyFinding: AssessmentFinding = {
  title: "",
  detail: "",
  basis: "assumption",
  supportingFacts: [],
  assumptions: [],
  confidence: "low",
}

export default function AssessmentPanel({
  engagementId,
  initialAssessment,
  initialReviewState,
}: AssessmentPanelProps) {
  const router = useRouter()
  const [assessment, setAssessment] = useState(initialAssessment)
  const [reviewState, setReviewState] = useState(initialReviewState)
  const [gapDimension, setGapDimension] =
    useState<AssessmentDimensionKey>("businessProcess")
  const [gapDescription, setGapDescription] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editsAtRisk, setEditsAtRisk] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  function updateAssessment(update: (current: Assessment) => Assessment) {
    setAssessment((current) => (current ? update(current) : current))
    setMessage("")
  }

  function updateDimension(
    key: AssessmentDimensionKey,
    update: (dimension: AssessmentDimension) => AssessmentDimension,
  ) {
    updateAssessment((current) => ({
      ...current,
      dimensions: {
        ...current.dimensions,
        [key]: update(current.dimensions[key]),
      },
    }))
  }

  function updateFinding(
    key: AssessmentDimensionKey,
    index: number,
    patch: Partial<AssessmentFinding>,
  ) {
    updateDimension(key, (dimension) => ({
      ...dimension,
      findings: dimension.findings.map((finding, findingIndex) =>
        findingIndex === index ? { ...finding, ...patch } : finding,
      ),
    }))
  }

  function addFinding(key: AssessmentDimensionKey) {
    updateDimension(key, (dimension) => ({
      ...dimension,
      findings: [...dimension.findings, { ...emptyFinding }],
    }))
  }

  function removeFinding(key: AssessmentDimensionKey, index: number) {
    updateDimension(key, (dimension) => ({
      ...dimension,
      findings: dimension.findings.filter(
        (_, findingIndex) => findingIndex !== index,
      ),
    }))
  }

  function addGap() {
    const description = gapDescription.trim()
    if (!description) return

    updateAssessment((current) => ({
      ...current,
      gaps: [...current.gaps, { dimension: gapDimension, description }],
    }))
    setGapDescription("")
  }

  function removeGap(index: number) {
    updateAssessment((current) => ({
      ...current,
      gaps: current.gaps.filter((_, gapIndex) => gapIndex !== index),
    }))
  }

  async function generateAssessment(replaceConsultantEdits: boolean) {
    setIsGenerating(true)
    setError("")
    setMessage("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/engagements/${engagementId}/assessment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replaceConsultantEdits }),
        },
      )
      const result = await response.json()

      // The backend refuses to overwrite reviewed work; regenerating anyway is
      // the consultant's explicit decision.
      if (response.status === 409) {
        setEditsAtRisk(true)
        setError(result.message ?? "This Assessment carries your own edits.")
        return
      }

      if (!response.ok) {
        throw new Error(result.message ?? "Failed to generate the Assessment")
      }

      setAssessment(result.data.assessment as Assessment)
      setReviewState(result.data.reviewState as AssessmentReviewState)
      setEditsAtRisk(false)
      setMessage("AI draft generated. Review, edit, and save it before use.")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error")
    } finally {
      setIsGenerating(false)
    }
  }

  async function saveAssessment(
    nextReviewState: Exclude<AssessmentReviewState, "ai_draft">,
  ) {
    if (!assessment) return

    setIsSaving(true)
    setError("")
    setMessage("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/engagements/${engagementId}/assessment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assessment,
            reviewState: nextReviewState,
          }),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message ?? "Failed to save the Assessment")
      }

      setReviewState(nextReviewState)
      setEditsAtRisk(false)
      setMessage(
        nextReviewState === "accepted"
          ? "Assessment accepted"
          : "Assessment saved",
      )
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Phase 3 · Business &amp; AI Readiness</p>
          <h2 style={headingStyle}>Assessment</h2>
          <p style={introStyle}>
            An AI-assisted reading of the persisted Discovery Profile across all
            six dimensions. Every finding shows whether it is supported by
            discovery or rests on an assumption, and how confident it is. The
            draft is yours to edit, override, or accept.
          </p>
        </div>
        <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
          {reviewState && (
            <span
              style={
                reviewState === "ai_draft" ? draftBadgeStyle : reviewedBadgeStyle
              }
            >
              {REVIEW_STATE_LABELS[reviewState]}
            </span>
          )}
          <button
            type="button"
            onClick={() => generateAssessment(false)}
            disabled={isGenerating}
            style={{ ...generateButtonStyle, opacity: isGenerating ? 0.6 : 1 }}
          >
            {isGenerating
              ? "Generating…"
              : assessment
                ? "Regenerate from Discovery"
                : "Generate Assessment"}
          </button>
        </div>
      </div>

      {message && <p style={successStyle}>{message}</p>}
      {error && <p style={errorStyle}>{error}</p>}

      {editsAtRisk && (
        <div style={confirmStyle}>
          <p style={{ margin: 0 }}>
            Regenerating replaces the Assessment you edited. Your saved version
            cannot be recovered afterwards.
          </p>
          <button
            type="button"
            onClick={() => generateAssessment(true)}
            disabled={isGenerating}
            style={{ ...dangerButtonStyle, opacity: isGenerating ? 0.6 : 1 }}
          >
            Replace my edits and regenerate
          </button>
        </div>
      )}

      {!assessment ? (
        <p style={emptyStyle}>
          No Assessment yet. Capture the Discovery Profile first, then generate a
          draft from it.
        </p>
      ) : (
        <>
          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <span>Overall summary</span>
            <textarea
              value={assessment.summary}
              onChange={(event) =>
                updateAssessment((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
              style={textareaStyle}
            />
          </label>

          {DIMENSION_KEYS.map((key) => {
            const dimension = assessment.dimensions[key]

            return (
              <fieldset key={key} style={sectionStyle}>
                <legend style={legendStyle}>{DIMENSION_LABELS[key]}</legend>

                <label style={fieldStyle}>
                  <span>Dimension summary</span>
                  <textarea
                    value={dimension.summary}
                    onChange={(event) =>
                      updateDimension(key, (current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                    style={textareaStyle}
                  />
                </label>

                {dimension.findings.length === 0 ? (
                  <p style={emptyFindingStyle}>
                    No findings for this dimension. Discovery did not support
                    any — add your own, or record what is missing as a gap.
                  </p>
                ) : (
                  dimension.findings.map((finding, index) => (
                    <div key={index} style={findingStyle}>
                      <div style={findingHeaderStyle}>
                        <span
                          style={
                            finding.basis === "discovery_fact"
                              ? factBadgeStyle
                              : assumptionBadgeStyle
                          }
                        >
                          {BASIS_LABELS[finding.basis]}
                        </span>
                        <span style={confidenceBadgeStyle}>
                          confidence: {finding.confidence}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFinding(key, index)}
                          style={removeButtonStyle}
                        >
                          Remove
                        </button>
                      </div>

                      <div style={fieldsGridStyle}>
                        <label style={fieldStyle}>
                          <span>Finding</span>
                          <input
                            value={finding.title}
                            onChange={(event) =>
                              updateFinding(key, index, {
                                title: event.target.value,
                              })
                            }
                            style={inputStyle}
                          />
                        </label>

                        <label style={fieldStyle}>
                          <span>Basis</span>
                          <select
                            value={finding.basis}
                            onChange={(event) =>
                              updateFinding(key, index, {
                                basis: event.target
                                  .value as AssessmentFinding["basis"],
                              })
                            }
                            style={inputStyle}
                          >
                            {basisOptions.map((option) => (
                              <option key={option} value={option}>
                                {BASIS_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label style={fieldStyle}>
                          <span>Confidence</span>
                          <select
                            value={finding.confidence}
                            onChange={(event) =>
                              updateFinding(key, index, {
                                confidence: event.target
                                  .value as AssessmentFinding["confidence"],
                              })
                            }
                            style={inputStyle}
                          >
                            {confidenceOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                          <span>Detail</span>
                          <textarea
                            value={finding.detail}
                            onChange={(event) =>
                              updateFinding(key, index, {
                                detail: event.target.value,
                              })
                            }
                            style={textareaStyle}
                          />
                        </label>

                        <label style={fieldStyle}>
                          <span>Supporting discovery facts</span>
                          <input
                            value={finding.supportingFacts.join(" | ")}
                            onChange={(event) =>
                              updateFinding(key, index, {
                                supportingFacts: toList(event.target.value),
                              })
                            }
                            style={inputStyle}
                          />
                          <small style={hintStyle}>
                            Separate items with a pipe (|).
                          </small>
                        </label>

                        <label style={fieldStyle}>
                          <span>Assumptions</span>
                          <input
                            value={finding.assumptions.join(" | ")}
                            onChange={(event) =>
                              updateFinding(key, index, {
                                assumptions: toList(event.target.value),
                              })
                            }
                            style={inputStyle}
                          />
                          <small style={hintStyle}>
                            Separate items with a pipe (|).
                          </small>
                        </label>
                      </div>
                    </div>
                  ))
                )}

                <button
                  type="button"
                  onClick={() => addFinding(key)}
                  style={addButtonStyle}
                >
                  Add finding
                </button>
              </fieldset>
            )
          })}

          <section style={gapsStyle}>
            <div>
              <p style={eyebrowStyle}>Open questions</p>
              <h3 style={{ margin: "5px 0 8px", fontSize: 22 }}>
                What the Assessment could not determine
              </h3>
              <p style={introStyle}>
                Gaps stay visible instead of being filled in by guesswork.
              </p>
            </div>

            {assessment.gaps.length === 0 ? (
              <p style={emptyGapStyle}>
                No gaps recorded for this Assessment.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {assessment.gaps.map((gap, index) => (
                  <div key={`${gap.dimension}-${index}`} style={gapItemStyle}>
                    <div>
                      <strong>{DIMENSION_LABELS[gap.dimension]}</strong>
                      <p style={{ margin: "4px 0 0", color: "#374151" }}>
                        {gap.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGap(index)}
                      style={removeButtonStyle}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={gapInputStyle}>
              <label style={fieldStyle}>
                <span>Dimension</span>
                <select
                  value={gapDimension}
                  onChange={(event) =>
                    setGapDimension(event.target.value as AssessmentDimensionKey)
                  }
                  style={inputStyle}
                >
                  {DIMENSION_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {DIMENSION_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldStyle}>
                <span>Description</span>
                <input
                  value={gapDescription}
                  onChange={(event) => setGapDescription(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      addGap()
                    }
                  }}
                  placeholder="What still has to be learned to assess this?"
                  style={inputStyle}
                />
              </label>
              <button
                type="button"
                onClick={addGap}
                disabled={!gapDescription.trim()}
                style={addButtonStyle}
              >
                Add gap
              </button>
            </div>
          </section>

          <p style={hintStyle}>
            Every finding needs a title, a detail, a confidence, and — depending
            on its basis — at least one supporting fact or one assumption.
          </p>

          <div style={footerStyle}>
            <button
              type="button"
              onClick={() => saveAssessment("consultant_edited")}
              disabled={isSaving}
              style={{ ...saveButtonStyle, opacity: isSaving ? 0.6 : 1 }}
            >
              {isSaving ? "Saving…" : "Save Assessment"}
            </button>
            <button
              type="button"
              onClick={() => saveAssessment("accepted")}
              disabled={isSaving}
              style={{ ...acceptButtonStyle, opacity: isSaving ? 0.6 : 1 }}
            >
              Accept Assessment
            </button>
          </div>
        </>
      )}
    </section>
  )
}

// Findings are full sentences, so a pipe separates list items instead of the
// comma the Discovery Profile's short entries use.
function toList(value: string): string[] {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
}

const panelStyle: React.CSSProperties = {
  maxWidth: 1120,
  margin: "24px auto 0",
  display: "grid",
  gap: 20,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 24,
  padding: 32,
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
}
const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  alignItems: "start",
  flexWrap: "wrap",
}
const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#4f46e5",
  fontWeight: 800,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.8,
}
const headingStyle: React.CSSProperties = { margin: "6px 0 8px", fontSize: 30 }
const introStyle: React.CSSProperties = {
  margin: 0,
  color: "#6b7280",
  lineHeight: 1.55,
  maxWidth: 720,
}
const sectionStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 20,
  margin: 0,
  display: "grid",
  gap: 14,
}
const legendStyle: React.CSSProperties = {
  padding: "0 8px",
  fontWeight: 800,
  fontSize: 18,
}
const fieldsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 16,
}
const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 7,
  alignContent: "start",
  fontWeight: 700,
  fontSize: 14,
}
const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "11px 12px",
  fontSize: 15,
  background: "#fff",
  color: "#111827",
}
const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 78,
  resize: "vertical",
}
const hintStyle: React.CSSProperties = {
  color: "#6b7280",
  fontWeight: 400,
  margin: 0,
}
const findingStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 16,
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
}
const findingHeaderStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
}
const badgeBaseStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
}
const factBadgeStyle: React.CSSProperties = {
  ...badgeBaseStyle,
  background: "#ecfdf5",
  color: "#065f46",
}
const assumptionBadgeStyle: React.CSSProperties = {
  ...badgeBaseStyle,
  background: "#fef3c7",
  color: "#92400e",
}
const confidenceBadgeStyle: React.CSSProperties = {
  ...badgeBaseStyle,
  background: "#eef2ff",
  color: "#3730a3",
}
const draftBadgeStyle: React.CSSProperties = {
  ...badgeBaseStyle,
  background: "#fef3c7",
  color: "#92400e",
}
const reviewedBadgeStyle: React.CSSProperties = {
  ...badgeBaseStyle,
  background: "#ecfdf5",
  color: "#065f46",
}
const generateButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 12,
  padding: "12px 17px",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
}
const saveButtonStyle: React.CSSProperties = {
  ...generateButtonStyle,
  background: "#4f46e5",
}
const acceptButtonStyle: React.CSSProperties = {
  ...generateButtonStyle,
  background: "#047857",
}
const dangerButtonStyle: React.CSSProperties = {
  ...generateButtonStyle,
  background: "#b91c1c",
}
const addButtonStyle: React.CSSProperties = {
  ...generateButtonStyle,
  justifySelf: "start",
}
const removeButtonStyle: React.CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#b91c1c",
  fontWeight: 700,
  cursor: "pointer",
  marginLeft: "auto",
}
const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
}
const successStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 12,
  background: "#ecfdf5",
  color: "#065f46",
  border: "1px solid #bbf7d0",
}
const errorStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 12,
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
}
const confirmStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  padding: 16,
  borderRadius: 14,
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
}
const emptyStyle: React.CSSProperties = {
  margin: 0,
  padding: 16,
  borderRadius: 14,
  background: "#f9fafb",
  border: "1px dashed #d1d5db",
  color: "#6b7280",
}
const emptyFindingStyle: React.CSSProperties = {
  ...emptyStyle,
  margin: 0,
}
const gapsStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
  border: "2px solid #c7d2fe",
  borderRadius: 18,
  padding: 20,
  background: "#f5f7ff",
}
const emptyGapStyle: React.CSSProperties = {
  margin: 0,
  padding: 14,
  borderRadius: 12,
  background: "#fff",
  border: "1px dashed #a5b4fc",
  color: "#6b7280",
}
const gapItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
  gap: 16,
  padding: 14,
  borderRadius: 12,
  background: "#fff",
  border: "1px solid #dbeafe",
}
const gapInputStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, .4fr) minmax(260px, 1fr) auto",
  gap: 12,
  alignItems: "end",
}
