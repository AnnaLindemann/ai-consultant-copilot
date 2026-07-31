"use client"

import { useState } from "react"

import type { ConsultantReport } from "../../shared/consultant-report.schema"
import AnalysisReportView from "./AnalysisReportView"

type AnalysisRun = {
  id: string
  stage: string
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

type EngagementAnalysisPanelProps = {
  engagementId: string
  // The engagement's audit trail across every AI-assisted stage, loaded with
  // the page so runs recorded by other stages are visible straight away.
  initialRuns: AnalysisRun[]
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

export default function EngagementAnalysisPanel({
  engagementId,
  initialRuns,
}: EngagementAnalysisPanelProps) {
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(
    null,
  )
  const [runs, setRuns] = useState<AnalysisRun[]>(initialRuns)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  async function loadRunHistory() {
    const response = await fetch(
      `${API_BASE_URL}/engagements/${engagementId}/analysis-runs`,
      { credentials: "include" },
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message ?? "Failed to load run history")
    }

    setRuns(result.data as AnalysisRun[])
  }

  async function runAnalysis() {
    setIsLoading(true)
    setError("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/engagements/${engagementId}/analyze`,
        {
          method: "POST",
          credentials: "include",
        },
      )

      const result = (await response.json()) as AnalyzeResponse

      if (!response.ok) {
        throw new Error(result.message ?? "Failed to run analysis")
      }

      setAnalysisResult(result)
      await loadRunHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section style={panelStyle}>
      <h2 style={{ marginTop: 0 }}>Analysis Workflow</h2>

      {error && (
        <div style={errorStyle}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <button
        onClick={runAnalysis}
        disabled={isLoading}
        style={{
          ...buttonStyle,
          opacity: isLoading ? 0.55 : 1,
          cursor: isLoading ? "not-allowed" : "pointer",
        }}
      >
        {isLoading ? "Running analysis..." : "Run Analysis"}
      </button>

      <section style={{ marginTop: 24 }}>
        <h3>Run History</h3>

        {runs.length === 0 ? (
          <p style={mutedStyle}>
            No AI-assisted step has been run for this engagement yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {runs.map((run) => (
              <div key={run.id} style={runCardStyle}>
                <strong>{run.model}</strong>
                <p style={mutedStyle}>
                  {new Date(run.createdAt).toLocaleString()}
                </p>
                <div style={badgeRowStyle}>
                  <Badge label={`stage: ${run.stage}`} />
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

      {analysisResult?.data?.report && (
        <section style={{ marginTop: 24 }}>
          <h3>Analysis Result</h3>
          <AnalysisReportView report={analysisResult.data.report} />
        </section>
      )}
    </section>
  )
}

function Badge({ label }: { label: string }) {
  return <span style={badgeStyle}>{label}</span>
}

const panelStyle: React.CSSProperties = {
  maxWidth: 1000,
  margin: "24px auto 0",
  background: "#ffffff",
  borderRadius: 24,
  padding: 32,
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
  border: "1px solid #e5e7eb",
}

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 14,
  background: "#111827",
  color: "#ffffff",
  padding: "12px 18px",
  fontSize: 15,
  fontWeight: 800,
}

const errorStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "#fee2e2",
  color: "#991b1b",
  marginBottom: 16,
  border: "1px solid #fecaca",
}

const mutedStyle: React.CSSProperties = {
  color: "#6b7280",
  margin: "6px 0",
}

const runCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
}

const badgeRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
}

const badgeStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#3730a3",
  fontSize: 12,
  fontWeight: 700,
}
