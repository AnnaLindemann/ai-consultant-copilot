"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"

import { formatDateTime, t, translateServerMessage } from "../i18n"
import type { MessageKey } from "../i18n/de"
import type { AnalysisReport } from "../../shared/analysis-report.schema"
import AnalysisReportView from "../components/AnalysisReportView"
import ManagerShell from "../components/ManagerShell"
import {
  Badge,
  EmptyState,
  InlineAlert,
  bodyTextStyle,
  buttonStyle,
  cardStyle,
  checkboxFieldStyle,
  fieldStyle,
  fieldsGridStyle,
  inputStyle,
  metaTextStyle,
  mutedTextStyle,
  nestedBlockStyle,
  pageStackStyle,
  rowStyle,
  sectionTitleStyle,
  textareaStyle,
} from "../components/UiKit"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"
import { stageLabel, type EngagementStage } from "../lib/engagement-stage"

// Opening an engagement: one process on one page, in the order it actually
// happens. It used to be three cards of three widths in two columns, which
// hid the fact that step 2 cannot start before step 1 has produced an
// organization. Each step now states what it is waiting for, and the controls
// of a step that is not reachable yet are genuinely disabled rather than merely
// dimmed.

type AnalysisRun = {
  id: string
  provider: string
  model: string
  promptVersion: string
  promptFingerprint: string
  latencyMs: number | null
  totalTokens: number | null
  costEstimateUsd: string | null
  jsonParseSuccess: boolean
  schemaValid: boolean
  createdAt: string
}

type AnalyzeResponse = {
  status: boolean
  message: string
  data?: {
    report?: AnalysisReport
    evaluation?: unknown
  }
}

type OrganizationFormState = {
  name: string
  industry: string
  companySize: string
}

type EngagementFormState = {
  title: string
  statedProblem: string
  currentProcess: string
  desiredOutcome: string
  sensitiveData: boolean
  gdprConcerns: boolean
}

const initialOrganizationForm: OrganizationFormState = {
  name: "",
  industry: "",
  companySize: "",
}

const initialEngagementForm: EngagementFormState = {
  title: "",
  statedProblem: "",
  currentProcess: "",
  desiredOutcome: "",
  sensitiveData: false,
  gdprConcerns: true,
}

// The Organization's size band. These are the backend's own enum values and
// travel as they are; only their labels are looked up.
const companySizeOptions = [
  "solo",
  "micro",
  "small",
  "medium",
  "large",
  "enterprise",
] as const

const TOTAL_STEPS = 3

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

