import type { ConsultantReport } from "../../../shared/consultant-report.schema.js"
import { parseLlmJson } from "./parse-llm-json.js"
import { validateConsultantReport } from "./validate-consultant-report.js"

type ParseConsultantReportResult =
  | {
      success: true
      report: ConsultantReport
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

export function parseConsultantReport(raw: string): ParseConsultantReportResult {
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

  try {
    const report = validateConsultantReport(parsed)

    return {
      success: true,
      report,
      jsonParseSuccess: true,
      schemaValid: true,
    }
  } catch (error) {
    return {
      success: false,
      jsonParseSuccess: true,
      schemaValid: false,
      error:
        error instanceof Error
          ? error.message
          : "LLM JSON failed ConsultantReport validation",
    }
  }
}