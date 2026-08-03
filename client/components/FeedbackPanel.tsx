"use client"

import { useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"

import {
  Badge,
  InlineAlert,
  actionRowStyle,
  buttonStyle,
  fieldStyle,
  fieldsGridStyle,
  hintStyle,
  inputStyle,
  metaTextStyle,
  nestedBlockStyle,
  readOnlyValueStyle,
  rowStyle,
  sectionTitleStyle,
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
  canCloseWithoutAction,
  canCompleteReentry,
  canOpenReentry,
  canSubmitClassification,
  classificationDraftFor,
  classificationPayload,
  closePayload,
  completeReentryPayload,
  openReentryPayload,
  outcomeForStatus,
  resultOptionFor,
  toggleStage,
  type ClassificationDraft,
} from "../lib/feedback-review"

import type {
  ClientFeedbackSummary,
  FeedbackClassification,
  FeedbackImpactStage,
  FeedbackReentrySummary,
  FeedbackStageState,
  ReentryOutcomeStatus,
  ReentryStageOutcomeInput,
  ReentryStageResultOption,
} from "../../shared/feedback.schema"

type FeedbackPanelProps = {
  engagementId: string
  initialStageState: FeedbackStageState | null
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

const FEEDBACK_CLASSIFICATIONS: FeedbackClassification[] = [
  "new_fact",
  "fact_correction",
  "changed_condition",
  "disagreement",
  "clarification",
  "request",
  "duplicate",
  "no_engagement_change_required",
]

const REENTRY_OUTCOME_STATUSES: ReentryOutcomeStatus[] = [
  "completed",
  "waived",
  "no_change_confirmed",
]

const FEEDBACK_STAGES: FeedbackImpactStage[] = [
  "discovery",
  "assessment",
  "opportunities",
  "recommendations",
  "roadmap",
  "report",
]

export default function FeedbackPanel({
  engagementId,
  initialStageState,
}: FeedbackPanelProps) {
  const router = useRouter()
  const [stageState, setStageState] = useState(
    initialStageState ?? { feedback: [], openReentries: [] },
  )
  const [drafts, setDrafts] = useState<Record<string, ClassificationDraft>>({})
  const [plans, setPlans] = useState<Record<string, string>>({})
  const [closeReasons, setCloseReasons] = useState<Record<string, string>>({})
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({})
  const [outcomes, setOutcomes] = useState<
    Record<string, Partial<Record<FeedbackImpactStage, ReentryStageOutcomeInput>>>
  >({})
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const draftOf = (feedback: ClientFeedbackSummary) =>
    drafts[feedback.id] ?? classificationDraftFor(feedback)

  async function send(
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
  ): Promise<{ ok: boolean; data?: Record<string, unknown>; message?: string }> {
    setIsSaving(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/engagements/${engagementId}${path}`, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok || !result.status) {
        setError(translateServerMessage(result.message))
        return { ok: false }
      }
      setMessage(translateServerMessage(result.message))
      return { ok: true, data: result.data }
    } catch {
      setError(t("feedback.error.internal"))
      return { ok: false }
    } finally {
      setIsSaving(false)
    }
  }

  async function loadFeedback() {
    setMessage(null)
    setError(null)
    const response = await fetch(`${API_BASE_URL}/engagements/${engagementId}/feedback`, {
      credentials: "include",
    })
    const result = await response.json()
    if (!response.ok || !result.status) {
      setError(translateServerMessage(result.message))
      return
    }
    setStageState(result.data)
    setMessage(translateServerMessage(result.message))
  }

  async function classify(feedback: ClientFeedbackSummary) {
    // No payload means the Manager has not made a decision yet, so there is
    // nothing to record.
    const payload = classificationPayload(feedback, draftOf(feedback))
    if (!payload) return

    const result = await send(
      `/feedback/${feedback.id}/classification`,
      "PATCH",
      payload,
    )
    if (!result.ok) return

    replaceFeedback(result.data?.feedback as ClientFeedbackSummary)
  }

  async function closeWithoutAction(feedback: ClientFeedbackSummary) {
    const payload = closePayload(feedback, closeReasons[feedback.id] ?? "")
    if (!payload) return

    const result = await send(
      `/feedback/${feedback.id}/close-no-action`,
      "PATCH",
      payload,
    )
    if (!result.ok) return

    replaceFeedback(result.data?.feedback as ClientFeedbackSummary)
  }

  async function openReentry(feedback: ClientFeedbackSummary) {
    const payload = openReentryPayload(feedback, plans[feedback.id] ?? "")
    if (!payload) return

    const result = await send("/feedback/reentries", "POST", payload)
    if (!result.ok) return

    setStageState((current) => ({
      feedback: current.feedback.map((item) =>
        item.id === (result.data?.feedback as ClientFeedbackSummary).id
          ? (result.data?.feedback as ClientFeedbackSummary)
          : item,
      ),
      openReentries: [
        result.data?.reentry as FeedbackReentrySummary,
        ...current.openReentries,
      ],
    }))
  }

  async function completeReentry(reentry: FeedbackReentrySummary) {
    const payload = completeReentryPayload(
      reentry,
      outcomes[reentry.id] ?? {},
      completionNotes[reentry.id] ?? "",
    )
    if (!payload) return

    const result = await send(
      `/feedback/reentries/${reentry.id}/complete`,
      "POST",
      payload,
    )
    if (!result.ok) return

    setStageState((current) => ({
      ...current,
      openReentries: current.openReentries.filter((item) => item.id !== reentry.id),
    }))
    // The completed re-entry resolved its Feedback and may have changed which
    // versions are current; the page reloads its stage states rather than
    // guessing them here.
    router.refresh()
  }

  const replaceFeedback = (updated: ClientFeedbackSummary) =>
    setStageState((current) => ({
      ...current,
      feedback: current.feedback.map((item) =>
        item.id === updated.id ? updated : item,
      ),
    }))

  return (
    <section style={stageSurfaceStyle}>
      <div style={stageHeaderStyle}>
        <div>
          <p style={stageEyebrowStyle}>{t("feedback.eyebrow")}</p>
          <h2 style={stageHeadingStyle}>{t("feedback.title")}</h2>
          <p style={stageIntroStyle}>{t("feedback.intro")}</p>
        </div>
        <button
          type="button"
          style={buttonStyle("secondary", isSaving)}
          disabled={isSaving}
          onClick={loadFeedback}
        >
          {t("feedback.action.refresh")}
        </button>
      </div>

      {message && <InlineAlert tone="success">{message}</InlineAlert>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      {stageState.feedback.length === 0 ? (
        <p style={hintStyle}>{t("feedback.empty")}</p>
      ) : (
        stageState.feedback.map((feedback) => (
          <FeedbackItem
            key={feedback.id}
            feedback={feedback}
            draft={draftOf(feedback)}
            plan={plans[feedback.id] ?? ""}
            closeReason={closeReasons[feedback.id] ?? ""}
            disabled={isSaving}
            onDraftChange={(draft) =>
              setDrafts((current) => ({ ...current, [feedback.id]: draft }))
            }
            onPlanChange={(plan) =>
              setPlans((current) => ({ ...current, [feedback.id]: plan }))
            }
            onCloseReasonChange={(reason) =>
              setCloseReasons((current) => ({ ...current, [feedback.id]: reason }))
            }
            onClassify={() => classify(feedback)}
            onClose={() => closeWithoutAction(feedback)}
            onOpenReentry={() => openReentry(feedback)}
          />
        ))
      )}

      {stageState.openReentries.length > 0 && (
        <div style={nestedBlockStyle}>
          <h3 style={sectionTitleStyle}>{t("feedback.reentry.open_title")}</h3>
          {stageState.openReentries.map((reentry) => (
            <ReentryItem
              key={reentry.id}
              reentry={reentry}
              disabled={isSaving}
              note={completionNotes[reentry.id] ?? ""}
              outcomes={outcomes[reentry.id] ?? {}}
              onNoteChange={(note) =>
                setCompletionNotes((current) => ({ ...current, [reentry.id]: note }))
              }
              onOutcomeChange={(stage, outcome) =>
                setOutcomes((current) => ({
                  ...current,
                  [reentry.id]: { ...(current[reentry.id] ?? {}), [stage]: outcome },
                }))
              }
              onComplete={() => completeReentry(reentry)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function FeedbackItem({
  feedback,
  draft,
  plan,
  closeReason,
  disabled,
  onDraftChange,
  onPlanChange,
  onCloseReasonChange,
  onClassify,
  onClose,
  onOpenReentry,
}: {
  feedback: ClientFeedbackSummary
  draft: ClassificationDraft
  plan: string
  closeReason: string
  disabled: boolean
  onDraftChange: (draft: ClassificationDraft) => void
  onPlanChange: (plan: string) => void
  onCloseReasonChange: (reason: string) => void
  onClassify: () => void
  onClose: () => void
  onOpenReentry: () => void
}) {
  const canClassify = canSubmitClassification(draft)
  const canReenter = canOpenReentry(feedback, plan)
  const canClose = canCloseWithoutAction(feedback, closeReason)

  return (
    <div style={feedbackCardStyle}>
      <div style={rowStyle}>
        <div>
          <p style={sourceTitleStyle}>
            {t("feedback.source.version", {
              version: feedback.sourceReportVersionNumber,
              date: formatDateTime(feedback.sourceReportVersionPublishedAt),
            })}
          </p>
          <p style={metaTextStyle}>
            {t("feedback.submitted_by", {
              author: feedback.submittedByName ?? feedback.submittedByUserId,
              date: formatDateTime(feedback.submittedAt),
            })}
          </p>
        </div>
        <Badge tone="neutral" label={t(`feedback.status.${feedback.status}`)} />
      </div>

      {/* The client's own words, shown as written and never editable. */}
      <p style={originalContentStyle}>{feedback.content}</p>

      <ImpactSummary feedback={feedback} />

      <div style={fieldsGridStyle}>
        <label style={fieldStyle}>
          {t("feedback.field.classification")}
          <select
            style={inputStyle}
            value={draft.classification}
            disabled={disabled}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                classification: event.target.value as FeedbackClassification | "",
              })
            }
          >
            <option value="">{t("feedback.classification.unselected")}</option>
            {FEEDBACK_CLASSIFICATIONS.map((classification) => (
              <option key={classification} value={classification}>
                {t(`feedback.classification.${classification}`)}
              </option>
            ))}
          </select>
        </label>
        <div style={fieldStyle}>
          <span>{t("feedback.field.impacted_stages")}</span>
          <div style={stageGridStyle}>
            {FEEDBACK_STAGES.map((stage) => (
              <label key={stage} style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={draft.impactedStages.includes(stage)}
                  disabled={disabled}
                  onChange={() =>
                    onDraftChange({
                      ...draft,
                      impactedStages: toggleStage(draft.impactedStages, stage),
                    })
                  }
                />
                {t(`feedback.stage.${stage}`)}
              </label>
            ))}
          </div>
        </div>
      </div>

      <label style={fieldStyle}>
        {t("feedback.field.summary")}
        <textarea
          style={textareaStyle}
          value={draft.managerSummary}
          disabled={disabled}
          onChange={(event) =>
            onDraftChange({ ...draft, managerSummary: event.target.value })
          }
        />
      </label>
      <label style={fieldStyle}>
        {t("feedback.field.decision")}
        <textarea
          style={textareaStyle}
          value={draft.managerDecision}
          disabled={disabled}
          onChange={(event) =>
            onDraftChange({ ...draft, managerDecision: event.target.value })
          }
        />
      </label>
      <button
        type="button"
        style={buttonStyle("secondary", disabled || !canClassify)}
        disabled={disabled || !canClassify}
        onClick={onClassify}
      >
        {t("feedback.action.classify")}
      </button>

      <div style={nestedBlockStyle}>
        <label style={fieldStyle}>
          {t("feedback.field.reentry_plan")}
          <textarea
            style={textareaStyle}
            value={plan}
            disabled={disabled}
            onChange={(event) => onPlanChange(event.target.value)}
          />
        </label>
        <p style={hintStyle}>{t("feedback.reentry.plan_hint")}</p>
        <label style={fieldStyle}>
          {t("feedback.field.close_reason")}
          <textarea
            style={textareaStyle}
            value={closeReason}
            disabled={disabled}
            onChange={(event) => onCloseReasonChange(event.target.value)}
          />
        </label>
        <div style={actionRowStyle}>
          <button
            type="button"
            style={buttonStyle("primary", disabled || !canReenter)}
            disabled={disabled || !canReenter}
            onClick={onOpenReentry}
          >
            {t("feedback.action.open_reentry")}
          </button>
          <button
            type="button"
            style={buttonStyle("secondary", disabled || !canClose)}
            disabled={disabled || !canClose}
            onClick={onClose}
          >
            {t("feedback.action.close_no_action")}
          </button>
        </div>
      </div>
    </div>
  )
}

// The three answers kept visually apart, because they are three different
// facts: what the Manager declared, what is technically stale right now, and
// how the published version the client commented on stands today.
function ImpactSummary({ feedback }: { feedback: ClientFeedbackSummary }) {
  const { declaredImpactedStages, technicalStaleness, sourceReport } = feedback.impact

  return (
    <div style={impactStyle}>
      <div style={impactRowStyle}>
        <span style={impactLabelStyle}>{t("feedback.impact.declared")}</span>
        {declaredImpactedStages.length === 0 ? (
          <span style={metaTextStyle}>{t("feedback.impact.declared_none")}</span>
        ) : (
          declaredImpactedStages.map((stage) => (
            <Badge key={stage} tone="info" label={t(`feedback.stage.${stage}`)} />
          ))
        )}
      </div>
      <div style={impactRowStyle}>
        <span style={impactLabelStyle}>{t("feedback.impact.technical")}</span>
        {technicalStaleness.reasons.length === 0 ? (
          <span style={metaTextStyle}>{t("feedback.impact.technical_none")}</span>
        ) : (
          technicalStaleness.reasons.map((reason) => (
            <Badge
              key={reason}
              tone="warning"
              label={t(`feedback.staleness.${reason}`)}
            />
          ))
        )}
      </div>
      <div style={impactRowStyle}>
        <span style={impactLabelStyle}>{t("feedback.impact.source_report")}</span>
        {sourceReport.reasons.length === 0 ? (
          <span style={metaTextStyle}>{t("feedback.impact.source_report_current")}</span>
        ) : (
          sourceReport.reasons.map((reason) => (
            <Badge
              key={reason}
              tone="neutral"
              label={t(`feedback.source_report.${reason}`)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ReentryItem({
  reentry,
  disabled,
  note,
  outcomes,
  onNoteChange,
  onOutcomeChange,
  onComplete,
}: {
  reentry: FeedbackReentrySummary
  disabled: boolean
  note: string
  outcomes: Partial<Record<FeedbackImpactStage, ReentryStageOutcomeInput>>
  onNoteChange: (note: string) => void
  onOutcomeChange: (
    stage: FeedbackImpactStage,
    outcome: ReentryStageOutcomeInput,
  ) => void
  onComplete: () => void
}) {
  const canComplete = canCompleteReentry(reentry, outcomes, note)

  return (
    <div style={feedbackCardStyle}>
      <p style={sourceTitleStyle}>
        {t("feedback.reentry.row", {
          stages: reentry.impactedStages
            .map((stage) => t(`feedback.stage.${stage}`))
            .join(", "),
        })}
      </p>
      <p style={metaTextStyle}>{reentry.plan}</p>

      <div style={fieldsGridStyle}>
        {reentry.impactedStages.map((stage) => {
          const option = resultOptionFor(reentry, stage)
          const outcome =
            outcomes[stage] ?? { stage, status: "no_change_confirmed", reason: "" }

          return (
            <div key={stage} style={fieldStyle}>
              <span>{t(`feedback.stage.${stage}`)}</span>
              <select
                style={inputStyle}
                value={outcome.status}
                disabled={disabled}
                onChange={(event) =>
                  onOutcomeChange(
                    stage,
                    outcomeForStatus(
                      stage,
                      event.target.value as ReentryOutcomeStatus,
                      option,
                      outcome.reason,
                    ),
                  )
                }
              >
                {REENTRY_OUTCOME_STATUSES.map((status) => (
                  <option
                    key={status}
                    value={status}
                    disabled={status === "completed" && option?.available !== true}
                  >
                    {t(`feedback.reentry.outcome.${status}`)}
                  </option>
                ))}
              </select>

              {outcome.status === "completed" ? (
                // The result is the version the engagement already holds. It is
                // shown, not typed: the server derives the recorded identity.
                <p style={readOnlyValueStyle}>{resultLabel(option)}</p>
              ) : (
                <input
                  style={inputStyle}
                  value={outcome.reason ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    onOutcomeChange(stage, {
                      stage,
                      status: outcome.status,
                      reason: event.target.value,
                    })
                  }
                  placeholder={t("feedback.field.outcome_reason")}
                />
              )}

              {option?.unavailableReason && (
                <p style={metaTextStyle}>
                  {t(`feedback.result.unavailable.${option.unavailableReason}`)}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <label style={fieldStyle}>
        {t("feedback.field.completion_note")}
        <textarea
          style={textareaStyle}
          value={note}
          disabled={disabled}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </label>

      <button
        type="button"
        style={buttonStyle("secondary", disabled || !canComplete)}
        disabled={disabled || !canComplete}
        onClick={onComplete}
      >
        {t("feedback.action.complete_reentry")}
      </button>
    </div>
  )
}

const resultLabel = (option: ReentryStageResultOption | undefined): string => {
  if (!option) return t("feedback.result.none")
  if (option.resultVersionNumber !== null) {
    return t("feedback.result.version", { version: option.resultVersionNumber })
  }
  if (option.resultRevision !== null) {
    return t("feedback.result.revision", { revision: option.resultRevision })
  }
  return t("feedback.result.accepted_state")
}

const feedbackCardStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.sm,
  padding: uiSpace.md,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.subtle,
}

const sourceTitleStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  fontWeight: 650,
}

const originalContentStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
}

const impactStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
}

const impactRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: uiSpace.xs,
}

const impactLabelStyle: CSSProperties = {
  color: uiColors.textMuted,
  fontSize: 12,
  fontWeight: 650,
}

const stageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: uiSpace.xs,
}

const checkboxLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: uiSpace.xs,
  color: uiColors.textSecondary,
  fontSize: 13,
}
