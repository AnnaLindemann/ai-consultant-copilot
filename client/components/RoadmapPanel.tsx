"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import {
  Badge,
  EmptyState,
  InlineAlert,
  actionRowStyle,
  buttonStyle,
  fieldStyle,
  fieldsGridStyle,
  hintStyle,
  inputStyle,
  nestedBlockStyle,
  rowStyle,
  textareaStyle,
} from "./UiKit"
import {
  stageEyebrowStyle,
  stageHeaderStyle,
  stageHeadingStyle,
  stageIntroStyle,
  stageSurfaceStyle,
} from "./StagePanel"
import { formatDateTime, t, translateServerMessage } from "../i18n"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"
import {
  roadmapValidationMessages,
  type RoadmapValidationDetail,
} from "../lib/roadmap-validation"

import type {
  Recommendation,
  RecommendationEffortLevel,
} from "../../shared/recommendation.schema"
import type {
  RoadmapRecommendationDisposition,
  Roadmap,
  RoadmapPhase,
  RoadmapReviewState,
  RoadmapStageState,
  RoadmapSubmission,
  RoadmapVersionSummary,
} from "../../shared/implementation-roadmap.schema"

type RoadmapPanelProps = {
  engagementId: string
  initialStageState: RoadmapStageState | null
  recommendations: Recommendation[]
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

const EFFORT_LEVELS: RecommendationEffortLevel[] = ["low", "medium", "high"]

const effortLabel = (effort: RecommendationEffortLevel) =>
  t(`recommendation.effort.${effort}`)
const reviewStateLabel = (state: RoadmapReviewState) =>
  t(`roadmap.review_state.${state}`)

const emptyRoadmap = (recommendations: Recommendation[]): DraftRoadmap => ({
  summary: "",
  phases: [emptyPhase(1)],
  recommendationDispositions: recommendations.map((recommendation) => ({
    recommendationId: recommendation.id,
    disposition: "deferred",
    rationale: "",
  })),
  assumptions: [],
  gaps: [],
})

const emptyPhase = (sequenceOrder: number): DraftPhase => ({
  sequenceOrder,
  title: "",
  objective: "",
  scope: [],
  expectedOutcome: "",
  linkedRecommendationIds: [],
  dependencyPhaseIds: [],
  explicitPrerequisites: [],
  readinessConsiderations: [],
  risks: [],
  assumptions: [],
  effort: null,
  sequencingRationale: "",
  implementationPatternGrounding: [],
})

type DraftPhase = RoadmapPhase | Omit<RoadmapPhase, "id">
type DraftRoadmap = Omit<Roadmap, "phases"> & { phases: DraftPhase[] }

const normalizeRoadmap = (
  roadmap: Roadmap | null | undefined,
  recommendations: Recommendation[],
): DraftRoadmap | null => {
  if (!roadmap) return null
  const existing = new Map(
    roadmap.recommendationDispositions.map((disposition) => [
      disposition.recommendationId,
      disposition,
    ]),
  )

  return {
    ...roadmap,
    recommendationDispositions: recommendations.map((recommendation) => {
      const disposition = existing.get(recommendation.id)
      if (disposition) return disposition
      const linked = roadmap.phases.some((phase) =>
        phase.linkedRecommendationIds.includes(recommendation.id),
      )
      return linked
        ? { recommendationId: recommendation.id, disposition: "included" }
        : {
            recommendationId: recommendation.id,
            disposition: "deferred",
            rationale: "",
          }
    }),
  }
}

const toSubmission = (roadmap: DraftRoadmap): RoadmapSubmission => ({
  ...roadmap,
  phases: roadmap.phases.map((phase) => ({
    ...phase,
    id: "id" in phase ? phase.id : undefined,
    implementationPatternGrounding: phase.implementationPatternGrounding.map(
      ({ code, rationale }) => ({ code, rationale }),
    ),
  })),
})

const complete = (roadmap: DraftRoadmap): boolean =>
  roadmap.summary.trim().length > 0 &&
  roadmap.recommendationDispositions.every(
    (disposition) =>
      disposition.disposition === "included" ||
      disposition.rationale.trim().length > 0,
  ) &&
  roadmap.phases.length > 0 &&
  roadmap.phases.every(
    (phase) =>
      phase.title.trim().length > 0 &&
      phase.objective.trim().length > 0 &&
      phase.scope.length > 0 &&
      phase.expectedOutcome.trim().length > 0 &&
      phase.linkedRecommendationIds.length > 0 &&
      phase.sequencingRationale.trim().length > 0 &&
      phase.implementationPatternGrounding.every(
        (grounding) => grounding.rationale.trim().length > 0,
      ),
  )

export default function RoadmapPanel({
  engagementId,
  initialStageState,
  recommendations,
}: RoadmapPanelProps) {
  const router = useRouter()
  const [stageState, setStageState] = useState(initialStageState)
  const [roadmap, setRoadmap] = useState<DraftRoadmap | null>(
    normalizeRoadmap(initialStageState?.activeVersion?.roadmap, recommendations),
  )
  const [reviewState, setReviewState] = useState<RoadmapReviewState | null>(
    initialStageState?.activeVersion?.reviewState ?? null,
  )
  const [replaceEdits, setReplaceEdits] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [versions, setVersions] = useState<RoadmapVersionSummary[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string[]>([])

  const activeVersion = stageState?.activeVersion ?? null
  const readOnly = activeVersion?.status === "superseded"
  const implementationPatternOptions =
    stageState?.implementationPatternOptions ?? []

  async function generate() {
    setIsGenerating(true)
    setError(null)
    setErrorDetails([])
    setMessage(null)

    const response = await fetch(`${API_BASE_URL}/engagements/${engagementId}/roadmap`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replaceConsultantEdits: replaceEdits }),
    })
    const result = await response.json()

    setIsGenerating(false)
    if (!response.ok || !result.status) {
      setError(translateServerMessage(result.message))
      setErrorDetails(
        roadmapValidationMessages(result.data as RoadmapValidationDetail),
      )
      return
    }

    setRoadmap(normalizeRoadmap(result.data.version.roadmap, recommendations))
    setReviewState(result.data.version.reviewState)
    setStageState((current) => ({
      ...(current ?? initialEmptyState()),
      activeVersion: result.data.version,
      stale: false,
    }))
    setVersions(null)
    setMessage(translateServerMessage(result.message))
    router.refresh()
  }

  async function save(nextReviewState: Exclude<RoadmapReviewState, "ai_draft">) {
    if (!roadmap || !activeVersion) return
    if (!complete(roadmap)) {
      setError(t("roadmap.validation"))
      setErrorDetails([])
      return
    }

    setIsSaving(true)
    setError(null)
    setErrorDetails([])
    setMessage(null)

    const response = await fetch(`${API_BASE_URL}/engagements/${engagementId}/roadmap`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        versionId: activeVersion.id,
        expectedRevision: activeVersion.revision,
        roadmap: toSubmission(roadmap),
        reviewState: nextReviewState,
      }),
    })
    const result = await response.json()

    setIsSaving(false)
    if (!response.ok || !result.status) {
      setError(translateServerMessage(result.message))
      setErrorDetails(
        roadmapValidationMessages(result.data as RoadmapValidationDetail),
      )
      return
    }

    setRoadmap(normalizeRoadmap(result.data.version.roadmap, recommendations))
    setReviewState(result.data.version.reviewState)
    setStageState((current) => ({
      ...(current ?? initialEmptyState()),
      activeVersion: result.data.version,
    }))
    setVersions(null)
    setMessage(translateServerMessage(result.message))
    router.refresh()
  }

  async function loadVersions() {
    setIsLoadingVersions(true)
    setError(null)
    setErrorDetails([])
    setMessage(null)

    const response = await fetch(
      `${API_BASE_URL}/engagements/${engagementId}/roadmap/versions`,
      {
        method: "GET",
        credentials: "include",
      },
    )
    const result = await response.json()

    setIsLoadingVersions(false)
    if (!response.ok || !result.status) {
      setError(translateServerMessage(result.message))
      setErrorDetails([])
      return
    }

    setVersions(result.data.versions)
    setMessage(translateServerMessage(result.message))
  }

  async function openVersion(versionId: string) {
    setIsLoadingVersions(true)
    setError(null)
    setErrorDetails([])
    setMessage(null)

    const response = await fetch(
      `${API_BASE_URL}/engagements/${engagementId}/roadmap/versions/${versionId}`,
      {
        method: "GET",
        credentials: "include",
      },
    )
    const result = await response.json()

    setIsLoadingVersions(false)
    if (!response.ok || !result.status) {
      setError(translateServerMessage(result.message))
      setErrorDetails([])
      return
    }

    setRoadmap(normalizeRoadmap(result.data.version.roadmap, recommendations))
    setReviewState(result.data.version.reviewState)
    setStageState((current) => ({
      ...(current ?? initialEmptyState()),
      activeVersion: result.data.version,
    }))
    setMessage(translateServerMessage(result.message))
  }

  const updatePhase = (index: number, change: Partial<DraftPhase>) => {
    setRoadmap((current) =>
      current
        ? {
            ...current,
            phases: current.phases.map((phase, phaseIndex) =>
              phaseIndex === index ? { ...phase, ...change } : phase,
            ),
          }
        : current,
    )
  }

  const movePhase = (index: number, direction: -1 | 1) => {
    setRoadmap((current) => {
      if (!current) return current
      const target = index + direction
      if (target < 0 || target >= current.phases.length) return current
      const phases = [...current.phases]
      const [phase] = phases.splice(index, 1)
      phases.splice(target, 0, phase)
      return {
        ...current,
        phases: phases.map((item, itemIndex) => ({
          ...item,
          sequenceOrder: itemIndex + 1,
        })),
      }
    })
  }

  const updateRecommendationDisposition = (
    recommendationId: string,
    nextDisposition: RoadmapRecommendationDisposition["disposition"],
    rationale = "",
  ) => {
    setRoadmap((current) => {
      if (!current) return current
      const recommendationDispositions =
        current.recommendationDispositions.map((disposition) =>
          disposition.recommendationId === recommendationId
            ? nextDisposition === "included"
              ? { recommendationId, disposition: "included" as const }
              : {
                  recommendationId,
                  disposition: "deferred" as const,
                  rationale,
                }
            : disposition,
        )

      return {
        ...current,
        recommendationDispositions,
        phases:
          nextDisposition === "deferred"
            ? current.phases.map((phase) => ({
                ...phase,
                linkedRecommendationIds: phase.linkedRecommendationIds.filter(
                  (id) => id !== recommendationId,
                ),
              }))
            : current.phases,
      }
    })
  }

  const updateDeferredRationale = (
    recommendationId: string,
    rationale: string,
  ) => {
    setRoadmap((current) =>
      current
        ? {
            ...current,
            recommendationDispositions:
              current.recommendationDispositions.map((disposition) =>
                disposition.recommendationId === recommendationId &&
                disposition.disposition === "deferred"
                  ? { ...disposition, rationale }
                  : disposition,
              ),
          }
        : current,
    )
  }

  const dispositionFor = (recommendationId: string) =>
    roadmap?.recommendationDispositions.find(
      (disposition) => disposition.recommendationId === recommendationId,
    )

  const toggleImplementationPattern = (
    phaseIndex: number,
    code: string,
    checked: boolean,
  ) => {
    const phase = roadmap?.phases[phaseIndex]
    const option = implementationPatternOptions.find((item) => item.code === code)
    if (!phase || !option) return

    updatePhase(phaseIndex, {
      implementationPatternGrounding: checked
        ? [
            ...phase.implementationPatternGrounding,
            { ...option, rationale: "" },
          ]
        : phase.implementationPatternGrounding.filter(
            (grounding) => grounding.code !== code,
          ),
    })
  }

  const updateImplementationPatternRationale = (
    phaseIndex: number,
    code: string,
    rationale: string,
  ) => {
    const phase = roadmap?.phases[phaseIndex]
    if (!phase) return

    updatePhase(phaseIndex, {
      implementationPatternGrounding: phase.implementationPatternGrounding.map(
        (grounding) =>
          grounding.code === code ? { ...grounding, rationale } : grounding,
      ),
    })
  }

  return (
    <section style={stageSurfaceStyle}>
      <div style={stageHeaderStyle}>
        <div>
          <p style={stageEyebrowStyle}>{t("roadmap.title")}</p>
          <h2 style={stageHeadingStyle}>{t("roadmap.title")}</h2>
          <p style={stageIntroStyle}>{t("roadmap.intro")}</p>
        </div>
        {reviewState && <Badge tone="neutral" label={reviewStateLabel(reviewState)} />}
      </div>

      {!stageState?.acceptedRecommendationsAvailable && (
        <EmptyState title={t("roadmap.no_recommendations.title")}>
          <p style={emptyDescriptionStyle}>
            {t("roadmap.no_recommendations.description")}
          </p>
        </EmptyState>
      )}

      {stageState?.stale && (
        <InlineAlert tone="warning">{t("roadmap.stale")}</InlineAlert>
      )}
      {readOnly && <InlineAlert tone="neutral">{t("roadmap.readonly")}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}
      {error && (
        <InlineAlert tone="danger">
          <p style={alertTextStyle}>{error}</p>
          {errorDetails.length > 0 && (
            <ul style={alertListStyle}>
              {errorDetails.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </InlineAlert>
      )}

      {versions && (
        <div style={versionListStyle}>
          {versions.length === 0 && (
            <p style={emptyDescriptionStyle}>{t("roadmap.versions.empty")}</p>
          )}
          {versions.map((version) => (
            <button
              key={version.id}
              type="button"
              style={buttonStyle(
                activeVersion?.id === version.id ? "primary" : "secondary",
              )}
              disabled={isLoadingVersions}
              onClick={() => openVersion(version.id)}
            >
              {t("roadmap.version.label", {
                version: version.versionNumber,
                status: t(`roadmap.version_status.${version.status}`),
                date: formatDateTime(version.createdAt),
              })}
            </button>
          ))}
        </div>
      )}

      {roadmap === null && stageState?.acceptedRecommendationsAvailable && (
        <EmptyState title={t("roadmap.empty.title")}>
          <p style={emptyDescriptionStyle}>{t("roadmap.empty.description")}</p>
        </EmptyState>
      )}

      {roadmap && (
        <div style={stackStyle}>
          <label style={fieldStyle}>
            <span>{t("roadmap.field.summary")}</span>
            <textarea
              style={textareaStyle}
              value={roadmap.summary}
              disabled={readOnly}
              onChange={(event) =>
                setRoadmap({ ...roadmap, summary: event.target.value })
              }
            />
          </label>

          <fieldset style={fieldsetResetStyle}>
            <legend style={legendStyle}>
              {t("roadmap.field.recommendation_dispositions")}
            </legend>
            {recommendations.map((recommendation) => {
              const disposition = dispositionFor(recommendation.id)
              const deferred = disposition?.disposition === "deferred"

              return (
                <div key={recommendation.id} style={dispositionRowStyle}>
                  <div style={dispositionHeaderStyle}>
                    <span>{recommendation.title}</span>
                    <select
                      style={inputStyle}
                      disabled={readOnly}
                      value={disposition?.disposition ?? "deferred"}
                      onChange={(event) =>
                        updateRecommendationDisposition(
                          recommendation.id,
                          event.target.value as RoadmapRecommendationDisposition["disposition"],
                          disposition?.disposition === "deferred"
                            ? disposition.rationale
                            : "",
                        )
                      }
                    >
                      <option value="included">
                        {t("roadmap.disposition.included")}
                      </option>
                      <option value="deferred">
                        {t("roadmap.disposition.deferred")}
                      </option>
                    </select>
                  </div>
                  {deferred && (
                    <label style={fieldStyle}>
                      <span>{t("roadmap.field.deferred_rationale")}</span>
                      <input
                        style={inputStyle}
                        disabled={readOnly}
                        value={disposition.rationale}
                        onChange={(event) =>
                          updateDeferredRationale(
                            recommendation.id,
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  )}
                </div>
              )
            })}
          </fieldset>

          {roadmap.phases.map((phase, index) => (
            <div key={"id" in phase ? phase.id : index} style={phaseStyle}>
              <div style={phaseHeaderStyle}>
                <Badge tone="info" label={String(phase.sequenceOrder)} />
                <div style={moveControlsStyle}>
                  <button
                    type="button"
                    style={buttonStyle("secondary")}
                    disabled={readOnly || index === 0}
                    onClick={() => movePhase(index, -1)}
                  >
                    {t("roadmap.move_up")}
                  </button>
                  <button
                    type="button"
                    style={buttonStyle("secondary")}
                    disabled={readOnly || index === roadmap.phases.length - 1}
                    onClick={() => movePhase(index, 1)}
                  >
                    {t("roadmap.move_down")}
                  </button>
                </div>
              </div>

              <div style={fieldsGridStyle}>
                <TextField
                  label={t("roadmap.field.title")}
                  value={phase.title}
                  disabled={readOnly}
                  onChange={(value) => updatePhase(index, { title: value })}
                />
                <TextField
                  label={t("roadmap.field.objective")}
                  value={phase.objective}
                  disabled={readOnly}
                  onChange={(value) => updatePhase(index, { objective: value })}
                />
              </div>

              <TextArea
                label={t("roadmap.field.expected_outcome")}
                value={phase.expectedOutcome}
                disabled={readOnly}
                onChange={(value) =>
                  updatePhase(index, { expectedOutcome: value })
                }
              />
              <TextArea
                label={t("roadmap.field.sequencing")}
                value={phase.sequencingRationale}
                disabled={readOnly}
                onChange={(value) =>
                  updatePhase(index, { sequencingRationale: value })
                }
              />

              <ListField
                label={t("roadmap.field.scope")}
                values={phase.scope}
                disabled={readOnly}
                onChange={(values) => updatePhase(index, { scope: values })}
              />
              <ListField
                label={t("roadmap.field.prerequisites")}
                values={phase.explicitPrerequisites}
                disabled={readOnly}
                onChange={(values) =>
                  updatePhase(index, { explicitPrerequisites: values })
                }
              />
              <ListField
                label={t("roadmap.field.readiness")}
                values={phase.readinessConsiderations}
                disabled={readOnly}
                onChange={(values) =>
                  updatePhase(index, { readinessConsiderations: values })
                }
              />
              <ListField
                label={t("roadmap.field.risks")}
                values={phase.risks}
                disabled={readOnly}
                onChange={(values) => updatePhase(index, { risks: values })}
              />
              <ListField
                label={t("roadmap.field.assumptions")}
                values={phase.assumptions}
                disabled={readOnly}
                onChange={(values) =>
                  updatePhase(index, { assumptions: values })
                }
              />

              <fieldset style={fieldsetResetStyle}>
                <legend style={legendStyle}>{t("roadmap.field.recommendations")}</legend>
                {recommendations.map((recommendation) => (
                  <label key={recommendation.id} style={checkboxStyle}>
                    <input
                      type="checkbox"
                      checked={phase.linkedRecommendationIds.includes(
                        recommendation.id,
                      )}
                      disabled={
                        readOnly ||
                        dispositionFor(recommendation.id)?.disposition ===
                          "deferred"
                      }
                      onChange={(event) => {
                        const ids = event.target.checked
                          ? [...phase.linkedRecommendationIds, recommendation.id]
                          : phase.linkedRecommendationIds.filter(
                              (id) => id !== recommendation.id,
                            )
                        if (event.target.checked) {
                          updateRecommendationDisposition(
                            recommendation.id,
                            "included",
                          )
                        }
                        updatePhase(index, { linkedRecommendationIds: ids })
                      }}
                    />
                    {recommendation.title}
                  </label>
                ))}
              </fieldset>

              <fieldset style={fieldsetResetStyle}>
                <legend style={legendStyle}>{t("roadmap.field.dependencies")}</legend>
                {roadmap.phases.slice(0, index).map((dependency) =>
                  "id" in dependency ? (
                    <label key={dependency.id} style={checkboxStyle}>
                      <input
                        type="checkbox"
                        checked={phase.dependencyPhaseIds.includes(dependency.id)}
                        disabled={readOnly}
                        onChange={(event) => {
                          const ids = event.target.checked
                            ? [...phase.dependencyPhaseIds, dependency.id]
                            : phase.dependencyPhaseIds.filter(
                                (id) => id !== dependency.id,
                              )
                          updatePhase(index, { dependencyPhaseIds: ids })
                        }}
                      />
                      {dependency.title}
                    </label>
                  ) : null,
                )}
              </fieldset>

              <fieldset style={fieldsetResetStyle}>
                <legend style={legendStyle}>{t("roadmap.field.patterns")}</legend>
                {implementationPatternOptions.length === 0 && (
                  <p style={emptyDescriptionStyle}>
                    {t("roadmap.patterns.none")}
                  </p>
                )}
                {implementationPatternOptions.map((option) => (
                  <label key={option.code} style={checkboxStyle}>
                    <input
                      type="checkbox"
                      checked={phase.implementationPatternGrounding.some(
                        (grounding) => grounding.code === option.code,
                      )}
                      disabled={readOnly}
                      onChange={(event) =>
                        toggleImplementationPattern(
                          index,
                          option.code,
                          event.target.checked,
                        )
                      }
                    />
                    <span>{option.title}</span>
                  </label>
                ))}
                {phase.implementationPatternGrounding.map((grounding) => {
                  const option = implementationPatternOptions.find(
                    (item) => item.code === grounding.code,
                  )

                  return (
                    <label key={grounding.code} style={fieldStyle}>
                      <span>
                        {t("roadmap.field.pattern_rationale", {
                          pattern: option?.title ?? grounding.code,
                        })}
                      </span>
                      <input
                        style={inputStyle}
                        disabled={readOnly}
                        value={grounding.rationale}
                        onChange={(event) =>
                          updateImplementationPatternRationale(
                            index,
                            grounding.code,
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  )
                })}
              </fieldset>

              <div style={rowStyle}>
                <select
                  style={inputStyle}
                  disabled={readOnly}
                  value={phase.effort?.level ?? ""}
                  onChange={(event) =>
                    updatePhase(index, {
                      effort: event.target.value
                        ? {
                            level: event.target.value as RecommendationEffortLevel,
                            rationale: phase.effort?.rationale ?? "",
                          }
                        : null,
                    })
                  }
                >
                  <option value="">{t("common.field.not_captured")}</option>
                  {EFFORT_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {effortLabel(level)}
                    </option>
                  ))}
                </select>
                <input
                  style={inputStyle}
                  disabled={readOnly || phase.effort === null}
                  value={phase.effort?.rationale ?? ""}
                  onChange={(event) =>
                    updatePhase(index, {
                      effort: phase.effort
                        ? { ...phase.effort, rationale: event.target.value }
                        : null,
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={actionRowStyle}>
        <label style={checkboxStyle}>
          <input
            type="checkbox"
            checked={replaceEdits}
            onChange={(event) => setReplaceEdits(event.target.checked)}
          />
          {t("roadmap.confirm_replace")}
        </label>
        <button
          type="button"
          style={buttonStyle("secondary")}
          disabled={readOnly || isSaving}
          onClick={() =>
            setRoadmap((current) =>
              current
                ? {
                    ...current,
                    phases: [
                      ...current.phases,
                      emptyPhase(current.phases.length + 1),
                    ],
                  }
                : emptyRoadmap(recommendations),
            )
          }
        >
          {t("roadmap.add_phase")}
        </button>
        <button
          type="button"
          style={buttonStyle("secondary")}
          disabled={isLoadingVersions}
          onClick={loadVersions}
        >
          {t("roadmap.versions.show")}
        </button>
        <button
          type="button"
          style={buttonStyle("primary")}
          disabled={
            isGenerating || !stageState?.acceptedRecommendationsAvailable
          }
          onClick={generate}
        >
          {roadmap ? t("roadmap.regenerate") : t("roadmap.generate")}
        </button>
        <button
          type="button"
          style={buttonStyle("secondary")}
          disabled={!roadmap || !activeVersion || readOnly || isSaving}
          onClick={() => save("consultant_edited")}
        >
          {t("roadmap.save")}
        </button>
        <button
          type="button"
          style={buttonStyle("primary")}
          disabled={!roadmap || !activeVersion || readOnly || isSaving}
          onClick={() => save("accepted")}
        >
          {t("roadmap.accept")}
        </button>
      </div>
    </section>
  )
}

function TextField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input
        style={inputStyle}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function TextArea(props: {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label style={fieldStyle}>
      <span>{props.label}</span>
      <textarea
        style={textareaStyle}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  )
}

function ListField({
  label,
  values,
  disabled,
  onChange,
}: {
  label: string
  values: string[]
  disabled: boolean
  onChange: (values: string[]) => void
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input
        style={inputStyle}
        value={values.join(", ")}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          )
        }
      />
      <span style={hintStyle}>{t("common.field.comma_hint")}</span>
    </label>
  )
}

const initialEmptyState = (): RoadmapStageState => ({
  activeVersion: null,
  stale: false,
  acceptedRecommendationVersionId: null,
  acceptedRecommendationVersionNumber: null,
  acceptedRecommendationFingerprint: null,
  acceptedRecommendationsAvailable: false,
  implementationPatternOptions: [],
})

const stackStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
}

const phaseStyle: React.CSSProperties = {
  ...nestedBlockStyle,
  borderRadius: uiRadius.card,
  background: uiColors.surface,
}

const phaseHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: uiSpace.sm,
  alignItems: "center",
}

const moveControlsStyle: React.CSSProperties = {
  display: "flex",
  gap: uiSpace.xs,
  flexWrap: "wrap",
}

const versionListStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: uiSpace.xs,
}

const dispositionRowStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  paddingBlock: uiSpace.xs,
}

const dispositionHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(160px, 220px)",
  gap: uiSpace.sm,
  alignItems: "center",
  color: uiColors.textPrimary,
  fontSize: 13,
}

const alertTextStyle: React.CSSProperties = {
  margin: 0,
}

const alertListStyle: React.CSSProperties = {
  margin: `${uiSpace.xs} 0 0`,
  paddingLeft: uiSpace.md,
}

const checkboxStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: uiSpace.xs,
  color: uiColors.textPrimary,
  fontSize: 13,
}

const fieldsetResetStyle: React.CSSProperties = {
  border: `1px solid ${uiColors.border}`,
  borderRadius: uiRadius.control,
  padding: uiSpace.sm,
}

const legendStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 12,
  fontWeight: 700,
}

const emptyDescriptionStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: 13,
  lineHeight: 1.5,
}
