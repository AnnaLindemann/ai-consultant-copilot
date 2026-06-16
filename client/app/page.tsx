"use client"

import { useState } from "react"

import type { ConsultantReport } from "../../shared/consultant-report.schema"
import AnalysisReportView from "../components/AnalysisReportView"

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
  relevance: string | null
  hallucinationRisk: string | null
  businessValue: string | null
  actionability: string | null
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

type CaseFormState = {
  companyName: string
  industry: string
  statedProblem: string
  currentProcess: string
  desiredOutcome: string
  sensitiveData: boolean
  gdprConcerns: boolean
}

const initialCaseForm: CaseFormState = {
  companyName: "",
  industry: "",
  statedProblem: "",
  currentProcess: "",
  desiredOutcome: "",
  sensitiveData: false,
  gdprConcerns: true,
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

export default function Home() {
  const [caseForm, setCaseForm] = useState<CaseFormState>(initialCaseForm)
  const [caseId, setCaseId] = useState("")
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(
    null,
  )
  const [runs, setRuns] = useState<AnalysisRun[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  function updateCaseForm<K extends keyof CaseFormState>(
    key: K,
    value: CaseFormState[K],
  ) {
    setCaseForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  async function createCase() {
    setIsLoading(true)
    setError("")
    setAnalysisResult(null)
    setRuns([])

    try {
      const response = await fetch(`${API_BASE_URL}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(caseForm),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message ?? "Failed to create case")
      }

      setCaseId(result.data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  async function runAnalysis() {
    if (!caseId) {
      setError("Create a case first")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch(`${API_BASE_URL}/cases/${caseId}/analyze`, {
        method: "POST",
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message ?? "Failed to run analysis")
      }

      setAnalysisResult(result)
      await loadRunHistory(caseId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  async function loadRunHistory(targetCaseId = caseId) {
    if (!targetCaseId) return

    const response = await fetch(
      `${API_BASE_URL}/cases/${targetCaseId}/analysis-runs`,
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message ?? "Failed to load run history")
    }

    setRuns(result.data)
  }

  const canCreateCase =
    caseForm.companyName.trim() &&
    caseForm.industry.trim() &&
    caseForm.statedProblem.trim() &&
    caseForm.currentProcess.trim() &&
    caseForm.desiredOutcome.trim()

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
            Analyze client cases with observable AI runs
          </h1>
          <p style={{ color: "#6b7280", fontSize: 18, maxWidth: 760 }}>
            Create a consulting case, run an AI analysis, and inspect the
            evaluation history with prompt versioning, token usage, cost, and
            validation status.
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
          <section
            style={{
              background: "#ffffff",
              borderRadius: 24,
              padding: 28,
              boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 24 }}>1. Create Case</h2>
              <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
                Enter the minimum consulting discovery data required by the
                backend schema.
              </p>
            </div>

            <div style={{ display: "grid", gap: 18 }}>
              <Field label="Company Name">
                <input
                  value={caseForm.companyName}
                  onChange={(event) =>
                    updateCaseForm("companyName", event.target.value)
                  }
                  placeholder="Example: Demo Hotel GmbH"
                  style={inputStyle}
                />
              </Field>

              <Field label="Industry">
                <input
                  value={caseForm.industry}
                  onChange={(event) =>
                    updateCaseForm("industry", event.target.value)
                  }
                  placeholder="Example: Hospitality"
                  style={inputStyle}
                />
              </Field>

              <Field label="Stated Problem">
                <textarea
                  value={caseForm.statedProblem}
                  onChange={(event) =>
                    updateCaseForm("statedProblem", event.target.value)
                  }
                  placeholder="What problem did the client describe?"
                  style={textareaStyle}
                />
              </Field>

              <Field label="Current Process">
                <textarea
                  value={caseForm.currentProcess}
                  onChange={(event) =>
                    updateCaseForm("currentProcess", event.target.value)
                  }
                  placeholder="How does the process work today?"
                  style={textareaStyle}
                />
              </Field>

              <Field label="Desired Outcome">
                <textarea
                  value={caseForm.desiredOutcome}
                  onChange={(event) =>
                    updateCaseForm("desiredOutcome", event.target.value)
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
                  checked={caseForm.sensitiveData}
                  onChange={(checked) =>
                    updateCaseForm("sensitiveData", checked)
                  }
                />

                <CheckboxCard
                  label="GDPR concerns"
                  checked={caseForm.gdprConcerns}
                  onChange={(checked) =>
                    updateCaseForm("gdprConcerns", checked)
                  }
                />
              </div>

              <button
                onClick={createCase}
                disabled={isLoading || !canCreateCase}
                style={{
                  ...buttonStyle,
                  opacity: isLoading || !canCreateCase ? 0.55 : 1,
                  cursor: isLoading || !canCreateCase ? "not-allowed" : "pointer",
                }}
              >
                {isLoading ? "Working..." : "Create Case"}
              </button>

              {caseId && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: "#ecfdf5",
                    border: "1px solid #bbf7d0",
                    color: "#065f46",
                    fontSize: 14,
                  }}
                >
                  <strong>Case created:</strong>
                  <div style={{ marginTop: 4, wordBreak: "break-all" }}>
                    {caseId}
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside style={{ display: "grid", gap: 24 }}>
            <section style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>2. Run Analysis</h2>
              <p style={{ color: "#6b7280" }}>
                Send this case to the backend analysis engine and persist the AI
                run.
              </p>

              <button
                onClick={runAnalysis}
                disabled={isLoading || !caseId}
                style={{
                  ...buttonStyle,
                  width: "100%",
                  background: "#111827",
                  opacity: isLoading || !caseId ? 0.55 : 1,
                  cursor: isLoading || !caseId ? "not-allowed" : "pointer",
                }}
              >
                Run Analysis
              </button>

              {!caseId && (
                <p style={{ color: "#9ca3af", fontSize: 14 }}>
                  Create a case before running analysis.
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