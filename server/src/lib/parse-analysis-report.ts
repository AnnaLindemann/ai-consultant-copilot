import type { AnalysisReport } from "../../../shared/analysis-report.schema.js"
import { analysisReportSchema } from "../../../shared/analysis-report.schema.js"
import { parseLlmJson } from "./parse-llm-json.js"

type ParseAnalysisReportResult =
  | {
      success: true
      report: AnalysisReport
      jsonParseSuccess: true
      schemaValid: true
      error?: never
    }
  | {
      success: false
      report?: never
      jsonParseSuccess: boolean
      schemaValid: boolean
      error: string
    }

export function parseAnalysisReport(raw: string): ParseAnalysisReportResult {
  let parsed: unknown

  try {
    parsed = parseLlmJson(raw)
  } catch (error) {
    return {
      success: false,
      jsonParseSuccess: false,
      schemaValid: false,
      error: error instanceof Error ? error.message : "Failed to parse LLM JSON",
    }
  }

  const result = analysisReportSchema.safeParse(parsed)
  if (!result.success) {
    return {
      success: false,
      jsonParseSuccess: true,
      schemaValid: false,
      error: result.error.message,
    }
  }

  return {
    success: true,
    report: result.data,
    jsonParseSuccess: true,
    schemaValid: true,
  }
}
