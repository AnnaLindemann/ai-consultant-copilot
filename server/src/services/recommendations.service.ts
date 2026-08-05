import { randomUUID } from "node:crypto"

import { calculateLlmCost } from "../evaluation/calculate-llm-cost.js"
import { evaluateAnalysisOutput } from "../evaluation/evaluate-analysis-output.js"
import { canonicalOpportunityContent } from "../domain/engagement/opportunities.js"
import {
  canReplaceRecommendationVersion,
  canonicalRecommendationContent,
  hasKnowledgeToGroundWith,
  hasOpportunitiesToMatch,
  identifyRecommendations,
  inOpportunityOrder,
  isRecommendationVersionStale,
  resolveRecommendationGrounding,
  type CitableKnowledge,
  type CitableTechnology,
  type RecommendationGroundingResolution,
} from "../domain/engagement/recommendations.js"
import { createSha256Hash } from "../lib/create-sha256-hash.js"
import { getCurrentRequestId, logger } from "../lib/application-logger.js"
import { failureIdentity } from "../lib/failure-identity.js"
import { callLlm } from "../lib/llm-client.js"
import { parseRecommendations } from "../lib/parse-recommendations.js"
import { langfuse } from "../observability/langfuse.js"
import { buildRecommendationsPrompt } from "../prompts/build-recommendations-prompt.js"
import { RECOMMENDATIONS_PROMPT } from "../prompts/recommendations-prompt.js"
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
  getActiveOpportunityVersion,
  getOpportunityVersionById,
} from "../repositories/opportunity-version.repository.js"
import {
  createRecommendationVersion,
  getActiveRecommendationVersion,
  getRecommendationVersionById,
  getRecommendationVersions,
  linkRecommendationVersionAnalysisRun,
  saveRecommendationVersion,
} from "../repositories/recommendation-version.repository.js"
import {
  listCitableKnowledge,
  retrieveKnowledgePackage,
} from "./consulting-knowledge.service.js"
import {
  listCitableTechnology,
  retrieveTechnologyPackage,
} from "./technology-knowledge.service.js"

import type { KnowledgePackage } from "../../../shared/consulting-knowledge.schema.js"
import type { OpportunityVersionDetail } from "../../../shared/opportunity.schema.js"
import {
  authorizeAiProcessing,
  reviewAiOutput,
} from "./ai-compliance.service.js"

import type { RecommendationMessageId } from "../../../shared/recommendation-messages.js"
import type { ComplianceMessageId } from "../../../shared/compliance-messages.js"
import type {
  RecommendationReviewState,
  RecommendationSetSubmission,
  RecommendationStageState,
  RecommendationVersionDetail,
  RecommendationVersionSummary,
} from "../../../shared/recommendation.schema.js"
import type { TechnologyPackage } from "../../../shared/technology-knowledge.schema.js"
import type { EvaluationResult } from "../evaluation/evaluation.types.js"

// Which methodology stage these runs support. It matches the engagement's own
// `solution_matching` stage marker, so runs filter by the same name the
// engagement stands at (architecture.md §8).
const STAGE = "solution_matching" as const

// Why recommendations could not be produced or saved. Each is a
// domain-meaningful outcome the consultant can act on, not an exception
// (architecture.md §13), and each is reported as an identifier the frontend
// localizes — never as prose (coding-standards.md §12A).
export type GenerateRecommendationsFailure =
  | "opportunities_not_ready"
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

export type SaveRecommendationsFailure =
  | "opportunities_not_ready"
  | "ai_output_ungrounded"
  | "version_not_found"
  | "historical_version_readonly"
  | "stale_update"

// `ai_not_permitted` is deliberately absent: a compliance refusal is reported
// with the identifier the gate named — which rule refused it — rather than with
// one fixed message for every rule.
const FAILURE_MESSAGE: Record<
  Exclude<GenerateRecommendationsFailure, "ai_not_permitted"> | SaveRecommendationsFailure,
  RecommendationMessageId
