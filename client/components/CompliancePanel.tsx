"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"

import {
  Badge,
  InlineAlert,
  actionRowStyle,
  bodyTextStyle,
  buttonStyle,
  cardStyle,
  checkboxFieldStyle,
  fieldStyle,
  fieldsGridStyle,
  hintStyle,
  inputStyle,
  metaTextStyle,
  mutedTextStyle,
  pageStackStyle,
  sectionTitleStyle,
  subSectionTitleStyle,
} from "./UiKit"
import { signInPath } from "../lib/auth-redirect"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"
import {
  AI_MODEL_APPROVAL_STATUSES,
  DATA_CLASSIFICATIONS,
  DPA_STATUSES,
  PERSONAL_IDENTIFIER_KINDS,
  PROMPT_RETENTION_DECISIONS,
  TRAINING_USE_DECISIONS,
  WORKSPACE_DPIA_STATUSES,
} from "../lib/compliance-options"
import type { PreviewIdentifierRules } from "../lib/compliance-preview"
import { formatDateTime, t, translateServerMessage } from "../i18n"

import type {
  AiModelApprovalStatus,
  ComplianceDashboard,
  CompliancePolicy,
  DataClassification,
  DpaStatus,
  PersonalIdentifierKind,
  PersonalIdentifierRule,
  PromptRetentionDecision,
  RetentionPreview,
  RetentionResult,
  TrainingUseDecision,
  WorkspaceAiModelApproval,
  WorkspaceDpia,
  WorkspaceDpiaStatus,
} from "../../shared/compliance.schema"

// The workspace's Security, Privacy & AI Compliance surface (roadmap Phase 10):
// the Compliance Policy an administrator configures, and the Compliance
// Dashboard that reports what it produced.
//
// The panel renders what the backend holds and decides nothing itself: whether
// this caller may configure the policy is the server's answer, and a Manager who
// may only read it is shown the rules without the controls. Hiding the controls
// is a convenience — the server refuses the write regardless (architecture.md
// §7A.2).

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

type PolicyView = CompliancePolicy & { configuredAt: string | null }

type PolicyResponse = {
  status: boolean
  message?: string
  data?: { policy: PolicyView }
}

type DashboardResponse = {
  status: boolean
  message?: string
  data?: { dashboard: ComplianceDashboard }
}

type DpiaResponse = {
  status: boolean
  message?: string
  data?: { dpia: WorkspaceDpia }
}

type AiModelApprovalResponse = {
  status: boolean
  message?: string
  data?: { approval: WorkspaceAiModelApproval }
}

type AiModelApprovalsResponse = {
  status: boolean
  message?: string
  data?: { approvals: WorkspaceAiModelApproval[] }
}

type RetentionPreviewResponse = {
  status: boolean
  message?: string
  data?: { preview: RetentionPreview }
}

type RetentionResultResponse = {
  status: boolean
  message?: string
  data?: { result: RetentionResult }
}

type GenericResponse = {
  status: boolean
  message?: string
}

type ApprovalDraft = {
  provider: string
  model: string
  technologyProfileCode?: string | null
  status: AiModelApprovalStatus
  dpaStatus: DpaStatus
  dpaReference?: string | null
  processingRegion?: string | null
  promptRetention: PromptRetentionDecision
  trainingUse: TrainingUseDecision
  thirdCountryTransferMechanism?: string | null
}

const statStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: uiSpace.xs,
  padding: uiSpace.md,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.subtle,
}

const statValueStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  color: uiColors.textPrimary,
  lineHeight: 1.1,
}