export default function Home() {
  const [organizationForm, setOrganizationForm] = useState<OrganizationFormState>(
    initialOrganizationForm,
  )
  const [organizationId, setOrganizationId] = useState("")
  const [organizationName, setOrganizationName] = useState("")

  const [engagementForm, setEngagementForm] =
    useState<EngagementFormState>(initialEngagementForm)
  const [engagementId, setEngagementId] = useState("")
  const [engagementStage, setEngagementStage] = useState<EngagementStage | "">("")

  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(
    null,
  )
  const [runs, setRuns] = useState<AnalysisRun[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  function updateOrganizationForm<K extends keyof OrganizationFormState>(
    key: K,
    value: OrganizationFormState[K],
  ) {
    setOrganizationForm((current) => ({ ...current, [key]: value }))
  }

  function updateEngagementForm<K extends keyof EngagementFormState>(
    key: K,
    value: EngagementFormState[K],
  ) {
    setEngagementForm((current) => ({ ...current, [key]: value }))
  }

  async function createOrganization() {
    setIsLoading(true)
    setError("")

    try {
      const response = await fetch(`${API_BASE_URL}/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: organizationForm.name,
          industry: organizationForm.industry || undefined,
          companySize: organizationForm.companySize || undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        // The server names the outcome; the wording is ours (§12A). Its
        // identifier is never what the consultant reads.
        setError(
          translateServerMessage(
            result.message,
            undefined,
            "organization.error.internal",
          ),
        )
        return
      }

      setOrganizationId(result.data.id)
      setOrganizationName(result.data.name)
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setIsLoading(false)
    }
  }

  async function createEngagement() {
    if (!organizationId) {
      setError(t("home.organization.required"))
      return
    }

    setIsLoading(true)
    setError("")
    setAnalysisResult(null)
    setRuns([])

    try {
      // Discovery content is optional — an engagement can be created empty and
      // filled in later. Only non-empty fields are sent.
      const response = await fetch(`${API_BASE_URL}/engagements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationId,
          title: engagementForm.title || undefined,
          statedProblem: engagementForm.statedProblem || undefined,
          currentProcess: engagementForm.currentProcess || undefined,
          desiredOutcome: engagementForm.desiredOutcome || undefined,
          sensitiveData: engagementForm.sensitiveData,
          gdprConcerns: engagementForm.gdprConcerns,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(
          translateServerMessage(
            result.message,
            undefined,
            "engagement.error.internal",
          ),
        )
        return
      }

      setEngagementId(result.data.id)
      setEngagementStage(result.data.stage as EngagementStage)
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setIsLoading(false)
    }
  }

  async function runAnalysis() {
    if (!engagementId) {
      setError(t("home.engagement.required"))
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/engagements/${engagementId}/analyze`,
        { method: "POST", credentials: "include" },
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          translateServerMessage(
            result.message,
            undefined,
            "analysis.error.failed",
          ),
        )
        return
      }

      setAnalysisResult(result)
      await loadRunHistory(engagementId)
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setIsLoading(false)
    }
  }

  async function loadRunHistory(targetEngagementId = engagementId) {
    if (!targetEngagementId) return

    const response = await fetch(
      `${API_BASE_URL}/engagements/${targetEngagementId}/analysis-runs`,
      { credentials: "include" },
    )

    const result = await response.json()

    if (!response.ok) {
      setError(
        translateServerMessage(
          result.message,
          undefined,
          "analysis.error.runs_not_loaded",
        ),
      )
      return
    }

    setRuns(result.data)
  }

  const canCreateOrganization = organizationForm.name.trim().length > 0
  const organizationReady = Boolean(organizationId)
  const engagementReady = Boolean(engagementId)

  return (
    <ManagerShell
      title={t("home.title")}
      description={t("home.intro")}
      actions={
        <Link href="/engagements" style={buttonStyle("secondary")}>
          {t("home.link.engagements")}
        </Link>
      }
    >
      <div style={pageStackStyle}>
        {error && (
          <InlineAlert tone="danger">
            <span>
              <strong>{t("common.error.label")}</strong> {error}
            </span>
          </InlineAlert>
        )}

        <ProcessStep
          number={1}
          title={t("home.organization.title")}
          intro={t("home.organization.intro")}
          state={organizationReady ? "done" : "open"}
        >
          <div style={fieldsGridStyle}>
            <Field labelKey="home.organization.name">
              <input
                value={organizationForm.name}
                onChange={(event) =>
                  updateOrganizationForm("name", event.target.value)
                }
                placeholder={t("home.organization.name_placeholder")}
                style={inputStyle}
              />
            </Field>

            <Field labelKey="home.organization.industry">
              <input
                value={organizationForm.industry}
                onChange={(event) =>
                  updateOrganizationForm("industry", event.target.value)
                }
                placeholder={t("home.organization.industry_placeholder")}
                style={inputStyle}
              />
            </Field>

            <Field labelKey="home.organization.company_size">
              <select
                value={organizationForm.companySize}
                onChange={(event) =>
                  updateOrganizationForm("companySize", event.target.value)
                }
                style={inputStyle}
              >
                <option value="">{t("common.field.not_captured")}</option>
                {companySizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {t(`organization.company_size.${size}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div style={rowStyle}>
            <button
              type="button"
              onClick={createOrganization}
              disabled={isLoading || !canCreateOrganization}
              style={buttonStyle(
                "primary",
                isLoading || !canCreateOrganization,
              )}
            >
              {isLoading
                ? t("common.state.working")
                : t("home.organization.submit")}
            </button>

            {organizationReady && (
              <span style={confirmationStyle}>
                {t("home.organization.ready", { name: organizationName })}
              </span>
            )}
          </div>
        </ProcessStep>

        <ProcessStep
          number={2}
          title={t("home.engagement.title")}
          intro={t("home.engagement.intro", {
            organization:
              organizationName || t("home.engagement.organization_fallback"),
          })}
          state={
            engagementReady ? "done" : organizationReady ? "open" : "locked"
          }
          lockedHint={t("home.step.locked.needs_organization")}
        >
          <div style={fieldsGridStyle}>
            <Field labelKey="home.engagement.title_field">
              <input
                value={engagementForm.title}
                onChange={(event) =>
                  updateEngagementForm("title", event.target.value)
                }
                placeholder={t("home.engagement.title_placeholder")}
                disabled={!organizationReady}
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={fieldsGridStyle}>
            <Field labelKey="home.engagement.stated_problem">
              <textarea
                value={engagementForm.statedProblem}
                onChange={(event) =>
                  updateEngagementForm("statedProblem", event.target.value)
                }
                placeholder={t("home.engagement.stated_problem_placeholder")}
                disabled={!organizationReady}
                style={textareaStyle}
              />
            </Field>

            <Field labelKey="home.engagement.current_process">
              <textarea
                value={engagementForm.currentProcess}
                onChange={(event) =>
                  updateEngagementForm("currentProcess", event.target.value)
                }
                placeholder={t("home.engagement.current_process_placeholder")}
                disabled={!organizationReady}
                style={textareaStyle}
              />
            </Field>

            <Field labelKey="home.engagement.desired_outcome">
              <textarea
                value={engagementForm.desiredOutcome}
                onChange={(event) =>
                  updateEngagementForm("desiredOutcome", event.target.value)
                }
                placeholder={t("home.engagement.desired_outcome_placeholder")}
                disabled={!organizationReady}
                style={textareaStyle}
              />
            </Field>
          </div>

          <div style={fieldsGridStyle}>
            <CheckboxField
              labelKey="home.engagement.sensitive_data"
              checked={engagementForm.sensitiveData}
              disabled={!organizationReady}
              onChange={(checked) =>
                updateEngagementForm("sensitiveData", checked)
              }
            />

            <CheckboxField
              labelKey="home.engagement.gdpr_concerns"
              checked={engagementForm.gdprConcerns}
              disabled={!organizationReady}
              onChange={(checked) =>
                updateEngagementForm("gdprConcerns", checked)
              }
            />
          </div>

          <div style={rowStyle}>
            <button
              type="button"
              onClick={createEngagement}
              disabled={isLoading || !organizationReady}
              style={buttonStyle("primary", isLoading || !organizationReady)}
            >
              {isLoading
                ? t("common.state.working")
                : t("home.engagement.submit")}
            </button>

            {engagementReady && (
              <span style={confirmationStyle}>
                {t("home.engagement.opened")}
                {engagementStage
                  ? ` · ${t("home.engagement.opened_stage", {
                      stage: stageLabel(engagementStage),
                    })}`
                  : ""}
              </span>
            )}

            {engagementReady && (
              <Link
                href={`/engagements/${engagementId}`}
                style={buttonStyle("secondary")}
              >
                {t("home.engagement.open_workspace")}
              </Link>
            )}
          </div>
        </ProcessStep>

        <ProcessStep
          number={3}
          title={t("home.analysis.title")}
          intro={t("home.analysis.intro")}
          state={engagementReady ? "open" : "locked"}
          lockedHint={t("home.step.locked.needs_engagement")}
        >
          <div style={rowStyle}>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={isLoading || !engagementReady}
              style={buttonStyle("primary", isLoading || !engagementReady)}
            >
              {isLoading ? t("analysis.action.running") : t("analysis.action.run")}
            </button>
          </div>

          <section style={runHistoryStyle}>
            <h3 style={sectionTitleStyle}>{t("analysis.runs.title")}</h3>

            {runs.length === 0 ? (
              <EmptyState>{t("analysis.runs.empty")}</EmptyState>
            ) : (
              <ul style={runListStyle}>
                {runs.map((run) => (
                  <li key={run.id} style={nestedBlockStyle}>
                    {/* The provider's model name and the prompt version are
                        recorded identifiers, shown as they were stored. */}
                    <p style={runTitleStyle}>{run.model}</p>
                    <p style={metaTextStyle}>{formatDateTime(run.createdAt)}</p>
                    <div style={rowStyle}>
                      <Badge tone="neutral" label={run.promptVersion} />
                      <Badge
                        tone="neutral"
                        label={t("analysis.runs.badge.tokens", {
                          count: run.totalTokens ?? 0,
                        })}
                      />
                      <Badge
                        tone="neutral"
                        label={t("analysis.runs.badge.cost", {
                          amount: run.costEstimateUsd ?? "0",
                        })}
                      />
                      <Badge
                        tone={run.schemaValid ? "success" : "danger"}
                        label={t("analysis.runs.badge.schema", {
                          validity: t(
                            run.schemaValid
                              ? "common.value.valid"
                              : "common.value.invalid",
                          ),
                        })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {analysisResult && (
            <section style={runHistoryStyle}>
              <h3 style={sectionTitleStyle}>{t("analysis.result.title")}</h3>
              {analysisResult.data?.report ? (
                <AnalysisReportView report={analysisResult.data.report} />
              ) : (
                <EmptyState>
                  {/* A successful call that carried no report still answers with
                      an identifier, never with prose to print. */}
                  {translateServerMessage(
                    analysisResult.message,
                    undefined,
                    "analysis.result.missing",
                  )}
                </EmptyState>
              )}
            </section>
          )}
        </ProcessStep>
      </div>
    </ManagerShell>
  )
}

type StepState = "open" | "done" | "locked"

const STEP_TONES = {
  open: "info",
  done: "success",
  locked: "neutral",
} as const

const STEP_STATE_KEYS = {
  open: "home.step.state.open",
  done: "home.step.state.done",
  locked: "home.step.state.locked",
} as const

// One step of the process. Its number, its state and — when it is waiting on an
// earlier step — what it is waiting for are all stated, so a dimmed form is
// never a mystery.
function ProcessStep({
  number,
  title,
  intro,
  state,
  lockedHint,
  children,
}: {
  number: number
  title: string
  intro: string
  state: StepState
  lockedHint?: string
  children: ReactNode
}) {
  const locked = state === "locked"

  return (
    <section
      style={{
        ...cardStyle,
        borderColor: locked ? uiColors.border : uiColors.borderStrong,
      }}
      aria-labelledby={`process-step-${number}`}
    >
      <header style={stepHeaderStyle}>
        <div style={stepHeadingStyle}>
          <span aria-hidden="true" style={stepNumberStyle}>
            {number}
          </span>
          <div>
            <h2 id={`process-step-${number}`} style={sectionTitleStyle}>
              {title}
            </h2>
            <p style={stepMarkerStyle}>
              {t("home.step.marker", { number, total: TOTAL_STEPS })}
            </p>
          </div>
        </div>
        <Badge tone={STEP_TONES[state]} label={t(STEP_STATE_KEYS[state])} />
      </header>

      <p style={mutedTextStyle}>{intro}</p>

      {locked && lockedHint && <EmptyState>{lockedHint}</EmptyState>}

      <div
        style={{
          ...stepBodyStyle,
          opacity: locked ? 0.6 : 1,
        }}
      >
        {children}
      </div>
    </section>
  )
}

function Field({
  labelKey,
  children,
}: {
  labelKey: MessageKey
  children: ReactNode
}) {
  return (
    <label style={fieldStyle}>
      <span>{t(labelKey)}</span>
      {children}
    </label>
  )
}

function CheckboxField({
  labelKey,
  checked,
  disabled,
  onChange,
}: {
  labelKey: MessageKey
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      style={{
        ...checkboxFieldStyle,
        borderColor: checked ? uiColors.primary : uiColors.border,
        background: checked ? uiColors.primaryTint : uiColors.surface,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {t(labelKey)}
    </label>
  )
}

const stepHeaderStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: uiSpace.sm,
}

const stepHeadingStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: uiSpace.sm,
  minWidth: 0,
}

const stepNumberStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  width: 28,
  height: 28,
  borderRadius: uiRadius.pill,
  background: uiColors.primaryTint,
  color: uiColors.primary,
  fontSize: 13,
  fontWeight: 700,
}

const stepMarkerStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: uiColors.textMuted,
  fontSize: 12,
}

const stepBodyStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  minWidth: 0,
}

const confirmationStyle: React.CSSProperties = {
  color: uiColors.success,
  fontSize: 14,
  fontWeight: 600,
}

const runHistoryStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.sm,
}

const runListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: uiSpace.xs,
}

const runTitleStyle: React.CSSProperties = {
  ...bodyTextStyle,
  fontWeight: 600,
}
