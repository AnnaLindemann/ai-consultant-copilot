import { randomUUID } from "node:crypto"

import { calculateLlmCost } from "../evaluation/calculate-llm-cost.js"
import { evaluateAnalysisOutput } from "../evaluation/evaluate-analysis-output.js"
import {
  canReplaceRoadmapVersion,
  canonicalRoadmapContent,
  canonicalRoadmapSourceContent,
  identifyRoadmapPhases,
  inRoadmapOrder,
  isRoadmapVersionStale,
  resolveGeneratedRoadmap,
  resolveRoadmap,
  type CitableImplementationPattern,
  type RoadmapResolution,
} from "../domain/engagement/implementation-roadmap.js"
import { canonicalRecommendationContent } from "../domain/engagement/recommendations.js"
import { createSha256Hash } from "../lib/create-sha256-hash.js"
import { getCurrentRequestId, logger } from "../lib/application-logger.js"
import { failureIdentity } from "../lib/failure-identity.js"
import { callLlm } from "../lib/llm-client.js"
import { parseImplementationRoadmap } from "../lib/parse-implementation-roadmap.js"
import { langfuse } from "../observability/langfuse.js"
import { buildImplementationRoadmapPrompt } from "../prompts/build-implementation-roadmap-prompt.js"
import { IMPLEMENTATION_ROADMAP_PROMPT } from "../prompts/implementation-roadmap-prompt.js"
import {
  createAnalysisRun,
  type CreateAnalysisRunInput,
} from "../repositories/analysis-run.repository.js"
import {
  toAssessment,
  type EngagementScope,
  type EngagementWithOrganization,
} from "../repositories/engagement.repository.js"
import {
  createRoadmapVersion,
  getActiveRoadmapVersion,
  getRoadmapVersionById,
  getRoadmapVersions,
  linkRoadmapVersionAnalysisRun,
  saveRoadmapVersion,
} from "../repositories/implementation-roadmap-version.repository.js"
import { getActiveRecommendationVersion } from "../repositories/recommendation-version.repository.js"
import {
  listCitableKnowledge,
  retrieveKnowledgePackage,
} from "./consulting-knowledge.service.js"

import type { EvaluationResult } from "../evaluation/evaluation.types.js"
import {
  authorizeAiProcessing,
  reviewAiOutput,
} from "./ai-compliance.service.js"

import type { RoadmapMessageId } from "../../../shared/implementation-roadmap-messages.js"
import type { ComplianceMessageId } from "../../../shared/compliance-messages.js"
import type {
  Roadmap,
  RoadmapReviewState,
  RoadmapStageState,
  RoadmapSubmission,
  RoadmapVersionDetail,
  RoadmapVersionSummary,
} from "../../../shared/implementation-roadmap.schema.js"
import type { KnowledgePackage } from "../../../shared/consulting-knowledge.schema.js"
import type { RecommendationVersionDetail } from "../../../shared/recommendation.schema.js"

const STAGE = "roadmap" as const

export type GenerateRoadmapFailure =
  | "recommendations_not_ready"
  | "knowledge_unavailable"
  | "consultant_edits_protected"
  | "ai_step_failed"
  | "ai_output_invalid"
  | "ai_output_ungrounded"
  | "version_conflict"
  | "persistence_failed"
  // The Workspace Compliance Policy, the engagement's AI consent, or its data
  // classification refused the request before it reached the provider (roadmap
  // Phase 10).
  | "ai_not_permitted"

export type SaveRoadmapFailure =
  | "recommendations_not_ready"
  | "ai_output_ungrounded"
  | "version_not_found"
  | "historical_version_readonly"
  | "stale_update"

// `ai_not_permitted` is deliberately absent: a compliance refusal is reported
// with the identifier the gate named — which rule refused it — rather than with
// one fixed message for every rule.
const FAILURE_MESSAGE: Record<
  Exclude<GenerateRoadmapFailure, "ai_not_permitted"> | SaveRoadmapFailure,
  RoadmapMessageId
> = {
  recommendations_not_ready: "roadmap.error.recommendations_not_ready",
  knowledge_unavailable: "roadmap.error.knowledge_unavailable",
  consultant_edits_protected: "roadmap.error.consultant_edits_protected",
  ai_step_failed: "roadmap.error.ai_step_failed",
  ai_output_invalid: "roadmap.error.ai_output_invalid",
  ai_output_ungrounded: "roadmap.error.ai_output_ungrounded",
  version_conflict: "roadmap.error.version_conflict",
  persistence_failed: "roadmap.error.persistence_failed",
  version_not_found: "roadmap.error.version_not_found",
  historical_version_readonly: "roadmap.error.historical_version_readonly",
  stale_update: "roadmap.error.stale_update",
}

