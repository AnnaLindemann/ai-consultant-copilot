"use client"

import { useEffect, useState, type CSSProperties } from "react"

import {
  Badge,
  InlineAlert,
  actionRowStyle,
  buttonStyle,
  checkboxFieldStyle,
  fieldStyle,
  fieldsGridStyle,
  inputStyle,
  mutedTextStyle,
  textareaStyle,
} from "./UiKit"
import {
  stageEyebrowStyle,
  stageHeaderStyle,
  stageHeadingStyle,
  stageIntroStyle,
  stageSurfaceStyle,
} from "./StagePanel"
import { submitAiOutputReview } from "../lib/ai-output-review"
import {
  AI_PROCESSING_PERMISSIONS,
  DATA_CLASSIFICATIONS,
  DPIA_SCREENINGS,
  isConfidentialClassification,
  LEGAL_BASES,
} from "../lib/compliance-options"
import { t, translateServerMessage } from "../i18n"
import { uiColors } from "../lib/design-tokens"

import type {
  AiAssistedStage,
  DataClassification,
  EngagementCompliance,
  EngagementAiProcessingPermission,
  EngagementDpiaScreening,
  LegalBasis,
} from "../../shared/compliance.schema"

// How this engagement's content is classified, whether AI may assist with it,
// and whether a legal obligation prevents its erasure (roadmap Phase 10).
//
// It is a stage panel like the others: the consultant reviews and decides, and
// the server enforces. Nothing here is a permission — a classification the
// interface shows is a fact the backend holds, and every AI request is checked
// against it server-side whatever this panel displays.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

type SaveResponse = {
  status: boolean
  message?: string
  data?: { compliance: EngagementCompliance }
}

