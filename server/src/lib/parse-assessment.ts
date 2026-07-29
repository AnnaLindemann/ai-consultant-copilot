import type { Assessment } from "../../../shared/assessment.schema.js"
import { parseLlmJson } from "./parse-llm-json.js"
import { validateAssessment } from "./validate-assessment.js"

type ParseAssessmentResult =
  | {
      success: true
      assessment: Assessment
      jsonParseSuccess: true
      schemaValid: true
      error?: never
    }
  | {
      success: false
      assessment?: never
      jsonParseSuccess: boolean
      schemaValid: boolean
      error: string
    }

export function parseAssessment(raw: string): ParseAssessmentResult {
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
    const assessment = validateAssessment(parsed)

    return {
      success: true,
      assessment,
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
          : "LLM JSON failed Assessment validation",
    }
  }
}
