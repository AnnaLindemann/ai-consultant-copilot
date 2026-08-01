import type { RecommendationSetDraft } from "../../../shared/recommendation.schema.js"
import { parseLlmJson } from "./parse-llm-json.js"
import { validateRecommendations } from "./validate-recommendations.js"

type ParseRecommendationsResult =
  | {
      success: true
      recommendationSet: RecommendationSetDraft
      jsonParseSuccess: true
      schemaValid: true
      error?: never
    }
  | {
      success: false
      recommendationSet?: never
      jsonParseSuccess: boolean
      schemaValid: boolean
      error: string
    }

export function parseRecommendations(raw: string): ParseRecommendationsResult {
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
    const recommendationSet = validateRecommendations(parsed)

    return {
      success: true,
      recommendationSet,
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
          : "LLM JSON failed Recommendation validation",
    }
  }
}