> = {
  opportunities_not_ready: "recommendation.error.opportunities_not_ready",
  knowledge_unavailable: "recommendation.error.knowledge_unavailable",
  consultant_edits_protected:
    "recommendation.error.consultant_edits_protected",
  ai_step_failed: "recommendation.error.ai_step_failed",
  ai_output_invalid: "recommendation.error.ai_output_invalid",
  ai_output_ungrounded: "recommendation.error.ai_output_ungrounded",
  version_conflict: "recommendation.error.version_conflict",
  persistence_failed: "recommendation.error.persistence_failed",
  version_not_found: "recommendation.error.version_not_found",
  historical_version_readonly:
    "recommendation.error.historical_version_readonly",
  stale_update: "recommendation.error.stale_update",
}

// What a refused grounding names, so the consultant sees *what* was fabricated
// rather than only that something was.
export type UngroundedDetail = {
  unknownOpportunityIds?: string[]
  unknownKnowledgeCodes?: string[]
  unknownTechnologyCodes?: string[]
  ungroundedRecommendationTitles?: string[]
}

export type GenerateRecommendationsResult =
  | {
      success: true
      version: RecommendationVersionDetail
      evaluation: EvaluationResult
    }
  | ({
      success: false
      failure: GenerateRecommendationsFailure
      // A compliance refusal names the rule that stopped it, so the
      // identifier may come from either contract.
      messageId: RecommendationMessageId | ComplianceMessageId
      evaluation?: EvaluationResult
    } & UngroundedDetail)

export type SaveRecommendationsResult =
  | { success: true; version: RecommendationVersionDetail }
  | ({
      success: false
      failure: SaveRecommendationsFailure
      messageId: RecommendationMessageId
      // What the version's revision actually is, so a client that lost a race
      // can re-read rather than guess.
      currentRevision?: number
    } & UngroundedDetail)

