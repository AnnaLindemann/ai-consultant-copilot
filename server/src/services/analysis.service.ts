import type { ClientCase } from "@prisma/client"

import { evaluateAnalysisOutput } from "../evaluation/evaluate-analysis-output.js"
import { callLlm } from "../lib/llm-client.js"
import { parseConsultantReport } from "../lib/parse-consultant-report.js"
import { buildAnalysisPrompt } from "../prompts/build-analysis-prompt.js"

import type { ConsultantReport } from "../schemas/consultant-report.schema.js"
import type { EvaluationResult } from "../evaluation/evaluation.types.js"
import { calculateLlmCost } from "../evaluation/calculate-llm-cost.js"
import { createAnalysisRun } from "../repositories/analysis-run.repository.js"
import { ANALYSIS_PROMPT } from "../prompts/analysis-prompt.js"

export type AnalyzeClientCaseResult =
  | {
      success: true
      report: ConsultantReport
      evaluation: EvaluationResult
    }
  | {
      success: false
      evaluation: EvaluationResult
      error: string
    }
export const analyzeClientCase = async (
  input: ClientCase,
): Promise<AnalyzeClientCaseResult> => {
  const prompt = buildAnalysisPrompt(input)

  const llmResponse = await callLlm(prompt)

 const parsedResult = parseConsultantReport(llmResponse.content)

 const costEstimateUsd = calculateLlmCost({
  promptTokens: llmResponse.promptTokens,
  completionTokens: llmResponse.completionTokens,
})

const evaluation = evaluateAnalysisOutput({
  provider: llmResponse.provider,
  model: llmResponse.model,
  jsonParseSuccess: parsedResult.jsonParseSuccess,
  schemaValid: parsedResult.schemaValid,
  latencyMs: llmResponse.latencyMs,
  promptTokens: llmResponse.promptTokens,
  completionTokens: llmResponse.completionTokens,
  totalTokens: llmResponse.totalTokens,
  costEstimateUsd,
})

try {
  await createAnalysisRun({
    caseId: input.id,
    provider: llmResponse.provider,
    model: llmResponse.model,
    promptVersion: ANALYSIS_PROMPT.version,
    promptFingerprint: ANALYSIS_PROMPT.fingerprint,
    latencyMs: llmResponse.latencyMs,
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
    costEstimateUsd,
    jsonParseSuccess: parsedResult.jsonParseSuccess,
    schemaValid: parsedResult.schemaValid,
    relevance: evaluation.relevance,
    hallucinationRisk: evaluation.hallucinationRisk,
    businessValue: evaluation.businessValue,
    actionability: evaluation.actionability,
    errorMessage: parsedResult.success ? undefined : parsedResult.error,
  })
} catch (error) {
  console.error("CREATE ANALYSIS RUN ERROR:", error)
}
if (!parsedResult.success) {
  return {
    success: false,
    evaluation,
    error: parsedResult.error,
  }
}

return {
  success: true,
  report: parsedResult.report,
  evaluation,
}
}