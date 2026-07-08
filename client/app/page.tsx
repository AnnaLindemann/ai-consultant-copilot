"use client"

import { useState } from "react"
import Link from "next/link"

import type { ConsultantReport } from "../../shared/consultant-report.schema"
import AnalysisReportView from "../components/AnalysisReportView"
import { STAGE_LABELS, type EngagementStage } from "../lib/engagement-stage"

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
    report?: ConsultantReport
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

const companySizeOptions = [
  "solo",
  "micro",
  "small",
  "medium",
  "large",
  "enterprise",
]

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
        body: JSON.stringify({
          name: organizationForm.name,
          industry: organizationForm.industry || undefined,
          companySize: organizationForm.companySize || undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message ?? "Failed to create organization")
      }

      setOrganizationId(result.data.id)
      setOrganizationName(result.data.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  async function createEngagement() {
    if (!organizationId) {
      setError("Create an organization first")
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
        throw new Error(result.message ?? "Failed to create engagement")
      }

      setEngagementId(result.data.id)
      setEngagementStage(result.data.stage as EngagementStage)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  async function runAnalysis() {
    if (!engagementId) {
      setError("Create an engagement first")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/engagements/${engagementId}/analyze`,
        { method: "POST" },
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message ?? "Failed to run analysis")
      }

      setAnalysisResult(result)
      await loadRunHistory(engagementId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  async function loadRunHistory(targetEngagementId = engagementId) {
    if (!targetEngagementId) return

    const response = await fetch(
      `${API_BASE_URL}/engagements/${targetEngagementId}/analysis-runs`,
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message ?? "Failed to load run history")
    }

    setRuns(result.data)
  }

  const canCreateOrganization = organizationForm.name.trim().length > 0

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f6f7fb",
        color: "#111827",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: "40px 24px",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ marginBottom: 32 }}>
          <p
            style={{
              margin: 0,
              color: "#4f46e5",
              fontWeight: 700,
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            AI Consultant Copilot
          </p>
          <h1 style={{ fontSize: 42, lineHeight: 1.1, margin: "8px 0 12px" }}>
            Start an engagement for a client organization
          </h1>
          <p style={{ color: "#6b7280", fontSize: 18, maxWidth: 760 }}>
            Create an organization, open an engagement for it, and resume that
            work at any time. Discovery details are optional now and can be
            filled in later.{" "}
            <Link href="/engagements" style={{ color: "#4f46e5", fontWeight: 700 }}>
              View all engagements →
            </Link>
          </p>
        </header>

        {error && (
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: "#fee2e2",
              color: "#991b1b",
              marginBottom: 24,
              border: "1px solid #fecaca",
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(360px, 0.9fr)",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 24 }}>
            <section style={cardStyle}>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 24 }}>1. Create Organization</h2>
                <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
                  The client company that groups its engagements.
                </p>
              </div>

              <div style={{ display: "grid", gap: 18 }}>
                <Field label="Organization Name">
                  <input
                    value={organizationForm.name}
                    onChange={(event) =>
                      updateOrganizationForm("name", event.target.value)
                    }
                    placeholder="Example: Demo Hotel GmbH"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Industry (optional)">
                  <input
                    value={organizationForm.industry}
                    onChange={(event) =>
                      updateOrganizationForm("industry", event.target.value)
                    }
                    placeholder="Example: Hospitality"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Company Size (optional)">
                  <select
                    value={organizationForm.companySize}
                    onChange={(event) =>
                      updateOrganizationForm("companySize", event.target.value)
                    }
                    style={inputStyle}
                  >
                    <option value="">—</option>
                    {companySizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </Field>

                <button
                  onClick={createOrganization}
                  disabled={isLoading || !canCreateOrganization}
                  style={{
                    ...buttonStyle,
                    opacity: isLoading || !canCreateOrganization ? 0.55 : 1,
                    cursor:
                      isLoading || !canCreateOrganization
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {isLoading ? "Working..." : "Create Organization"}
                </button>

                {organizationId && (
                  <div style={successStyle}>
                    <strong>Organization ready:</strong> {organizationName}
                  </div>
                )}
              </div>
            </section>

            <section style={{ ...cardStyle, opacity: organizationId ? 1 : 0.6 }}>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 24 }}>2. Open Engagement</h2>
                <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
                  A complete piece of consulting work for{" "}
                  {organizationName || "the organization"}. All fields are
                  optional — an empty engagement is a valid starting point.
                </p>
              </div>

              <div style={{ display: "grid", gap: 18 }}>
                <Field label="Engagement Title (optional)">
                  <input
                    value={engagementForm.title}
                    onChange={(event) =>
                      updateEngagementForm("title", event.target.value)
                    }
                    placeholder="Example: Support automation review"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Stated Problem (optional)">
                  <textarea
                    value={engagementForm.statedProblem}
                    onChange={(event) =>
                      updateEngagementForm("statedProblem", event.target.value)
                    }
                    placeholder="What problem did the client describe?"
                    style={textareaStyle}
                  />
                </Field>

                <Field label="Current Process (optional)">
                  <textarea
                    value={engagementForm.currentProcess}
                    onChange={(event) =>
                      updateEngagementForm("currentProcess", event.target.value)
                    }
                    placeholder="How does the process work today?"
                    style={textareaStyle}
                  />
                </Field>

                <Field label="Desired Outcome (optional)">
                  <textarea
                    value={engagementForm.desiredOutcome}
                    onChange={(event) =>
                      updateEngagementForm("desiredOutcome", event.target.value)
                    }
                    placeholder="What should improve after the AI solution?"
                    style={textareaStyle}
                  />
                </Field>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <CheckboxCard
                    label="Sensitive data involved"
                    checked={engagementForm.sensitiveData}
                    onChange={(checked) =>
                      updateEngagementForm("sensitiveData", checked)
                    }
                  />

                  <CheckboxCard
                    label="GDPR concerns"
                    checked={engagementForm.gdprConcerns}
                    onChange={(checked) =>
                      updateEngagementForm("gdprConcerns", checked)
                    }
                  />
                </div>

                <button
                  onClick={createEngagement}
                  disabled={isLoading || !organizationId}
                  style={{
                    ...buttonStyle,
                    opacity: isLoading || !organizationId ? 0.55 : 1,
                    cursor:
                      isLoading || !organizationId ? "not-allowed" : "pointer",
                  }}
                >
                  {isLoading ? "Working..." : "Open Engagement"}
                </button>

                {engagementId && (
                  <div style={successStyle}>
                    <strong>Engagement opened</strong>
                    {engagementStage && (
                      <> · stage: {STAGE_LABELS[engagementStage]}</>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <Link
                        href={`/engagements/${engagementId}`}
                        style={{ color: "#065f46", fontWeight: 800 }}
                      >
                        Open engagement workspace →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside style={{ display: "grid", gap: 24 }}>
            <section style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>3. Run Analysis</h2>
              <p style={{ color: "#6b7280" }}>
                Send this engagement to the backend analysis engine and persist
                the AI run.
              </p>

              <button
                onClick={runAnalysis}
                disabled={isLoading || !engagementId}
                style={{
                  ...buttonStyle,
                  width: "100%",
                  background: "#111827",
                  opacity: isLoading || !engagementId ? 0.55 : 1,
                  cursor: isLoading || !engagementId ? "not-allowed" : "pointer",
                }}
              >
                Run Analysis
              </button>

              {!engagementId && (
                <p style={{ color: "#9ca3af", fontSize: 14 }}>
                  Open an engagement before running analysis.
                </p>
              )}
            </section>

            <section style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Run History</h2>

              {runs.length === 0 ? (
                <p style={{ color: "#9ca3af" }}>No runs yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {runs.map((run) => (
                    <div
                      key={run.id}
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        border: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{run.model}</div>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>
                        {new Date(run.createdAt).toLocaleString()}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          marginTop: 10,
                        }}
                      >
                        <Badge label={run.promptVersion} />
                        <Badge label={`${run.totalTokens ?? 0} tokens`} />
                        <Badge label={`$${run.costEstimateUsd ?? "0"}`} />
                        <Badge label={`schema: ${String(run.schemaValid)}`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>

        {analysisResult && (
          <section
            style={{
              ...cardStyle,
              marginTop: 24,
            }}
          >
            <h2 style={{ marginTop: 0 }}>Analysis Result</h2>
            {analysisResult.data?.report ? (
              <AnalysisReportView report={analysisResult.data.report} />
            ) : (
              <p style={{ color: "#9ca3af" }}>
                {analysisResult.message ??
                  "The response did not contain a report."}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function CheckboxCard({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: 14,
        borderRadius: 14,
        border: checked ? "1px solid #4f46e5" : "1px solid #e5e7eb",
        background: checked ? "#eef2ff" : "#ffffff",
        fontWeight: 700,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

function Badge({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: 999,
        background: "#eef2ff",
        color: "#3730a3",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  )
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 24,
  padding: 24,
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
  border: "1px solid #e5e7eb",
}

const successStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "#ecfdf5",
  border: "1px solid #bbf7d0",
  color: "#065f46",
  fontSize: 14,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid #d1d5db",
  padding: "12px 14px",
  fontSize: 15,
  outline: "none",
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical",
}

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 14,
  background: "#4f46e5",
  color: "#ffffff",
  padding: "12px 18px",
  fontSize: 15,
  fontWeight: 800,
}
