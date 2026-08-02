"use client"

import { useRef, useState, type CSSProperties } from "react"
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
import { AppDialog } from "./AppDialog"
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
  canOpenPublishDialog,
  notificationOutcomeKey,
  validatePublishDialog,
} from "../lib/consultant-report-dialog"

import type {
  ConsultantReportContent,
  ConsultantReportSubmission,
  FollowUpQuestion,
  FollowUpQuestionStatus,
  ReportPublicationRecipient,
  ReportReviewState,
  ReportStageState,
  ReportVersionSummary,
} from "../../shared/consultant-report.schema"

type ConsultantReportPanelProps = {
  engagementId: string
  initialStageState: ReportStageState | null
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

const QUESTION_STATUSES: FollowUpQuestionStatus[] = [
  "draft",
  "approved",
  "removed",
]

export default function ConsultantReportPanel({
  engagementId,
  initialStageState,
}: ConsultantReportPanelProps) {
  const router = useRouter()
  const [stageState, setStageState] = useState(initialStageState)
  const [report, setReport] = useState<ConsultantReportContent | null>(
    initialStageState?.activeVersion?.report ?? null,
  )
  const [replaceEdits, setReplaceEdits] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [versions, setVersions] = useState<ReportVersionSummary[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [publishTitle, setPublishTitle] = useState("")
  const [publishManagerMessage, setPublishManagerMessage] = useState("")
  const [publishDialogError, setPublishDialogError] = useState<string | null>(null)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [revokeDialogError, setRevokeDialogError] = useState<string | null>(null)
  const publishTitleRef = useRef<HTMLInputElement | null>(null)
  const revokeCancelRef = useRef<HTMLButtonElement | null>(null)

  const activeVersion = stageState?.activeVersion ?? null
  const publication = stageState?.activePublication ?? activeVersion?.publication
  const publicationRecipient = stageState?.publicationRecipient ?? null
  const readOnly =
    !activeVersion ||
    activeVersion.status === "superseded" ||
    activeVersion.reviewState === "approved"
  const stale = stageState?.stale ?? false
  const eligible = stageState?.eligible ?? false
  const publishAvailable = canOpenPublishDialog({
    version: activeVersion,
    stale,
    recipient: publicationRecipient,
  })

  async function generate() {
    setIsGenerating(true)
    setMessage(null)
    setNotificationMessage(null)
    setError(null)

    const response = await fetch(`${API_BASE_URL}/engagements/${engagementId}/report`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replaceConsultantEdits: replaceEdits }),
    })
    const result = await response.json()

    setIsGenerating(false)
    if (!response.ok || !result.status) {
      setError(translateServerMessage(result.message))
      return
    }

    setReport(result.data.version.report)
    setStageState((current) => ({
      ...(current ?? initialEmptyState()),
      activeVersion: result.data.version,
      stale: false,
    }))
    setVersions(null)
    setMessage(translateServerMessage(result.message))
    router.refresh()
  }

  async function save(reviewState: "draft" | "manager_review") {
    if (!activeVersion || !report) return
    setIsSaving(true)
    setMessage(null)
    setNotificationMessage(null)
    setError(null)

    const response = await fetch(`${API_BASE_URL}/engagements/${engagementId}/report`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        versionId: activeVersion.id,
        expectedRevision: activeVersion.revision,
        report: toSubmission(report),
        reviewState,
      }),
    })
    const result = await response.json()

    setIsSaving(false)
    if (!response.ok || !result.status) {
      setError(translateServerMessage(result.message))
      return
    }

    setReport(result.data.version.report)
    setStageState((current) => ({
      ...(current ?? initialEmptyState()),
      activeVersion: result.data.version,
      stale: false,
      activePublication: result.data.version.publication ?? current?.activePublication ?? null,
    }))
    setMessage(translateServerMessage(result.message))
    router.refresh()
  }

  async function approve() {
    if (!activeVersion) return
    setIsSaving(true)
    setMessage(null)
    setNotificationMessage(null)
    setError(null)

    const response = await fetch(
      `${API_BASE_URL}/engagements/${engagementId}/report/versions/${activeVersion.id}/approve`,
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: activeVersion.revision }),
      },
    )
    const result = await response.json()

    setIsSaving(false)
    if (!response.ok || !result.status) {
      setError(translateServerMessage(result.message))
      return
    }

    setReport(result.data.version.report)
    setStageState((current) => ({
      ...(current ?? initialEmptyState()),
      activeVersion: result.data.version,
      stale: false,
      activePublication: result.data.version.publication ?? current?.activePublication ?? null,
    }))
    setMessage(translateServerMessage(result.message))
    router.refresh()
  }

  async function loadVersions() {
    const response = await fetch(
      `${API_BASE_URL}/engagements/${engagementId}/report/versions`,
      { credentials: "include" },
    )
    const result = await response.json()
    if (!response.ok || !result.status) {
      setError(translateServerMessage(result.message))
      return
    }
    setVersions(result.data.versions)
    setMessage(translateServerMessage(result.message))
  }

  async function publish() {
    if (!activeVersion) return
    const validation = validatePublishDialog({
      version: activeVersion,
      stale,
      recipient: publicationRecipient,
      title: publishTitle,
    })
    if (!validation.valid) {
      setPublishDialogError(t(validation.messageKey))
      return
    }
    setIsPublishing(true)
    setMessage(null)
    setNotificationMessage(null)
    setError(null)
    setPublishDialogError(null)

    const response = await fetch(
      `${API_BASE_URL}/engagements/${engagementId}/report/versions/${activeVersion.id}/publish`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: publishTitle.trim(),
          managerMessage:
            publishManagerMessage.trim().length === 0
              ? null
              : publishManagerMessage.trim(),
        }),
      },
    )
    const result = await response.json()

    setIsPublishing(false)
    if (!response.ok || !result.status) {
      setPublishDialogError(translateServerMessage(result.message))
      return
    }

    setStageState((current) => ({
      ...(current ?? initialEmptyState()),
      activePublication: result.data.publication,
      activeVersion: current?.activeVersion
        ? { ...current.activeVersion, publication: result.data.publication }
        : null,
    }))
    setPublishDialogOpen(false)
    setMessage(translateServerMessage(result.message))
    setNotificationMessage(t(notificationOutcomeKey(result.data.publication)))
    router.refresh()
  }

  async function revoke() {
    setIsPublishing(true)
    setMessage(null)
    setNotificationMessage(null)
    setError(null)
    setRevokeDialogError(null)

    const response = await fetch(
      `${API_BASE_URL}/engagements/${engagementId}/report/publication/revoke`,
      { method: "POST", credentials: "include" },
    )
    const result = await response.json()

    setIsPublishing(false)
    if (!response.ok || !result.status) {
      setRevokeDialogError(translateServerMessage(result.message))
      return
    }

    setStageState((current) => ({
      ...(current ?? initialEmptyState()),
      activePublication: null,
      activeVersion: current?.activeVersion
        ? { ...current.activeVersion, publication: null }
        : null,
    }))
    setRevokeDialogOpen(false)
    setMessage(translateServerMessage(result.message))
    router.refresh()
  }

  async function retryNotification() {
    setIsPublishing(true)
    setMessage(null)
    setNotificationMessage(null)
    setError(null)

    const response = await fetch(
      `${API_BASE_URL}/engagements/${engagementId}/report/publication/notify`,
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestKey: crypto.randomUUID() }),
      },
    )
    const result = await response.json()

    setIsPublishing(false)
    if (!response.ok || !result.status) {
      setError(translateServerMessage(result.message))
      return
    }

    setStageState((current) => ({
      ...(current ?? initialEmptyState()),
      activePublication: result.data.publication,
    }))
    setMessage(translateServerMessage(result.message))
    setNotificationMessage(t(notificationOutcomeKey(result.data.publication)))
  }

  return (
    <section style={stageSurfaceStyle}>
      <div style={stageHeaderStyle}>
        <div>
          <p style={stageEyebrowStyle}>{t("report.lifecycle.eyebrow")}</p>
          <h2 style={stageHeadingStyle}>{t("report.lifecycle.title")}</h2>
          <p style={stageIntroStyle}>{t("report.lifecycle.intro")}</p>
        </div>
        {activeVersion && (
          <div style={rowStyle}>
            <Badge
              tone={reviewTone(activeVersion.reviewState)}
              label={t(`report.review_state.${activeVersion.reviewState}`)}
            />
            <Badge
              tone={stale ? "warning" : "neutral"}
              label={stale ? t("report.state.stale") : t("report.state.current")}
            />
            {publication && (
              <Badge tone="success" label={t("report.state.published")} />
            )}
          </div>
        )}
      </div>

      {!eligible && (
        <InlineAlert tone="warning">
          {t("report.sources.missing", {
            sources:
              stageState?.missingAcceptedSources.map(sourceLabel).join(", ") ??
              t("common.field.none"),
          })}
        </InlineAlert>
      )}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}
      {notificationMessage && (
        <InlineAlert
          tone={
            notificationMessage === t("report.publication.email_failed")
              ? "warning"
              : "success"
          }
        >
          {notificationMessage}
        </InlineAlert>
      )}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {stale && (
        <InlineAlert tone="warning">{t("report.warning.stale")}</InlineAlert>
      )}

      <div style={actionRowStyle}>
        <label style={replaceControlStyle}>
          <input
            type="checkbox"
            checked={replaceEdits}
            onChange={(event) => setReplaceEdits(event.target.checked)}
          />
          {t("report.action.replace_edits")}
        </label>
        <button
          type="button"
          style={buttonStyle("secondary", isGenerating || !eligible)}
          disabled={isGenerating || !eligible}
          onClick={generate}
        >
          {isGenerating
            ? t("report.action.generating")
            : activeVersion
              ? t("report.action.regenerate")
              : t("report.action.generate")}
        </button>
        <button type="button" style={buttonStyle("secondary")} onClick={loadVersions}>
          {t("report.versions.show")}
        </button>
      </div>

      {!report && (
        <EmptyState title={t("report.empty.title")}>
          <p style={hintStyle}>{t("report.empty.description")}</p>
        </EmptyState>
      )}

      {report && (
        <div style={editorStyle}>
          <label style={fieldStyle}>
            {t("report.field.title")}
            <input
              style={inputStyle}
              value={report.title}
              disabled={readOnly}
              onChange={(event) =>
                setReport({ ...report, title: event.target.value })
              }
            />
          </label>
          <label style={fieldStyle}>
            {t("report.field.executive_summary")}
            <textarea
              style={textareaStyle}
              value={report.executiveSummary}
              disabled={readOnly}
              onChange={(event) =>
                setReport({ ...report, executiveSummary: event.target.value })
              }
            />
          </label>
          <div style={fieldsGridStyle}>
            <TextListField
              label={t("report.field.assumptions")}
              values={report.assumptions}
              disabled={readOnly}
              onChange={(assumptions) => setReport({ ...report, assumptions })}
            />
            <TextListField
              label={t("report.field.risks")}
              values={report.risks}
              disabled={readOnly}
              onChange={(risks) => setReport({ ...report, risks })}
            />
          </div>
          <ReadOnlyList
            label={t("report.field.prioritized_problems")}
            values={report.prioritizedProblems.map(
              (problem) => `${problem.priorityRank}. ${problem.title}`,
            )}
          />
          <ReadOnlyList
            label={t("report.field.recommendations")}
            values={report.recommendations.map(
              (recommendation) => recommendation.title,
            )}
          />
          <label style={fieldStyle}>
            {t("report.field.assessment_summary")}
            <textarea
              style={textareaStyle}
              value={report.assessmentSummary}
              disabled={readOnly}
              onChange={(event) =>
                setReport({ ...report, assessmentSummary: event.target.value })
              }
            />
          </label>
          <label style={fieldStyle}>
            {t("report.field.roadmap_summary")}
            <textarea
              style={textareaStyle}
              value={report.roadmapSummary}
              disabled={readOnly}
              onChange={(event) =>
                setReport({ ...report, roadmapSummary: event.target.value })
              }
            />
          </label>
          <div style={nestedBlockStyle}>
            <div style={sectionRowStyle}>
              <h3 style={sectionTitleStyle}>{t("report.questions.title")}</h3>
              {!readOnly && (
                <button
                  type="button"
                  style={buttonStyle("secondary")}
                  onClick={() =>
                    setReport({
                      ...report,
                      followUpQuestions: [
                        ...report.followUpQuestions,
                        emptyQuestion(),
                      ],
                    })
                  }
                >
                  {t("report.questions.add")}
                </button>
              )}
            </div>
            {report.followUpQuestions.length === 0 ? (
              <p style={hintStyle}>{t("report.questions.empty")}</p>
            ) : (
              report.followUpQuestions.map((question, index) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  disabled={readOnly}
                  onChange={(next) => updateQuestion(index, next)}
                  onRemove={() => removeQuestion(index)}
                />
              ))
            )}
          </div>
          <div style={actionRowStyle}>
            {activeVersion && (
              <a
                href={`${API_BASE_URL}/engagements/${engagementId}/report/versions/${activeVersion.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                style={buttonStyle("secondary")}
              >
                {t("report.action.preview_pdf")}
              </a>
            )}
            <button
              type="button"
              style={buttonStyle("secondary", readOnly || isSaving || !complete(report))}
              disabled={readOnly || isSaving || !complete(report)}
              onClick={() => save("draft")}
            >
              {isSaving ? t("common.state.saving") : t("report.action.save_draft")}
            </button>
            <button
              type="button"
              style={buttonStyle("secondary", readOnly || isSaving || !complete(report))}
              disabled={readOnly || isSaving || !complete(report)}
              onClick={() => save("manager_review")}
            >
              {isSaving ? t("common.state.saving") : t("report.action.submit")}
            </button>
            <button
              type="button"
              style={buttonStyle(
                "primary",
                readOnly ||
                  isSaving ||
                  !complete(report) ||
                  activeVersion?.reviewState !== "manager_review",
              )}
              disabled={
                readOnly ||
                isSaving ||
                !complete(report) ||
                activeVersion?.reviewState !== "manager_review"
              }
              onClick={approve}
            >
              {t("report.action.approve")}
            </button>
          </div>
        </div>
      )}

      {activeVersion?.reviewState === "approved" && (
        <div style={publicationStyle}>
          <div>
            <p style={publicationTitleStyle}>{t("report.publication.title")}</p>
            <p style={hintStyle}>
              {publication
                ? t("report.publication.active", {
                    version: publication.reportVersionNumber,
                    date: formatDateTime(publication.publishedAt),
                  })
                : t("report.publication.none")}
            </p>
          </div>
          <div style={rowStyle}>
            {publication ? (
              <>
                <button
                  type="button"
                  style={buttonStyle("secondary", isPublishing)}
                  disabled={isPublishing}
                  onClick={retryNotification}
                >
                  {t("report.action.retry_notification")}
                </button>
                <button
                  type="button"
                  style={buttonStyle("danger", isPublishing)}
                  disabled={isPublishing}
                  onClick={() => {
                    setRevokeDialogError(null)
                    setRevokeDialogOpen(true)
                  }}
                >
                  {t("report.action.revoke")}
                </button>
              </>
            ) : (
              <button
                type="button"
                style={buttonStyle("primary", isPublishing || !publishAvailable)}
                disabled={isPublishing || !publishAvailable}
                onClick={() => {
                  if (!activeVersion) return
                  setPublishTitle(activeVersion.report.title)
                  setPublishManagerMessage("")
                  setPublishDialogError(null)
                  setPublishDialogOpen(true)
                }}
              >
                {t("report.action.publish")}
              </button>
            )}
          </div>
        </div>
      )}

      {versions && (
        <div style={nestedBlockStyle}>
          {versions.length === 0 ? (
            <p style={hintStyle}>{t("report.versions.empty")}</p>
          ) : (
            versions.map((version) => (
              <p key={version.id} style={versionRowStyle}>
                {t("report.version.label", {
                  version: version.versionNumber,
                  status: t(`report.version_status.${version.status}`),
                  review: t(`report.review_state.${version.reviewState}`),
                  date: formatDateTime(version.lastModifiedAt),
                })}
              </p>
            ))
          )}
        </div>
      )}

      <AppDialog
        open={publishDialogOpen}
        title={t("report.publish.dialog_title")}
        description={t("report.publish.dialog_description")}
        cancelLabel={t("common.action.cancel")}
        onCancel={() => {
          if (isPublishing) return
          setPublishDialogOpen(false)
          setPublishDialogError(null)
        }}
        initialFocusRef={publishTitleRef}
        primaryAction={{
          label: isPublishing
            ? t("report.publish.publishing")
            : t("report.publish.primary"),
          onClick: publish,
          loading: isPublishing,
          disabled: !activeVersion || !publishAvailable,
        }}
      >
        {publishDialogError && (
          <InlineAlert tone="danger">{publishDialogError}</InlineAlert>
        )}
        <div style={nestedBlockStyle}>
          <p style={publicationTitleStyle}>{t("report.publish.version_label")}</p>
          <p style={hintStyle}>
            {activeVersion
              ? t("report.version.label", {
                  version: activeVersion.versionNumber,
                  status: t(`report.version_status.${activeVersion.status}`),
                  review: t(`report.review_state.${activeVersion.reviewState}`),
                  date: formatDateTime(activeVersion.lastModifiedAt),
                })
              : t("common.field.none")}
          </p>
        </div>
        <label style={fieldStyle}>
          {t("report.publish.title_label")}
          <input
            ref={publishTitleRef}
            style={inputStyle}
            value={publishTitle}
            aria-describedby="report-publish-title-help"
            onChange={(event) => setPublishTitle(event.target.value)}
          />
          <span id="report-publish-title-help" style={hintStyle}>
            {t("report.publish.title_help")}
          </span>
        </label>
        <label style={fieldStyle}>
          {t("report.publish.message_label")}
          <textarea
            style={textareaStyle}
            value={publishManagerMessage}
            onChange={(event) => setPublishManagerMessage(event.target.value)}
          />
        </label>
        <div style={nestedBlockStyle}>
          <p style={publicationTitleStyle}>{t("report.publish.client_label")}</p>
          <p style={hintStyle}>
            {publicationRecipient
              ? recipientLabel(publicationRecipient)
              : t("report.publish.client_missing")}
          </p>
        </div>
        <InlineAlert tone="info">{t("report.publish.read_only_pdf")}</InlineAlert>
        <InlineAlert tone="info">{t("report.publish.immutable_version")}</InlineAlert>
        <InlineAlert tone="info">{t("report.publish.email_separate")}</InlineAlert>
      </AppDialog>

      <AppDialog
        open={revokeDialogOpen}
        title={t("report.revoke.dialog_title")}
        description={t("report.revoke.dialog_description")}
        cancelLabel={t("common.action.cancel")}
        onCancel={() => {
          if (isPublishing) return
          setRevokeDialogOpen(false)
          setRevokeDialogError(null)
        }}
        initialFocusRef={revokeCancelRef}
        primaryAction={{
          label: isPublishing
            ? t("report.revoke.revoking")
            : t("report.revoke.primary"),
          onClick: revoke,
          loading: isPublishing,
          disabled: !publication,
          variant: "danger",
        }}
      >
        {revokeDialogError && (
          <InlineAlert tone="danger">{revokeDialogError}</InlineAlert>
        )}
        <div style={nestedBlockStyle}>
          <p style={publicationTitleStyle}>
            {publication?.title ?? activeVersion?.report.title ?? t("common.field.none")}
          </p>
          <p style={hintStyle}>
            {publication
              ? t("report.revoke.version_label", {
                  version: publication.reportVersionNumber,
                })
              : t("common.field.none")}
          </p>
          <p style={hintStyle}>
            {publication?.clientUserId
              ? t("report.revoke.client_label", {
                  client: publication.clientUserId,
                })
              : t("report.publish.client_missing")}
          </p>
        </div>
        <InlineAlert tone="warning">{t("report.revoke.access_ends")}</InlineAlert>
        <InlineAlert tone="info">{t("report.revoke.history_kept")}</InlineAlert>
      </AppDialog>
    </section>
  )

  function updateQuestion(index: number, next: FollowUpQuestion) {
    if (!report) return
    setReport({
      ...report,
      followUpQuestions: report.followUpQuestions.map((question, questionIndex) =>
        questionIndex === index ? next : question,
      ),
    })
  }

  function removeQuestion(index: number) {
    if (!report) return
    setReport({
      ...report,
      followUpQuestions: report.followUpQuestions.filter(
        (_question, questionIndex) => questionIndex !== index,
      ),
    })
  }
}

function QuestionEditor({
  question,
  disabled,
  onChange,
  onRemove,
}: {
  question: FollowUpQuestion
  disabled: boolean
  onChange: (question: FollowUpQuestion) => void
  onRemove: () => void
}) {
  return (
    <div style={questionStyle}>
      <label style={fieldStyle}>
        {t("report.questions.question")}
        <textarea
          style={textareaStyle}
          value={question.question}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...question, question: event.target.value })
          }
        />
      </label>
      <div style={fieldsGridStyle}>
        <label style={fieldStyle}>
          {t("report.questions.status")}
          <select
            style={inputStyle}
            value={question.status}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...question,
                status: event.target.value as FollowUpQuestionStatus,
              })
            }
          >
            {QUESTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`report.question_status.${status}`)}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          {t("report.questions.template")}
          <input
            style={inputStyle}
            value={question.templateCode ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...question,
                templateCode: event.target.value.trim() || null,
              })
            }
          />
        </label>
      </div>
      <label style={fieldStyle}>
        {t("report.questions.source")}
        <textarea
          style={textareaStyle}
          value={question.sourceDescription}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...question, sourceDescription: event.target.value })
          }
        />
      </label>
      <label style={fieldStyle}>
        {t("report.questions.rationale")}
        <textarea
          style={textareaStyle}
          value={question.rationale}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...question, rationale: event.target.value })
          }
        />
      </label>
      {!disabled && (
        <div style={actionRowStyle}>
          <button type="button" style={buttonStyle("ghost")} onClick={onRemove}>
            {t("common.action.remove")}
          </button>
        </div>
      )}
    </div>
  )
}

function TextListField({
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
      {label}
      <textarea
        style={textareaStyle}
        value={values.join("\n")}
        disabled={disabled}
        onChange={(event) => onChange(lines(event.target.value))}
      />
      <span style={hintStyle}>{t("report.field.line_hint")}</span>
    </label>
  )
}

function ReadOnlyList({
  label,
  values,
}: {
  label: string
  values: string[]
}) {
  return (
    <div style={fieldStyle}>
      <span>{label}</span>
      <ul style={readOnlyListStyle}>
        {values.map((value, index) => (
          <li key={`${value}:${index}`}>{value}</li>
        ))}
      </ul>
    </div>
  )
}

const toSubmission = (
  report: ConsultantReportContent,
): ConsultantReportSubmission => {
  const { sourceSnapshot: _sourceSnapshot, ...submission } = report
  void _sourceSnapshot
  return {
    ...submission,
    followUpQuestions: submission.followUpQuestions.map((question) => ({
      id: question.id,
      question: question.question,
      sourceType: question.sourceType,
      sourceDescription: question.sourceDescription,
      templateCode: question.templateCode,
      rationale: question.rationale,
      status: question.status,
    })),
  }
}

const complete = (report: ConsultantReportContent): boolean =>
  report.title.trim().length > 0 &&
  report.executiveSummary.trim().length > 0 &&
  report.engagementContext.organizationName.trim().length > 0 &&
  report.assessmentSummary.trim().length > 0 &&
  report.recommendations.length > 0 &&
  report.roadmapSummary.trim().length > 0 &&
  report.followUpQuestions.every(
    (question) =>
      question.status === "removed" ||
      (question.question.trim().length > 0 &&
        question.sourceDescription.trim().length > 0 &&
        question.rationale.trim().length > 0),
  )

const lines = (value: string): string[] =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)

const emptyQuestion = (): FollowUpQuestion => ({
  id: crypto.randomUUID(),
  question: "",
  sourceType: "discovery_gap",
  sourceGapId: "pending",
  sourceFingerprint: "pending",
  sourceDescription: "",
  templateCode: null,
  templateEntryId: null,
  templateVersion: null,
  templateFingerprint: null,
  templateTitle: null,
  rationale: "",
  status: "draft",
})

const initialEmptyState = (): ReportStageState => ({
  activeVersion: null,
  stale: false,
  eligible: false,
  missingAcceptedSources: [],
  currentSourceSnapshot: null,
  followUpTemplateOptions: [],
  activePublication: null,
  publicationRecipient: null,
})

const reviewTone = (state: ReportReviewState) =>
  state === "approved" ? "success" : state === "manager_review" ? "info" : "neutral"

const recipientLabel = (recipient: ReportPublicationRecipient): string =>
  recipient.displayName
    ? `${recipient.displayName} (${recipient.email})`
    : recipient.email

const sourceLabel = (source: string): string => {
  switch (source) {
    case "discovery":
    case "assessment":
    case "opportunities":
    case "recommendations":
    case "roadmap":
      return t(`report.sources.${source}`)
    default:
      return source
  }
}

const editorStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
}

const replaceControlStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: uiSpace.xs,
  minHeight: 40,
  color: uiColors.textSecondary,
  fontSize: 13,
}

const sectionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: uiSpace.sm,
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 15,
  fontWeight: 650,
}

const questionStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.sm,
  padding: uiSpace.sm,
  borderRadius: uiRadius.control,
  background: uiColors.surface,
  border: `1px solid ${uiColors.border}`,
}

const publicationStyle: CSSProperties = {
  ...nestedBlockStyle,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
}

const publicationTitleStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  fontWeight: 650,
}

const versionRowStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 13,
}

const readOnlyListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: uiColors.textPrimary,
  fontSize: 14,
  lineHeight: 1.5,
}