export type UngroundedRoadmapDetail = {
  unknownRecommendationIds?: string[]
  missingRecommendationIds?: string[]
  unknownImplementationPatternCodes?: string[]
  nonImplementationPatternCodes?: string[]
  dependencyErrors?: string[]
  dispositionErrors?: string[]
}

export type GenerateRoadmapResult =
  | {
      success: true
      version: RoadmapVersionDetail
      evaluation: EvaluationResult
    }
  | ({
      success: false
      failure: GenerateRoadmapFailure
      // A compliance refusal names the rule that stopped it, so the
      // identifier may come from either contract.
      messageId: RoadmapMessageId | ComplianceMessageId
      evaluation?: EvaluationResult
    } & UngroundedRoadmapDetail)

export type SaveRoadmapResult =
  | { success: true; version: RoadmapVersionDetail }
  | ({
      success: false
      failure: SaveRoadmapFailure
      messageId: RoadmapMessageId
      currentRevision?: number
    } & UngroundedRoadmapDetail)

export const generateImplementationRoadmap = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  options: { replaceConsultantEdits: boolean } = {
    replaceConsultantEdits: false,
  },
): Promise<GenerateRoadmapResult> => {
  const recommendationVersion = await acceptedRecommendationVersion(
    engagement.id,
    scope,
  )

  if (recommendationVersion === null) {
    return refused("recommendations_not_ready")
  }

  const activeVersion = await getActiveRoadmapVersion(engagement.id, scope)
  if (
    !canReplaceRoadmapVersion(
      activeVersion?.reviewState ?? null,
      options.replaceConsultantEdits,
    )
  ) {
    return refused("consultant_edits_protected")
  }

  const knowledgePackage = await retrieveImplementationPatterns(
    engagement,
    recommendationVersion,
  )

  if (knowledgePackage.codes.length === 0) {
    return refused("knowledge_unavailable")
  }

  const trace = langfuse?.trace({
    name: "generate-implementation-roadmap",
    metadata: {
      engagementId: engagement.id,
      workspaceId: scope.workspaceId,
      requestId: getCurrentRequestId(),
      stage: STAGE,
      promptVersion: IMPLEMENTATION_ROADMAP_PROMPT.version,
      promptFingerprint: IMPLEMENTATION_ROADMAP_PROMPT.fingerprint,
    },
  })

  const prompt = buildImplementationRoadmapPrompt({
    organization: {
      name: engagement.organization.name,
      industry: engagement.organization.industry,
      companySize: engagement.organization.companySize,
      geography: engagement.organization.geography,
    },
    engagement: {
      title: engagement.title,
      department: engagement.department,
      businessImpact: engagement.businessImpact,
      currentProcess: engagement.currentProcess,
      desiredOutcome: engagement.desiredOutcome,
      technicalConstraints: engagement.technicalConstraints,
      missingInformation: engagement.missingInformation,
    },
    recommendations: recommendationVersion.recommendationSet,
    implementationPatterns: knowledgePackage,
  })

  // The compliance gate: the Workspace Compliance Policy, the engagement's AI
  // consent and its data classification are asked *before* anything leaves for
  // the provider, and personal data is removed where the policy requires it
  // (roadmap Phase 10). The prompt the gate hands back is the only one that may
  // be sent, and a refusal leaves the version the consultant was working on
  // exactly as they left it.
  const gate = await authorizeAiProcessing({
    engagement,
    scope,
    stage: STAGE,
    purpose: "roadmap_assembly",
    prompt,
    promptVersion: IMPLEMENTATION_ROADMAP_PROMPT.version,
    promptFingerprint: IMPLEMENTATION_ROADMAP_PROMPT.fingerprint,
  })

  if (!gate.permitted) {
    trace?.update({
      metadata: {
        engagementId: engagement.id,
        workspaceId: scope.workspaceId,
        stage: STAGE,
        success: false,
        complianceDenial: gate.reason,
      },
    })
    await langfuse?.flushAsync()

    return refusedByCompliance(gate.messageId)
  }

  const llmConfig = { provider: gate.provider, model: gate.model }
  const groundingCodes = { knowledgeEntryCodes: knowledgePackage.codes }

  let llmResponse
  try {
    llmResponse = await callLlm(gate.prompt)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "The AI provider call failed"

    trace?.update({
      metadata: {
        engagementId: engagement.id,
        workspaceId: scope.workspaceId,
        stage: STAGE,
        success: false,
        error: errorMessage,
      },
    })

    await recordRoadmapRun({
      workspaceId: scope.workspaceId,
      engagementId: engagement.id,
      stage: STAGE,
      provider: llmConfig.provider,
      model: llmConfig.model,
      promptVersion: IMPLEMENTATION_ROADMAP_PROMPT.version,
      promptFingerprint: IMPLEMENTATION_ROADMAP_PROMPT.fingerprint,
      jsonParseSuccess: false,
      schemaValid: false,
      errorMessage,
      ...groundingCodes,
      compliance: gate.compliance,
    })

    return refused("ai_step_failed")
  }

  const parsedResult = parseImplementationRoadmap(llmResponse.content)
  const outputReview = await reviewAiOutput({
    engagement,
    scope,
    stage: STAGE,
    decision: gate,
    responseText: llmResponse.content,
  })
  const resolution = parsedResult.success
    ? resolveGeneratedRoadmap(
        parsedResult.roadmap,
        {
          recommendations: recommendationVersion.recommendationSet,
          implementationPatterns: citablePatternsOf(knowledgePackage),
        },
        mintRoadmapPhaseId,
      )
    : null
  const grounded = resolution?.resolved === true

  const costEstimateUsd = calculateLlmCost({
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
  })

  const evaluation = evaluateAnalysisOutput({
    provider: llmResponse.provider,
    model: llmResponse.model,
    jsonParseSuccess: parsedResult.jsonParseSuccess,
    schemaValid: parsedResult.schemaValid && grounded,
    latencyMs: llmResponse.latencyMs,
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
    costEstimateUsd,
  })

  trace?.generation({
    name: "implementation-roadmap-llm-call",
    model: llmResponse.model,
    metadata: {
      provider: llmResponse.provider,
      stage: STAGE,
      promptVersion: IMPLEMENTATION_ROADMAP_PROMPT.version,
      promptFingerprint: IMPLEMENTATION_ROADMAP_PROMPT.fingerprint,
      latencyMs: llmResponse.latencyMs,
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      totalTokens: llmResponse.totalTokens,
      costEstimateUsd,
      jsonParseSuccess: parsedResult.jsonParseSuccess,
      schemaValid: parsedResult.schemaValid,
      grounded,
      knowledgeEntryCodes: knowledgePackage.codes,
    },
  })

  const persisted =
    outputReview.accepted && resolution?.resolved === true
      ? await persistVersion(
          engagement,
          scope,
          recommendationVersion,
          inRoadmapOrder(identifyRoadmapPhases(resolution.roadmap, mintRoadmapPhaseId)),
        )
      : null

  const analysisRunId = await recordRoadmapRun({
    workspaceId: scope.workspaceId,
    engagementId: engagement.id,
    stage: STAGE,
    provider: llmResponse.provider,
    model: llmResponse.model,
    promptVersion: IMPLEMENTATION_ROADMAP_PROMPT.version,
    promptFingerprint: IMPLEMENTATION_ROADMAP_PROMPT.fingerprint,
    latencyMs: llmResponse.latencyMs,
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
    costEstimateUsd,
    jsonParseSuccess: parsedResult.jsonParseSuccess,
    schemaValid: parsedResult.schemaValid && grounded,
    errorMessage: generationError(
      parsedResult,
      outputReview,
      resolution,
      persisted,
    ),
    ...groundingCodes,
    compliance: outputReview.compliance,
  })

  trace?.update({
    metadata: {
      engagementId: engagement.id,
      workspaceId: scope.workspaceId,
      analysisRunId,
      stage: STAGE,
      success: persisted?.stored === true,
      jsonParseSuccess: parsedResult.jsonParseSuccess,
      schemaValid: parsedResult.schemaValid,
      grounded,
      versionNumber:
        persisted?.stored === true ? persisted.version.versionNumber : undefined,
    },
  })

  if (!parsedResult.success) return { ...refused("ai_output_invalid"), evaluation }
  if (resolution === null) {
    return { ...refused("ai_output_invalid"), evaluation }
  }

  if (!outputReview.accepted) {
    return {
      success: false,
      failure: "ai_output_invalid",
      messageId: outputReview.messageId,
      evaluation,
    }
  }

  if (resolution.resolved !== true) {
    return {
      ...refused("ai_output_ungrounded"),
      ...ungroundedDetail(resolution),
      evaluation,
    }
  }
  if (persisted?.stored !== true) {
    return {
      ...refused(persisted?.reason ?? "persistence_failed"),
      evaluation,
    }
  }

  if (analysisRunId) {
    await linkRoadmapVersionAnalysisRun(persisted.version.id, analysisRunId)
  }

  return {
    success: true,
    version: {
      ...persisted.version,
      analysisRunId: analysisRunId ?? persisted.version.analysisRunId,
    },
    evaluation,
  }
}

