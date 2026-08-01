"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import {
  SectionStatusLegend,
  WorkflowAccordion,
  WorkflowProgressSummary,
  WorkflowSectionNav,
  type WorkflowSectionItem,
} from "./WorkflowPrimitives"
import {
  stageEyebrowStyle,
  stageHeaderStyle,
  stageHeadingStyle,
  stageIntroStyle,
  stageSurfaceStyle,
} from "./StagePanel"
import {
  Badge,
  EmptyState,
  InlineAlert,
  actionRowStyle,
  buttonStyle,
  fieldStyle,
  fieldsGridStyle,
  fieldsetStyle,
  hintStyle,
  inputStyle,
  legendStyle,
  nestedBlockStyle,
  removeButtonStyle,
  rowStyle,
  subSectionTitleStyle,
  textareaStyle,
} from "./UiKit"
import { uiColors, uiSpace } from "../lib/design-tokens"
import { t, translateServerMessage } from "../i18n"
import type {
  Assessment,
  AssessmentDimension,
  AssessmentDimensionKey,
  AssessmentFinding,
  AssessmentReviewState,
} from "../../shared/assessment.schema"
import {
  hasAnyItem,
  hasAnyText,
  type WorkflowSectionStatus,
} from "../lib/workflow-status"

type AssessmentPanelProps = {
  engagementId: string
  initialAssessment: Assessment | null
  initialReviewState: AssessmentReviewState | null
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

// The six assessment dimensions, the three-step confidence scale, the two
// bases and the review state are the schema's own identifiers: they stay
// English on the wire and in storage, and only their rendering is looked up.
const DIMENSION_KEYS: AssessmentDimensionKey[] = [
  "businessProcess",
  "data",
  "technology",
  "aiReadiness",
  "risks",
  "opportunities",
]

const dimensionLabel = (key: AssessmentDimensionKey) =>
  t(`assessment.dimension.${key}`)

// The draft is always labelled for what it is, so an unreviewed AI output is
// never mistaken for the consultant's own conclusion.
const reviewStateLabel = (state: AssessmentReviewState) =>
  t(`assessment.review_state.${state}`)

const confidenceOptions = ["low", "medium", "high"] as const
const basisOptions = ["discovery_fact", "assumption"] as const

const confidenceLabel = (level: (typeof confidenceOptions)[number]) =>
  t(`assessment.confidence.${level}`)

const basisLabel = (basis: (typeof basisOptions)[number]) =>
  t(`assessment.basis.${basis}`)

const emptyFinding: Omit<AssessmentFinding, "id"> = {
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
      findings: [...dimension.findings, { ...emptyFinding } as AssessmentFinding],
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
          credentials: "include",
          body: JSON.stringify({ replaceConsultantEdits }),
        },
      )
      const result = await response.json()

      // The backend refuses to overwrite reviewed work; regenerating anyway is
      // the consultant's explicit decision. Every refusal arrives as an
      // identifier and is worded here (§12A).
      if (response.status === 409) {
        setEditsAtRisk(true)
        setError(
          translateServerMessage(
            result.message,
            undefined,
            "assessment.error.consultant_edits_protected",
          ),
        )
        return
      }

      if (!response.ok) {
        setError(
          translateServerMessage(
            result.message,
            undefined,
            "assessment.error.internal",
          ),
        )
        return
      }

      setAssessment(result.data.assessment as Assessment)
      setReviewState(result.data.reviewState as AssessmentReviewState)
      setEditsAtRisk(false)
      setMessage(
        translateServerMessage(
          result.message,
          undefined,
          "assessment.message.draft_generated",
        ),
      )
      router.refresh()
    } catch {
      setError(t("common.error.unexpected"))
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
          credentials: "include",
          body: JSON.stringify({
            assessment,
            reviewState: nextReviewState,
          }),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        setError(
          translateServerMessage(
            result.message,
            undefined,
            "assessment.error.internal",
          ),
        )
        return
      }

      setReviewState(nextReviewState)
      setEditsAtRisk(false)
      // Accepting and saving are the same endpoint but not the same event, so
      // the consultant is told which one happened.
      setMessage(
        nextReviewState === "accepted"
          ? t("assessment.confirm.accepted")
          : translateServerMessage(
              result.message,
              undefined,
              "assessment.message.saved",
            ),
      )
      router.refresh()
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setIsSaving(false)
    }
  }

  function getAssessmentDimensionStatus(
    key: AssessmentDimensionKey,
    currentAssessment: Assessment | null,
    currentReviewState: AssessmentReviewState | null,
  ): WorkflowSectionStatus {
    if (!currentAssessment) return "not_started"

    const dimension = currentAssessment.dimensions[key]
    const hasGaps = currentAssessment.gaps.some((gap) => gap.dimension === key)
    const hasSummary = hasAnyText([dimension.summary])
    const hasFindings = hasAnyItem(dimension.findings)

    if (hasGaps) return "action_required"
    if (hasFindings && hasSummary) {
      return currentReviewState === "accepted" ? "complete" : "in_progress"
    }
    if (hasSummary || hasFindings) return "in_progress"
    return "not_started"
  }

  function getAssessmentGapsStatus(
    currentAssessment: Assessment | null,
  ): WorkflowSectionStatus {
    if (!currentAssessment) return "not_started"
    return currentAssessment.gaps.length === 0 ? "not_started" : "complete"
  }

  function renderDimensionSection(key: AssessmentDimensionKey) {
    const dimension = assessment?.dimensions[key]
    if (!assessment || !dimension) return null

    return (
      <fieldset style={sectionStyle}>
        <legend style={legendStyle}>{dimensionLabel(key)}</legend>

        <label style={fieldStyle}>
          <span>{t("assessment.field.dimension_summary")}</span>
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
          <EmptyState>{t("assessment.finding.empty")}</EmptyState>
        ) : (
          dimension.findings.map((finding, index) => (
            <div key={index} style={findingStyle}>
              <div style={rowStyle}>
                {/* Evidence and confidence are statuses, so they use the
                    semantic tones — never a colour that means "this feature". */}
                <Badge
                  tone={finding.basis === "discovery_fact" ? "success" : "warning"}
                  label={basisLabel(finding.basis)}
                />
                <Badge
                  tone="neutral"
                  label={t("assessment.finding.confidence_badge", {
                    level: confidenceLabel(finding.confidence),
                  })}
                />
                <button
                  type="button"
                  onClick={() => removeFinding(key, index)}
                  style={removeButtonStyle}
                >
                  {t("common.action.remove")}
                </button>
              </div>

              <div style={fieldsGridStyle}>
                <label style={fieldStyle}>
                  <span>{t("assessment.finding.title")}</span>
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
                  <span>{t("assessment.finding.basis")}</span>
                  <select
                    value={finding.basis}
                    onChange={(event) =>
                      updateFinding(key, index, {
                        basis: event.target.value as AssessmentFinding["basis"],
                      })
                    }
                    style={inputStyle}
                  >
                    {basisOptions.map((option) => (
                      <option key={option} value={option}>
                        {basisLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span>{t("assessment.finding.confidence")}</span>
                  <select
                    value={finding.confidence}
                    onChange={(event) =>
                      updateFinding(key, index, {
                        confidence: event.target.value as AssessmentFinding["confidence"],
                      })
                    }
                    style={inputStyle}
                  >
                    {confidenceOptions.map((option) => (
                      <option key={option} value={option}>
                        {confidenceLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={fullWidthFieldStyle}>
                  <span>{t("assessment.finding.detail")}</span>
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
                  <span>{t("assessment.finding.supporting_facts")}</span>
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
                    {t("common.field.pipe_hint")}
                  </small>
                </label>

                <label style={fieldStyle}>
                  <span>{t("assessment.finding.assumptions")}</span>
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
                    {t("common.field.pipe_hint")}
                  </small>
                </label>
              </div>
            </div>
          ))
        )}

        <button
          type="button"
          onClick={() => addFinding(key)}
          style={addFindingButtonStyle}
        >
          {t("assessment.action.add_finding")}
        </button>
      </fieldset>
    )
  }

  function renderGapsSection() {
    return (
      <section style={gapsStyle}>
        <div>
          <p style={eyebrowStyle}>{t("assessment.gaps.eyebrow")}</p>
          <h3 style={subSectionTitleStyle}>{t("assessment.gaps.title")}</h3>
          <p style={introStyle}>{t("assessment.gaps.intro")}</p>
        </div>

        {assessment?.gaps.length === 0 ? (
          <EmptyState>{t("assessment.gaps.empty")}</EmptyState>
        ) : (
          <div style={gapListStyle}>
            {assessment?.gaps.map((gap, index) => (
              <div key={`${gap.dimension}-${index}`} style={gapItemStyle}>
                <div>
                  <strong>{dimensionLabel(gap.dimension)}</strong>
                  <p style={gapDescriptionStyle}>{gap.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeGap(index)}
                  style={removeButtonStyle}
                >
                  {t("common.action.remove")}
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={gapInputStyle}>
          <label style={fieldStyle}>
            <span>{t("assessment.gaps.dimension")}</span>
            <select
              value={gapDimension}
              onChange={(event) =>
                setGapDimension(event.target.value as AssessmentDimensionKey)
              }
              style={inputStyle}
            >
              {DIMENSION_KEYS.map((key) => (
                <option key={key} value={key}>
                  {dimensionLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span>{t("assessment.gaps.description")}</span>
            <input
              value={gapDescription}
              onChange={(event) => setGapDescription(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addGap()
                }
              }}
              placeholder={t("assessment.gaps.description_placeholder")}
              style={inputStyle}
            />
          </label>
          <button
            type="button"
            onClick={addGap}
            disabled={!gapDescription.trim()}
            style={buttonStyle("secondary", !gapDescription.trim())}
          >
            {t("assessment.action.add_gap")}
          </button>
        </div>
      </section>
    )
  }

  const sectionItems: WorkflowSectionItem[] = [
    ...DIMENSION_KEYS.map((key) => ({
      id: key,
      title: dimensionLabel(key),
      status: getAssessmentDimensionStatus(key, assessment, reviewState),
      content: renderDimensionSection(key),
    })),
    {
      id: "gaps",
      title: t("assessment.gaps.title"),
      status: getAssessmentGapsStatus(assessment),
      content: renderGapsSection(),
    },
  ]

  const [activeSectionId, setActiveSectionId] = useState(
    sectionItems.find((section) => section.status !== "complete")?.id ??
      sectionItems[0]?.id ??
      "businessProcess",
  )
  const effectiveActiveSectionId = sectionItems.some(
    (section) => section.id === activeSectionId,
  )
    ? activeSectionId
    : sectionItems.find((section) => section.status !== "complete")?.id ??
      sectionItems[0]?.id ??
      "businessProcess"

  return (
    <section style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>{t("assessment.eyebrow")}</p>
          <h2 style={headingStyle}>{t("assessment.title")}</h2>
          <p style={introStyle}>{t("assessment.intro")}</p>
        </div>
        <div style={headerActionsStyle}>
          {reviewState && (
            <Badge
              tone={reviewState === "ai_draft" ? "warning" : "success"}
              label={reviewStateLabel(reviewState)}
            />
          )}
          <button
            type="button"
            onClick={() => generateAssessment(false)}
            disabled={isGenerating}
            style={buttonStyle("secondary", isGenerating)}
          >
            {isGenerating
              ? t("assessment.action.generating")
              : assessment
                ? t("assessment.action.regenerate")
                : t("assessment.action.generate")}
          </button>
        </div>
      </div>

      {message && <InlineAlert tone="success">{message}</InlineAlert>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      {editsAtRisk && (
        <InlineAlert tone="warning">
          <span>{t("assessment.warning.replace_edits")}</span>
          <button
            type="button"
            onClick={() => generateAssessment(true)}
            disabled={isGenerating}
            style={buttonStyle("danger", isGenerating)}
          >
            {t("assessment.action.replace_edits")}
          </button>
        </InlineAlert>
      )}

      {!assessment ? (
        <EmptyState>{t("assessment.empty")}</EmptyState>
      ) : (
        <div className="workflow-shell">
          <aside className="workflow-sticky">
            <WorkflowSectionNav
              title={t("workflow.nav.assessment_title")}
              sections={sectionItems}
              activeId={effectiveActiveSectionId}
              onSelect={setActiveSectionId}
            />
          </aside>

          <div className="workflow-mobile-stack">
            <WorkflowProgressSummary sections={sectionItems} />

            <SectionStatusLegend />

            <WorkflowAccordion
              items={sectionItems}
              activeId={effectiveActiveSectionId}
              onActiveIdChange={setActiveSectionId}
            />

            <p style={hintStyle}>{t("assessment.hint.requirements")}</p>

            <div style={actionRowStyle}>
              <button
                type="button"
                onClick={() => saveAssessment("consultant_edited")}
                disabled={isSaving}
                style={buttonStyle("secondary", isSaving)}
              >
                {isSaving ? t("common.state.saving") : t("assessment.action.save")}
              </button>
              <button
                type="button"
                onClick={() => saveAssessment("accepted")}
                disabled={isSaving}
                style={buttonStyle("primary", isSaving)}
              >
                {t("assessment.action.accept")}
              </button>
            </div>
          </div>
        </div>
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

const panelStyle = stageSurfaceStyle
const headerStyle = stageHeaderStyle
const eyebrowStyle = stageEyebrowStyle
const headingStyle = stageHeadingStyle
const introStyle = stageIntroStyle

// Everything below is the shared control vocabulary, not this panel's own: the
// Assessment, the Opportunities and the Discovery all draw their fields,
// buttons, badges and empty states from `UiKit`, so the three stages of one
// engagement no longer read as three products.

const sectionStyle = fieldsetStyle
const findingStyle = nestedBlockStyle

const gapsStyle: React.CSSProperties = {
  ...fieldsetStyle,
  background: uiColors.subtle,
}

const gapItemStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: uiSpace.sm,
  padding: uiSpace.sm,
  borderRadius: 8,
  background: uiColors.surface,
  border: `1px solid ${uiColors.border}`,
}

const gapDescriptionStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1.5,
}

const gapInputStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 0.4fr) minmax(240px, 1fr) auto",
  gap: uiSpace.sm,
  alignItems: "end",
}

const gapListStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
}

const headerActionsStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  justifyItems: "end",
}

const fullWidthFieldStyle: React.CSSProperties = {
  ...fieldStyle,
  gridColumn: "1 / -1",
}

const addFindingButtonStyle: React.CSSProperties = {
  ...buttonStyle("secondary"),
  justifySelf: "start",
}
