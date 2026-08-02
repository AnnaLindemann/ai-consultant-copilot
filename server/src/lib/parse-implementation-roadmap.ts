import type { GeneratedRoadmapDraft } from "../../../shared/implementation-roadmap.schema.js"
import { parseLlmJson } from "./parse-llm-json.js"
import { validateImplementationRoadmap } from "./validate-implementation-roadmap.js"

type ParseRoadmapResult =
  | {
      success: true
      roadmap: GeneratedRoadmapDraft
      jsonParseSuccess: true
      schemaValid: true
      error?: never
    }
  | {
      success: false
      roadmap?: never
      jsonParseSuccess: boolean
      schemaValid: boolean
      error: string
    }

export function parseImplementationRoadmap(raw: string): ParseRoadmapResult {
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
    return {
      success: true,
      roadmap: validateImplementationRoadmap(parsed),
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
          : "LLM JSON failed Implementation Roadmap validation",
    }
  }
}