export const saveImplementationRoadmap = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  input: {
    versionId: string
    expectedRevision: number
    roadmap: RoadmapSubmission
    reviewState: Exclude<RoadmapReviewState, "ai_draft">
  },
): Promise<SaveRoadmapResult> => {
  const version = await getRoadmapVersionById(
    input.versionId,
    engagement.id,
    scope,
  )
  if (version === null) return refusedSave("version_not_found")

  const sourceRecommendationVersion = await getActiveRecommendationVersion(
    engagement.id,
    scope,
  )
  if (
    sourceRecommendationVersion === null ||
    sourceRecommendationVersion.id !== version.sourceRecommendationVersionId ||
    sourceRecommendationVersion.reviewState !== "accepted"
  ) {
    return refusedSave("recommendations_not_ready")
  }

  const citableKnowledge = await listCitableKnowledge()
  const resolution = resolveRoadmap(input.roadmap, {
    recommendations: sourceRecommendationVersion.recommendationSet,
    implementationPatterns: citableKnowledge,
  })

  if (!resolution.resolved) {
    return {
      ...refusedSave("ai_output_ungrounded"),
      ...ungroundedDetail(resolution),
    }
  }

  const resolvedRoadmap = inRoadmapOrder(
    identifyRoadmapPhases(resolution.roadmap, mintRoadmapPhaseId),
  )
  const saved = await saveRoadmapVersion(scope, {
    versionId: input.versionId,
    engagementId: engagement.id,
    expectedRevision: input.expectedRevision,
    roadmap: resolvedRoadmap,
    reviewState: input.reviewState,
    sourceRecommendationFingerprint: roadmapSourceFingerprint(
      sourceRecommendationVersion,
      resolvedRoadmap,
    ),
    modifiedByUserId: scope.userId,
  })

  if (!saved.saved) {
    return {
      ...refusedSave(saved.reason),
      currentRevision: saved.currentRevision,
    }
  }

  return { success: true, version: saved.version }
}

