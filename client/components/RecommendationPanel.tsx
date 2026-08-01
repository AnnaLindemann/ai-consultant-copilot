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
import {
  hasAnyItem,
  hasAnyText,
  type WorkflowSectionStatus,
} from "../lib/workflow-status"

import type { AssessmentDimensionKey } from "../../shared/assessment.schema"
import type { OpportunityVersionState } from "../../shared/opportunity.schema"
import type {
  Recommendation,
  RecommendationConfidence,
  RecommendationEffortLevel,
  RecommendationReviewState,
  RecommendationSet,
  RecommendationSetSubmission,
  RecommendationStageState,
} from "../../shared/recommendation.schema"

// The Solution Matching surface (roadmap Phase 6).
//
// It exists to make grounding *reviewable*, not merely present: every
// recommendation shows the Opportunity it addresses, the discovery facts behind
// that Opportunity, the curated entries that justify its approach, and the
// Technology Profiles behind any technology it names — and every one of those is
// editable, because the draft is the consultant's (agent-rules.md §7, §10).
//
// A recommendation the consultant adds by hand starts empty and is refused by
// the completeness check below before it can reach the server, so an incomplete
// draft is named as incomplete rather than rejected as "invalid input".

type RecommendationPanelProps = {
  engagementId: string
  // Where the stage stands, including the curated grounding this engagement's
  // recommendations may draw on. It is what the pickers offer, so the consultant
  // can only cite knowledge that exists.
  initialStageState: RecommendationStageState | null
  // The prioritized Opportunities a recommendation may address.
  opportunities: OpportunityVersionState | null
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

const CONFIDENCE_LEVELS: RecommendationConfidence[] = ["low", "medium", "high"]
const EFFORT_LEVELS: RecommendationEffortLevel[] = ["low", "medium", "high"]

// Identifiers stay English on the wire and in storage; only their rendering is
// German, looked up by key (coding-standards.md §12A).
const confidenceLabel = (confidence: RecommendationConfidence) =>
  t(`recommendation.confidence.${confidence}`)
const effortLabel = (effort: RecommendationEffortLevel) =>
  t(`recommendation.effort.${effort}`)
const dimensionLabel = (dimension: AssessmentDimensionKey) =>
  t(`assessment.dimension.${dimension}`)

// A recommendation the consultant adds. It carries no identity — the server
// mints one when it is first stored — and no grounding, because grounding is a
// deliberate choice rather than a default.
const emptyRecommendation = (): DraftRecommendation => ({
  title: "",
  approach: "",
  rationale: "",
  expectedValue: { summary: "", drivers: [] },
  effort: { level: "medium", rationale: "" },
  assumptions: [],
  confidence: "low",
  opportunity: null,
  knowledgeGrounding: [],
  technologyGrounding: [],
})

// What the panel edits: a stored recommendation, or one the consultant has just
// added and not yet grounded. The nullable opportunity is the only difference —
// everything stored always has one.
type DraftRecommendation = Omit<Recommendation, "id" | "opportunity"> & {
  id?: string
  opportunity: Recommendation["opportunity"] | null
}

type DraftRecommendationSet = Omit<RecommendationSet, "recommendations"> & {
  recommendations: DraftRecommendation[]
}

const toDraftSet = (
  recommendationSet: RecommendationSet,
): DraftRecommendationSet => ({
  ...recommendationSet,
  recommendations: recommendationSet.recommendations.map((recommendation) => ({
    ...recommendation,
  })),
})

// What the server is sent: identifiers and codes. The snapshots travelling on a
// stored recommendation — the Opportunity's title and rank, the discovery trace,
// each cited entry's kind and title — are the server's to write and are
// deliberately not sent back (agent-rules.md §12 "no fabricated grounding").
const toSubmission = (
  recommendationSet: DraftRecommendationSet,
): RecommendationSetSubmission => ({
  summary: recommendationSet.summary,
  gaps: recommendationSet.gaps,
  recommendations: recommendationSet.recommendations.map(
    ({ opportunity, knowledgeGrounding, technologyGrounding, ...content }) => ({
      ...content,
      opportunityId: opportunity!.opportunityId,
      knowledgeGrounding: knowledgeGrounding.map(({ code, rationale }) => ({
        code,
        rationale,
      })),
      technologyGrounding: technologyGrounding.map(({ code, fitRationale }) => ({
        code,
        fitRationale,
      })),
    }),
  ),
})

const isComplete = (recommendation: DraftRecommendation): boolean =>
  recommendation.title.trim().length > 0 &&
  recommendation.approach.trim().length > 0 &&
  recommendation.rationale.trim().length > 0 &&
  recommendation.expectedValue.summary.trim().length > 0 &&
  recommendation.expectedValue.drivers.length > 0 &&
  recommendation.effort.rationale.trim().length > 0 &&
  recommendation.opportunity !== null &&
  recommendation.knowledgeGrounding.length > 0 &&
  recommendation.knowledgeGrounding.every(
    (grounding) => grounding.rationale.trim().length > 0,
  ) &&
  recommendation.technologyGrounding.every(
    (grounding) => grounding.fitRationale.trim().length > 0,
  ) &&
  (recommendation.confidence !== "low" ||
    recommendation.assumptions.length > 0)

const hasContent = (recommendation: DraftRecommendation): boolean =>
  hasAnyText([
    recommendation.title,
    recommendation.approach,
    recommendation.rationale,
    recommendation.expectedValue.summary,
    recommendation.effort.rationale,
  ]) ||
  hasAnyItem(recommendation.expectedValue.drivers) ||
  hasAnyItem(recommendation.assumptions) ||
  hasAnyItem(recommendation.knowledgeGrounding) ||
  hasAnyItem(recommendation.technologyGrounding) ||
  recommendation.opportunity !== null

const sectionStatus = (
  recommendation: DraftRecommendation,
): WorkflowSectionStatus => {
  if (!hasContent(recommendation)) return "not_started"
  return isComplete(recommendation) ? "complete" : "action_required"
}

const textStatus = (value: string): WorkflowSectionStatus =>
  value.trim().length > 0 ? "complete" : "not_started"

const listStatus = (values: readonly string[]): WorkflowSectionStatus =>
  values.length > 0 ? "complete" : "not_started"

export default function RecommendationPanel({
  engagementId,
  initialStageState,
  opportunities,
}: RecommendationPanelProps) {
  const router = useRouter()
  const [stageState, setStageState] = useState(initialStageState)
  const [recommendationSet, setRecommendationSet] = useState(
    initialStageState?.activeVersion
      ? toDraftSet(initialStageState.activeVersion.recommendationSet)
      : null,
  )
  const [reviewState, setReviewState] = useState(
    initialStageState?.activeVersion?.reviewState ?? null,
  )
  const [gapDescription, setGapDescription] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editsAtRisk, setEditsAtRisk] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [activeSectionId, setActiveSectionId] = useState("summary")

  const citableOpportunities =
    opportunities?.activeVersion?.prioritization.opportunities ?? []
  const citableKnowledge = stageState?.groundingOptions.knowledge ?? []
  const citableTechnology = stageState?.groundingOptions.technology ?? []

  function update(
    change: (current: DraftRecommendationSet) => DraftRecommendationSet,
  ) {
    setRecommendationSet((current) => (current ? change(current) : current))
    setMessage("")
  }

  function updateRecommendation(
    index: number,
    patch: Partial<DraftRecommendation>,
  ) {
    update((current) => ({
      ...current,
      recommendations: current.recommendations.map((recommendation, position) =>
        position === index ? { ...recommendation, ...patch } : recommendation,
      ),
    }))
  }

  function addRecommendation() {
    update((current) => ({
      ...current,
      recommendations: [...current.recommendations, emptyRecommendation()],
    }))
  }

  function removeRecommendation(index: number) {
    update((current) => ({
      ...current,
      recommendations: current.recommendations.filter(
        (_, position) => position !== index,
      ),
    }))
  }

  // Assigning an Opportunity re-reads its title and rank from the prioritization
  // the page was given. The discovery trace is the server's to resolve, so a
  // re-assigned recommendation carries none until it is saved and read back.
  function assignOpportunity(index: number, opportunityId: string) {
    const chosen = citableOpportunities.find((one) => one.id === opportunityId)
    if (!chosen) return

    updateRecommendation(index, {
      opportunity: {
        opportunityId: chosen.id,
        opportunityTitle: chosen.title,
        priorityRank: chosen.priorityRank,
        discoveryTrace: chosen.sourceFindings.map((finding) => ({
          findingId: finding.findingId,
          dimension: finding.dimension,
          findingTitle: finding.findingTitle,
          supportingFacts: [],
        })),
      },
    })
  }

  function citeKnowledge(index: number, code: string) {
    const recommendation = recommendationSet?.recommendations[index]
    const entry = citableKnowledge.find((one) => one.code === code)
    if (!recommendation || !entry) return
    if (recommendation.knowledgeGrounding.some((one) => one.code === code)) return

    updateRecommendation(index, {
      knowledgeGrounding: [
        ...recommendation.knowledgeGrounding,
        { code: entry.code, kind: entry.kind, title: entry.title, rationale: "" },
      ],
    })
  }

  function citeTechnology(index: number, code: string) {
    const recommendation = recommendationSet?.recommendations[index]
    const profile = citableTechnology.find((one) => one.code === code)
    if (!recommendation || !profile) return
    if (recommendation.technologyGrounding.some((one) => one.code === code)) return

    updateRecommendation(index, {
      technologyGrounding: [
        ...recommendation.technologyGrounding,
        {
          code: profile.code,
          categoryCode: profile.categoryCode,
          title: profile.title,
          fitRationale: "",
        },
      ],
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

  // The refusals the server names when a citation resolves to nothing. Each is
  // rendered from its identifier and the items it named, so the consultant sees
  // exactly what was claimed (coding-standards.md §12A).
  function ungroundedDetail(data: Record<string, string[] | undefined>): string {
    return (
      [
        ["unknownOpportunityIds", "recommendation.warning.ungrounded_opportunities"],
        ["unknownKnowledgeCodes", "recommendation.warning.ungrounded_knowledge"],
        ["unknownTechnologyCodes", "recommendation.warning.ungrounded_technology"],
        [
          "ungroundedRecommendationTitles",
          "recommendation.warning.ungrounded_approach",
        ],
      ] as const
    )
      .map(([field, key]) => {
        const items = data[field]
        return items && items.length > 0
          ? t(key, { items: items.join(" · ") })
          : ""
      })
      .filter(Boolean)
      .join(" ")
  }

  async function generate(replaceConsultantEdits: boolean) {
    setIsGenerating(true)
    setError("")
    setMessage("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/engagements/${engagementId}/recommendations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ replaceConsultantEdits }),
        },
      )
      const result = await response.json()

      // The backend refuses to overwrite reviewed work; re-running anyway is the
      // consultant's explicit decision.
      if (
        response.status === 409 &&
        result.data?.failure === "consultant_edits_protected"
      ) {
        setEditsAtRisk(true)
        setError(translateServerMessage(result.message))
        return
      }

      if (!response.ok) {
        const detail = ungroundedDetail(result.data ?? {})
        throw new Error(
          `${translateServerMessage(result.message)}${detail ? ` ${detail}` : ""}`,
        )
      }

      const version = result.data.version as
        | NonNullable<RecommendationStageState["activeVersion"]>
        | undefined
      if (version) {
        setStageState((current) =>
          current ? { ...current, activeVersion: version, stale: false } : current,
        )
        setRecommendationSet(toDraftSet(version.recommendationSet))
        setReviewState(version.reviewState)
      }
      setEditsAtRisk(false)
      setMessage(translateServerMessage(result.message))
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : t("common.error.unexpected"),
      )
    } finally {
      setIsGenerating(false)
    }
  }

  async function save(
    nextReviewState: Exclude<RecommendationReviewState, "ai_draft">,
  ) {
    if (!recommendationSet || !stageState?.activeVersion) return

    // An incomplete recommendation is named as incomplete here rather than
    // rejected by the server as "invalid input", which tells the consultant
    // nothing about what to fix.
    if (!recommendationSet.recommendations.every(isComplete)) {
      setError(t("recommendation.error.incomplete"))
      return
    }

    setIsSaving(true)
    setError("")
    setMessage("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/engagements/${engagementId}/recommendations`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            versionId: stageState.activeVersion.id,
            expectedRevision: stageState.activeVersion.revision,
            recommendationSet: toSubmission(recommendationSet),
            reviewState: nextReviewState,
          }),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        const detail = ungroundedDetail(result.data ?? {})
        throw new Error(
          `${translateServerMessage(result.message)}${detail ? ` ${detail}` : ""}`,
        )
      }

      const version = result.data.version as
        | NonNullable<RecommendationStageState["activeVersion"]>
        | undefined
      if (version) {
        setStageState((current) =>
          current ? { ...current, activeVersion: version } : current,
        )
        setRecommendationSet(toDraftSet(version.recommendationSet))
      }
      setReviewState(nextReviewState)
      setEditsAtRisk(false)
      setMessage(translateServerMessage(result.message))
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : t("common.error.unexpected"),
      )
    } finally {
      setIsSaving(false)
    }
  }

  function buildSections(
    current: DraftRecommendationSet,
  ): WorkflowSectionItem[] {
    return [
      {
        id: "summary",
        title: t("recommendation.field.summary"),
        status: textStatus(current.summary),
        content: (
          <label style={fieldStyle}>
            <span>{t("recommendation.field.summary")}</span>
            <textarea
              value={current.summary}
              onChange={(event) =>
                update((state) => ({ ...state, summary: event.target.value }))
              }
              style={textareaStyle}
            />
          </label>
        ),
      },
      ...current.recommendations.map((recommendation, index) => ({
        id: `recommendation-${index}`,
        title:
          recommendation.title.trim().length > 0
            ? recommendation.title
            : t("recommendation.field.title"),
        meta: recommendation.opportunity
          ? t("recommendation.opportunity.rank", {
              rank: recommendation.opportunity.priorityRank,
            })
          : t("recommendation.opportunity.none"),
        status: sectionStatus(recommendation),
        content: (
          <div style={blockStyle}>
            <div style={rowStyle}>
              <Badge
                tone="neutral"
                label={t("recommendation.confidence_badge", {
                  level: confidenceLabel(recommendation.confidence),
                })}
              />
              <button
                type="button"
                onClick={() => removeRecommendation(index)}
                style={removeButtonStyle}
              >
                {t("common.action.remove")}
              </button>
            </div>

            <div style={fieldsGridStyle}>
              <label style={fullWidthFieldStyle}>
                <span>{t("recommendation.field.title")}</span>
                <input
                  value={recommendation.title}
                  onChange={(event) =>
                    updateRecommendation(index, { title: event.target.value })
                  }
                  style={inputStyle}
                />
              </label>

              <label style={fullWidthFieldStyle}>
                <span>{t("recommendation.field.approach")}</span>
                <textarea
                  value={recommendation.approach}
                  onChange={(event) =>
                    updateRecommendation(index, { approach: event.target.value })
                  }
                  style={textareaStyle}
                />
              </label>

              <label style={fullWidthFieldStyle}>
                <span>{t("recommendation.field.rationale")}</span>
                <textarea
                  value={recommendation.rationale}
                  onChange={(event) =>
                    updateRecommendation(index, {
                      rationale: event.target.value,
                    })
                  }
                  style={textareaStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span>{t("recommendation.field.confidence")}</span>
                <select
                  value={recommendation.confidence}
                  onChange={(event) =>
                    updateRecommendation(index, {
                      confidence: event.target.value as RecommendationConfidence,
                    })
                  }
                  style={inputStyle}
                >
                  {CONFIDENCE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {confidenceLabel(level)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStyle}>
                <span>{t("recommendation.field.effort_level")}</span>
                <select
                  value={recommendation.effort.level}
                  onChange={(event) =>
                    updateRecommendation(index, {
                      effort: {
                        ...recommendation.effort,
                        level: event.target.value as RecommendationEffortLevel,
                      },
                    })
                  }
                  style={inputStyle}
                >
                  {EFFORT_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {effortLabel(level)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStyle}>
                <span>{t("recommendation.field.assumptions")}</span>
                <input
                  value={recommendation.assumptions.join(" | ")}
                  onChange={(event) =>
                    updateRecommendation(index, {
                      assumptions: toList(event.target.value),
                    })
                  }
                  style={inputStyle}
                />
                <small style={hintStyle}>{t("recommendation.hint.pipe")}</small>
              </label>
            </div>

            <fieldset style={nestedSectionStyle}>
              <legend style={nestedLegendStyle}>
                {t("recommendation.field.expected_value")}
              </legend>

              <div style={fieldsGridStyle}>
                <label style={fullWidthFieldStyle}>
                  <span>
                    {t("recommendation.field.expected_value_summary")}
                  </span>
                  <textarea
                    value={recommendation.expectedValue.summary}
                    onChange={(event) =>
                      updateRecommendation(index, {
                        expectedValue: {
                          ...recommendation.expectedValue,
                          summary: event.target.value,
                        },
                      })
                    }
                    style={textareaStyle}
                  />
                </label>

                <label style={fullWidthFieldStyle}>
                  <span>
                    {t("recommendation.field.expected_value_drivers")}
                  </span>
                  <input
                    value={recommendation.expectedValue.drivers.join(" | ")}
                    onChange={(event) =>
                      updateRecommendation(index, {
                        expectedValue: {
                          ...recommendation.expectedValue,
                          drivers: toList(event.target.value),
                        },
                      })
                    }
                    style={inputStyle}
                  />
                  <small style={hintStyle}>
                    {t("recommendation.hint.pipe")}
                  </small>
                </label>
              </div>

              <p style={nestedIntroStyle}>
                {t("recommendation.hint.no_figures")}
              </p>
            </fieldset>

            <label style={fullWidthFieldStyle}>
              <span>{t("recommendation.field.effort_rationale")}</span>
              <textarea
                value={recommendation.effort.rationale}
                onChange={(event) =>
                  updateRecommendation(index, {
                    effort: {
                      ...recommendation.effort,
                      rationale: event.target.value,
                    },
                  })
                }
                style={textareaStyle}
              />
              <small style={hintStyle}>{t("recommendation.hint.effort")}</small>
            </label>

            {/* Backward traceability: the Opportunity, and the discovery facts
                behind it. Read-only where it is a record of what the engagement
                established. */}
            <div style={groundingBlockStyle}>
              <p style={labelStyle}>{t("recommendation.field.opportunity")}</p>

              {citableOpportunities.length === 0 ? (
                <p style={emptyGroundingStyle}>
                  {t("recommendation.opportunity.unavailable")}
                </p>
              ) : (
                <label style={fieldStyle}>
                  <span>{t("recommendation.opportunity.select")}</span>
                  <select
                    value={recommendation.opportunity?.opportunityId ?? ""}
                    onChange={(event) =>
                      assignOpportunity(index, event.target.value)
                    }
                    style={inputStyle}
                  >
                    <option value="">—</option>
                    {citableOpportunities.map((one) => (
                      <option key={one.id} value={one.id}>
                        {t("recommendation.opportunity.rank", {
                          rank: one.priorityRank,
                        })}
                        {" · "}
                        {one.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {recommendation.opportunity && (
                <div style={traceStyle}>
                  <p style={labelStyle}>{t("recommendation.trace.title")}</p>
                  {recommendation.opportunity.discoveryTrace.length === 0 ? (
                    <p style={emptyGroundingStyle}>
                      {t("recommendation.trace.empty")}
                    </p>
                  ) : (
                    <ul style={listResetStyle}>
                      {recommendation.opportunity.discoveryTrace.map(
                        (trace, position) => (
                          <li key={position} style={traceItemStyle}>
                            <p style={traceTitleStyle}>
                              <strong>{dimensionLabel(trace.dimension)}</strong>
                              {" · "}
                              {trace.findingTitle}
                            </p>
                            {trace.supportingFacts.map((fact, factPosition) => (
                              <p key={factPosition} style={traceFactStyle}>
                                {fact}
                              </p>
                            ))}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Outward traceability: the Consulting Knowledge Base entries that
                justify the approach. */}
            <div style={groundingBlockStyle}>
              <p style={labelStyle}>{t("recommendation.knowledge.title")}</p>

              {recommendation.knowledgeGrounding.length === 0 ? (
                <p style={emptyGroundingStyle}>
                  {t("recommendation.knowledge.none")}
                </p>
              ) : (
                <div style={listResetStyle}>
                  {recommendation.knowledgeGrounding.map((grounding, position) => (
                    <div key={grounding.code} style={groundingItemStyle}>
                      <div style={rowStyle}>
                        <Badge
                          tone="neutral"
                          label={t(`knowledge.kind.${grounding.kind}`)}
                        />
                        <span style={groundingTitleStyle}>{grounding.title}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateRecommendation(index, {
                              knowledgeGrounding:
                                recommendation.knowledgeGrounding.filter(
                                  (_, current) => current !== position,
                                ),
                            })
                          }
                          style={removeButtonStyle}
                        >
                          {t("common.action.remove")}
                        </button>
                      </div>
                      <label style={fieldStyle}>
                        <span>{t("recommendation.knowledge.rationale")}</span>
                        <textarea
                          value={grounding.rationale}
                          onChange={(event) =>
                            updateRecommendation(index, {
                              knowledgeGrounding:
                                recommendation.knowledgeGrounding.map(
                                  (one, current) =>
                                    current === position
                                      ? { ...one, rationale: event.target.value }
                                      : one,
                                ),
                            })
                          }
                          style={textareaStyle}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {citableKnowledge.length === 0 ? (
                <p style={emptyGroundingStyle}>
                  {t("recommendation.knowledge.unavailable")}
                </p>
              ) : (
                <label style={fieldStyle}>
                  <span>{t("recommendation.knowledge.add")}</span>
                  <select
                    value=""
                    onChange={(event) => citeKnowledge(index, event.target.value)}
                    style={inputStyle}
                  >
                    <option value="">—</option>
                    {citableKnowledge.map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {t(`knowledge.kind.${entry.kind}`)} · {entry.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {/* Outward traceability: the Technology Profiles behind any
                technology or model named. Optional by design — a recommendation
                need not name one, but it may not name one that is not curated. */}
            <div style={groundingBlockStyle}>
              <p style={labelStyle}>{t("recommendation.technology.title")}</p>
              <p style={nestedIntroStyle}>
                {t("recommendation.technology.intro")}
              </p>

              {recommendation.technologyGrounding.length === 0 ? (
                <p style={emptyGroundingStyle}>
                  {t("recommendation.technology.none")}
                </p>
              ) : (
                <div style={listResetStyle}>
                  {recommendation.technologyGrounding.map(
                    (grounding, position) => (
                      <div key={grounding.code} style={groundingItemStyle}>
                        <div style={rowStyle}>
                          <span style={groundingTitleStyle}>
                            {grounding.title}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateRecommendation(index, {
                                technologyGrounding:
                                  recommendation.technologyGrounding.filter(
                                    (_, current) => current !== position,
                                  ),
                              })
                            }
                            style={removeButtonStyle}
                          >
                            {t("common.action.remove")}
                          </button>
                        </div>
                        <label style={fieldStyle}>
                          <span>
                            {t("recommendation.technology.fit_rationale")}
                          </span>
                          <textarea
                            value={grounding.fitRationale}
                            onChange={(event) =>
                              updateRecommendation(index, {
                                technologyGrounding:
                                  recommendation.technologyGrounding.map(
                                    (one, current) =>
                                      current === position
                                        ? {
                                            ...one,
                                            fitRationale: event.target.value,
                                          }
                                        : one,
                                  ),
                              })
                            }
                            style={textareaStyle}
                          />
                        </label>
                      </div>
                    ),
                  )}
                </div>
              )}

              {citableTechnology.length === 0 ? (
                <p style={emptyGroundingStyle}>
                  {t("recommendation.technology.unavailable")}
                </p>
              ) : (
                <label style={fieldStyle}>
                  <span>{t("recommendation.technology.add")}</span>
                  <select
                    value=""
                    onChange={(event) =>
                      citeTechnology(index, event.target.value)
                    }
                    style={inputStyle}
                  >
                    <option value="">—</option>
                    {citableTechnology.map((profile) => (
                      <option key={profile.code} value={profile.code}>
                        {profile.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        ),
      })),
      {
        id: "gaps",
        title: t("recommendation.gaps.title"),
        status: listStatus(current.gaps),
        content: (
          <section style={gapsStyle}>
            <div>
              <h3 style={subSectionTitleStyle}>
                {t("recommendation.gaps.title")}
              </h3>
              <p style={introStyle}>{t("recommendation.gaps.intro")}</p>
            </div>

            {current.gaps.length === 0 ? (
              <EmptyState>{t("recommendation.gaps.empty")}</EmptyState>
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
                <span>{t("recommendation.gaps.add")}</span>
                <input
                  value={gapDescription}
                  onChange={(event) => setGapDescription(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      addGap()
                    }
                  }}
                  placeholder={t("recommendation.gaps.placeholder")}
                  style={inputStyle}
                />
              </label>
              <button
                type="button"
                onClick={addGap}
                disabled={!gapDescription.trim()}
                style={addButtonStyle}
              >
                {t("recommendation.gaps.add")}
              </button>
            </div>
          </section>
        ),
      },
    ]
  }

  const sectionItems = recommendationSet
    ? buildSections(recommendationSet)
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
          <p style={eyebrowStyle}>{t("recommendation.eyebrow")}</p>
          <h2 style={headingStyle}>{t("recommendation.title")}</h2>
          <p style={introStyle}>{t("recommendation.intro")}</p>
        </div>
        <div style={headerActionsStyle}>
          {reviewState && (
            <Badge
              tone={reviewState === "ai_draft" ? "warning" : "success"}
              label={t(`recommendation.review_state.${reviewState}`)}
            />
          )}
          <button
            type="button"
            onClick={() => generate(false)}
            disabled={isGenerating || citableOpportunities.length === 0}
            style={buttonStyle(
              "secondary",
              isGenerating || citableOpportunities.length === 0,
            )}
          >
            {isGenerating
              ? t("recommendation.action.generating")
              : recommendationSet
                ? t("recommendation.action.regenerate")
                : t("recommendation.action.generate")}
          </button>
        </div>
      </div>

      {stageState?.stale && (
        <InlineAlert tone="warning">
          {t("recommendation.warning.stale")}
        </InlineAlert>
      )}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      {editsAtRisk && (
        <InlineAlert tone="warning">
          <span>{t("recommendation.warning.replace_edits")}</span>
          <button
            type="button"
            onClick={() => generate(true)}
            disabled={isGenerating}
            style={buttonStyle("danger", isGenerating)}
          >
            {t("recommendation.action.replace_edits")}
          </button>
        </InlineAlert>
      )}

      {citableOpportunities.length === 0 && (
        <EmptyState>{t("recommendation.no_opportunities")}</EmptyState>
      )}

      {!recommendationSet ? (
        citableOpportunities.length > 0 && (
          <EmptyState>{t("recommendation.empty")}</EmptyState>
        )
      ) : (
        <div className="workflow-shell">
          <aside className="workflow-sticky">
            <WorkflowSectionNav
              title={t("workflow.nav.recommendations_title")}
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

            {recommendationSet.recommendations.length === 0 && (
              <EmptyState>{t("recommendation.none_found")}</EmptyState>
            )}

            <button
              type="button"
              onClick={addRecommendation}
              style={addButtonStyle}
            >
              {t("recommendation.action.add")}
            </button>

            <p style={hintStyle}>{t("recommendation.hint.requirements")}</p>

            <div style={actionRowStyle}>
              <button
                type="button"
                onClick={() => save("consultant_edited")}
                disabled={isSaving}
                style={buttonStyle("secondary", isSaving)}
              >
                {isSaving
                  ? t("recommendation.action.saving")
                  : t("recommendation.action.save")}
              </button>
              <button
                type="button"
                onClick={() => save("accepted")}
                disabled={isSaving}
                style={buttonStyle("primary", isSaving)}
              >
                {t("recommendation.action.accept")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// Assumptions, drivers and blockers are full sentences, so a pipe separates list
// items instead of the comma the Discovery Profile's short entries use.
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

// The same shared vocabulary the Assessment and the Opportunities use: one
// field, one button, one badge and one empty state across every stage.
const blockStyle = nestedBlockStyle
const nestedSectionStyle = fieldsetStyle
const nestedLegendStyle = legendStyle

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

// Grounding is evidence, so it sits on the neutral tinted block every grouped
// list uses rather than on a colour of its own.
const groundingBlockStyle: React.CSSProperties = {
  ...nestedBlockStyle,
  gridColumn: "1 / -1",
}

const listResetStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: uiSpace.xs,
}

const groundingItemStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  padding: uiSpace.sm,
  borderRadius: 8,
  background: uiColors.surface,
  border: `1px solid ${uiColors.border}`,
}

const groundingTitleStyle: React.CSSProperties = {
  color: uiColors.textPrimary,
  fontSize: 14,
  fontWeight: 600,
}

const emptyGroundingStyle: React.CSSProperties = {
  margin: 0,
  padding: uiSpace.sm,
  borderRadius: 8,
  background: uiColors.surface,
  border: `1px dashed ${uiColors.borderStrong}`,
  color: uiColors.textSecondary,
  fontSize: 14,
  fontWeight: 400,
}

const traceStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
}

const traceItemStyle: React.CSSProperties = {
  padding: uiSpace.sm,
  borderRadius: 8,
  background: uiColors.surface,
  border: `1px solid ${uiColors.border}`,
}

const traceTitleStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
}

const traceFactStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: uiColors.textSecondary,
  fontSize: 13,
  lineHeight: 1.5,
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
