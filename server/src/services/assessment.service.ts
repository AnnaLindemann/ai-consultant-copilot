import { randomUUID } from "node:crypto"

import { calculateLlmCost } from "../evaluation/calculate-llm-cost.js"
import { evaluateAnalysisOutput } from "../evaluation/evaluate-analysis-output.js"
import {
  canReplaceAssessment,
  hasDiscoveryContentToAssess,
  identifyAssessmentFindings,
} from "../domain/engagement/assessment.js"
import { callLlm } from "../lib/llm-client.js"
import { getDefaultLlmConfig } from "../lib/llm-config.js"
import { parseAssessment } from "../lib/parse-assessment.js"
import { langfuse } from "../observability/langfuse.js"
import { ASSESSMENT_PROMPT } from "../prompts/assessment-prompt.js"
import { buildAssessmentPrompt } from "../prompts/build-assessment-prompt.js"
import { retrieveKnowledgePackage } from "./consulting-knowledge.service.js"
import {
  createAnalysisRun,
  type CreateAnalysisRunInput,
} from "../repositories/analysis-run.repository.js"
import {
  toAssessment,
  toDiscoveryProfile,
  type EngagementScope,
  updateEngagementAssessment,
  type EngagementWithOrganization,
} from "../repositories/engagement.repository.js"

import type {
  Assessment,
  AssessmentReviewState,
  AssessmentSubmission,
} from "../../../shared/assessment.schema.js"
import type { EvaluationResult } from "../evaluation/evaluation.types.js"
import { failureIdentity } from "../lib/failure-identity.js"

// Why an assessment could not be generated. Each is a domain-meaningful
// outcome the consultant can act on, not an exception (architecture.md §13).
export type GenerateAssessmentFailure =
  | "discovery_not_ready"
  | "consultant_edits_protected"
  | "ai_step_failed"
  | "ai_output_invalid"

export type GenerateAssessmentResult =
  | {
      success: true
      assessment: Assessment
      reviewState: AssessmentReviewState
      evaluation: EvaluationResult
    }
  | {
      success: false
      failure: GenerateAssessmentFailure
      error: string
      evaluation?: EvaluationResult
    }

export type GenerateAssessmentOptions = {
  // The consultant's explicit intent to discard their own edits and regenerate.
  replaceConsultantEdits: boolean
}

