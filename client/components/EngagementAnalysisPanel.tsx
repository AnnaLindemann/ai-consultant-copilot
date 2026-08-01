"use client"

import { useState } from "react"

import { formatDateTime, t, translateServerMessage } from "../i18n"
import type { ConsultantReport } from "../../shared/consultant-report.schema"
import AnalysisReportView from "./AnalysisReportView"
import {
  stageHeaderStyle,
  stageHeadingStyle,
  stageIntroStyle,
  stageSurfaceStyle,
} from "./StagePanel"
import {
  Badge,
  EmptyState,
  InlineAlert,
  bodyTextStyle,
  buttonStyle,
  metaTextStyle,
  nestedBlockStyle,
  rowStyle,
  sectionTitleStyle,
} from "./UiKit"
import { uiSpace } from "../lib/design-tokens"

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

  // The audit trail is a read; failing to refresh it must not be reported as a
  // failed analysis, so it carries its own outcome.
  async function loadRunHistory() {
    const response = await fetch(
      `${API_BASE_URL}/engagements/${engagementId}/analysis-runs`,
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
        // The server names the outcome; the wording is ours (§12A).
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
      await loadRunHistory()
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section style={panelStyle}>
      <div style={stageHeaderStyle}>
        <div>
          <h2 style={stageHeadingStyle}>{t("analysis.panel.title")}</h2>
          <p style={stageIntroStyle}>{t("analysis.panel.intro")}</p>
        </div>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={isLoading}
          style={buttonStyle("secondary", isLoading)}
        >
          {isLoading ? t("analysis.action.running") : t("analysis.action.run")}
        </button>
      </div>

      {error && (
        <InlineAlert tone="danger">
          <span>
            <strong>{t("common.error.label")}</strong> {error}
          </span>
        </InlineAlert>
      )}

      <section style={blockStyle}>
        <h3 style={sectionTitleStyle}>{t("analysis.runs.title")}</h3>

        {runs.length === 0 ? (
          <EmptyState>{t("analysis.runs.empty")}</EmptyState>
        ) : (
          <ul style={runListStyle}>
            {runs.map((run) => (
              <li key={run.id} style={nestedBlockStyle}>
                {/* The provider's model name, the prompt version and the run's
                    stage are recorded identifiers, shown as they were stored. */}
                <p style={runTitleStyle}>{run.model}</p>
                <p style={metaTextStyle}>{formatDateTime(run.createdAt)}</p>
                <div style={rowStyle}>
                  <Badge
                    tone="neutral"
                    label={t("analysis.runs.badge.stage", { stage: run.stage })}
                  />
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
                  {/* Whether the provider's answer matched the contract is a
                      real outcome, so it carries a semantic tone. */}
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

      {analysisResult?.data?.report && (
        <section style={blockStyle}>
          <h3 style={sectionTitleStyle}>{t("analysis.result.title")}</h3>
          <AnalysisReportView report={analysisResult.data.report} />
        </section>
      )}
    </section>
  )
}

const panelStyle = stageSurfaceStyle

const blockStyle: React.CSSProperties = {
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
