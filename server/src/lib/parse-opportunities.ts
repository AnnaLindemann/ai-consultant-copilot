import type { OpportunityPrioritizationDraft } from "../../../shared/opportunity.schema.js"
import { parseLlmJson } from "./parse-llm-json.js"
import { validateOpportunities } from "./validate-opportunities.js"

type ParseOpportunitiesResult =
  | {
      success: true
      prioritization: OpportunityPrioritizationDraft
      jsonParseSuccess: true
      schemaValid: true
      error?: never
    }
  | {
      success: false
      prioritization?: never
      jsonParseSuccess: boolean
      schemaValid: boolean
      error: string
    }

export function parseOpportunities(raw: string): ParseOpportunitiesResult {
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
    const prioritization = validateOpportunities(parsed)

    return {
      success: true,
      prioritization,
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
          : "LLM JSON failed Opportunity validation",
    }
  }
}