export const getRoadmapStageState = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
): Promise<RoadmapStageState> => {
  const [activeVersion, recommendationVersion] = await Promise.all([
    getActiveRoadmapVersion(engagement.id, scope),
    acceptedRecommendationVersion(engagement.id, scope),
  ])

  const currentRecommendationFingerprint =
    recommendationVersion === null || activeVersion === null
      ? recommendationVersion === null
        ? null
        : recommendationFingerprint(recommendationVersion)
      : roadmapSourceFingerprint(recommendationVersion, activeVersion.roadmap)

  const knowledgePackage =
    recommendationVersion === null
      ? null
      : await retrieveImplementationPatterns(engagement, recommendationVersion)

  return {
    activeVersion,
    stale: isRoadmapVersionStale(
      activeVersion?.sourceRecommendationFingerprint ?? null,
      currentRecommendationFingerprint,
    ),
    acceptedRecommendationVersionId: recommendationVersion?.id ?? null,
    acceptedRecommendationVersionNumber:
      recommendationVersion?.versionNumber ?? null,
    acceptedRecommendationFingerprint: currentRecommendationFingerprint,
    acceptedRecommendationsAvailable: recommendationVersion !== null,
    implementationPatternOptions:
      knowledgePackage?.entries.map((entry) => ({
        code: entry.code,
        title: entry.title,
        summary: entry.summary,
      })) ?? [],
  }
}

export const listRoadmapVersions = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<RoadmapVersionSummary[]> => getRoadmapVersions(engagementId, scope)

export const roadmapFingerprint = (version: RoadmapVersionDetail): string =>
  createSha256Hash(canonicalRoadmapContent(version.roadmap))

export const roadmapSourceFingerprint = (
  recommendationVersion: RecommendationVersionDetail,
  roadmap: Pick<RoadmapVersionDetail["roadmap"], "recommendationDispositions">,
): string =>
  createSha256Hash(
    canonicalRoadmapSourceContent({
      recommendationVersionId: recommendationVersion.id,
      recommendationVersionNumber: recommendationVersion.versionNumber,
      recommendations: recommendationVersion.recommendationSet,
      recommendationDispositions: roadmap.recommendationDispositions,
    }),
  )

