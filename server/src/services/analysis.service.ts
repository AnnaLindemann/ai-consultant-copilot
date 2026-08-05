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
import { getCurrentRequestId, logger } from "../lib/application-logger.js"
import { failureIdentity } from "../lib/failure-identity.js"
import {
  authorizeAiProcessing,
  reviewAiOutput,
} from "./ai-compliance.service.js"

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
  // The Workspace Compliance Policy, the engagement's AI consent, or its data
  // classification refused the request before it reached the provider (roadmap
  // Phase 10). No report was produced and no Analysis Run was recorded —
  // nothing ran — but the refusal is in the append-only Audit Trail.
  | {
      success: false
      complianceDenial: true
      messageId: string
    }
  | {
      success: false
      outputRejected: true
      messageId: string
      evaluation: EvaluationResult
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
      requestId: getCurrentRequestId(),
      promptVersion: ANALYSIS_PROMPT.version,
      promptFingerprint: ANALYSIS_PROMPT.fingerprint,
    },
  })

  const prompt = buildAnalysisPrompt(input)

  // The compliance gate: policy, consent and classification are asked before
  // anything leaves for the provider, and personal data is removed where the
  // policy requires it. The prompt the gate hands back is the only one that may
  // be sent (roadmap Phase 10).
  const gate = await authorizeAiProcessing({
    engagement: input,
    scope,
    stage: "analysis",
    purpose: "engagement_analysis",
    prompt,
    promptVersion: ANALYSIS_PROMPT.version,
    promptFingerprint: ANALYSIS_PROMPT.fingerprint,
  })

  if (!gate.permitted) {
    trace?.update({
      metadata: {
        engagementId: input.id,
        workspaceId: scope.workspaceId,
        success: false,
        complianceDenial: gate.reason,
      },
    })
    await langfuse?.flushAsync()

    return { success: false, complianceDenial: true, messageId: gate.messageId }
  }

  const llmResponse = await callLlm(gate.prompt)

  const parsedResult = parseAnalysisReport(llmResponse.content)
  const outputReview = await reviewAiOutput({
    engagement: input,
    scope,
    stage: "analysis",
    decision: gate,
    responseText: llmResponse.content,
  })

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
      errorMessage:
        !outputReview.accepted
          ? "AI output contained personal data and was refused."
          : parsedResult.success
            ? undefined
            : parsedResult.error,
      compliance: outputReview.compliance,
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
    logger.error("CREATE_ANALYSIS_RUN_FAILED", failureIdentity(error))
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

  if (!outputReview.accepted) {
    return {
      success: false,
      outputRejected: true,
      messageId: outputReview.messageId,
      evaluation,
    }
  }

  return {
    success: true,
    report: parsedResult.report,
    evaluation,
  }
}
