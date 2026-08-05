import { randomUUID } from "node:crypto"

import { calculateLlmCost } from "../evaluation/calculate-llm-cost.js"
import { evaluateAnalysisOutput } from "../evaluation/evaluate-analysis-output.js"
import { canonicalAssessmentContent } from "../domain/engagement/assessment.js"
import {
  canReplaceOpportunityVersion,
  hasAssessmentToPrioritize,
  identifyOpportunities,
  inPriorityOrder,
  isOpportunityVersionStale,
  resolveCitations,
} from "../domain/engagement/opportunities.js"
import { createSha256Hash } from "../lib/create-sha256-hash.js"
import { getCurrentRequestId, logger } from "../lib/application-logger.js"
import { callLlm } from "../lib/llm-client.js"
import { parseOpportunities } from "../lib/parse-opportunities.js"
import { langfuse } from "../observability/langfuse.js"
import { OPPORTUNITIES_PROMPT } from "../prompts/opportunities-prompt.js"
import { buildOpportunitiesPrompt } from "../prompts/build-opportunities-prompt.js"
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
  createOpportunityVersion,
  getActiveOpportunityVersion,
  getOpportunityVersions,
  linkOpportunityVersionAnalysisRun,
  saveOpportunityVersion,
} from "../repositories/opportunity-version.repository.js"

import type { Assessment, AssessmentFindingId } from "../../../shared/assessment.schema.js"
import {
  authorizeAiProcessing,
  reviewAiOutput,
} from "./ai-compliance.service.js"

import type { OpportunityMessageId } from "../../../shared/opportunity-messages.js"
import type { ComplianceMessageId } from "../../../shared/compliance-messages.js"
import type {
  OpportunityPrioritizationSubmission,
  OpportunityReviewState,
  OpportunityVersionDetail,
  OpportunityVersionState,
  OpportunityVersionSummary,
} from "../../../shared/opportunity.schema.js"
import type { EvaluationResult } from "../evaluation/evaluation.types.js"
import { failureIdentity } from "../lib/failure-identity.js"

// Which methodology stage these runs support. It matches the engagement's own
// `prioritization` stage marker, so runs filter by the same name the engagement
// stands at (architecture.md §8).
const STAGE = "prioritization" as const

// Why a prioritization could not be produced or saved. Each is a
// domain-meaningful outcome the consultant can act on, not an exception
// (architecture.md §13), and each is reported as an identifier the frontend
// localizes — never as prose (coding-standards.md §12A).
export type PrioritizeOpportunitiesFailure =
  | "assessment_not_ready"
  | "consultant_edits_protected"
  // The Workspace Compliance Policy, the engagement's AI consent, or its data
  // classification refused the request before it reached the provider (roadmap
  // Phase 10).
  | "ai_not_permitted"
  | "ai_step_failed"
  | "ai_output_invalid"
  | "ai_output_ungrounded"
  | "version_conflict"
  | "persistence_failed"

export type SaveOpportunitiesFailure =
  | "assessment_not_ready"
  | "ai_output_ungrounded"
  | "success_criteria_placeholder"
  | "version_not_found"
  | "historical_version_readonly"
  | "stale_update"

// `ai_not_permitted` is deliberately absent: a compliance refusal is reported
// with the identifier the gate named — which rule refused it — rather than with
// one fixed message for every rule.
const FAILURE_MESSAGE: Record<
  | Exclude<PrioritizeOpportunitiesFailure, "ai_not_permitted">
  | SaveOpportunitiesFailure,
  OpportunityMessageId
> = {
  assessment_not_ready: "opportunity.error.assessment_not_ready",
  consultant_edits_protected:
    "opportunity.error.consultant_edits_protected",
  ai_step_failed: "opportunity.error.ai_step_failed",
  ai_output_invalid: "opportunity.error.ai_output_invalid",
  ai_output_ungrounded: "opportunity.error.ai_output_ungrounded",
  success_criteria_placeholder:
    "opportunity.error.success_criteria_placeholder",
  version_conflict: "opportunity.error.version_conflict",
  persistence_failed: "opportunity.error.persistence_failed",
  version_not_found: "opportunity.error.version_not_found",
  historical_version_readonly: "opportunity.error.historical_version_readonly",
  stale_update: "opportunity.error.stale_update",
}