export default function CompliancePanel() {
  const router = useRouter()
  const [policy, setPolicy] = useState<PolicyView | null>(null)
  const [dashboard, setDashboard] = useState<ComplianceDashboard | null>(null)
  const [dpia, setDpia] = useState<WorkspaceDpia | null>(null)
  const [approvals, setApprovals] = useState<WorkspaceAiModelApproval[]>([])
  const [retentionPreview, setRetentionPreview] =
    useState<RetentionPreview | null>(null)
  const [retentionResult, setRetentionResult] =
    useState<RetentionResult | null>(null)
  const [canConfigure, setCanConfigure] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function refused(status: number) {
    if (status === 401) {
      router.replace(signInPath("/compliance"))
      return true
    }

    if (status === 403) {
      setAccessDenied(true)
      return true
    }

    return false
  }

  async function load() {
    setLoading(true)
    setError("")

    try {
      const response = await fetch(`${API_BASE_URL}/compliance/policy`, {
        credentials: "include",
      })

      if (refused(response.status)) return

      const result = (await response.json()) as PolicyResponse
      if (!response.ok || !result.data) {
        setError(translateServerMessage(result.message, undefined, "compliance.load_failed"))
        return
      }

      setPolicy(result.data.policy)

      // The dashboard is the Administrator's. A Manager reads the policy and is
      // simply not offered the workspace-wide figures — the server refuses them
      // either way.
      const dashboardResponse = await fetch(
        `${API_BASE_URL}/compliance/dashboard`,
        { credentials: "include" },
      )

      if (dashboardResponse.ok) {
        const dashboardResult =
          (await dashboardResponse.json()) as DashboardResponse
        setDashboard(dashboardResult.data?.dashboard ?? null)
        setCanConfigure(true)
      }

      const [dpiaResponse, approvalsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/compliance/dpia`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/compliance/ai-model-approvals`, {
          credentials: "include",
        }),
      ])

      if (dpiaResponse.ok) {
        const dpiaResult = (await dpiaResponse.json()) as DpiaResponse
        setDpia(dpiaResult.data?.dpia ?? null)
      }

      if (approvalsResponse.ok) {
        const approvalsResult =
          (await approvalsResponse.json()) as AiModelApprovalsResponse
        setApprovals(approvalsResult.data?.approvals ?? [])
      }
    } catch {
      setError(t("compliance.load_failed"))
    } finally {
      setLoading(false)
    }
  }

  async function save(update: Partial<CompliancePolicy>) {
    setSaving(true)
    setError("")
    setNotice("")

    try {
      const response = await fetch(`${API_BASE_URL}/compliance/policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(update),
      })

      if (refused(response.status)) return

      const result = (await response.json()) as PolicyResponse
      if (!response.ok || !result.data) {
        setError(
          translateServerMessage(result.message, undefined, "compliance.save_failed"),
        )
        return
      }

      setPolicy(result.data.policy)
      setNotice(translateServerMessage(result.message, undefined, "compliance.save_failed"))
      void load()
    } catch {
      setError(t("compliance.save_failed"))
    } finally {
      setSaving(false)
    }
  }

  async function saveDpia(update: Partial<WorkspaceDpia>) {
    await postJson<DpiaResponse>("/compliance/dpia", "PATCH", update, (result) => {
      if (result.data) setDpia(result.data.dpia)
      setNotice(translateServerMessage(result.message, undefined, "compliance.save_failed"))
    })
  }

  async function saveApproval(input: ApprovalDraft) {
    await postJson<AiModelApprovalResponse>(
      "/compliance/ai-model-approvals",
      "POST",
      input,
      (result) => {
        if (result.data) {
          setApprovals((current) => [
            result.data!.approval,
            ...current.filter((item) => item.id !== result.data!.approval.id),
          ])
        }
        setNotice(translateServerMessage(result.message, undefined, "compliance.save_failed"))
        void load()
      },
    )
  }

  async function revokeApproval(approvalId: string) {
    await postJson<AiModelApprovalResponse>(
      `/compliance/ai-model-approvals/${approvalId}/revoke`,
      "POST",
      {},
      (result) => {
        if (result.data) {
          setApprovals((current) =>
            current.map((item) =>
              item.id === result.data!.approval.id ? result.data!.approval : item,
            ),
          )
        }
        setNotice(translateServerMessage(result.message, undefined, "compliance.save_failed"))
        void load()
      },
    )
  }

  async function loadRetentionPreview() {
    await postJson<RetentionPreviewResponse>(
      "/compliance/retention/preview",
      "GET",
      null,
      (result) => {
        setRetentionPreview(result.data?.preview ?? null)
        setNotice(translateServerMessage(result.message, undefined, "compliance.save_failed"))
      },
    )
  }

  async function executeRetentionAction(categories: string[]) {
    await postJson<RetentionResultResponse>(
      "/compliance/retention/execute",
      "POST",
      {
        categories,
        confirm: "execute_retention",
        requestKey: `retention-${Date.now()}`,
      },
      (result) => {
        setRetentionResult(result.data?.result ?? null)
        setNotice(translateServerMessage(result.message, undefined, "compliance.save_failed"))
        void load()
      },
    )
  }

  async function exportEngagementData(engagementId: string) {
    await postJson<{ status: boolean; message?: string; data?: { export: unknown } }>(
      `/compliance/engagements/${engagementId}/export`,
      "POST",
      {},
      (result) => {
        const size = result.data?.export
          ? JSON.stringify(result.data.export).length
          : 0
        setNotice(t("compliance.data_subject.export_ready", { size }))
      },
    )
  }

  async function eraseEngagementData(engagementId: string, reasonCode: string) {
    await postJson<GenericResponse>(
      `/compliance/engagements/${engagementId}/erasure`,
      "POST",
      { confirmEngagementId: engagementId, reasonCode },
      (result) => {
        setNotice(translateServerMessage(result.message, undefined, "compliance.save_failed"))
        void load()
      },
    )
  }

  const previewIdentifierRules: PreviewIdentifierRules = async (
    text: string,
    rules: PersonalIdentifierRule[],
  ) => {
    const result = await postJson<{ status: boolean; message?: string; data?: { matches: { kind: PersonalIdentifierKind; count: number }[] } }>(
      "/compliance/identifier-rules/preview",
      "POST",
      { text, rules },
    )

    return result?.data?.matches ?? []
  }

  async function postJson<TResponse extends { status: boolean; message?: string }>(
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    body: unknown,
    onSuccess?: (result: TResponse) => void,
  ): Promise<TResponse | null> {
    setSaving(true)
    setError("")
    setNotice("")

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: body === null ? undefined : { "Content-Type": "application/json" },
        credentials: "include",
        body: body === null ? undefined : JSON.stringify(body),
      })

      if (refused(response.status)) return null

      const result = (await response.json()) as TResponse
      if (!response.ok) {
        setError(
          translateServerMessage(result.message, undefined, "compliance.save_failed"),
        )
        return null
      }

      onSuccess?.(result)
      return result
    } catch {
      setError(t("compliance.save_failed"))
      return null
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p style={mutedTextStyle}>{t("common.state.loading")}</p>

  if (accessDenied) {
    return <InlineAlert tone="warning">{t("compliance.access_denied")}</InlineAlert>
  }

  if (!policy) {
    return <InlineAlert tone="danger">{error || t("compliance.load_failed")}</InlineAlert>
  }

  return (
    <div style={pageStackStyle}>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {notice ? <InlineAlert tone="success">{notice}</InlineAlert> : null}

      {dashboard ? <Dashboard dashboard={dashboard} /> : null}

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t("compliance.policy.title")}</h2>
        <p style={metaTextStyle}>
          {policy.configuredAt === null
            ? t("compliance.policy.never_configured")
            : t("compliance.policy.configured_at", {
                value: formatDateTime(policy.configuredAt),
              })}
        </p>
        {canConfigure ? null : (
          <p style={mutedTextStyle}>{t("compliance.policy.read_only")}</p>
        )}

        <PolicyForm
          key={`${policy.configuredAt ?? "unconfigured"}:${policy.redactPersonalDataBeforeAi ? "redact" : "plain"}`}
          policy={policy}
          disabled={!canConfigure || saving}
          onSave={save}
          onPreviewIdentifierRules={previewIdentifierRules}
        />
      </section>

      {canConfigure ? (
        <>
          {dpia ? (
            <WorkspaceDpiaForm dpia={dpia} disabled={saving} onSave={saveDpia} />
          ) : null}
          <ModelApprovalPanel
            approvals={approvals}
            disabled={saving}
            onSave={saveApproval}
            onRevoke={revokeApproval}
          />
          <RetentionPanel
            preview={retentionPreview}
            result={retentionResult}
            disabled={saving}
            onPreview={loadRetentionPreview}
            onExecute={executeRetentionAction}
          />
          <DataSubjectPanel
            disabled={saving}
            onExport={exportEngagementData}
            onErase={eraseEngagementData}
          />
        </>
      ) : null}
    </div>
  )
}

function Dashboard({ dashboard }: { dashboard: ComplianceDashboard }) {
  const stats: [string, number][] = [
    ["compliance.dashboard.confidential", dashboard.confidentialEngagements],
    ["compliance.dashboard.ai_restricted", dashboard.aiRestrictedEngagements],
    ["compliance.dashboard.legal_hold", dashboard.engagementsUnderLegalHold],
    ["compliance.dashboard.denied_ai", dashboard.deniedAiRequests],
    [
      "compliance.dashboard.pii_redaction_failures",
      dashboard.piiRedactionFailures,
    ],
    [
      "compliance.dashboard.denied_permissions",
      dashboard.deniedPermissionAttempts,
    ],
    [
      "compliance.dashboard.awaiting_review",
      dashboard.analysisRunsAwaitingHumanReview,
    ],
    [
      "compliance.dashboard.ai_outputs_with_personal_data",
      dashboard.aiOutputsWithPersonalData,
    ],
    [
      "compliance.dashboard.without_legal_basis",
      dashboard.engagementsWithoutLegalBasis,
    ],
    [
      "compliance.dashboard.withdrawn_consent",
      dashboard.engagementsWithWithdrawnConsent,
    ],
    [
      "compliance.dashboard.dpia_screening",
      dashboard.engagementsAwaitingDpiaScreening,
    ],
    [
      "compliance.dashboard.model_review",
      dashboard.aiModelApprovalsNeedingReview,
    ],
  ]

  const retention: [string, number][] = [
    [
      "compliance.dashboard.retention.engagements",
      dashboard.retention.engagementsPastRetention,
    ],
    [
      "compliance.dashboard.retention.documents",
      dashboard.retention.documentsPastRetention,
    ],
    [
      "compliance.dashboard.retention.audit",
      dashboard.retention.auditEntriesPastRetention,
    ],
    [
      "compliance.dashboard.retention.ai",
      dashboard.retention.aiArtifactsPastRetention,
    ],
  ]

  return (
    <section style={cardStyle}>
      <h2 style={sectionTitleStyle}>{t("compliance.dashboard.title")}</h2>

      <div style={fieldsGridStyle}>
        {stats.map(([key, value]) => (
          <div key={key} style={statStyle}>
            <span style={statValueStyle}>{value}</span>
            <span style={metaTextStyle}>{t(key as never)}</span>
          </div>
        ))}
      </div>

      <h3 style={subSectionTitleStyle}>
        {t("compliance.dashboard.by_classification")}
      </h3>
      <div style={actionRowStyle}>
        {DATA_CLASSIFICATIONS.map((classification) => (
          <Badge
            key={classification}
            tone="neutral"
            label={t("compliance.dashboard.classification_count", {
              label: t(`compliance.classification.${classification}` as never),
              count: dashboard.engagementsByClassification[classification] ?? 0,
            })}
          />
        ))}
      </div>

      <h3 style={subSectionTitleStyle}>
        {t("compliance.dashboard.retention.title")}
      </h3>
      <div style={fieldsGridStyle}>
        {retention.map(([key, value]) => (
          <div key={key} style={statStyle}>
            <span style={statValueStyle}>{value}</span>
            <span style={metaTextStyle}>{t(key as never)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function PolicyForm({
  policy,
  disabled,
  onSave,
  onPreviewIdentifierRules,
}: {
  policy: CompliancePolicy
  disabled: boolean
  onSave: (update: Partial<CompliancePolicy>) => void
  onPreviewIdentifierRules: PreviewIdentifierRules
}) {
  // The draft starts from the stored policy. When a save reloads it, the parent
  // re-keys this form on the reloaded policy, so a fresh draft is a remount
  // rather than an effect that writes state during render.
  const [draft, setDraft] = useState(policy)
  const [ruleDraft, setRuleDraft] = useState<PersonalIdentifierRule>({
    label: "",
    kind: "custom",
    match: "literal",
    value: "",
  })
  const [previewText, setPreviewText] = useState("")
  const [previewMatches, setPreviewMatches] = useState<
    { kind: PersonalIdentifierKind; count: number }[]
  >([])

  const set = <K extends keyof CompliancePolicy>(
    key: K,
    value: CompliancePolicy[K],
  ) => setDraft((current) => ({ ...current, [key]: value }))

  return (
    <div style={pageStackStyle}>
      <h3 style={subSectionTitleStyle}>{t("compliance.policy.section.data")}</h3>
      <div style={fieldsGridStyle}>
        <label style={fieldStyle}>
          {t("compliance.policy.default_classification")}
          <select
            style={inputStyle}
            disabled={disabled}
            value={draft.defaultDataClassification}
            onChange={(event) =>
              set(
                "defaultDataClassification",
                event.target.value as DataClassification,
              )
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
          {t("compliance.policy.download_ttl")}
          <input
            style={inputStyle}
            type="number"
            min={1}
            max={1440}
            disabled={disabled}
            value={draft.documentDownloadLinkTtlMinutes}
            onChange={(event) =>
              set(
                "documentDownloadLinkTtlMinutes",
                Number(event.target.value) || 1,
              )
            }
          />
        </label>
      </div>

      <Toggle
        labelKey="compliance.policy.export_permitted"
        disabled={disabled}
        checked={draft.clientDataExportPermitted}
        onChange={(value) => set("clientDataExportPermitted", value)}
      />
      <Toggle
        labelKey="compliance.policy.encrypt_at_rest"
        disabled={disabled}
        checked={draft.encryptDocumentsAtRest}
        onChange={(value) => set("encryptDocumentsAtRest", value)}
      />
      <Toggle
        labelKey="compliance.policy.require_https"
        disabled={disabled}
        checked={draft.requireEncryptedTransport}
        onChange={(value) => set("requireEncryptedTransport", value)}
      />

      <h3 style={subSectionTitleStyle}>{t("compliance.policy.section.ai")}</h3>
      <Toggle
        labelKey="compliance.policy.ai_permitted"
        disabled={disabled}
        checked={draft.aiProcessingPermitted}
        onChange={(value) => set("aiProcessingPermitted", value)}
      />
      <Toggle
        labelKey="compliance.policy.confidential_ai"
        disabled={disabled}
        checked={draft.confidentialAiProcessingPermitted}
        onChange={(value) => set("confidentialAiProcessingPermitted", value)}
      />
      <Toggle
        labelKey="compliance.policy.redact_personal_data"
        disabled={disabled}
        checked={draft.redactPersonalDataBeforeAi}
        onChange={(value) => set("redactPersonalDataBeforeAi", value)}
      />
      <Toggle
        labelKey="compliance.policy.human_approval"
        disabled={disabled}
        checked={draft.humanApprovalRequiredForAiOutput}
        onChange={(value) => set("humanApprovalRequiredForAiOutput", value)}
      />

      <h3 style={subSectionTitleStyle}>
        {t("compliance.policy.section.retention")}
      </h3>
      <p style={hintStyle}>{t("compliance.policy.retention_hint")}</p>
      <div style={fieldsGridStyle}>
        <RetentionField
          labelKey="compliance.policy.retention_engagements"
          disabled={disabled}
          value={draft.engagementRetentionDays}
          onChange={(value) => set("engagementRetentionDays", value)}
        />
        <RetentionField
          labelKey="compliance.policy.retention_documents"
          disabled={disabled}
          value={draft.documentRetentionDays}
          onChange={(value) => set("documentRetentionDays", value)}
        />
        <RetentionField
          labelKey="compliance.policy.retention_audit"
          disabled={disabled}
          value={draft.auditRetentionDays}
          onChange={(value) => set("auditRetentionDays", value)}
        />
        <RetentionField
          labelKey="compliance.policy.retention_ai"
          disabled={disabled}
          value={draft.aiArtifactRetentionDays}
          onChange={(value) => set("aiArtifactRetentionDays", value)}
        />
      </div>

      <h3 style={subSectionTitleStyle}>
        {t("compliance.policy.section.rules")}
      </h3>
      <p style={bodyTextStyle}>{t("compliance.policy.frameworks")}</p>
      <div style={actionRowStyle}>
        {draft.regulatoryFrameworks.map((framework) => (
          <Badge
            key={framework.code}
            tone={framework.enabled ? "success" : "neutral"}
            label={framework.code}
          />
        ))}
      </div>

      <p style={bodyTextStyle}>{t("compliance.policy.identifier_rules")}</p>
      {draft.personalIdentifierRules.length === 0 ? (
        <p style={mutedTextStyle}>
          {t("compliance.policy.identifier_rules.empty")}
        </p>
      ) : (
        <div style={pageStackStyle}>
          {draft.personalIdentifierRules.map((rule, index) => (
            <div key={`${rule.kind}-${rule.label}-${index}`} style={actionRowStyle}>
              <Badge tone="info" label={rule.label} />
              <span style={metaTextStyle}>
                {t(`compliance.identifier_kind.${rule.kind}` as never)} ·{" "}
                {t(`compliance.identifier_match.${rule.match}` as never)}
              </span>
              {disabled ? null : (
                <button
                  type="button"
                  style={buttonStyle("secondary")}
                  onClick={() =>
                    set(
                      "personalIdentifierRules",
                      draft.personalIdentifierRules.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  {t("compliance.policy.identifier_rule.remove")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {disabled ? null : (
        <div style={pageStackStyle}>
          <div style={fieldsGridStyle}>
            <label style={fieldStyle}>
              {t("compliance.policy.identifier_rule.label")}
              <input
                style={inputStyle}
                value={ruleDraft.label}
                onChange={(event) =>
                  setRuleDraft((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
              />
            </label>
            <label style={fieldStyle}>
              {t("compliance.policy.identifier_rule.kind")}
              <select
                style={inputStyle}
                value={ruleDraft.kind}
                onChange={(event) =>
                  setRuleDraft((current) => ({
                    ...current,
                    kind: event.target.value as PersonalIdentifierKind,
                  }))
                }
              >
                {PERSONAL_IDENTIFIER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`compliance.identifier_kind.${kind}` as never)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              {t("compliance.policy.identifier_rule.match")}
              <select
                style={inputStyle}
                value={ruleDraft.match}
                onChange={(event) =>
                  setRuleDraft((current) => ({
                    ...current,
                    match: event.target.value as PersonalIdentifierRule["match"],
                  }))
                }
              >
                {(["literal", "pattern"] as const).map((match) => (
                  <option key={match} value={match}>
                    {t(`compliance.identifier_match.${match}` as never)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              {t("compliance.policy.identifier_rule.value")}
              <input
                style={inputStyle}
                value={ruleDraft.value}
                onChange={(event) =>
                  setRuleDraft((current) => ({
                    ...current,
                    value: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div style={actionRowStyle}>
            <button
              type="button"
              style={buttonStyle("secondary")}
              onClick={() => {
                if (!ruleDraft.label.trim() || !ruleDraft.value.trim()) return
                set("personalIdentifierRules", [
                  ...draft.personalIdentifierRules,
                  {
                    ...ruleDraft,
                    label: ruleDraft.label.trim(),
                    value: ruleDraft.value.trim(),
                  },
                ])
                setRuleDraft({
                  label: "",
                  kind: "custom",
                  match: "literal",
                  value: "",
                })
              }}
            >
              {t("compliance.policy.identifier_rule.add")}
            </button>
          </div>
          <label style={fieldStyle}>
            {t("compliance.policy.identifier_preview.text")}
            <textarea
              style={inputStyle}
              rows={3}
              value={previewText}
              onChange={(event) => setPreviewText(event.target.value)}
            />
          </label>
          <div style={actionRowStyle}>
            <button
              type="button"
              style={buttonStyle("secondary")}
              onClick={async () => {
                const matches = await onPreviewIdentifierRules(
                  previewText,
                  draft.personalIdentifierRules,
                )
                setPreviewMatches(matches)
              }}
            >
              {t("compliance.policy.identifier_preview.run")}
            </button>
            {previewMatches.length === 0 ? (
              <span style={mutedTextStyle}>
                {t("compliance.policy.identifier_preview.empty")}
              </span>
            ) : (
              previewMatches.map((match) => (
                <Badge
                  key={match.kind}
                  tone="neutral"
                  label={t("compliance.policy.identifier_preview.match", {
                    kind: t(`compliance.identifier_kind.${match.kind}` as never),
                    count: match.count,
                  })}
                />
              ))
            )}
          </div>
        </div>
      )}

      {disabled ? null : (
        <div style={actionRowStyle}>
          <button
            type="button"
            style={buttonStyle("primary")}
            onClick={() => onSave(draft)}
          >
            {t("compliance.policy.save")}
          </button>
        </div>
      )}
    </div>
  )
}

function WorkspaceDpiaForm({
  dpia,
  disabled,
  onSave,
}: {
  dpia: WorkspaceDpia
  disabled: boolean
  onSave: (update: Partial<WorkspaceDpia>) => void
}) {
  const [draft, setDraft] = useState(dpia)

  return (
    <section style={cardStyle}>
      <h2 style={sectionTitleStyle}>{t("compliance.dpia.title")}</h2>
      <div style={fieldsGridStyle}>
        <label style={fieldStyle}>
          {t("compliance.dpia.status")}
          <select
            style={inputStyle}
            disabled={disabled}
            value={draft.status}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as WorkspaceDpiaStatus,
              }))
            }
          >
            {WORKSPACE_DPIA_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`compliance.workspace_dpia.${status}` as never)}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          {t("compliance.dpia.review_due")}
          <input
            style={inputStyle}
            type="datetime-local"
            disabled={disabled}
            value={toDatetimeLocal(draft.reviewDueAt)}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                reviewDueAt: fromDatetimeLocal(event.target.value),
              }))
            }
          />
        </label>
      </div>
      <label style={fieldStyle}>
        {t("compliance.dpia.scope")}
        <textarea
          style={inputStyle}
          rows={3}
          disabled={disabled}
          value={draft.scope ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              scope: emptyToNull(event.target.value),
            }))
          }
        />
      </label>
      <label style={fieldStyle}>
        {t("compliance.dpia.rationale")}
        <textarea
          style={inputStyle}
          rows={3}
          disabled={disabled}
          value={draft.rationale ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              rationale: emptyToNull(event.target.value),
            }))
          }
        />
      </label>
      <label style={fieldStyle}>
        {t("compliance.dpia.document_reference")}
        <input
          style={inputStyle}
          disabled={disabled}
          value={draft.documentReference ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              documentReference: emptyToNull(event.target.value),
            }))
          }
        />
      </label>
      <div style={actionRowStyle}>
        <button
          type="button"
          style={buttonStyle("primary")}
          disabled={disabled}
          onClick={() => onSave(draft)}
        >
          {t("compliance.dpia.save")}
        </button>
      </div>
    </section>
  )
}

function ModelApprovalPanel({
  approvals,
  disabled,
  onSave,
  onRevoke,
}: {
  approvals: WorkspaceAiModelApproval[]
  disabled: boolean
  onSave: (input: ApprovalDraft) => void
  onRevoke: (approvalId: string) => void
}) {
  const [draft, setDraft] = useState<ApprovalDraft>({
    provider: "",
    model: "",
    technologyProfileCode: null,
    status: "needs_review",
    dpaStatus: "not_assessed",
    dpaReference: null,
    processingRegion: null,
    promptRetention: "retained_unknown",
    trainingUse: "unknown",
    thirdCountryTransferMechanism: null,
  })

  return (
    <section style={cardStyle}>
      <h2 style={sectionTitleStyle}>{t("compliance.model.title")}</h2>
      {approvals.length === 0 ? (
        <p style={mutedTextStyle}>{t("compliance.model.empty")}</p>
      ) : (
        <div style={pageStackStyle}>
          {approvals.map((approval) => (
            <div key={approval.id} style={statStyle}>
              <strong>
                {approval.provider} / {approval.model}
              </strong>
              <span style={metaTextStyle}>
                {t(`compliance.model.status.${approval.status}` as never)}
                {approval.technologyProfileCode
                  ? ` · ${approval.technologyProfileCode}`
                  : ""}
              </span>
              <div style={actionRowStyle}>
                <button
                  type="button"
                  style={buttonStyle("secondary")}
                  disabled={disabled}
                  onClick={() =>
                    setDraft({
                      provider: approval.provider,
                      model: approval.model,
                      technologyProfileCode: approval.technologyProfileCode,
                      status: "approved",
                      dpaStatus: approval.dpaStatus,
                      dpaReference: approval.dpaReference,
                      processingRegion: approval.processingRegion,
                      promptRetention: approval.promptRetention,
                      trainingUse: approval.trainingUse,
                      thirdCountryTransferMechanism:
                        approval.thirdCountryTransferMechanism,
                    })
                  }
                >
                  {t("compliance.model.review")}
                </button>
                <button
                  type="button"
                  style={buttonStyle("secondary")}
                  disabled={disabled}
                  onClick={() => onRevoke(approval.id)}
                >
                  {t("compliance.model.revoke")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={fieldsGridStyle}>
        <TextField
          labelKey="compliance.model.provider"
          value={draft.provider}
          disabled={disabled}
          onChange={(provider) => setDraft((current) => ({ ...current, provider }))}
        />
        <TextField
          labelKey="compliance.model.model"
          value={draft.model}
          disabled={disabled}
          onChange={(model) => setDraft((current) => ({ ...current, model }))}
        />
        <TextField
          labelKey="compliance.model.profile"
          value={draft.technologyProfileCode ?? ""}
          disabled={disabled}
          onChange={(technologyProfileCode) =>
            setDraft((current) => ({
              ...current,
              technologyProfileCode: emptyToNull(technologyProfileCode),
            }))
          }
        />
        <SelectField
          labelKey="compliance.model.status"
          value={draft.status}
          disabled={disabled}
          values={AI_MODEL_APPROVAL_STATUSES}
          labelPrefix="compliance.model.status"
          onChange={(status) =>
            setDraft((current) => ({
              ...current,
              status: status as AiModelApprovalStatus,
            }))
          }
        />
        <SelectField
          labelKey="compliance.model.dpa_status"
          value={draft.dpaStatus}
          disabled={disabled}
          values={DPA_STATUSES}
          labelPrefix="compliance.model.dpa"
          onChange={(dpaStatus) =>
            setDraft((current) => ({ ...current, dpaStatus: dpaStatus as DpaStatus }))
          }
        />
        <TextField
          labelKey="compliance.model.dpa_reference"
          value={draft.dpaReference ?? ""}
          disabled={disabled}
          onChange={(dpaReference) =>
            setDraft((current) => ({
              ...current,
              dpaReference: emptyToNull(dpaReference),
            }))
          }
        />
        <TextField
          labelKey="compliance.model.region"
          value={draft.processingRegion ?? ""}
          disabled={disabled}
          onChange={(processingRegion) =>
            setDraft((current) => ({
              ...current,
              processingRegion: emptyToNull(processingRegion),
            }))
          }
        />
        <SelectField
          labelKey="compliance.model.retention"
          value={draft.promptRetention}
          disabled={disabled}
          values={PROMPT_RETENTION_DECISIONS}
          labelPrefix="compliance.model.retention"
          onChange={(promptRetention) =>
            setDraft((current) => ({
              ...current,
              promptRetention: promptRetention as PromptRetentionDecision,
            }))
          }
        />
        <SelectField
          labelKey="compliance.model.training"
          value={draft.trainingUse}
          disabled={disabled}
          values={TRAINING_USE_DECISIONS}
          labelPrefix="compliance.model.training"
          onChange={(trainingUse) =>
            setDraft((current) => ({
              ...current,
              trainingUse: trainingUse as TrainingUseDecision,
            }))
          }
        />
        <TextField
          labelKey="compliance.model.transfer"
          value={draft.thirdCountryTransferMechanism ?? ""}
          disabled={disabled}
          onChange={(thirdCountryTransferMechanism) =>
            setDraft((current) => ({
              ...current,
              thirdCountryTransferMechanism: emptyToNull(
                thirdCountryTransferMechanism,
              ),
            }))
          }
        />
      </div>
      <div style={actionRowStyle}>
        <button
          type="button"
          style={buttonStyle("primary")}
          disabled={disabled || !draft.provider.trim() || !draft.model.trim()}
          onClick={() => onSave(draft)}
        >
          {t("compliance.model.save")}
        </button>
      </div>
    </section>
  )
}

function RetentionPanel({
  preview,
  result,
  disabled,
  onPreview,
  onExecute,
}: {
  preview: RetentionPreview | null
  result: RetentionResult | null
  disabled: boolean
  onPreview: () => void
  onExecute: (categories: string[]) => void
}) {
  const executableCategories =
    preview?.entries
      .filter((entry) => entry.executable && entry.dueCount > 0)
      .map((entry) => entry.category) ?? []

  return (
    <section style={cardStyle}>
      <h2 style={sectionTitleStyle}>{t("compliance.retention.title")}</h2>
      <p style={mutedTextStyle}>
        {t("compliance.retention.confirmation_hint")}
      </p>
      <div style={actionRowStyle}>
        <button
          type="button"
          style={buttonStyle("secondary")}
          disabled={disabled}
          onClick={onPreview}
        >
          {t("compliance.retention.preview")}
        </button>
        <button
          type="button"
          style={buttonStyle("primary")}
          disabled={disabled || executableCategories.length === 0}
          onClick={() => onExecute(executableCategories)}
        >
          {t("compliance.retention.execute")}
        </button>
      </div>
      {preview ? (
        <RetentionEntries entries={preview.entries} />
      ) : (
        <p style={mutedTextStyle}>{t("compliance.retention.empty")}</p>
      )}
      {result ? <RetentionEntries entries={result.entries} /> : null}
    </section>
  )
}

function RetentionEntries({
  entries,
}: {
  entries: {
    category: string
    dueCount?: number
    deletedCount?: number
    excludedByLegalHold: number
    reported?: boolean
    executable?: boolean
    success?: boolean
    skippedCount?: number
    error?: { errorName: string; errorCode: string | null } | null
  }[]
}) {
  return (
    <div style={fieldsGridStyle}>
      {entries.map((entry) => (
        <div key={entry.category} style={statStyle}>
          <strong>{t(`compliance.retention.category.${entry.category}` as never)}</strong>
          <span style={metaTextStyle}>
            {t("compliance.retention.entry", {
              count: entry.deletedCount ?? entry.dueCount ?? 0,
              held: entry.excludedByLegalHold,
            })}
          </span>
          {entry.success === false ? (
            <span style={metaTextStyle}>
              {t("compliance.retention.entry_failed", {
                errorName: entry.error?.errorName ?? "unrecognized",
                errorCode: entry.error?.errorCode ?? "-",
              })}
            </span>
          ) : null}
          {entry.skippedCount !== undefined && entry.skippedCount > 0 ? (
            <span style={metaTextStyle}>
              {t("compliance.retention.entry_skipped", {
                count: entry.skippedCount,
              })}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function DataSubjectPanel({
  disabled,
  onExport,
  onErase,
}: {
  disabled: boolean
  onExport: (engagementId: string) => void
  onErase: (engagementId: string, reasonCode: string) => void
}) {
  const [engagementId, setEngagementId] = useState("")
  const [confirm, setConfirm] = useState("")
  const [reasonCode, setReasonCode] = useState("client_request")

  return (
    <section style={cardStyle}>
      <h2 style={sectionTitleStyle}>{t("compliance.data_subject.title")}</h2>
      <p style={hintStyle}>{t("compliance.data_subject.scope")}</p>
      <label style={fieldStyle}>
        {t("compliance.data_subject.engagement_id")}
        <input
          style={inputStyle}
          disabled={disabled}
          value={engagementId}
          onChange={(event) => setEngagementId(event.target.value)}
        />
      </label>
      <div style={actionRowStyle}>
        <button
          type="button"
          style={buttonStyle("secondary")}
          disabled={disabled || !engagementId.trim()}
          onClick={() => onExport(engagementId.trim())}
        >
          {t("compliance.data_subject.export")}
        </button>
      </div>
      <div style={fieldsGridStyle}>
        <label style={fieldStyle}>
          {t("compliance.data_subject.reason_code")}
          <select
            style={inputStyle}
            disabled={disabled}
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value)}
          >
            {(["client_request", "retention_follow_up", "admin_correction"] as const).map(
              (reason) => (
                <option key={reason} value={reason}>
                  {t(`compliance.erasure_reason.${reason}` as never)}
                </option>
              ),
            )}
          </select>
        </label>
        <label style={fieldStyle}>
          {t("compliance.data_subject.confirm")}
          <input
            style={inputStyle}
            disabled={disabled}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
      </div>
      <div style={actionRowStyle}>
        <button
          type="button"
          style={buttonStyle("danger")}
          disabled={
            disabled ||
            !engagementId.trim() ||
            confirm.trim() !== engagementId.trim()
          }
          onClick={() => onErase(engagementId.trim(), reasonCode)}
        >
          {t("compliance.data_subject.erase")}
        </button>
      </div>
    </section>
  )
}

function TextField({
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

function SelectField({
  labelKey,
  value,
  values,
  labelPrefix,
  disabled,
  onChange,
}: {
  labelKey: string
  value: string
  values: readonly string[]
  labelPrefix: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label style={fieldStyle}>
      {t(labelKey as never)}
      <select
        style={inputStyle}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {t(`${labelPrefix}.${item}` as never)}
          </option>
        ))}
      </select>
    </label>
  )
}

function Toggle({
  labelKey,
  checked,
  disabled,
  onChange,
}: {
  labelKey: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label style={checkboxFieldStyle}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {t(labelKey as never)}
    </label>
  )
}

function RetentionField({
  labelKey,
  value,
  disabled,
  onChange,
}: {
  labelKey: string
  value: number | null
  disabled: boolean
  onChange: (value: number | null) => void
}) {
  return (
    <label style={fieldStyle}>
      {t(labelKey as never)}
      <input
        style={inputStyle}
        type="number"
        min={1}
        max={36500}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
      />
    </label>
  )
}

const emptyToNull = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

const toDatetimeLocal = (value: string | null): string =>
  value === null ? "" : value.slice(0, 16)

const fromDatetimeLocal = (value: string): string | null =>
  value === "" ? null : new Date(value).toISOString()