const acceptedRecommendationVersion = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<RecommendationVersionDetail | null> => {
  const version = await getActiveRecommendationVersion(engagementId, scope)

  return version?.reviewState === "accepted" ? version : null
}

const recommendationFingerprint = (
  version: RecommendationVersionDetail,
): string =>
  createSha256Hash(canonicalRecommendationContent(version.recommendationSet))

const retrieveImplementationPatterns = async (
  engagement: EngagementWithOrganization,
  recommendationVersion: RecommendationVersionDetail,
): Promise<KnowledgePackage> =>
  retrieveKnowledgePackage(engagement, "roadmap", {
    assessment: toAssessment(engagement),
    recommendations: recommendationVersion.recommendationSet,
  })

const citablePatternsOf = (
  knowledgePackage: KnowledgePackage,
): CitableImplementationPattern =>
  new Map(
    knowledgePackage.entries.map((entry) => [
      entry.code,
      { kind: entry.kind, title: entry.title, summary: entry.summary },
    ]),
  )

type PersistOutcome =
  | { stored: true; version: RoadmapVersionDetail }
  | { stored: false; reason: "version_conflict" | "persistence_failed" }

const persistVersion = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  recommendationVersion: RecommendationVersionDetail,
  roadmap: Roadmap,
): Promise<PersistOutcome> => {
  try {
    const created = await createRoadmapVersion(scope, {
      workspaceId: scope.workspaceId,
      engagementId: engagement.id,
      roadmap,
      sourceRecommendationVersionId: recommendationVersion.id,
      sourceRecommendationVersionNumber: recommendationVersion.versionNumber,
      sourceRecommendationFingerprint:
        roadmapSourceFingerprint(recommendationVersion, roadmap),
      createdByUserId: scope.userId,
    })

    return created.created
      ? { stored: true, version: created.version }
      : { stored: false, reason: created.reason }
  } catch (error) {
    logger.error("PERSIST_ROADMAP_VERSION_FAILED", failureIdentity(error))
    return { stored: false, reason: "persistence_failed" }
  }
}

const recordRoadmapRun = async (
  input: CreateAnalysisRunInput,
): Promise<string | null> => {
  try {
    const run = await createAnalysisRun(input)
    return run.id
  } catch (error) {
    logger.error("RECORD_ROADMAP_RUN_FAILED", failureIdentity(error))
    return null
  }
}

const generationError = (
  parsedResult: ReturnType<typeof parseImplementationRoadmap>,
  outputReview: { accepted: boolean },
  resolution: RoadmapResolution | null,
  persisted: PersistOutcome | null,
): string | undefined => {
  if (!outputReview.accepted) {
    return "AI output contained personal data and was refused."
  }

  if (!parsedResult.success) return parsedResult.error
  if (resolution?.resolved === false) {
    return JSON.stringify(ungroundedDetail(resolution))
  }
  if (persisted?.stored === false) return persisted.reason
  return undefined
}

const ungroundedDetail = (
  resolution: Extract<RoadmapResolution, { resolved: false }>,
): UngroundedRoadmapDetail => ({
  unknownRecommendationIds: resolution.unknownRecommendationIds,
  missingRecommendationIds: resolution.missingRecommendationIds,
  unknownImplementationPatternCodes:
    resolution.unknownImplementationPatternCodes,
  nonImplementationPatternCodes: resolution.nonImplementationPatternCodes,
  dependencyErrors: resolution.dependencyErrors,
  dispositionErrors: resolution.dispositionErrors,
})

// A compliance refusal carries the identifier the gate named rather than this
// stage's own, so the consultant is told which rule stopped the request.
const refusedByCompliance = (messageId: ComplianceMessageId) =>
  ({
    success: false,
    failure: "ai_not_permitted",
    messageId,
  }) as const

const refused = (
  failure: Exclude<GenerateRoadmapFailure, "ai_not_permitted">,
): Extract<GenerateRoadmapResult, { success: false }> => ({
  success: false,
  failure,
  messageId: FAILURE_MESSAGE[failure],
})

const refusedSave = (
  failure: SaveRoadmapFailure,
): Extract<SaveRoadmapResult, { success: false }> => ({
  success: false,
  failure,
  messageId: FAILURE_MESSAGE[failure],
})

const mintRoadmapPhaseId = (): string => `roadmap-phase-${randomUUID()}`