export default function EngagementCompliancePanel({
  engagementId,
  compliance,
  activeReviewStage,
  activeStagePendingReview,
}: {
  engagementId: string
  compliance: EngagementCompliance
  activeReviewStage: AiAssistedStage | null
  activeStagePendingReview: boolean
}) {
  // The engagement page re-keys this panel on the compliance state it loaded,
  // so a changed classification arrives as a remount rather than as an effect
  // writing state.
  const [draft, setDraft] = useState(compliance)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [currentRole, setCurrentRole] = useState<string | null>(null)
  const [consentDraft, setConsentDraft] = useState({
    subjectName: "",
    subjectRole: "",
    subjectOrganization: "",
    consentText: "",
    consentTextVersion: "",
    processingPurpose: "",
    privacyNoticeVersion: "",
  })

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: "include",
        })
        if (!response.ok) return
        const result = (await response.json()) as {
          data?: { role?: string | null }
        }
        if (mounted) setCurrentRole(result.data?.role ?? null)
      } catch {
        if (mounted) setCurrentRole(null)
      }
    }

    void loadUser()

    return () => {
      mounted = false
    }
  }, [])

  const canReviewAiOutput =
    currentRole === "ADMIN" || currentRole === "MANAGER"

  async function save() {
    setSaving(true)
    setError("")
    setNotice("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/compliance/engagements/${engagementId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(draft),
        },
      )

      const result = (await response.json()) as SaveResponse

      if (!response.ok) {
        setError(
          translateServerMessage(result.message, undefined, "compliance.save_failed"),
        )
        return
      }

      if (result.data?.compliance) setDraft(result.data.compliance)
      setNotice(
        translateServerMessage(result.message, undefined, "compliance.save_failed"),
      )
    } catch {
      setError(t("compliance.save_failed"))
    } finally {
      setSaving(false)
    }
  }

  async function reviewAiOutput() {
    if (!activeReviewStage || !activeStagePendingReview) return

    setSaving(true)
    setError("")
    setNotice("")

    try {
      const outcome = await submitAiOutputReview({
        apiBaseUrl: API_BASE_URL,
        engagementId,
        stage: activeReviewStage,
        fetchImpl: fetch,
      })

      if (!outcome.reviewed) {
        setError(
          translateServerMessage(
            outcome.message,
            undefined,
            "compliance.ai_review.failed",
          ),
        )
        return
      }

      setNotice(
        translateServerMessage(
          outcome.message,
          undefined,
          "compliance.ai_review.success",
        ),
      )
      // Re-read from the server rather than clearing the badge locally: the
      // pending flag lives on the Analysis Runs the page loads, and a locally
      // cleared one would be a guess that outlives the truth.
      window.location.reload()
    } catch {
      setError(t("compliance.ai_review.failed"))
    } finally {
      setSaving(false)
    }
  }

  async function savePrivacyProcessing() {
    await postCompliance(`/compliance/engagements/${engagementId}/privacy-processing`, {
      processingPurpose: draft.privacyProcessing.processingPurpose,
      legalBasis: draft.privacyProcessing.legalBasis,
      legalBasisNote: draft.privacyProcessing.legalBasisNote,
    })
  }

  async function saveDpiaScreening() {
    await postCompliance(`/compliance/engagements/${engagementId}/dpia-screening`, {
      dpiaScreening: draft.dpiaScreening,
      dpiaScreeningNote: draft.dpiaScreeningNote,
    })
  }

  async function recordConsent() {
    await postCompliance(
      `/compliance/engagements/${engagementId}/consents`,
      {
        subjectName: consentDraft.subjectName,
        subjectRole: emptyToNull(consentDraft.subjectRole),
        subjectOrganization: emptyToNull(consentDraft.subjectOrganization),
        consentText: consentDraft.consentText,
        consentTextVersion: consentDraft.consentTextVersion,
        processingPurpose: consentDraft.processingPurpose,
        privacyNoticeVersion: emptyToNull(consentDraft.privacyNoticeVersion),
      },
      "POST",
    )
  }

  async function withdrawConsent(consentId: string) {
    await postCompliance(
      `/compliance/engagements/${engagementId}/consents/${consentId}/withdraw`,
      {},
      "POST",
    )
  }

  async function postCompliance(
    path: string,
    body: unknown,
    method: "PATCH" | "POST" = "PATCH",
  ) {
    setSaving(true)
    setError("")
    setNotice("")

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })

      const result = (await response.json()) as SaveResponse
      if (!response.ok) {
        setError(
          translateServerMessage(result.message, undefined, "compliance.save_failed"),
        )
        return
      }

      if (result.data?.compliance) setDraft(result.data.compliance)
      setNotice(
        translateServerMessage(result.message, undefined, "compliance.save_failed"),
      )
    } catch {
      setError(t("compliance.save_failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={stageSurfaceStyle}>
      <header style={stageHeaderStyle}>
        <span style={stageEyebrowStyle}>{t("compliance.page.title")}</span>
        <h2 style={stageHeadingStyle}>{t("compliance.engagement.title")}</h2>
        <p style={stageIntroStyle}>{t("compliance.engagement.intro")}</p>
      </header>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {notice ? <InlineAlert tone="success">{notice}</InlineAlert> : null}

      {isConfidentialClassification(draft.dataClassification) ? (
        <InlineAlert tone="info">
          {t("compliance.engagement.confidential_hint")}
        </InlineAlert>
      ) : null}

      {canReviewAiOutput && activeReviewStage ? (
        <div style={reviewBoxStyle}>
          <div>
            <Badge
              tone={activeStagePendingReview ? "warning" : "success"}
              label={
                activeStagePendingReview
                  ? t("compliance.ai_review.pending")
                  : t("compliance.ai_review.none_pending")
              }
            />
            <p style={mutedTextStyle}>
              {t("compliance.ai_review.description", {
                stage: t(`compliance.ai_stage.${activeReviewStage}` as never),
              })}
            </p>
          </div>
          <button
            type="button"
            style={buttonStyle("primary")}
            disabled={saving || !activeStagePendingReview}
            onClick={() => void reviewAiOutput()}
          >
            {t("compliance.ai_review.action")}
          </button>
        </div>
      ) : null}

      <div style={fieldsGridStyle}>
        <label style={fieldStyle}>
          {t("compliance.engagement.classification")}
          <select
            style={inputStyle}
            value={draft.dataClassification}
            disabled={saving}
            onChange={(event) =>
              setDraft({
                ...draft,
                dataClassification: event.target.value as DataClassification,
              })
            }
          >
            {DATA_CLASSIFICATIONS.map((classification) => (
              <option key={classification} value={classification}>
                {t(`compliance.classification.${classification}` as never)}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          {t("compliance.engagement.consent")}
          <select
            style={inputStyle}
            value={draft.aiProcessingPermission}
            disabled={saving}
            onChange={(event) =>
              setDraft({
                ...draft,
                aiProcessingPermission: event.target
                  .value as EngagementAiProcessingPermission,
              })
            }
          >
            {AI_PROCESSING_PERMISSIONS.map((permission) => (
              <option key={permission} value={permission}>
                {t(`compliance.ai_processing_permission.${permission}` as never)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={fieldStyle}>
        {t("compliance.engagement.consent_notes")}
        <textarea
          style={textareaStyle}
          rows={2}
          disabled={saving}
          value={draft.aiProcessingPermissionNotes ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              aiProcessingPermissionNotes:
                event.target.value === "" ? null : event.target.value,
            })
          }
        />
      </label>

      <InlineAlert tone="info">
        {t("compliance.engagement.ai_permission_not_gdpr_consent")}
      </InlineAlert>

      <div style={fieldsGridStyle}>
        <label style={fieldStyle}>
          {t("compliance.engagement.processing_purpose")}
          <textarea
            style={textareaStyle}
            rows={3}
            disabled={saving}
            value={draft.privacyProcessing.processingPurpose ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                privacyProcessing: {
                  ...draft.privacyProcessing,
                  processingPurpose: emptyToNull(event.target.value),
                },
              })
            }
          />
        </label>
        <label style={fieldStyle}>
          {t("compliance.engagement.legal_basis")}
          <select
            style={inputStyle}
            value={draft.privacyProcessing.legalBasis}
            disabled={saving}
            onChange={(event) =>
              setDraft({
                ...draft,
                privacyProcessing: {
                  ...draft.privacyProcessing,
                  legalBasis: event.target.value as LegalBasis,
                },
              })
            }
          >
            {LEGAL_BASES.map((basis) => (
              <option key={basis} value={basis}>
                {t(`compliance.legal_basis.${basis}` as never)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={fieldStyle}>
        {t("compliance.engagement.legal_basis_note")}
        <textarea
          style={textareaStyle}
          rows={2}
          disabled={saving}
          value={draft.privacyProcessing.legalBasisNote ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              privacyProcessing: {
                ...draft.privacyProcessing,
                legalBasisNote: emptyToNull(event.target.value),
              },
            })
          }
        />
      </label>

      <div style={actionRowStyle}>
        <button
          type="button"
          style={buttonStyle("secondary")}
          disabled={saving}
          onClick={() => void savePrivacyProcessing()}
        >
          {t("compliance.engagement.privacy_save")}
        </button>
        <Badge
          tone={
            draft.privacyProcessing.legalBasis === "not_assessed"
              ? "warning"
              : "success"
          }
          label={t(
            `compliance.legal_basis.${draft.privacyProcessing.legalBasis}` as never,
          )}
        />
      </div>

      <div style={fieldsGridStyle}>
        <label style={fieldStyle}>
          {t("compliance.engagement.dpia_screening")}
          <select
            style={inputStyle}
            value={draft.dpiaScreening}
            disabled={saving}
            onChange={(event) =>
              setDraft({
                ...draft,
                dpiaScreening: event.target.value as EngagementDpiaScreening,
              })
            }
          >
            {DPIA_SCREENINGS.map((screening) => (
              <option key={screening} value={screening}>
                {t(`compliance.dpia_screening.${screening}` as never)}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          {t("compliance.engagement.dpia_note")}
          <textarea
            style={textareaStyle}
            rows={2}
            disabled={saving}
            value={draft.dpiaScreeningNote ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                dpiaScreeningNote: emptyToNull(event.target.value),
              })
            }
          />
        </label>
      </div>

      <div style={actionRowStyle}>
        <button
          type="button"
          style={buttonStyle("secondary")}
          disabled={saving}
          onClick={() => void saveDpiaScreening()}
        >
          {t("compliance.engagement.dpia_save")}
        </button>
      </div>

      <div style={fieldsGridStyle}>
        <div>
          <Badge
            tone={draft.activeConsent ? "success" : "warning"}
            label={
              draft.activeConsent
                ? t("compliance.engagement.consent_active")
                : t("compliance.engagement.consent_missing")
            }
          />
        </div>
        {draft.activeConsent ? (
          <button
            type="button"
            style={buttonStyle("secondary")}
            disabled={saving}
            onClick={() => void withdrawConsent(draft.activeConsent!.id)}
          >
            {t("compliance.engagement.consent_withdraw")}
          </button>
        ) : null}
      </div>

      {draft.privacyProcessing.legalBasis === "consent" ? (
        <div style={fieldsGridStyle}>
          <ConsentField
            labelKey="compliance.engagement.consent_subject"
            value={consentDraft.subjectName}
            disabled={saving}
            onChange={(subjectName) =>
              setConsentDraft((current) => ({ ...current, subjectName }))
            }
          />
          <ConsentField
            labelKey="compliance.engagement.consent_subject_role"
            value={consentDraft.subjectRole}
            disabled={saving}
            onChange={(subjectRole) =>
              setConsentDraft((current) => ({ ...current, subjectRole }))
            }
          />
          <ConsentField
            labelKey="compliance.engagement.consent_text_version"
            value={consentDraft.consentTextVersion}
            disabled={saving}
            onChange={(consentTextVersion) =>
              setConsentDraft((current) => ({ ...current, consentTextVersion }))
            }
          />
          <ConsentField
            labelKey="compliance.engagement.privacy_notice_version"
            value={consentDraft.privacyNoticeVersion}
            disabled={saving}
            onChange={(privacyNoticeVersion) =>
              setConsentDraft((current) => ({ ...current, privacyNoticeVersion }))
            }
          />
          <label style={fieldStyle}>
            {t("compliance.engagement.consent_text")}
            <textarea
              style={textareaStyle}
              rows={3}
              disabled={saving}
              value={consentDraft.consentText}
              onChange={(event) =>
                setConsentDraft((current) => ({
                  ...current,
                  consentText: event.target.value,
                }))
              }
            />
          </label>
          <label style={fieldStyle}>
            {t("compliance.engagement.consent_purpose")}
            <textarea
              style={textareaStyle}
              rows={2}
              disabled={saving}
              value={consentDraft.processingPurpose}
              onChange={(event) =>
                setConsentDraft((current) => ({
                  ...current,
                  processingPurpose: event.target.value,
                }))
              }
            />
          </label>
          <div style={actionRowStyle}>
            <button
              type="button"
              style={buttonStyle("secondary")}
              disabled={
                saving ||
                !consentDraft.subjectName.trim() ||
                !consentDraft.consentText.trim() ||
                !consentDraft.consentTextVersion.trim() ||
                !consentDraft.processingPurpose.trim()
              }
              onClick={() => void recordConsent()}
            >
              {t("compliance.engagement.consent_record")}
            </button>
          </div>
        </div>
      ) : null}

      <label style={checkboxFieldStyle}>
        <input
          type="checkbox"
          checked={draft.legalHold}
          disabled={saving}
          onChange={(event) =>
            setDraft({ ...draft, legalHold: event.target.checked })
          }
        />
        {t("compliance.engagement.legal_hold")}
      </label>

      {draft.legalHold ? (
        <label style={fieldStyle}>
          {t("compliance.engagement.legal_hold_reason")}
          <textarea
            style={textareaStyle}
            rows={2}
            disabled={saving}
            value={draft.legalHoldReason ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                legalHoldReason:
                  event.target.value === "" ? null : event.target.value,
              })
            }
          />
        </label>
      ) : null}

      <div style={actionRowStyle}>
        <Badge
          tone={draft.aiProcessingPermission === "allowed" ? "success" : "warning"}
          label={t(
            `compliance.ai_processing_permission.${draft.aiProcessingPermission}` as never,
          )}
        />
        <button
          type="button"
          style={buttonStyle("primary")}
          disabled={saving}
          onClick={() => void save()}
        >
          {t("compliance.engagement.save")}
        </button>
      </div>

      {saving ? <p style={mutedTextStyle}>{t("common.state.loading")}</p> : null}
    </section>
  )
}

function ConsentField({
  labelKey,
  value,
  disabled,
  onChange,
}: {
  labelKey: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label style={fieldStyle}>
      {t(labelKey as never)}
      <input
        style={inputStyle}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

const emptyToNull = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

const reviewBoxStyle: CSSProperties = {
  alignItems: "center",
  border: `1px solid ${uiColors.border}`,
  borderRadius: 8,
  display: "flex",
  gap: 16,
  justifyContent: "space-between",
  padding: 16,
}