// Match the engagement's prioritized Opportunities against curated knowledge to
// produce grounded, explainable Recommendations (roadmap Phase 6). The
// AI-assisted step reuses the shared orchestration: retrieve grounding → build
// prompt → call LLM → parse → evaluate → persist → record Analysis Run → trace
// (architecture.md §5).
//
// Generation is additive. It never touches the version that is already there:
// the new snapshot is created and made active in one transaction, and only once
// generation, validation, and persistence have all succeeded. Until then — and
// on every failure path below — the version the consultant was working on is
// exactly as they left it (coding-standards.md §7).
export const generateRecommendations = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  options: { replaceConsultantEdits: boolean } = {
    replaceConsultantEdits: false,
  },
): Promise<GenerateRecommendationsResult> => {
  const opportunityVersion = await getActiveOpportunityVersion(
    engagement.id,
    scope,
  )

  // Guarded before any AI call, so a refused run neither costs a request nor
  // produces an Analysis Run: nothing was run to record.
  if (
    opportunityVersion === null ||
    !hasOpportunitiesToMatch(opportunityVersion.prioritization)
  ) {
    return refused("opportunities_not_ready")
  }

  const activeVersion = await getActiveRecommendationVersion(engagement.id, scope)
  if (
    !canReplaceRecommendationVersion(
      activeVersion?.reviewState ?? null,
      options.replaceConsultantEdits,
    )
  ) {
    return refused("consultant_edits_protected")
  }

  // Deterministic grounding first: the knowledge is retrieved and passed *into*
  // the prompt, so the model reasons over supplied knowledge rather than
  // inventing it, and the codes it was grounded in are recorded on the run
  // (architecture.md §5; agent-rules.md §3, §4).
  const { knowledgePackage, technologyPackage } = await retrieveGrounding(
    engagement,
    opportunityVersion,
  )

  // Grounding is what makes a recommendation valid, so a knowledge base that
  // offers nothing for this engagement is a refusal rather than a licence to
  // generate ungroundable proposals (agent-rules.md §4 "missing curated
  // knowledge is a gap to surface, not licence to invent").
  if (!hasKnowledgeToGroundWith(knowledgePackage.codes)) {
    return refused("knowledge_unavailable")
  }

  const trace = langfuse?.trace({
    name: "generate-recommendations",
    metadata: {
      engagementId: engagement.id,
      workspaceId: scope.workspaceId,
      requestId: getCurrentRequestId(),
      stage: STAGE,
      promptVersion: RECOMMENDATIONS_PROMPT.version,
      promptFingerprint: RECOMMENDATIONS_PROMPT.fingerprint,
    },
  })

  const assessment = toAssessment(engagement)

  const prompt = buildRecommendationsPrompt({
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
    opportunities: opportunityVersion.prioritization,
    discoveryTrace: discoveryTraceOf(opportunityVersion, assessment),
    knowledgePackage,
    technologyPackage,
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
    purpose: "solution_matching",
    prompt,
    promptVersion: RECOMMENDATIONS_PROMPT.version,
    promptFingerprint: RECOMMENDATIONS_PROMPT.fingerprint,
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

  const groundingCodes = {
    knowledgeEntryCodes: knowledgePackage.codes,
    technologyProfileCodes: technologyPackage.codes,
  }

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

    await recordMatchingRun({
      workspaceId: scope.workspaceId,
      engagementId: engagement.id,
      stage: STAGE,
      provider: llmConfig.provider,
      model: llmConfig.model,
      promptVersion: RECOMMENDATIONS_PROMPT.version,
      promptFingerprint: RECOMMENDATIONS_PROMPT.fingerprint,
      jsonParseSuccess: false,
      schemaValid: false,
      errorMessage,
      ...groundingCodes,
      compliance: gate.compliance,
    })

    return refused("ai_step_failed")
  }

  const parsedResult = parseRecommendations(llmResponse.content)
  const outputReview = await reviewAiOutput({
    engagement,
    scope,
    stage: STAGE,
    decision: gate,
    responseText: llmResponse.content,
  })

  // Grounding is checked as part of validity, not after the fact: a citation
  // naming an Opportunity, a curated entry, or a Technology Profile that was not
  // supplied is fabricated grounding, and output carrying one is unusable
  // (agent-rules.md §3, §12). The model may cite only what was retrieved *for
  // it*, which is why the citable sets here are the packages themselves.
  const resolution = parsedResult.success
    ? resolveRecommendationGrounding(parsedResult.recommendationSet, {
        opportunities: opportunityVersion.prioritization,
        assessment,
        knowledge: citableKnowledgeOf(knowledgePackage),
        technology: citableTechnologyOf(technologyPackage),
      })
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
    name: "recommendations-llm-call",
    model: llmResponse.model,
    metadata: {
      provider: llmResponse.provider,
      stage: STAGE,
      promptVersion: RECOMMENDATIONS_PROMPT.version,
      promptFingerprint: RECOMMENDATIONS_PROMPT.fingerprint,
      latencyMs: llmResponse.latencyMs,
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      totalTokens: llmResponse.totalTokens,
      costEstimateUsd,
      jsonParseSuccess: parsedResult.jsonParseSuccess,
      schemaValid: parsedResult.schemaValid,
      grounded,
      knowledgeEntryCodes: knowledgePackage.codes,
      technologyProfileCodes: technologyPackage.codes,
    },
  })

  // Persistence is attempted before the run is recorded, so the run's record can
  // carry the *whole* outcome — a lost race or a storage failure belongs on it as
  // much as a provider failure does — and so the version it produced can be
  // linked back to it (architecture.md §8).
  //
  // Identity is added here, on the server: the model writes recommendations, and
  // each one gets a stable id the Implementation Roadmap will sequence.
  const persisted =
    outputReview.accepted && resolution?.resolved === true
      ? await persistVersion(
          engagement,
          scope,
          opportunityVersion,
          inOpportunityOrder(
            identifyRecommendations(
              resolution.recommendationSet,
              mintRecommendationId,
            ),
          ),
        )
      : null

  const analysisRunId = await recordMatchingRun({
    workspaceId: scope.workspaceId,
    engagementId: engagement.id,
    stage: STAGE,
    provider: llmResponse.provider,
    model: llmResponse.model,
    promptVersion: RECOMMENDATIONS_PROMPT.version,
    promptFingerprint: RECOMMENDATIONS_PROMPT.fingerprint,
    latencyMs: llmResponse.latencyMs,
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
    costEstimateUsd,
    jsonParseSuccess: parsedResult.jsonParseSuccess,
    // Ungrounded output is a broken contract as much as a missing field is, so
    // the run records it as such rather than as a valid run.
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
      promptVersion: RECOMMENDATIONS_PROMPT.version,
      promptFingerprint: RECOMMENDATIONS_PROMPT.fingerprint,
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

  if (resolution?.resolved !== true) {
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

// Save the consultant's reviewed Recommendations into the version they are
// working on. Consultant authorship is deterministic engagement state, so it
// records no Analysis Run — the same way the Assessment and the Opportunities
// do. Overriding a proposal, re-grounding it, or correcting a rationale is
// exactly this path.
//
// Editing does not create a version. It changes the active one, guarded by the
// revision the consultant read, so a save that has been overtaken is refused
// rather than allowed to overwrite (architecture.md §13).
export const saveRecommendations = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  input: {
    versionId: string
    expectedRevision: number
    recommendationSet: RecommendationSetSubmission
    reviewState: Exclude<RecommendationReviewState, "ai_draft">
  },
): Promise<SaveRecommendationsResult> => {
  // A save aimed at a version the caller cannot reach is refused exactly as one
  // aimed at a version that does not exist (architecture.md §7A.4). Whether the
  // version is still the editable one is the store's answer, not this one's, so
  // a save aimed at a preserved version is told *that* rather than told it does
  // not exist.
  const version = await getRecommendationVersionById(
    input.versionId,
    engagement.id,
    scope,
  )

  if (version === null) {
    return refusedSave("version_not_found")
  }

  // Citations are resolved against the Opportunity version this recommendation
  // set was *matched against*, not against whatever is prioritized now.
  // Otherwise a consultant could not save an edit to a version the
  // prioritization had moved on from — and the stored record would stop meaning
  // what it meant when the work was done (architecture.md §4.3).
  const sourceOpportunityVersion = await getOpportunityVersionById(
    version.sourceOpportunityVersionId,
    engagement.id,
    scope,
  )

  if (sourceOpportunityVersion === null) {
    return refusedSave("opportunities_not_ready")
  }

  // The consultant's citations are held to the same rule as the model's: a code
  // that names nothing curated cannot be stored, whoever wrote it. What differs
  // is the citable set — the consultant is the expert and may ground a proposal
  // in a curated entry the retrieval did not surface (see the note on
  // `resolveRecommendationGrounding`).
  const [knowledge, technology] = await Promise.all([
    listCitableKnowledge(),
    listCitableTechnology(),
  ])

  const resolution = resolveRecommendationGrounding(input.recommendationSet, {
    opportunities: sourceOpportunityVersion.prioritization,
    assessment: toAssessment(engagement),
    knowledge,
    technology,
  })

  if (!resolution.resolved) {
    return {
      ...refusedSave("ai_output_ungrounded"),
      ...ungroundedDetail(resolution),
    }
  }

  // Recommendations the consultant kept carry the id they already had; ones they
  // added get one here. Nothing the browser sent decides an identity.
  const saved = await saveRecommendationVersion(scope, {
    versionId: input.versionId,
    engagementId: engagement.id,
    expectedRevision: input.expectedRevision,
    recommendationSet: inOpportunityOrder(
      identifyRecommendations(resolution.recommendationSet, mintRecommendationId),
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

// Where the engagement's Recommendations stand, for a reader: the version being
// worked on, whether the prioritized Opportunities have moved on beneath it, and
// the curated grounding this engagement's recommendations may draw on.
// Staleness is a recommendation to regenerate and nothing more — no version is
// ever changed because the Opportunities changed (agent-rules.md §15).
export const getRecommendationStageState = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
): Promise<RecommendationStageState> => {
  const [activeVersion, opportunityVersion] = await Promise.all([
    getActiveRecommendationVersion(engagement.id, scope),
    getActiveOpportunityVersion(engagement.id, scope),
  ])

  const { knowledgePackage, technologyPackage } = await retrieveGrounding(
    engagement,
    opportunityVersion,
  )

  const currentOpportunityFingerprint =
    opportunityVersion === null
      ? null
      : opportunityFingerprint(opportunityVersion)

  return {
    activeVersion,
    stale: isRecommendationVersionStale(
      activeVersion?.sourceOpportunityFingerprint ?? null,
      currentOpportunityFingerprint,
    ),
    currentOpportunityVersionId: opportunityVersion?.id ?? null,
    currentOpportunityVersionNumber: opportunityVersion?.versionNumber ?? null,
    currentOpportunityFingerprint,
    groundingOptions: {
      knowledge: knowledgePackage.entries,
      technology: technologyPackage.profiles,
    },
  }
}

export const listRecommendationVersions = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<RecommendationVersionSummary[]> =>
  getRecommendationVersions(engagementId, scope)

// A fingerprint of the prioritized Opportunities' content. Content-based rather
// than time-based, so a save that changed nothing does not make the
// recommendations look stale, and any real edit does.
export const opportunityFingerprint = (
  version: OpportunityVersionDetail,
): string => createSha256Hash(canonicalOpportunityContent(version.prioritization))

// A fingerprint of a stored recommendation set, for the stage that will be
// derived from it (roadmap Phase 7). It is defined here, beside the stage that
// owns the content, exactly as the Assessment's and the Opportunities' are.
export const recommendationFingerprint = (
  version: RecommendationVersionDetail,
): string =>
  createSha256Hash(canonicalRecommendationContent(version.recommendationSet))

// --- Internals --------------------------------------------------------------

// The deterministic grounding for this engagement, from both knowledge bases.
//
// Both retrievals are structural and reproducible: the same engagement against
// unchanged knowledge always yields the same entries in the same order. The
// technology retrieval is asked for *any* category — which technologies suit an
// opportunity is what the curated match terms decide, not something this stage
// should pre-judge by naming categories.
const retrieveGrounding = async (
  engagement: EngagementWithOrganization,
  opportunityVersion: OpportunityVersionDetail | null,
): Promise<{
  knowledgePackage: KnowledgePackage
  technologyPackage: TechnologyPackage
}> => {
  const opportunities = opportunityVersion?.prioritization ?? null

  const [knowledgePackage, technologyPackage] = await Promise.all([
    retrieveKnowledgePackage(engagement, "solution_matching", {
      assessment: toAssessment(engagement),
      opportunities,
    }),
    retrieveTechnologyPackage({
      categoryCodes: [],
      situationText: technologySituationText(engagement, opportunities),
    }),
  ])

  return { knowledgePackage, technologyPackage }
}

// The engagement text the Technology Knowledge Base's curated match terms
// resolve into profile codes. It is never matched against profile prose — only
// against `matchTerms` — so what is passed here decides which technologies are
// *offered*, never how they are ranked against each other.
const technologySituationText = (
  engagement: EngagementWithOrganization,
  opportunities: OpportunityVersionDetail["prioritization"] | null,
): string[] =>
  [
    engagement.statedProblem,
    engagement.currentProcess,
    engagement.desiredOutcome,
    ...toStringList(engagement.currentTools),
    ...toStringList(engagement.communicationChannels),
    ...toStringList(engagement.integrationNeeds),
    ...toStringList(engagement.dataTypes),
    // What the engagement decided to pursue is what the technology suggestions
    // are for, so it narrows the offer the same way discovery does.
    ...(opportunities?.opportunities.flatMap((opportunity) => [
      opportunity.title,
      opportunity.problem,
      opportunity.improvement,
    ]) ?? []),
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  )

// The Json list columns hold validated string lists, but a row is still data
// from the database: anything that is not a string is dropped rather than
// stringified into the haystack as "[object Object]".
const toStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []

const citableKnowledgeOf = (
  knowledgePackage: KnowledgePackage,
): CitableKnowledge =>
  new Map(
    knowledgePackage.entries.map((entry) => [
      entry.code,
      { kind: entry.kind, title: entry.title },
    ]),
  )

const citableTechnologyOf = (
  technologyPackage: TechnologyPackage,
): CitableTechnology =>
  new Map(
    technologyPackage.profiles.map((profile) => [
      profile.code,
      { categoryCode: profile.categoryCode, title: profile.title },
    ]),
  )

// What each Opportunity rests on, as the discovery facts behind the Assessment
// findings it cites. Resolved by the server from persisted state, keyed by
// opportunity id, so the model is told what the engagement established rather
// than asked to remember it.
const discoveryTraceOf = (
  opportunityVersion: OpportunityVersionDetail,
  assessment: ReturnType<typeof toAssessment>,
): Record<string, { findingTitle: string; supportingFacts: string[] }[]> => {
  const findings = new Map(
    assessment === null
      ? []
      : Object.values(assessment.dimensions).flatMap((dimension) =>
          dimension.findings.map((finding) => [finding.id, finding] as const),
        ),
  )

  return Object.fromEntries(
    opportunityVersion.prioritization.opportunities.map((opportunity) => [
      opportunity.id,
      opportunity.sourceFindings.map((citation) => ({
        findingTitle: citation.findingTitle,
        supportingFacts:
          findings.get(citation.findingId)?.supportingFacts ?? [],
      })),
    ]),
  )
}

type PersistOutcome =
  | { stored: true; version: RecommendationVersionDetail }
  | { stored: false; reason: "version_conflict" | "persistence_failed" }

// Storing the new version. A lost race and a storage failure are both reported
// as outcomes rather than thrown, because both leave the previous active version
// untouched and both belong on the Analysis Run.
const persistVersion = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  opportunityVersion: OpportunityVersionDetail,
  recommendationSet: Parameters<typeof inOpportunityOrder>[0],
): Promise<PersistOutcome> => {
  try {
    const created = await createRecommendationVersion(scope, {
      workspaceId: scope.workspaceId,
      engagementId: engagement.id,
      recommendationSet,
      sourceOpportunityVersionId: opportunityVersion.id,
      sourceOpportunityVersionNumber: opportunityVersion.versionNumber,
      sourceOpportunityFingerprint: opportunityFingerprint(opportunityVersion),
      createdByUserId: scope.userId,
    })

    return created.created
      ? { stored: true, version: created.version }
      : { stored: false, reason: created.reason }
  } catch (error) {
    logger.error("STORE_RECOMMENDATION_VERSION_FAILED", failureIdentity(error))
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
  failure: Exclude<GenerateRecommendationsFailure, "ai_not_permitted">,
) =>
  ({
    success: false,
    failure,
    messageId: FAILURE_MESSAGE[failure],
  }) as const

const refusedSave = (failure: SaveRecommendationsFailure) =>
  ({
    success: false,
    failure,
    messageId: FAILURE_MESSAGE[failure],
  }) as const

// The fabricated citations named, so the consultant can see what was claimed.
// Empty lists are dropped rather than sent as empty arrays: a caller reading
// "no unknown technology codes" from an absent field and from an empty one would
// be reading the same thing twice.
const ungroundedDetail = (
  resolution: RecommendationGroundingResolution | null,
): UngroundedDetail => {
  if (resolution === null || resolution.resolved) return {}

  return {
    ...(resolution.unknownOpportunityIds.length > 0
      ? { unknownOpportunityIds: resolution.unknownOpportunityIds }
      : {}),
    ...(resolution.unknownKnowledgeCodes.length > 0
      ? { unknownKnowledgeCodes: resolution.unknownKnowledgeCodes }
      : {}),
    ...(resolution.unknownTechnologyCodes.length > 0
      ? { unknownTechnologyCodes: resolution.unknownTechnologyCodes }
      : {}),
    ...(resolution.ungroundedRecommendationTitles.length > 0
      ? {
          ungroundedRecommendationTitles:
            resolution.ungroundedRecommendationTitles,
        }
      : {}),
  }
}

// What the run records about why the generation did not end in a stored version.
// Kept as an internal diagnostic on the Analysis Run — the consultant is told the
// outcome by its identifier, not by a validator's wording, and no raw provider
// response reaches either (coding-standards.md §7, §12A).
const generationError = (
  parsedResult: { success: boolean; error?: string },
  outputReview: { accepted: boolean },
  resolution: RecommendationGroundingResolution | null,
  persisted: PersistOutcome | null,
): string | undefined => {
  if (!outputReview.accepted) {
    return "AI output contained personal data and was refused."
  }

  if (!parsedResult.success) return parsedResult.error

  if (resolution !== null && !resolution.resolved) {
    return [
      resolution.unknownOpportunityIds.length > 0
        ? `Cited Opportunities that do not exist: ${resolution.unknownOpportunityIds.join(", ")}`
        : null,
      resolution.unknownKnowledgeCodes.length > 0
        ? `Cited Consulting Knowledge Base entries that were not retrieved: ${resolution.unknownKnowledgeCodes.join(", ")}`
        : null,
      resolution.unknownTechnologyCodes.length > 0
        ? `Named Technology Profiles that were not retrieved: ${resolution.unknownTechnologyCodes.join(", ")}`
        : null,
      resolution.ungroundedRecommendationTitles.length > 0
        ? `Recommendations with no AI Use Case or Solution Pattern behind them: ${resolution.ungroundedRecommendationTitles.join(", ")}`
        : null,
    ]
      .filter((line): line is string => line !== null)
      .join("; ")
  }

  if (persisted && !persisted.stored) {
    return persisted.reason === "version_conflict"
      ? "Another recommendation version was created for this engagement at the same time"
      : "The generated Recommendation version could not be stored"
  }

  return undefined
}

// A recommendation's identity is opaque and unrelated to its text, so re-wording
// a title can never change what sequences it later.
const mintRecommendationId = () => randomUUID()

// Linking the run is best-effort for the same reason recording it is: an audit
// write must never fail the consultant's stage. The version stands either way.
const linkAnalysisRun = async (versionId: string, analysisRunId: string) => {
  try {
    await linkRecommendationVersionAnalysisRun(versionId, analysisRunId)
  } catch (error) {
    logger.error(
      "LINK_RECOMMENDATION_VERSION_ANALYSIS_RUN_FAILED",
      failureIdentity(error),
    )
  }
}

// Recording the run and flushing the trace are best-effort: they must never fail
// the consultant's stage (coding-standards.md §7).
const recordMatchingRun = async (
  input: CreateAnalysisRunInput,
): Promise<string | undefined> => {
  try {
    const analysisRun = await createAnalysisRun(input)
    return analysisRun.id
  } catch (error) {
    logger.error(
      "CREATE_SOLUTION_MATCHING_ANALYSIS_RUN_FAILED",
      failureIdentity(error),
    )
    return undefined
  } finally {
    await langfuse?.flushAsync()
  }
}
