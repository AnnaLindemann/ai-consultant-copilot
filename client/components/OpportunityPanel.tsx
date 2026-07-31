"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { t, translateServerMessage } from "../i18n"

import type {
  Assessment,
  AssessmentDimensionKey,
} from "../../shared/assessment.schema"
import type {
  AssessmentFindingCitation,
  Opportunity,
  OpportunityLevel,
  OpportunityPrioritization,
  OpportunityPrioritizationSubmission,
  OpportunityReviewState,
  OpportunityVersionState,
  SuccessCriterion,
  SuccessCriterionValue,
} from "../../shared/opportunity.schema"

type AssessmentFindingReference = Pick<
  AssessmentFindingCitation,
  "findingId" | "dimension" | "findingTitle"
>

type OpportunityPanelProps = {
  engagementId: string
  // The Assessment the Opportunities are derived from. It is what the citation
  // picker offers, so the consultant can only cite findings that exist.
  assessment: Assessment | null
  initialVersionState: OpportunityVersionState | null
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

const LEVELS: OpportunityLevel[] = ["low", "medium", "high"]
const QUALIFICATIONS = ["ready", "conditional", "not_ready"] as const

// Identifiers stay English on the wire and in storage; only their rendering is
// German, looked up by key (coding-standards.md §12A).
const levelLabel = (level: OpportunityLevel) => t(`opportunity.level.${level}`)
const dimensionLabel = (dimension: AssessmentDimensionKey) =>
  t(`assessment.dimension.${dimension}`)

const emptyOpportunity = (rank: number): Opportunity => ({
  title: "",
  problem: "",
  improvement: "",
  sourceFindings: [],
  successCriteria: [emptySuccessCriterion()],
  value: "medium",
  effort: "medium",
  impact: "medium",
  confidence: "low",
  aiReadiness: { qualification: "conditional", rationale: "", blockers: [] },
  assumptions: [],
  priorityRank: rank,
  priorityRationale: "",
})

const emptySuccessCriterion = (): SuccessCriterion => ({
  metric: "Zu definieren",
  measurementMethod: "Zu definieren",
  dataSource: "Zu definieren",
  assumptions: [],
  baseline: { status: "unknown", validationNote: "Zu definieren" },
  target: { status: "unknown", validationNote: "Zu definieren" },
  timeframe: { status: "unknown", validationNote: "Zu definieren" },
})

const toSubmission = (
  prioritization: OpportunityPrioritization,
): OpportunityPrioritizationSubmission => ({
  ...prioritization,
  opportunities: prioritization.opportunities.map(
    ({ sourceFindings, ...opportunity }) => ({
      ...opportunity,
      sourceFindingIds: sourceFindings.map((finding) => finding.findingId),
    }),
  ),
})

const DRAFT_SUCCESS_CRITERION_PLACEHOLDER = "Zu definieren"

const hasPlaceholderSuccessCriteria = (
  prioritization: OpportunityPrioritization,
): boolean =>
  prioritization.opportunities.some((opportunity) =>
    opportunity.successCriteria.some((criterion) =>
      [
        criterion.metric,
        criterion.measurementMethod,
        criterion.dataSource,
        criterion.baseline.status === "unknown"
          ? criterion.baseline.validationNote
          : criterion.baseline.value,
        criterion.target.status === "unknown"
          ? criterion.target.validationNote
          : criterion.target.value,
        criterion.timeframe.status === "unknown"
          ? criterion.timeframe.validationNote
          : criterion.timeframe.value,
        ...criterion.assumptions,
      ].some((value) => value === DRAFT_SUCCESS_CRITERION_PLACEHOLDER),
    ),
  )

export default function OpportunityPanel({
  engagementId,
  assessment,
  initialVersionState,
}: OpportunityPanelProps) {
  const router = useRouter()
  const [versionState, setVersionState] = useState(initialVersionState)
  const [prioritization, setPrioritization] = useState(
    initialVersionState?.activeVersion?.prioritization ?? null,
  )
  const [reviewState, setReviewState] = useState(
    initialVersionState?.activeVersion?.reviewState ?? null,
  )
  const [gapDescription, setGapDescription] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editsAtRisk, setEditsAtRisk] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  // Every finding the current Assessment holds, as the citations a consultant
  // may pick from.
  const citableFindings: AssessmentFindingReference[] = assessment
    ? (
        Object.entries(assessment.dimensions) as [
          AssessmentDimensionKey,
          Assessment["dimensions"][AssessmentDimensionKey],
        ][]
      ).flatMap(([dimension, content]) =>
        content.findings.map((finding) => ({
          findingId: finding.id,
          dimension,
          findingTitle: finding.title,
        })),
      )
    : []

  function update(
    change: (current: OpportunityPrioritization) => OpportunityPrioritization,
  ) {
    setPrioritization((current) => (current ? change(current) : current))
    setMessage("")
  }

  function updateOpportunity(index: number, patch: Partial<Opportunity>) {
    update((current) => ({
      ...current,
      opportunities: current.opportunities.map((opportunity, position) =>
        position === index ? { ...opportunity, ...patch } : opportunity,
      ),
    }))
  }

  function updateSuccessCriterion(
    opportunityIndex: number,
    criterionIndex: number,
    patch: Partial<SuccessCriterion>,
  ) {
    update((current) => ({
      ...current,
      opportunities: current.opportunities.map((opportunity, position) =>
        position === opportunityIndex
          ? {
              ...opportunity,
              successCriteria: opportunity.successCriteria.map(
                (criterion, currentIndex) =>
                  currentIndex === criterionIndex
                    ? { ...criterion, ...patch }
                    : criterion,
              ),
            }
          : opportunity,
      ),
    }))
  }

  function addSuccessCriterion(opportunityIndex: number) {
    update((current) => ({
      ...current,
      opportunities: current.opportunities.map((opportunity, position) =>
        position === opportunityIndex
          ? {
              ...opportunity,
              successCriteria: [
                ...opportunity.successCriteria,
                emptySuccessCriterion(),
              ],
            }
          : opportunity,
      ),
    }))
  }

  function removeSuccessCriterion(
    opportunityIndex: number,
    criterionIndex: number,
  ) {
    update((current) => ({
      ...current,
      opportunities: current.opportunities.map((opportunity, position) =>
        position === opportunityIndex
          ? {
              ...opportunity,
              successCriteria: opportunity.successCriteria.filter(
                (_, currentIndex) => currentIndex !== criterionIndex,
              ),
            }
          : opportunity,
      ),
    }))
  }

  function addOpportunity() {
    update((current) => ({
      ...current,
      opportunities: [
        ...current.opportunities,
        emptyOpportunity(current.opportunities.length + 1),
      ],
    }))
  }

  function removeOpportunity(index: number) {
    update((current) => ({
      ...current,
      opportunities: renumber(
        current.opportunities.filter((_, position) => position !== index),
      ),
    }))
  }

  // Re-ordering by hand is the consultant adjusting the prioritization. Ranks
  // are renumbered with the move, so the saved set always carries a real
  // ordering rather than one the consultant has to keep consistent themselves.
  function moveOpportunity(index: number, direction: -1 | 1) {
    const target = index + direction

    update((current) => {
      if (target < 0 || target >= current.opportunities.length) return current

      const reordered = [...current.opportunities]
      const [moved] = reordered.splice(index, 1)
      reordered.splice(target, 0, moved)

      return { ...current, opportunities: renumber(reordered) }
    })
  }

  function citeFinding(index: number, reference: AssessmentFindingReference) {
    const opportunity = prioritization?.opportunities[index]
    if (!opportunity) return

    const alreadyCited = opportunity.sourceFindings.some(
      (cited) => cited.findingId === reference.findingId,
    )
    if (alreadyCited) return

    updateOpportunity(index, {
      sourceFindings: [...opportunity.sourceFindings, reference],
    })
  }

  function removeCitation(index: number, citationIndex: number) {
    const opportunity = prioritization?.opportunities[index]
    if (!opportunity) return

    updateOpportunity(index, {
      sourceFindings: opportunity.sourceFindings.filter(
        (_, position) => position !== citationIndex,
      ),
    })
  }

  function addGap() {
    const description = gapDescription.trim()
    if (!description) return

    update((current) => ({ ...current, gaps: [...current.gaps, description] }))
    setGapDescription("")
  }

  function removeGap(index: number) {
    update((current) => ({
      ...current,
      gaps: current.gaps.filter((_, position) => position !== index),
    }))
  }

  async function prioritize(replaceConsultantEdits: boolean) {
    setIsGenerating(true)
    setError("")
    setMessage("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/engagements/${engagementId}/opportunities`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ replaceConsultantEdits }),
        },
      )
      const result = await response.json()

      // The backend refuses to overwrite reviewed work; re-running anyway is
      // the consultant's explicit decision.
      if (
        response.status === 409 &&
        result.data?.failure === "consultant_edits_protected"
      ) {
        setEditsAtRisk(true)
        setError(translateServerMessage(result.message))
        return
      }

      if (!response.ok) {
        // The server names its refusal with an identifier; the wording is ours,
        // in the user's language. Fabricated citations are named too, so the
        // consultant can see what the model claimed.
        const unknownFindingIds: string[] = result.data?.unknownFindingIds ?? []

        throw new Error(
          unknownFindingIds.length > 0
            ? `${translateServerMessage(result.message)} ${t(
                "opportunity.warning.ungrounded",
                {
                  findings: unknownFindingIds.join(" · "),
                },
              )}`
            : translateServerMessage(result.message),
        )
      }

      const version =
        result.data.version as
          | NonNullable<OpportunityVersionState["activeVersion"]>
          | undefined
      if (version) {
        setVersionState((current) =>
          current
            ? { ...current, activeVersion: version, stale: false }
            : {
                activeVersion: version,
                stale: false,
                currentAssessmentRevision: 0,
                currentAssessmentFingerprint: null,
              },
        )
        setPrioritization(version.prioritization)
        setReviewState(version.reviewState)
      }
      setEditsAtRisk(false)
      setMessage(translateServerMessage(result.message))
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("common.error.unexpected"),
      )
    } finally {
      setIsGenerating(false)
    }
  }

  async function save(
    nextReviewState: Exclude<OpportunityReviewState, "ai_draft">,
  ) {
    if (!prioritization || !versionState?.activeVersion) return

    if (hasPlaceholderSuccessCriteria(prioritization)) {
      setError(t("opportunity.error.success_criteria_placeholder"))
      return
    }

    setIsSaving(true)
    setError("")
    setMessage("")

    const submission = toSubmission(prioritization)

    try {
      const response = await fetch(
        `${API_BASE_URL}/engagements/${engagementId}/opportunities`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            versionId: versionState.activeVersion.id,
            expectedRevision: versionState.activeVersion.revision,
            prioritization: submission,
            reviewState: nextReviewState,
          }),
        },
      )
      const result = await response.json()

      if (!response.ok) throw new Error(translateServerMessage(result.message))

      const version =
        result.data.version as
          | NonNullable<OpportunityVersionState["activeVersion"]>
          | undefined
      if (version) {
        setVersionState((current) =>
          current ? { ...current, activeVersion: version } : current,
        )
        setPrioritization(version.prioritization)
      }
      setReviewState(nextReviewState)
      setEditsAtRisk(false)
      setMessage(translateServerMessage(result.message))
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("common.error.unexpected"),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>{t("opportunity.eyebrow")}</p>
          <h2 style={headingStyle}>{t("opportunity.title")}</h2>
          <p style={introStyle}>{t("opportunity.intro")}</p>
        </div>
        <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
          {reviewState && (
            <span
              style={
                reviewState === "ai_draft" ? draftBadgeStyle : reviewedBadgeStyle
              }
            >
              {t(`opportunity.review_state.${reviewState}`)}
            </span>
          )}
          <button
            type="button"
            onClick={() => prioritize(false)}
            disabled={isGenerating || citableFindings.length === 0}
            style={{
              ...generateButtonStyle,
              opacity: isGenerating || citableFindings.length === 0 ? 0.6 : 1,
            }}
          >
            {isGenerating
              ? t("opportunity.action.generating")
              : prioritization
                ? t("opportunity.action.regenerate")
                : t("opportunity.action.generate")}
          </button>
        </div>
      </div>

      {versionState?.stale && (
        <p style={staleStyle}>{t("opportunity.warning.stale")}</p>
      )}
      {message && <p style={successStyle}>{message}</p>}
      {error && <p style={errorStyle}>{error}</p>}

      {editsAtRisk && (
        <div style={confirmStyle}>
          <p style={{ margin: 0 }}>{t("opportunity.warning.replace_edits")}</p>
          <button
            type="button"
            onClick={() => prioritize(true)}
            disabled={isGenerating}
            style={{ ...dangerButtonStyle, opacity: isGenerating ? 0.6 : 1 }}
          >
            {t("opportunity.action.replace_edits")}
          </button>
        </div>
      )}

      {citableFindings.length === 0 && (
        <p style={emptyStyle}>{t("opportunity.no_assessment")}</p>
      )}

      {!prioritization ? (
        citableFindings.length > 0 && (
          <p style={emptyStyle}>{t("opportunity.empty")}</p>
        )
      ) : (
        <>
          <label style={fieldStyle}>
            <span>{t("opportunity.field.summary")}</span>
            <textarea
              value={prioritization.summary}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
              style={textareaStyle}
            />
          </label>

          {prioritization.opportunities.length === 0 ? (
            <p style={emptyStyle}>{t("opportunity.none_found")}</p>
          ) : (
            prioritization.opportunities.map((opportunity, index) => (
              <fieldset key={index} style={sectionStyle}>
                <legend style={legendStyle}>
                  {t("opportunity.rank", { rank: opportunity.priorityRank })}
                </legend>

                <div style={findingHeaderStyle}>
                  <span
                    style={
                      opportunity.aiReadiness.qualification === "ready"
                        ? readyBadgeStyle
                        : conditionalBadgeStyle
                    }
                  >
                    {t(
                      `opportunity.ai_readiness.${opportunity.aiReadiness.qualification}`,
                    )}
                  </span>
                  <span style={confidenceBadgeStyle}>
                    {t("opportunity.field.confidence")}:{" "}
                    {levelLabel(opportunity.confidence)}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveOpportunity(index, -1)}
                    disabled={index === 0}
                    style={moveButtonStyle}
                  >
                    {t("opportunity.action.move_up")}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveOpportunity(index, 1)}
                    disabled={index === prioritization.opportunities.length - 1}
                    style={moveButtonStyle}
                  >
                    {t("opportunity.action.move_down")}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOpportunity(index)}
                    style={removeButtonStyle}
                  >
                    {t("common.action.remove")}
                  </button>
                </div>

                <div style={fieldsGridStyle}>
                  <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                    <span>{t("opportunity.field.title")}</span>
                    <input
                      value={opportunity.title}
                      onChange={(event) =>
                        updateOpportunity(index, { title: event.target.value })
                      }
                      style={inputStyle}
                    />
                  </label>

                  <label style={fieldStyle}>
                    <span>{t("opportunity.field.problem")}</span>
                    <textarea
                      value={opportunity.problem}
                      onChange={(event) =>
                        updateOpportunity(index, { problem: event.target.value })
                      }
                      style={textareaStyle}
                    />
                  </label>

                  <label style={fieldStyle}>
                    <span>{t("opportunity.field.improvement")}</span>
                    <textarea
                      value={opportunity.improvement}
                      onChange={(event) =>
                        updateOpportunity(index, {
                          improvement: event.target.value,
                        })
                      }
                      style={textareaStyle}
                    />
                  </label>

                  <LevelField
                    label={t("opportunity.field.value")}
                    value={opportunity.value}
                    onChange={(value) => updateOpportunity(index, { value })}
                  />
                  <LevelField
                    label={t("opportunity.field.effort")}
                    value={opportunity.effort}
                    onChange={(effort) => updateOpportunity(index, { effort })}
                  />
                  <LevelField
                    label={t("opportunity.field.impact")}
                    value={opportunity.impact}
                    onChange={(impact) => updateOpportunity(index, { impact })}
                  />
                  <LevelField
                    label={t("opportunity.field.confidence")}
                    value={opportunity.confidence}
                    onChange={(confidence) =>
                      updateOpportunity(index, { confidence })
                    }
                  />

                  <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                    <span>{t("opportunity.field.priority_rationale")}</span>
                    <textarea
                      value={opportunity.priorityRationale}
                      onChange={(event) =>
                        updateOpportunity(index, {
                          priorityRationale: event.target.value,
                        })
                      }
                      style={textareaStyle}
                    />
                  </label>

                  <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                    <span>{t("opportunity.field.assumptions")}</span>
                    <input
                      value={opportunity.assumptions.join(" | ")}
                      onChange={(event) =>
                        updateOpportunity(index, {
                          assumptions: toList(event.target.value),
                        })
                      }
                      style={inputStyle}
                    />
                    <small style={hintStyle}>{t("opportunity.hint.pipe")}</small>
                  </label>
                </div>

                <fieldset style={nestedSectionStyle}>
                  <legend style={nestedLegendStyle}>
                    {t("opportunity.field.ai_readiness")}
                  </legend>

                  <div style={fieldsGridStyle}>
                    <label style={fieldStyle}>
                      <span>
                        {t("opportunity.field.ai_readiness_qualification")}
                      </span>
                      <select
                        value={opportunity.aiReadiness.qualification}
                        onChange={(event) =>
                          updateOpportunity(index, {
                            aiReadiness: {
                              ...opportunity.aiReadiness,
                              qualification: event.target
                                .value as Opportunity["aiReadiness"]["qualification"],
                            },
                          })
                        }
                        style={inputStyle}
                      >
                        {QUALIFICATIONS.map((option) => (
                          <option key={option} value={option}>
                            {t(`opportunity.ai_readiness.${option}`)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={fieldStyle}>
                      <span>{t("opportunity.field.ai_readiness_rationale")}</span>
                      <input
                        value={opportunity.aiReadiness.rationale}
                        onChange={(event) =>
                          updateOpportunity(index, {
                            aiReadiness: {
                              ...opportunity.aiReadiness,
                              rationale: event.target.value,
                            },
                          })
                        }
                        style={inputStyle}
                      />
                    </label>

                    <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                      <span>{t("opportunity.field.ai_readiness_blockers")}</span>
                      <input
                        value={opportunity.aiReadiness.blockers.join(" | ")}
                        onChange={(event) =>
                          updateOpportunity(index, {
                            aiReadiness: {
                              ...opportunity.aiReadiness,
                              blockers: toList(event.target.value),
                            },
                          })
                        }
                        style={inputStyle}
                      />
                      <small style={hintStyle}>
                        {t("opportunity.hint.pipe")}
                      </small>
                    </label>
                  </div>
                </fieldset>

                <div style={citationsStyle}>
                  <p style={labelStyle}>
                    {t("opportunity.field.source_findings")}
                  </p>

                  {opportunity.sourceFindings.length === 0 ? (
                    <p style={emptyCitationStyle}>
                      {t("opportunity.source.none")}
                    </p>
                  ) : (
                    <ul style={citationListStyle}>
                      {opportunity.sourceFindings.map((reference, position) => (
                        <li key={position} style={citationStyle}>
                          <span>
                            <strong>{dimensionLabel(reference.dimension)}</strong>
                            {" · "}
                            {reference.findingTitle}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeCitation(index, position)}
                            style={removeButtonStyle}
                          >
                            {t("common.action.remove")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {citableFindings.length === 0 ? (
                    <p style={emptyCitationStyle}>
                      {t("opportunity.source.unavailable")}
                    </p>
                  ) : (
                    <label style={fieldStyle}>
                      <span>{t("opportunity.source.add")}</span>
                      <select
                        value=""
                        onChange={(event) => {
                          const chosen = citableFindings[Number(event.target.value)]
                          if (chosen) citeFinding(index, chosen)
                        }}
                        style={inputStyle}
                      >
                        <option value="">—</option>
                        {citableFindings.map((reference, position) => (
                          <option key={position} value={position}>
                            {dimensionLabel(reference.dimension)} ·{" "}
                            {reference.findingTitle}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <fieldset style={nestedSectionStyle}>
                  <legend style={nestedLegendStyle}>
                    {t("opportunity.success_criteria.title")}
                  </legend>

                  <p style={nestedIntroStyle}>
                    {t("opportunity.success_criteria.intro")}
                  </p>

                  <div style={{ display: "grid", gap: 14 }}>
                    {opportunity.successCriteria.map((criterion, criterionIndex) => (
                      <fieldset key={criterionIndex} style={criterionStyle}>
                        <legend style={nestedLegendStyle}>
                          {t("opportunity.success_criteria.item", {
                            rank: criterionIndex + 1,
                          })}
                        </legend>

                        <div style={fieldsGridStyle}>
                          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                            <span>
                              {t("opportunity.success_criteria.metric")}
                            </span>
                            <input
                              value={criterion.metric}
                              onChange={(event) =>
                                updateSuccessCriterion(index, criterionIndex, {
                                  metric: event.target.value,
                                })
                              }
                              style={inputStyle}
                            />
                          </label>

                          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                            <span>
                              {t(
                                "opportunity.success_criteria.measurement_method",
                              )}
                            </span>
                            <textarea
                              value={criterion.measurementMethod}
                              onChange={(event) =>
                                updateSuccessCriterion(index, criterionIndex, {
                                  measurementMethod: event.target.value,
                                })
                              }
                              style={textareaStyle}
                            />
                          </label>

                          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                            <span>
                              {t("opportunity.success_criteria.data_source")}
                            </span>
                            <input
                              value={criterion.dataSource}
                              onChange={(event) =>
                                updateSuccessCriterion(index, criterionIndex, {
                                  dataSource: event.target.value,
                                })
                              }
                              style={inputStyle}
                            />
                          </label>

                          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                            <span>
                              {t("opportunity.success_criteria.assumptions")}
                            </span>
                            <input
                              value={criterion.assumptions.join(" | ")}
                              onChange={(event) =>
                                updateSuccessCriterion(index, criterionIndex, {
                                  assumptions: toList(event.target.value),
                                })
                              }
                              style={inputStyle}
                            />
                            <small style={hintStyle}>
                              {t("opportunity.hint.pipe")}
                            </small>
                          </label>

                          <SuccessCriterionValueField
                            label={t("opportunity.success_criteria.baseline")}
                            value={criterion.baseline}
                            onChange={(baseline) =>
                              updateSuccessCriterion(index, criterionIndex, {
                                baseline,
                              })
                            }
                          />
                          <SuccessCriterionValueField
                            label={t("opportunity.success_criteria.target")}
                            value={criterion.target}
                            onChange={(target) =>
                              updateSuccessCriterion(index, criterionIndex, {
                                target,
                              })
                            }
                          />
                          <SuccessCriterionValueField
                            label={t("opportunity.success_criteria.timeframe")}
                            value={criterion.timeframe}
                            onChange={(timeframe) =>
                              updateSuccessCriterion(index, criterionIndex, {
                                timeframe,
                              })
                            }
                          />
                        </div>

                        <div style={{ display: "flex", justifyContent: "end" }}>
                          <button
                            type="button"
                            onClick={() =>
                              removeSuccessCriterion(index, criterionIndex)
                            }
                            style={removeButtonStyle}
                          >
                            {t("common.action.remove")}
                          </button>
                        </div>
                      </fieldset>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => addSuccessCriterion(index)}
                    style={addButtonStyle}
                  >
                    {t("opportunity.success_criteria.add")}
                  </button>
                </fieldset>
              </fieldset>
            ))
          )}

          <button
            type="button"
            onClick={addOpportunity}
            style={addButtonStyle}
          >
            {t("opportunity.action.add")}
          </button>

          <section style={gapsStyle}>
            <div>
              <p style={eyebrowStyle}>{t("opportunity.gaps.title")}</p>
              <p style={introStyle}>{t("opportunity.gaps.intro")}</p>
            </div>

            {prioritization.gaps.length === 0 ? (
              <p style={emptyGapStyle}>{t("opportunity.gaps.empty")}</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {prioritization.gaps.map((gap, index) => (
                  <div key={index} style={gapItemStyle}>
                    <p style={{ margin: 0, color: "#374151" }}>{gap}</p>
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
                <span>{t("opportunity.gaps.add")}</span>
                <input
                  value={gapDescription}
                  onChange={(event) => setGapDescription(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      addGap()
                    }
                  }}
                  placeholder={t("opportunity.gaps.placeholder")}
                  style={inputStyle}
                />
              </label>
              <button
                type="button"
                onClick={addGap}
                disabled={!gapDescription.trim()}
                style={addButtonStyle}
              >
                {t("opportunity.gaps.add")}
              </button>
            </div>
          </section>

          <p style={hintStyle}>{t("opportunity.hint.requirements")}</p>

          <div style={footerStyle}>
            <button
              type="button"
              onClick={() => save("consultant_edited")}
              disabled={isSaving}
              style={{ ...saveButtonStyle, opacity: isSaving ? 0.6 : 1 }}
            >
              {isSaving
                ? t("opportunity.action.saving")
                : t("opportunity.action.save")}
            </button>
            <button
              type="button"
              onClick={() => save("accepted")}
              disabled={isSaving}
              style={{ ...acceptButtonStyle, opacity: isSaving ? 0.6 : 1 }}
            >
              {t("opportunity.action.accept")}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function LevelField({
  label,
  value,
  onChange,
}: {
  label: string
  value: OpportunityLevel
  onChange: (value: OpportunityLevel) => void
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as OpportunityLevel)}
        style={inputStyle}
      >
        {LEVELS.map((level) => (
          <option key={level} value={level}>
            {levelLabel(level)}
          </option>
        ))}
      </select>
    </label>
  )
}

function SuccessCriterionValueField({
  label,
  value,
  onChange,
}: {
  label: string
  value: SuccessCriterionValue
  onChange: (value: SuccessCriterionValue) => void
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <select
        value={value.status}
        onChange={(event) =>
          onChange(
            event.target.value === "known"
              ? {
                  status: "known",
                  value: "Zu definieren",
                  source: "Zu definieren",
                }
              : { status: "unknown", validationNote: "Zu definieren" },
          )
        }
        style={inputStyle}
      >
        <option value="unknown">
          {t("opportunity.success_criteria.value_unknown")}
        </option>
        <option value="known">
          {t("opportunity.success_criteria.value_known")}
        </option>
      </select>

      {value.status === "known" ? (
        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={value.value}
            onChange={(event) =>
              onChange({
                ...value,
                value: event.target.value,
              })
            }
            placeholder={t("opportunity.success_criteria.value_placeholder")}
            style={inputStyle}
          />
          <input
            value={value.source}
            onChange={(event) =>
              onChange({
                ...value,
                source: event.target.value,
              })
            }
            placeholder={t("opportunity.success_criteria.source_placeholder")}
            style={inputStyle}
          />
        </div>
      ) : (
        <textarea
          value={value.validationNote}
          onChange={(event) =>
            onChange({
              ...value,
              validationNote: event.target.value,
            })
          }
          placeholder={t(
            "opportunity.success_criteria.validation_note_placeholder",
          )}
          style={textareaStyle}
        />
      )}
    </label>
  )
}

// The rank is the prioritization, so it follows the order on screen rather than
// being maintained separately.
function renumber(opportunities: Opportunity[]): Opportunity[] {
  return opportunities.map((opportunity, index) => ({
    ...opportunity,
    priorityRank: index + 1,
  }))
}

// Assumptions and blockers are full sentences, so a pipe separates list items
// instead of the comma the Discovery Profile's short entries use.
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
const nestedSectionStyle: React.CSSProperties = {
  ...sectionStyle,
  background: "#f9fafb",
}
const legendStyle: React.CSSProperties = {
  padding: "0 8px",
  fontWeight: 800,
  fontSize: 18,
}
const nestedLegendStyle: React.CSSProperties = {
  ...legendStyle,
  fontSize: 15,
}
const nestedIntroStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  lineHeight: 1.5,
}
const criterionStyle: React.CSSProperties = {
  border: "1px solid #dbe3f0",
  borderRadius: 14,
  padding: 16,
  display: "grid",
  gap: 14,
  background: "#fff",
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
const labelStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 700,
  fontSize: 14,
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
const readyBadgeStyle: React.CSSProperties = {
  ...badgeBaseStyle,
  background: "#ecfdf5",
  color: "#065f46",
}
const conditionalBadgeStyle: React.CSSProperties = {
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
const staleStyle: React.CSSProperties = {
  margin: 0,
  padding: "12px 14px",
  borderRadius: 12,
  background: "#fffbeb",
  border: "1px solid #f59e0b",
  color: "#92400e",
  fontWeight: 700,
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
const moveButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  borderRadius: 10,
  padding: "6px 10px",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  color: "#111827",
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
const citationsStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 16,
  borderRadius: 14,
  border: "1px solid #dbeafe",
  background: "#f5f7ff",
}
const citationListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 8,
}
const citationStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
  gap: 16,
  padding: 12,
  borderRadius: 12,
  background: "#fff",
  border: "1px solid #dbeafe",
}
const emptyCitationStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 12,
  background: "#fff",
  border: "1px dashed #a5b4fc",
  color: "#6b7280",
  fontWeight: 400,
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
  gridTemplateColumns: "minmax(260px, 1fr) auto",
  gap: 12,
  alignItems: "end",
}
