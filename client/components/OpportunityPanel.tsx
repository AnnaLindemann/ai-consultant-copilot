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
  compactButtonStyle,
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
import {
  hasAnyItem,
  hasAnyText,
  type WorkflowSectionStatus,
} from "../lib/workflow-status"

import type {
  Assessment,
  AssessmentDimensionKey,
} from "../../shared/assessment.schema"
import type {
  AssessmentFindingCitation,
  OpportunityLevel,
  OpportunityPrioritizationSubmission,
  OpportunityReviewState,
  OpportunityVersionState,
  ResolvedOpportunity,
  ResolvedOpportunityPrioritization,
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

// An opportunity the consultant adds. It carries no identity: the server mints
// one when it is first stored, so nothing the browser sent decides what a
// Recommendation will later cite.
const emptyOpportunity = (rank: number): ResolvedOpportunity => ({
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

// The marker a not-yet-filled success criterion carries. This is **data, not a
// label**: the server refuses to save a prioritization that still contains it
// (`services/opportunities.service.ts`, `opportunity.error.success_criteria_placeholder`),
// so both sides must agree on the exact string. It is therefore deliberately
// *not* looked up in the catalogue — translating it would silently disarm that
// guard the moment a second language exists. Making it language-neutral is a
// contract change, tracked separately.
const emptySuccessCriterion = (): SuccessCriterion => ({
  metric: DRAFT_SUCCESS_CRITERION_PLACEHOLDER,
  measurementMethod: DRAFT_SUCCESS_CRITERION_PLACEHOLDER,
  dataSource: DRAFT_SUCCESS_CRITERION_PLACEHOLDER,
  assumptions: [],
  baseline: {
    status: "unknown",
    validationNote: DRAFT_SUCCESS_CRITERION_PLACEHOLDER,
  },
  target: {
    status: "unknown",
    validationNote: DRAFT_SUCCESS_CRITERION_PLACEHOLDER,
  },
  timeframe: {
    status: "unknown",
    validationNote: DRAFT_SUCCESS_CRITERION_PLACEHOLDER,
  },
})

const toSubmission = (
  prioritization: ResolvedOpportunityPrioritization,
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
  prioritization: ResolvedOpportunityPrioritization,
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

const hasMeaningfulText = (value: string | null | undefined): boolean =>
  hasAnyText([value]) && value !== DRAFT_SUCCESS_CRITERION_PLACEHOLDER

const successCriterionValueHasIssue = (
  value: SuccessCriterionValue,
): boolean => {
  if (value.status === "known") {
    return (
      !hasMeaningfulText(value.value) || !hasMeaningfulText(value.source)
    )
  }

  return !hasMeaningfulText(value.validationNote)
}

const successCriterionHasContent = (criterion: SuccessCriterion): boolean =>
  hasAnyText([
    criterion.metric,
    criterion.measurementMethod,
    criterion.dataSource,
    ...(criterion.assumptions as string[]),
  ]) ||
  successCriterionValueHasIssue(criterion.baseline) ||
  successCriterionValueHasIssue(criterion.target) ||
  successCriterionValueHasIssue(criterion.timeframe)

const successCriterionIsComplete = (criterion: SuccessCriterion): boolean =>
  hasMeaningfulText(criterion.metric) &&
  hasMeaningfulText(criterion.measurementMethod) &&
  hasMeaningfulText(criterion.dataSource) &&
  criterion.assumptions.every((assumption) => hasMeaningfulText(assumption)) &&
  !successCriterionValueHasIssue(criterion.baseline) &&
  !successCriterionValueHasIssue(criterion.target) &&
  !successCriterionValueHasIssue(criterion.timeframe)

const opportunityHasContent = (opportunity: ResolvedOpportunity): boolean =>
  hasAnyText([
    opportunity.title,
    opportunity.problem,
    opportunity.improvement,
    opportunity.priorityRationale,
    opportunity.aiReadiness.rationale,
  ]) ||
  hasAnyItem(opportunity.assumptions) ||
  hasAnyItem(opportunity.aiReadiness.blockers) ||
  hasAnyItem(opportunity.sourceFindings) ||
  hasAnyItem(opportunity.successCriteria) ||
  opportunity.successCriteria.some(successCriterionHasContent)

const opportunityHasActionRequiredIssue = (
  opportunity: ResolvedOpportunity,
): boolean =>
  !hasMeaningfulText(opportunity.title) ||
  !hasMeaningfulText(opportunity.problem) ||
  !hasMeaningfulText(opportunity.improvement) ||
  !hasMeaningfulText(opportunity.priorityRationale) ||
  !hasMeaningfulText(opportunity.aiReadiness.rationale) ||
  (opportunity.aiReadiness.qualification !== "ready" &&
    opportunity.aiReadiness.blockers.length === 0) ||
  (opportunity.confidence === "low" && opportunity.assumptions.length === 0) ||
  opportunity.sourceFindings.length === 0 ||
  opportunity.successCriteria.length === 0 ||
  opportunity.successCriteria.some(
    (criterion) => !successCriterionIsComplete(criterion),
  )

const getOpportunitySectionStatus = (
  opportunity: ResolvedOpportunity,
): WorkflowSectionStatus => {
  if (!opportunityHasContent(opportunity)) {
    return "not_started"
  }

  if (!opportunityHasActionRequiredIssue(opportunity)) {
    return "complete"
  }

  return "action_required"
}

const getOpportunitySummaryStatus = (
  summary: string,
): WorkflowSectionStatus =>
  hasMeaningfulText(summary) ? "complete" : "not_started"

const getOpportunityGapsStatus = (
  gaps: readonly string[],
): WorkflowSectionStatus => (gaps.length > 0 ? "complete" : "not_started")

export default function OpportunityPanel({
  engagementId,
  assessment,
  initialVersionState,
}: OpportunityPanelProps) {
  const router = useRouter()
  const [versionState, setVersionState] = useState(initialVersionState)
  // The editing state may hold an opportunity the consultant has just added,
  // which has no identity until the server mints one.
  const [prioritization, setPrioritization] =
    useState<ResolvedOpportunityPrioritization | null>(
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
  const [activeSectionId, setActiveSectionId] = useState("summary")

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
    change: (
      current: ResolvedOpportunityPrioritization,
    ) => ResolvedOpportunityPrioritization,
  ) {
    setPrioritization((current) => (current ? change(current) : current))
    setMessage("")
  }

  function updateOpportunity(
    index: number,
    patch: Partial<ResolvedOpportunity>,
  ) {
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
    } catch {
      setError(
        t("common.error.unexpected"),
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
    } catch {
      setError(
        t("common.error.unexpected"),
      )
    } finally {
      setIsSaving(false)
    }
  }

  function buildOpportunitySections(
    current: ResolvedOpportunityPrioritization,
  ): WorkflowSectionItem[] {
    return [
      {
        id: "summary",
        title: t("opportunity.field.summary"),
        status: getOpportunitySummaryStatus(current.summary),
        content: (
          <label style={fieldStyle}>
            <span>{t("opportunity.field.summary")}</span>
            <textarea
              value={current.summary}
              onChange={(event) =>
                update((state) => ({
                  ...state,
                  summary: event.target.value,
                }))
              }
              style={textareaStyle}
            />
          </label>
        ),
      },
      ...current.opportunities.map((opportunity, index) => ({
        id: `opportunity-${opportunity.priorityRank}`,
        title: t("opportunity.rank", { rank: opportunity.priorityRank }),
        meta:
          opportunity.title.trim().length > 0
            ? opportunity.title
            : t("opportunity.field.title"),
        status: getOpportunitySectionStatus(opportunity),
        content: (
          <div style={sectionStyle}>
            <div style={rowStyle}>
              {/* Readiness and confidence are statuses; they use the shared
                  semantic tones and never a colour of their own. */}
              <Badge
                tone={
                  opportunity.aiReadiness.qualification === "ready"
                    ? "success"
                    : "warning"
                }
                label={t(
                  `opportunity.ai_readiness.${opportunity.aiReadiness.qualification}`,
                )}
              />
              <Badge
                tone="neutral"
                label={t("opportunity.confidence_badge", {
                  level: levelLabel(opportunity.confidence),
                })}
              />
              <button
                type="button"
                onClick={() => moveOpportunity(index, -1)}
                disabled={index === 0}
                style={compactButtonStyle("secondary", index === 0)}
              >
                {t("opportunity.action.move_up")}
              </button>
              <button
                type="button"
                onClick={() => moveOpportunity(index, 1)}
                disabled={index === current.opportunities.length - 1}
                style={compactButtonStyle(
                  "secondary",
                  index === current.opportunities.length - 1,
                )}
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
              <label style={fullWidthFieldStyle}>
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

              <label style={fullWidthFieldStyle}>
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

              <label style={fullWidthFieldStyle}>
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
                  <span>{t("opportunity.field.ai_readiness_qualification")}</span>
                  <select
                    value={opportunity.aiReadiness.qualification}
                    onChange={(event) =>
                      updateOpportunity(index, {
                        aiReadiness: {
                          ...opportunity.aiReadiness,
                          qualification: event.target
                            .value as ResolvedOpportunity["aiReadiness"]["qualification"],
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

                <label style={fullWidthFieldStyle}>
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
                  <small style={hintStyle}>{t("opportunity.hint.pipe")}</small>
                </label>
              </div>
            </fieldset>

            <div style={citationsStyle}>
              <p style={labelStyle}>{t("opportunity.field.source_findings")}</p>

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
                {opportunity.successCriteria.map(
                  (criterion, criterionIndex) => (
                    <fieldset key={criterionIndex} style={criterionStyle}>
                      <legend style={nestedLegendStyle}>
                        {t("opportunity.success_criteria.item", {
                          rank: criterionIndex + 1,
                        })}
                      </legend>

                      <div style={fieldsGridStyle}>
                        <label style={fullWidthFieldStyle}>
                          <span>{t("opportunity.success_criteria.metric")}</span>
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

                        <label style={fullWidthFieldStyle}>
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

                        <label style={fullWidthFieldStyle}>
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

                        <label style={fullWidthFieldStyle}>
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
                  ),
                )}
              </div>

              <button
                type="button"
                onClick={() => addSuccessCriterion(index)}
                style={addButtonStyle}
              >
                {t("opportunity.success_criteria.add")}
              </button>
            </fieldset>
          </div>
        ),
      })),
      {
        id: "gaps",
        title: t("opportunity.gaps.title"),
        status: getOpportunityGapsStatus(current.gaps),
        content: (
          <section style={gapsStyle}>
            <div>
              <h3 style={subSectionTitleStyle}>{t("opportunity.gaps.title")}</h3>
              <p style={introStyle}>{t("opportunity.gaps.intro")}</p>
            </div>

            {current.gaps.length === 0 ? (
              <EmptyState>{t("opportunity.gaps.empty")}</EmptyState>
            ) : (
              <div style={gapListStyle}>
                {current.gaps.map((gap, index) => (
                  <div key={index} style={gapItemStyle}>
                    <p style={gapTextStyle}>{gap}</p>
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
        ),
      },
    ]
  }

  const sectionItems = prioritization
    ? buildOpportunitySections(prioritization)
    : []
  const defaultActiveSectionId =
    sectionItems.find((section) => section.status !== "complete")?.id ??
    sectionItems[0]?.id ??
    ""
  const effectiveActiveSectionId = sectionItems.some(
    (section) => section.id === activeSectionId,
  )
    ? activeSectionId
    : defaultActiveSectionId

  return (
    <section style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>{t("opportunity.eyebrow")}</p>
          <h2 style={headingStyle}>{t("opportunity.title")}</h2>
          <p style={introStyle}>{t("opportunity.intro")}</p>
        </div>
        <div style={headerActionsStyle}>
          {reviewState && (
            <Badge
              tone={reviewState === "ai_draft" ? "warning" : "success"}
              label={t(`opportunity.review_state.${reviewState}`)}
            />
          )}
          <button
            type="button"
            onClick={() => prioritize(false)}
            disabled={isGenerating || citableFindings.length === 0}
            style={buttonStyle(
              "secondary",
              isGenerating || citableFindings.length === 0,
            )}
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
        <InlineAlert tone="warning">
          {t("opportunity.warning.stale")}
        </InlineAlert>
      )}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      {editsAtRisk && (
        <InlineAlert tone="warning">
          <span>{t("opportunity.warning.replace_edits")}</span>
          <button
            type="button"
            onClick={() => prioritize(true)}
            disabled={isGenerating}
            style={buttonStyle("danger", isGenerating)}
          >
            {t("opportunity.action.replace_edits")}
          </button>
        </InlineAlert>
      )}

      {citableFindings.length === 0 && (
        <EmptyState>{t("opportunity.no_assessment")}</EmptyState>
      )}

      {!prioritization ? (
        citableFindings.length > 0 && (
          <EmptyState>{t("opportunity.empty")}</EmptyState>
        )
      ) : (
        <div className="workflow-shell">
          <aside className="workflow-sticky">
            <WorkflowSectionNav
              title={t("workflow.nav.opportunities_title")}
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

            {prioritization.opportunities.length === 0 && (
              <EmptyState>{t("opportunity.none_found")}</EmptyState>
            )}

            <button
              type="button"
              onClick={addOpportunity}
              style={addButtonStyle}
            >
              {t("opportunity.action.add")}
            </button>

            <p style={hintStyle}>{t("opportunity.hint.requirements")}</p>

            <div style={actionRowStyle}>
              <button
                type="button"
                onClick={() => save("consultant_edited")}
                disabled={isSaving}
                style={buttonStyle("secondary", isSaving)}
              >
                {isSaving
                  ? t("opportunity.action.saving")
                  : t("opportunity.action.save")}
              </button>
              <button
                type="button"
                onClick={() => save("accepted")}
                disabled={isSaving}
                style={buttonStyle("primary", isSaving)}
              >
                {t("opportunity.action.accept")}
              </button>
            </div>
          </div>
        </div>
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
                  value: DRAFT_SUCCESS_CRITERION_PLACEHOLDER,
                  source: DRAFT_SUCCESS_CRITERION_PLACEHOLDER,
                }
              : {
                  status: "unknown",
                  validationNote: DRAFT_SUCCESS_CRITERION_PLACEHOLDER,
                },
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
        <div style={gapListStyle}>
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
function renumber(
  opportunities: ResolvedOpportunity[],
): ResolvedOpportunity[] {
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

const panelStyle = stageSurfaceStyle
const headerStyle = stageHeaderStyle
const eyebrowStyle = stageEyebrowStyle
const headingStyle = stageHeadingStyle
const introStyle = stageIntroStyle

// The same shared vocabulary the Assessment uses: one field, one button, one
// badge and one empty state across every stage of the engagement.

const sectionStyle = nestedBlockStyle
const nestedSectionStyle = fieldsetStyle
const nestedLegendStyle = legendStyle
const criterionStyle = fieldsetStyle

const nestedIntroStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1.5,
}

const labelStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  fontWeight: 600,
}

const fullWidthFieldStyle: React.CSSProperties = {
  ...fieldStyle,
  gridColumn: "1 / -1",
}

const headerActionsStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  justifyItems: "end",
}

const addButtonStyle: React.CSSProperties = {
  ...buttonStyle("secondary"),
  justifySelf: "start",
}

// Cited assessment findings: evidence, so they sit on the neutral tinted block
// every grouped list uses rather than on a colour of their own.
const citationsStyle: React.CSSProperties = {
  ...nestedBlockStyle,
  gridColumn: "1 / -1",
}

const citationListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: uiSpace.xs,
}

const citationStyle: React.CSSProperties = {
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

const emptyCitationStyle: React.CSSProperties = {
  margin: 0,
  padding: uiSpace.sm,
  borderRadius: 8,
  background: uiColors.surface,
  border: `1px dashed ${uiColors.borderStrong}`,
  color: uiColors.textSecondary,
  fontSize: 14,
  fontWeight: 400,
}

const gapsStyle: React.CSSProperties = {
  ...fieldsetStyle,
  background: uiColors.subtle,
}

const gapTextStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1.5,
}

const gapListStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
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

const gapInputStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(240px, 1fr) auto",
  gap: uiSpace.sm,
  alignItems: "end",
}