// Generate the Assessment for an engagement from its persisted Discovery
// Profile (roadmap Phase 3). The AI-assisted step reuses the shared
// orchestration: build prompt → call LLM → parse → evaluate → persist draft →
// record Analysis Run → trace (architecture.md §5).
export const generateAssessment = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  options: GenerateAssessmentOptions,
): Promise<GenerateAssessmentResult> => {
  const discoveryProfile = toDiscoveryProfile(engagement)

  // Both guards run before any AI call, so a refused generation neither costs a
  // request nor produces an Analysis Run: nothing was run to record.
  if (!hasDiscoveryContentToAssess(discoveryProfile)) {
    return {
      success: false,
      failure: "discovery_not_ready",
      error:
        "The Discovery Profile is empty. Capture what is known about the client before generating an Assessment.",
    }
  }

  if (
    !canReplaceAssessment(
      engagement.assessmentReviewState,
      options.replaceConsultantEdits,
    )
  ) {
    return {
      success: false,
      failure: "consultant_edits_protected",
      error:
        "This Assessment carries your own edits. Re-running would replace them, so it needs your explicit confirmation.",
    }
  }

  const trace = langfuse?.trace({
    name: "generate-assessment",
    metadata: {
      engagementId: engagement.id,
      workspaceId: scope.workspaceId,
      stage: "assessment",
      promptVersion: ASSESSMENT_PROMPT.version,
      promptFingerprint: ASSESSMENT_PROMPT.fingerprint,
    },
  })

  // Deterministic grounding first: the knowledge is retrieved and passed *into*
  // the prompt, so the model reasons over supplied knowledge rather than
  // inventing it, and the codes it was grounded in are recorded on the run
  // (architecture.md §5; roadmap Phase 5).
  const knowledgePackage = await retrieveKnowledgePackage(
    engagement,
    "assessment",
    engagement.assessment ? toAssessment(engagement) : null,
  )

  const prompt = buildAssessmentPrompt({
    organization: {
      name: engagement.organization.name,
      industry: engagement.organization.industry,
      companySize: engagement.organization.companySize,
      geography: engagement.organization.geography,
    },
    engagement: {
      title: engagement.title,
      department: engagement.department,
    },
    discoveryProfile,
    knowledgePackage,
  })

  // Resolved up front so a provider failure can still be attributed to the
  // provider and model it was attempted with.
  const llmConfig = getDefaultLlmConfig()

  let llmResponse
  try {
    llmResponse = await callLlm(prompt)
  } catch (error) {
    // A provider failure is still a failed AI-assisted step: it is recorded so
    // the audit trail survives (coding-standards.md §7), and engagement state
    // is left untouched.
    const errorMessage =
      error instanceof Error ? error.message : "The AI provider call failed"

    trace?.update({
      metadata: {
        engagementId: engagement.id,
        workspaceId: scope.workspaceId,
        stage: "assessment",
        success: false,
        error: errorMessage,
      },
    })

    await recordAssessmentRun({
      workspaceId: scope.workspaceId,
      engagementId: engagement.id,
      stage: "assessment",
      provider: llmConfig.provider,
      model: llmConfig.model,
      promptVersion: ASSESSMENT_PROMPT.version,
      promptFingerprint: ASSESSMENT_PROMPT.fingerprint,
      jsonParseSuccess: false,
      schemaValid: false,
      errorMessage,
      knowledgeEntryCodes: knowledgePackage.codes,
    })

    return {
      success: false,
      failure: "ai_step_failed",
      error: errorMessage,
    }
  }

  const parsedResult = parseAssessment(llmResponse.content)

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
    name: "assessment-llm-call",
    model: llmResponse.model,
    metadata: {
      provider: llmResponse.provider,
      stage: "assessment",
      promptVersion: ASSESSMENT_PROMPT.version,
      promptFingerprint: ASSESSMENT_PROMPT.fingerprint,
      latencyMs: llmResponse.latencyMs,
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      totalTokens: llmResponse.totalTokens,
      costEstimateUsd,
      jsonParseSuccess: parsedResult.jsonParseSuccess,
      schemaValid: parsedResult.schemaValid,
    },
  })

  const analysisRunId = await recordAssessmentRun({
    workspaceId: scope.workspaceId,
    engagementId: engagement.id,
    stage: "assessment",
    provider: llmResponse.provider,
    model: llmResponse.model,
    promptVersion: ASSESSMENT_PROMPT.version,
    promptFingerprint: ASSESSMENT_PROMPT.fingerprint,
    latencyMs: llmResponse.latencyMs,
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
    costEstimateUsd,
    jsonParseSuccess: parsedResult.jsonParseSuccess,
    schemaValid: parsedResult.schemaValid,
    errorMessage: parsedResult.success ? undefined : parsedResult.error,
    knowledgeEntryCodes: knowledgePackage.codes,
  })

  trace?.update({
    metadata: {
      engagementId: engagement.id,
      workspaceId: scope.workspaceId,
      analysisRunId,
      stage: "assessment",
      promptVersion: ASSESSMENT_PROMPT.version,
      promptFingerprint: ASSESSMENT_PROMPT.fingerprint,
      success: parsedResult.success,
      jsonParseSuccess: parsedResult.jsonParseSuccess,
      schemaValid: parsedResult.schemaValid,
    },
  })

  // Unusable AI output leaves the previous Assessment exactly as it was
  // (architecture.md §13; agent-rules.md §10).
  if (!parsedResult.success) {
    return {
      success: false,
      failure: "ai_output_invalid",
      error: parsedResult.error,
      evaluation,
    }
  }

  // Validated output is persisted as an unreviewed draft the consultant owns.
  // Identity is added here, on the server: the model writes findings, and each
  // one gets a stable id that downstream stages cite and that survives every
  // later re-wording of its title.
  const assessment = identifyAssessmentFindings(parsedResult.assessment, mintFindingId)

  await updateEngagementAssessment(engagement.id, scope, assessment, "ai_draft")

  return {
    success: true,
    assessment,
    reviewState: "ai_draft",
    evaluation,
  }
}

// Save the consultant's reviewed Assessment. Consultant authorship is
// deterministic engagement state, so it records no Analysis Run — the same way
// discovery does.
// Findings the consultant kept carry the id they already had; findings they
// added get one here. Nothing downstream loses its citation because a title was
// re-worded, and nothing the browser sent decides an identity.
export const saveAssessment = async (
  engagementId: string,
  scope: EngagementScope,
  submitted: AssessmentSubmission,
  reviewState: Exclude<AssessmentReviewState, "ai_draft">,
) =>
  updateEngagementAssessment(
    engagementId,
    scope,
    identifyAssessmentFindings(submitted, mintFindingId),
    reviewState,
  )

// A finding's identity is opaque and unrelated to its text, so re-wording a
// title can never change what cites it.
const mintFindingId = () => randomUUID()

// Recording the run and flushing the trace are best-effort: they must never
// fail the consultant's stage (coding-standards.md §7).
const recordAssessmentRun = async (
  input: CreateAnalysisRunInput,
): Promise<string | undefined> => {
  try {
    const analysisRun = await createAnalysisRun(input)
    return analysisRun.id
  } catch (error) {
    console.error("CREATE_ASSESSMENT_ANALYSIS_RUN_FAILED", failureIdentity(error))
    return undefined
  } finally {
    await langfuse?.flushAsync()
  }
}
