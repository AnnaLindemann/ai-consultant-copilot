import { evaluateAnalysisOutput } from "../evaluation/evaluate-analysis-output.js"
import { callLlm } from "../lib/llm-client.js"
import { parseAnalysisReport } from "../lib/parse-analysis-report.js"
import { buildAnalysisPrompt } from "../prompts/build-analysis-prompt.js"

import type { AnalysisReport } from "../../../shared/analysis-report.schema.js"
import type { EvaluationResult } from "../evaluation/evaluation.types.js"
import { calculateLlmCost } from "../evaluation/calculate-llm-cost.js"
import { createAnalysisRun } from "../repositories/analysis-run.repository.js"
import type {
  EngagementScope,
  EngagementWithOrganization,
} from "../repositories/engagement.repository.js"
import { ANALYSIS_PROMPT } from "../prompts/analysis-prompt.js"
import { langfuse } from "../observability/langfuse.js"
import { failureIdentity } from "../lib/failure-identity.js"

export type AnalyzeEngagementResult =
  | {
      success: true
      report: AnalysisReport
      evaluation: EvaluationResult
    }
  | {
      success: false
      evaluation: EvaluationResult
      error: string
    }

export const analyzeEngagement = async (
  input: EngagementWithOrganization,
  scope: EngagementScope,
): Promise<AnalyzeEngagementResult> => {
  const trace = langfuse?.trace({
    name: "analyze-engagement",
    metadata: {
      engagementId: input.id,
      workspaceId: scope.workspaceId,
      promptVersion: ANALYSIS_PROMPT.version,
      promptFingerprint: ANALYSIS_PROMPT.fingerprint,
    },
  })

  const prompt = buildAnalysisPrompt(input)

  const llmResponse = await callLlm(prompt)

  const parsedResult = parseAnalysisReport(llmResponse.content)

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

  trace?.generation({
    name: "groq-llm-call",
    model: llmResponse.model,
    metadata: {
      provider: llmResponse.provider,
      promptVersion: ANALYSIS_PROMPT.version,
      promptFingerprint: ANALYSIS_PROMPT.fingerprint,
      latencyMs: llmResponse.latencyMs,
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      totalTokens: llmResponse.totalTokens,
      costEstimateUsd,
      jsonParseSuccess: parsedResult.jsonParseSuccess,
      schemaValid: parsedResult.schemaValid,
    },
  })

  // The audit trail must survive even when the AI output is unusable: the run
  // is recorded (with its error) and Langfuse is flushed regardless of outcome
  // (architecture.md §5, §13; coding-standards.md §7).
  try {
    const analysisRun = await createAnalysisRun({
      workspaceId: scope.workspaceId,
      engagementId: input.id,
      stage: "analysis",
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
      errorMessage: parsedResult.success ? undefined : parsedResult.error,
    })

      trace?.update({
      metadata: {
        engagementId: input.id,
        workspaceId: scope.workspaceId,
        analysisRunId: analysisRun.id,
        promptVersion: ANALYSIS_PROMPT.version,
        promptFingerprint: ANALYSIS_PROMPT.fingerprint,
        success: parsedResult.success,
        jsonParseSuccess: parsedResult.jsonParseSuccess,
        schemaValid: parsedResult.schemaValid,
      },
    })
  } catch (error) {
    console.error("CREATE_ANALYSIS_RUN_FAILED", failureIdentity(error))
  } finally {
    await langfuse?.flushAsync()
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