export type PrioritizeOpportunitiesResult =
  | {
      success: true
      version: OpportunityVersionDetail
      evaluation: EvaluationResult
    }
  | {
      success: false
      failure: PrioritizeOpportunitiesFailure
      // A compliance refusal names the rule that stopped it, so the identifier
      // may come from either contract.
      messageId: OpportunityMessageId | ComplianceMessageId
      evaluation?: EvaluationResult
      // The finding ids the citation named but the Assessment does not contain,
      // so the consultant can see *what* was fabricated rather than only that
      // something was.
      unknownFindingIds?: AssessmentFindingId[]
    }

export type SaveOpportunitiesResult =
  | { success: true; version: OpportunityVersionDetail }
  | {
      success: false
      failure: SaveOpportunitiesFailure
      messageId: OpportunityMessageId
      unknownFindingIds?: AssessmentFindingId[]
      // What the version's revision actually is, so a client that lost a race
      // can re-read rather than guess.
      currentRevision?: number
    }

// Derive, qualify, and prioritize the engagement's Opportunities from its
// persisted Assessment (roadmap Phase 4). The AI-assisted step reuses the shared
// orchestration: build prompt → call LLM → parse → evaluate → persist → record
// Analysis Run → trace (architecture.md §5).
//
// Regeneration is additive. It never touches the version that is already there:
// the new snapshot is created and made active in one transaction, and only once
// generation, validation, and persistence have all succeeded. Until then — and
// on every failure path below — the version the consultant was working on is
// exactly as they left it (coding-standards.md §7).
export const prioritizeOpportunities = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  options: { replaceConsultantEdits: boolean } = {
    replaceConsultantEdits: false,
  },
): Promise<PrioritizeOpportunitiesResult> => {
  const assessment = toAssessment(engagement)

  // Guarded before any AI call, so a refused run neither costs a request nor
  // produces an Analysis Run: nothing was run to record.
  if (!hasAssessmentToPrioritize(assessment)) {
    return refused("assessment_not_ready")
  }

  const activeVersion = await getActiveOpportunityVersion(engagement.id, scope)
  if (
    !canReplaceOpportunityVersion(
      activeVersion?.reviewState ?? null,
      options.replaceConsultantEdits,
    )
  ) {
    return refused("consultant_edits_protected")
  }

  // Guarded above: an engagement with no assessed findings never reaches here.
  const assessedState = assessment!

  const trace = langfuse?.trace({
    name: "prioritize-opportunities",
    metadata: {
      engagementId: engagement.id,
      workspaceId: scope.workspaceId,
      requestId: getCurrentRequestId(),
      stage: STAGE,
      promptVersion: OPPORTUNITIES_PROMPT.version,
      promptFingerprint: OPPORTUNITIES_PROMPT.fingerprint,
    },
  })

  const prompt = buildOpportunitiesPrompt({
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
    assessment: assessedState,
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
    purpose: "opportunity_prioritization",
    prompt,
    promptVersion: OPPORTUNITIES_PROMPT.version,
    promptFingerprint: OPPORTUNITIES_PROMPT.fingerprint,
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

  let llmResponse
  try {
    llmResponse = await callLlm(gate.prompt)
  } catch (error) {
    // A provider failure is still a failed AI-assisted step: it is recorded so
    // the audit trail survives (coding-standards.md §7), and no version is
    // created or changed.
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

    await recordPrioritizationRun({
      workspaceId: scope.workspaceId,
      engagementId: engagement.id,
      stage: STAGE,
      provider: llmConfig.provider,
      model: llmConfig.model,
      promptVersion: OPPORTUNITIES_PROMPT.version,
      promptFingerprint: OPPORTUNITIES_PROMPT.fingerprint,
      jsonParseSuccess: false,
      schemaValid: false,
      errorMessage,
      compliance: gate.compliance,
    })

    return refused("ai_step_failed")
  }

  const parsedResult = parseOpportunities(llmResponse.content)
  const outputReview = await reviewAiOutput({
    engagement,
    scope,
    stage: STAGE,
    decision: gate,
    responseText: llmResponse.content,
  })

  // Grounding is checked as part of validity, not after the fact: a citation
  // naming a finding the Assessment does not contain is fabricated grounding,
  // and output carrying one is unusable (agent-rules.md §3, §12).
  const citations = parsedResult.success
    ? resolveCitations(parsedResult.prioritization, assessedState)
    : null
  const grounded = citations?.resolved === true

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
    name: "opportunities-llm-call",
    model: llmResponse.model,
    metadata: {
      provider: llmResponse.provider,
      stage: STAGE,
      promptVersion: OPPORTUNITIES_PROMPT.version,
      promptFingerprint: OPPORTUNITIES_PROMPT.fingerprint,
      latencyMs: llmResponse.latencyMs,
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      totalTokens: llmResponse.totalTokens,
      costEstimateUsd,
      jsonParseSuccess: parsedResult.jsonParseSuccess,
      schemaValid: parsedResult.schemaValid,
      grounded,
    },
  })

  // Persistence is attempted before the run is recorded, so the run's record
  // can carry the *whole* outcome — a lost race or a storage failure belongs on
  // it as much as a provider failure does — and so the version it produced can
  // be linked back to it (architecture.md §8).
  // Identity is added here, on the server: the model writes opportunities, and
  // each one gets a stable id that a Recommendation cites and that survives
  // every later re-wording of its title and re-ordering of its rank.
  const persisted =
    outputReview.accepted && citations?.resolved === true
      ? await persistVersion(
          engagement,
          scope,
          assessedState,
          identifyOpportunities(citations.prioritization, mintOpportunityId),
        )
      : null

  const runErrorMessage = generationError(
    parsedResult,
    outputReview,
    citations,
    persisted,
  )

  const analysisRunId = await recordPrioritizationRun({
    workspaceId: scope.workspaceId,
    engagementId: engagement.id,
    stage: STAGE,
    provider: llmResponse.provider,
    model: llmResponse.model,
    promptVersion: OPPORTUNITIES_PROMPT.version,
    promptFingerprint: OPPORTUNITIES_PROMPT.fingerprint,
    latencyMs: llmResponse.latencyMs,
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
    costEstimateUsd,
    jsonParseSuccess: parsedResult.jsonParseSuccess,
    // An ungrounded citation is a broken contract as much as a missing field
    // is, so the run records it as such rather than as a valid run.
    schemaValid: parsedResult.schemaValid && grounded,
    errorMessage: runErrorMessage,
    compliance: outputReview.compliance,
  })

  trace?.update({
    metadata: {
      engagementId: engagement.id,
      workspaceId: scope.workspaceId,
      analysisRunId,
      stage: STAGE,
      promptVersion: OPPORTUNITIES_PROMPT.version,
      promptFingerprint: OPPORTUNITIES_PROMPT.fingerprint,
      success: persisted?.stored === true,
      jsonParseSuccess: parsedResult.jsonParseSuccess,
      schemaValid: parsedResult.schemaValid,
      grounded,
      versionNumber:
        persisted?.stored === true ? persisted.version.versionNumber : undefined,
    },
  })

  // Unusable AI output leaves the active version exactly as it was
  // (architecture.md §13; agent-rules.md §10).
  if (!parsedResult.success) {
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

  if (citations?.resolved !== true) {
    return {
      ...refused("ai_output_ungrounded"),
      evaluation,
      unknownFindingIds: citations?.unknownFindingIds ?? [],
    }
  }

  if (persisted?.stored !== true) {
    return {
      ...refused(persisted?.reason ?? "persistence_failed"),
      evaluation,
    }
  }

  if (analysisRunId) {
    await linkAnalysisRun(persisted.version.id, analysisRunId)
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

// Save the consultant's reviewed Opportunities into the version they are
// working on. Consultant authorship is deterministic engagement state, so it
// records no Analysis Run — the same way discovery and the Assessment do.
// Re-ordering by hand is exactly this path: the consultant sets the ranks and
// the stored version follows them.
//
// Editing does not create a version. It changes the active one, guarded by the
// revision the consultant read, so a save that has been overtaken is refused
// rather than allowed to overwrite (architecture.md §13).
export const saveOpportunities = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  input: {
    versionId: string
    expectedRevision: number
    prioritization: OpportunityPrioritizationSubmission
    reviewState: Exclude<OpportunityReviewState, "ai_draft">
  },
): Promise<SaveOpportunitiesResult> => {
  const assessment = toAssessment(engagement)

  if (assessment === null) {
    return refusedSave("assessment_not_ready")
  }

  if (containsPlaceholderSuccessCriteria(input.prioritization)) {
    return refusedSave("success_criteria_placeholder")
  }

  // The consultant's citations are held to the same rule as the model's: a
  // finding id the Assessment does not contain cannot be stored, whoever wrote
  // it (agent-rules.md §3, §12).
  const citations = resolveCitations(input.prioritization, assessment)
  if (!citations.resolved) {
    return {
      ...refusedSave("ai_output_ungrounded"),
      unknownFindingIds: citations.unknownFindingIds,
    }
  }

  // Opportunities the consultant kept carry the id they already had; ones they
  // added get one here. Nothing that cites an opportunity loses its citation
  // because a title was re-worded, and nothing the browser sent decides an
  // identity.
  const saved = await saveOpportunityVersion(scope, {
    versionId: input.versionId,
    engagementId: engagement.id,
    expectedRevision: input.expectedRevision,
    prioritization: inPriorityOrder(
      identifyOpportunities(citations.prioritization, mintOpportunityId),
    ),
    reviewState: input.reviewState,
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

// Where the engagement's Opportunities stand, for a reader: the version being
// worked on and whether the Assessment has moved on beneath it. Staleness is a
// recommendation to regenerate and nothing more — no version is ever changed
// because the Assessment changed (agent-rules.md §15).
export const getOpportunityVersionState = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
): Promise<OpportunityVersionState> => {
  const assessment = toAssessment(engagement)
  const currentAssessmentFingerprint = assessment
    ? assessmentFingerprint(assessment)
    : null
  const activeVersion = await getActiveOpportunityVersion(engagement.id, scope)

  return {
    activeVersion,
    stale: isOpportunityVersionStale(
      activeVersion?.sourceAssessmentFingerprint ?? null,
      currentAssessmentFingerprint,
    ),
    currentAssessmentRevision: engagement.assessmentRevision,
    currentAssessmentFingerprint,
  }
}

export const listOpportunityVersions = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<OpportunityVersionSummary[]> =>
  getOpportunityVersions(engagementId, scope)

// A fingerprint of the Assessment's content. Content-based rather than
// time-based, so a save that changed nothing does not make a derived version
// look stale, and any real edit does.
export const assessmentFingerprint = (assessment: Assessment): string =>
  createSha256Hash(canonicalAssessmentContent(assessment))

// An opportunity's identity is opaque and unrelated to its text or its rank, so
// re-wording a title or re-ordering the prioritization can never change what
// cites it.
const mintOpportunityId = () => randomUUID()

type PersistOutcome =
  | { stored: true; version: OpportunityVersionDetail }
  | { stored: false; reason: "version_conflict" | "persistence_failed" }

// Storing the new version. A lost race and a storage failure are both reported
// as outcomes rather than thrown, because both leave the previous active
// version untouched and both belong on the Analysis Run.
const persistVersion = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  assessment: Assessment,
  prioritization: Parameters<typeof inPriorityOrder>[0],
): Promise<PersistOutcome> => {
  try {
    const created = await createOpportunityVersion(scope, {
      workspaceId: scope.workspaceId,
      engagementId: engagement.id,
      prioritization: inPriorityOrder(prioritization),
      sourceAssessmentRevision: engagement.assessmentRevision,
      sourceAssessmentFingerprint: assessmentFingerprint(assessment),
      createdByUserId: scope.userId,
    })

    return created.created
      ? { stored: true, version: created.version }
      : { stored: false, reason: created.reason }
  } catch (error) {
    logger.error("STORE_OPPORTUNITY_VERSION_FAILED", failureIdentity(error))
    return { stored: false, reason: "persistence_failed" }
  }
}

// A compliance refusal carries the identifier the gate named rather than this
// stage's own, so the consultant is told which rule stopped the request.
const refusedByCompliance = (messageId: ComplianceMessageId) =>
  ({
    success: false,
    failure: "ai_not_permitted",
    messageId,
  }) as const

const refused = (
  failure: Exclude<PrioritizeOpportunitiesFailure, "ai_not_permitted">,
) =>
  ({
    success: false,
    failure,
    messageId: FAILURE_MESSAGE[failure],
  }) as const

const refusedSave = (failure: SaveOpportunitiesFailure) =>
  ({
    success: false,
    failure,
    messageId: FAILURE_MESSAGE[failure],
  }) as const

const DRAFT_SUCCESS_CRITERION_PLACEHOLDER = "Zu definieren"

const containsPlaceholderSuccessCriteria = (
  prioritization: OpportunityPrioritizationSubmission,
): boolean =>
  prioritization.opportunities.some((opportunity) =>
    opportunity.successCriteria.some((criterion) =>
      [
        criterion.metric,
        criterion.measurementMethod,
        criterion.dataSource,
        criterion.baseline.status === "unknown"
          ? criterion.baseline.validationNote
          : criterion.baseline.value,
        criterion.target.status === "unknown"
          ? criterion.target.validationNote
          : criterion.target.value,
        criterion.timeframe.status === "unknown"
          ? criterion.timeframe.validationNote
          : criterion.timeframe.value,
        ...criterion.assumptions,
      ].some((value) => value === DRAFT_SUCCESS_CRITERION_PLACEHOLDER),
    ),
  )

// What the run records about why the generation did not end in a stored
// version. Kept as an internal diagnostic on the Analysis Run — the consultant
// is told the outcome by its identifier, not by a validator's wording, and no
// raw provider response reaches either (coding-standards.md §7, §12A).
const generationError = (
  parsedResult: { success: boolean; error?: string },
  outputReview: { accepted: boolean },
  citations: { resolved: boolean; unknownFindingIds?: string[] } | null,
  persisted: PersistOutcome | null,
): string | undefined => {
  if (!outputReview.accepted) {
    return "AI output contained personal data and was refused."
  }

  if (!parsedResult.success) return parsedResult.error

  if (citations && !citations.resolved) {
    return `Cited Assessment findings that do not exist: ${(
      citations.unknownFindingIds ?? []
    ).join(", ")}`
  }

  if (persisted && !persisted.stored) {
    return persisted.reason === "version_conflict"
      ? "Another prioritization version was created for this engagement at the same time"
      : "The generated Opportunity version could not be stored"
  }

  return undefined
}

// Linking the run is best-effort for the same reason recording it is: an audit
// write must never fail the consultant's stage. The version stands either way.
const linkAnalysisRun = async (versionId: string, analysisRunId: string) => {
  try {
    await linkOpportunityVersionAnalysisRun(versionId, analysisRunId)
  } catch (error) {
    logger.error(
      "LINK_OPPORTUNITY_VERSION_ANALYSIS_RUN_FAILED",
      failureIdentity(error),
    )
  }
}

// Recording the run and flushing the trace are best-effort: they must never
// fail the consultant's stage (coding-standards.md §7).
const recordPrioritizationRun = async (
  input: CreateAnalysisRunInput,
): Promise<string | undefined> => {
  try {
    const analysisRun = await createAnalysisRun(input)
    return analysisRun.id
  } catch (error) {
    logger.error(
      "CREATE_PRIORITIZATION_ANALYSIS_RUN_FAILED",
      failureIdentity(error),
    )
    return undefined
  } finally {
    await langfuse?.flushAsync()
  }
}
