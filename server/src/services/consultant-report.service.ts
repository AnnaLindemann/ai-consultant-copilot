import { randomUUID } from "node:crypto"

import { calculateLlmCost } from "../evaluation/calculate-llm-cost.js"
import { evaluateAnalysisOutput } from "../evaluation/evaluate-analysis-output.js"
import {
  canReplaceReportVersion,
  canonicalReportContent,
  isReportVersionStale,
  renderReportPdf,
  reportSourceSnapshot,
  resolveGeneratedReport,
  resolveReportSubmission,
  type CitableFollowUpTemplate,
  type ReportSourceBundle,
  type FollowUpResolution,
} from "../domain/engagement/consultant-report.js"
import { getCurrentRequestId, logger } from "../lib/application-logger.js"
import { failureIdentity } from "../lib/failure-identity.js"
import { callLlm } from "../lib/llm-client.js"
import { parseConsultantReport } from "../lib/parse-consultant-report.js"
import { renderEmail } from "../lib/email-templates.js"
import { emailDelivery } from "../lib/email-delivery.js"
import { createSha256Hash } from "../lib/create-sha256-hash.js"
import { langfuse } from "../observability/langfuse.js"
import { buildConsultantReportPrompt } from "../prompts/build-consultant-report-prompt.js"
import { CONSULTANT_REPORT_PROMPT } from "../prompts/consultant-report-prompt.js"
import {
  createAnalysisRun,
  type CreateAnalysisRunInput,
} from "../repositories/analysis-run.repository.js"
import {
  toAssessment,
  toDiscoveryProfile,
  type EngagementScope,
  type EngagementWithOrganization,
} from "../repositories/engagement.repository.js"
import { getActiveOpportunityVersion } from "../repositories/opportunity-version.repository.js"
import { getActiveRecommendationVersion } from "../repositories/recommendation-version.repository.js"
import { getActiveRoadmapVersion } from "../repositories/implementation-roadmap-version.repository.js"
import {
  approveReportVersion,
  createReportVersion,
  createReportPdfArtifact,
  getActivePublication,
  getActivePublicationForClient,
  getActiveReportVersion,
  getPublishedPdfArtifactBytesForClient,
  getReportPdfArtifactBytes,
  getReportVersions,
  getReportVersionById,
  linkReportVersionAnalysisRun,
  finalizePublicationEmailAttempt,
  publishReportVersion,
  reservePublicationEmailAttempt,
  revokeActivePublication,
  saveReportVersion,
} from "../repositories/consultant-report-version.repository.js"
import {
  appendAuditTrail,
  getActiveDiscoveryAccessByEngagement,
  getWorkspaceUserById,
} from "../repositories/access.repository.js"
import { raiseNotification } from "./notification.service.js"
import { retrieveKnowledgePackage } from "./consulting-knowledge.service.js"

import type { EvaluationResult } from "../evaluation/evaluation.types.js"
import {
  authorizeAiProcessing,
  reviewAiOutput,
} from "./ai-compliance.service.js"
import { getCompliancePolicy } from "./compliance.service.js"

import type { ConsultantReportMessageId } from "../../../shared/consultant-report-messages.js"
import type { ComplianceMessageId } from "../../../shared/compliance-messages.js"
import type {
  ConsultantReportSubmission,
  DocumentPublicationSummary,
  ReportReviewState,
  ReportStageState,
  ReportVersionDetail,
  ReportVersionSummary,
} from "../../../shared/consultant-report.schema.js"
import type { KnowledgePackage } from "../../../shared/consulting-knowledge.schema.js"

const STAGE = "report" as const

export type GenerateReportFailure =
  | "sources_not_ready"
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

export type SaveReportFailure =
  | "sources_not_ready"
  | "ai_output_ungrounded"
  | "version_not_found"
  | "historical_version_readonly"
  | "immutable_version_readonly"
  | "stale_update"
  | "not_in_review"

export type PublishReportFailure =
  | "version_not_found"
  | "historical_version_readonly"
  | "not_approved"
  | "no_active_publication"
  | "no_client_recipient"
  | "stale_update"
  | "pdf_artifact_missing"

// `ai_not_permitted` is deliberately absent: a compliance refusal is reported
// with the identifier the gate named — which rule refused it — rather than with
// one fixed message for every rule.
const FAILURE_MESSAGE: Record<
  | Exclude<GenerateReportFailure, "ai_not_permitted">
  | SaveReportFailure
  | PublishReportFailure,
  ConsultantReportMessageId
> = {
  sources_not_ready: "report.error.sources_not_ready",
  consultant_edits_protected: "report.error.consultant_edits_protected",
  ai_step_failed: "report.error.ai_step_failed",
  ai_output_invalid: "report.error.ai_output_invalid",
  ai_output_ungrounded: "report.error.ai_output_ungrounded",
  version_conflict: "report.error.version_conflict",
  persistence_failed: "report.error.persistence_failed",
  version_not_found: "report.error.version_not_found",
  historical_version_readonly: "report.error.historical_version_readonly",
  immutable_version_readonly: "report.error.immutable_version_readonly",
  stale_update: "report.error.stale_update",
  not_in_review: "report.error.not_in_review",
  not_approved: "report.error.not_approved",
  no_active_publication: "report.error.no_active_publication",
  no_client_recipient: "report.error.no_client_recipient",
  pdf_artifact_missing: "report.error.pdf_artifact_missing",
}

export type ReportGroundingDetail = {
  unknownTemplateCodes?: string[]
  nonTemplateCodes?: string[]
  ungroundedQuestions?: string[]
  invalidSourceReferences?: string[]
}

export type GenerateReportResult =
  | { success: true; version: ReportVersionDetail; evaluation: EvaluationResult }
  | ({
      success: false
      failure: GenerateReportFailure
      // A compliance refusal names the rule that stopped it, so the identifier
      // may come from either contract.
      messageId: ConsultantReportMessageId | ComplianceMessageId
      evaluation?: EvaluationResult
    } & ReportGroundingDetail)

export type SaveReportResult =
  | { success: true; version: ReportVersionDetail; withdrewFromReview: boolean }
  | ({
      success: false
      failure: SaveReportFailure
      messageId: ConsultantReportMessageId
      currentRevision?: number
    } & ReportGroundingDetail)

export type ApproveReportResult =
  | { success: true; version: ReportVersionDetail }
  | {
      success: false
      failure: SaveReportFailure
      messageId: ConsultantReportMessageId
      currentRevision?: number
    }

export type PublicationResult =
  | { success: true; publication: DocumentPublicationSummary }
  | {
      success: false
      failure: PublishReportFailure
      messageId: ConsultantReportMessageId
    }

export const generateConsultantReport = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  options: { replaceConsultantEdits: boolean } = { replaceConsultantEdits: false },
): Promise<GenerateReportResult> => {
  const sourceResult = await acceptedSources(engagement, scope)
  if (!sourceResult.eligible) return refused("sources_not_ready")

  const activeVersion = await getActiveReportVersion(engagement.id, scope)
  if (
    !canReplaceReportVersion(
      activeVersion?.reviewState ?? null,
      options.replaceConsultantEdits,
    )
  ) {
    return refused("consultant_edits_protected")
  }

  const templates = sourceResult.templates
  const sourceSnapshot = sourceResult.snapshot

  const prompt = buildConsultantReportPrompt({
    sources: sourceResult.sources,
    followUpTemplates: templates,
  })
  const trace = langfuse?.trace({
    name: "generate-consultant-report",
    metadata: {
      engagementId: engagement.id,
      workspaceId: scope.workspaceId,
      requestId: getCurrentRequestId(),
      stage: STAGE,
      promptVersion: CONSULTANT_REPORT_PROMPT.version,
      promptFingerprint: CONSULTANT_REPORT_PROMPT.fingerprint,
    },
  })

  // The compliance gate: the Workspace Compliance Policy, the engagement's AI
  // consent and its data classification are asked *before* anything leaves for
  // the provider, and personal data is removed where the policy requires it
  // (roadmap Phase 10). The prompt the gate hands back is the only one that may
  // be sent, and a refusal leaves every existing report version untouched.
  const gate = await authorizeAiProcessing({
    engagement,
    scope,
    stage: STAGE,
    purpose: "report_drafting",
    prompt,
    promptVersion: CONSULTANT_REPORT_PROMPT.version,
    promptFingerprint: CONSULTANT_REPORT_PROMPT.fingerprint,
  })

  if (!gate.permitted) {
    trace?.update({
      metadata: { success: false, complianceDenial: gate.reason },
    })
    await langfuse?.flushAsync()

    return refusedByCompliance(gate.messageId)
  }

  const llmConfig = { provider: gate.provider, model: gate.model }

  let llmResponse
  try {
    llmResponse = await callLlm(gate.prompt)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "The AI provider call failed"
    await recordReportRun({
      workspaceId: scope.workspaceId,
      engagementId: engagement.id,
      stage: STAGE,
      provider: llmConfig.provider,
      model: llmConfig.model,
      promptVersion: CONSULTANT_REPORT_PROMPT.version,
      promptFingerprint: CONSULTANT_REPORT_PROMPT.fingerprint,
      jsonParseSuccess: false,
      schemaValid: false,
      errorMessage,
      knowledgeEntryCodes: templates.codes,
      compliance: gate.compliance,
    })
    trace?.update({ metadata: { success: false, error: errorMessage } })
    return refused("ai_step_failed")
  }

  const parsed = parseConsultantReport(llmResponse.content)
  const outputReview = await reviewAiOutput({
    engagement,
    scope,
    stage: STAGE,
    decision: gate,
    responseText: llmResponse.content,
  })
  const resolution = parsed.success
    ? resolveGeneratedReport(
        parsed.report,
        sourceResult.sources,
        citableTemplatesOf(templates),
        mintFollowUpQuestionId,
      )
    : null
  const grounded = resolution?.resolved === true
  // Priced against the model that actually answered, not the one configured.
  // An unpriced pair yields `undefined` and the run records no cost rather than
  // a wrong one (`evaluation/llm-rates.ts`).
  const costEstimateUsd = calculateLlmCost({
    provider: llmResponse.provider,
    model: llmResponse.model,
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
  })
  const evaluation = evaluateAnalysisOutput({
    provider: llmResponse.provider,
    model: llmResponse.model,
    jsonParseSuccess: parsed.jsonParseSuccess,
    schemaValid: parsed.schemaValid && grounded,
    latencyMs: llmResponse.latencyMs,
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
    costEstimateUsd,
  })

  const persisted =
    outputReview.accepted && resolution?.resolved === true && resolution.report
      ? await persistVersion(engagement, scope, {
          ...resolution.report,
          sourceSnapshot,
        })
      : null

  const analysisRunId = await recordReportRun({
    workspaceId: scope.workspaceId,
    engagementId: engagement.id,
    stage: STAGE,
    provider: llmResponse.provider,
    model: llmResponse.model,
    promptVersion: CONSULTANT_REPORT_PROMPT.version,
    promptFingerprint: CONSULTANT_REPORT_PROMPT.fingerprint,
    latencyMs: llmResponse.latencyMs,
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
    costEstimateUsd,
    jsonParseSuccess: parsed.jsonParseSuccess,
    schemaValid: parsed.schemaValid && grounded,
    errorMessage: generationError(parsed, outputReview, resolution, persisted),
    knowledgeEntryCodes: templates.codes,
    compliance: outputReview.compliance,
  })

  if (!parsed.success) return { ...refused("ai_output_invalid"), evaluation }
  if (resolution === null) return { ...refused("ai_output_invalid"), evaluation }
  if (!outputReview.accepted) {
    return {
      success: false,
      failure: "ai_output_invalid",
      messageId: outputReview.messageId,
      evaluation,
    }
  }
  if (!resolution.resolved) {
    return { ...refused("ai_output_ungrounded"), ...groundingDetail(resolution), evaluation }
  }
  if (persisted?.stored !== true) {
    return { ...refused(persisted?.reason ?? "persistence_failed"), evaluation }
  }

  if (analysisRunId) {
    await linkReportVersionAnalysisRun(persisted.version.id, analysisRunId)
  }

  trace?.update({
    metadata: {
      engagementId: engagement.id,
      workspaceId: scope.workspaceId,
      analysisRunId,
      stage: STAGE,
      success: true,
      versionNumber: persisted.version.versionNumber,
    },
  })

  return {
    success: true,
    version: {
      ...persisted.version,
      analysisRunId: analysisRunId ?? persisted.version.analysisRunId,
    },
    evaluation,
  }
}

export const saveConsultantReport = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  input: {
    versionId: string
    expectedRevision: number
    report: ConsultantReportSubmission
    reviewState: Extract<ReportReviewState, "draft" | "manager_review">
  },
): Promise<SaveReportResult> => {
  const sourceResult = await acceptedSources(engagement, scope)
  if (!sourceResult.eligible) return refusedSave("sources_not_ready")

  const templates = sourceResult.templates
  const resolution = resolveReportSubmission(
    input.report,
    sourceResult.sources,
    citableTemplatesOf(templates),
    mintFollowUpQuestionId,
  )
  const sourceSnapshot = sourceResult.snapshot
  const existingVersion = await getReportVersionById(
    input.versionId,
    engagement.id,
    scope,
  )

  if (isUnresolvedFollowUp(resolution)) {
    return { ...refusedSave("ai_output_ungrounded"), ...groundingDetail(resolution) }
  }
  if (!resolution.report) return refusedSave("ai_output_ungrounded")

  const saved = await saveReportVersion(scope, {
    versionId: input.versionId,
    engagementId: engagement.id,
    expectedRevision: input.expectedRevision,
    report: { ...resolution.report, sourceSnapshot },
    reviewState: input.reviewState,
    sourceSnapshot,
    modifiedByUserId: scope.userId,
  })

  if (!saved.saved) {
    return {
      ...refusedSave(saved.reason),
      currentRevision: saved.currentRevision,
    }
  }

  return {
    success: true,
    version: saved.version,
    withdrewFromReview:
      existingVersion?.reviewState === "manager_review" &&
      saved.version.reviewState === "draft",
  }
}

export const approveConsultantReport = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  input: { versionId: string; expectedRevision: number },
): Promise<ApproveReportResult> => {
  const sourceResult = await acceptedSources(engagement, scope)
  if (!sourceResult.eligible) return refusedApproval("sources_not_ready")

  const version = await getReportVersionById(input.versionId, engagement.id, scope)
  if (!version) return refusedApproval("version_not_found")
  if (version.reviewState !== "manager_review") {
    return refusedApproval("not_in_review")
  }
  if (isReportVersionStale(version.sourceSnapshot, sourceResult.snapshot)) {
    return refusedApproval("stale_update")
  }

  const approved = await approveReportVersion(scope, {
    versionId: input.versionId,
    engagementId: engagement.id,
    expectedRevision: input.expectedRevision,
    approvedByUserId: scope.userId,
    approvedSourceFingerprint: version.sourceSnapshot.fingerprint,
  })

  if (!approved.approved) {
    return {
      ...refusedApproval(approved.reason),
      currentRevision: approved.currentRevision,
    }
  }

  return { success: true, version: approved.version }
}

export const getReportStageState = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
): Promise<ReportStageState> => {
  const [activeVersion, sourceResult, activePublication] =
    await Promise.all([
      getActiveReportVersion(engagement.id, scope),
      acceptedSources(engagement, scope),
      getActivePublication(engagement.id, scope),
    ])
  const publicationRecipient = await getPublicationRecipient(engagement)

  const currentSnapshot =
    sourceResult.eligible
      ? sourceResult.snapshot
      : null

  return {
    activeVersion,
    stale: isReportVersionStale(
      activeVersion?.sourceSnapshot ?? null,
      currentSnapshot,
    ),
    eligible: sourceResult.eligible,
    missingAcceptedSources: sourceResult.eligible
      ? []
      : sourceResult.missingAcceptedSources,
    currentSourceSnapshot: currentSnapshot,
    followUpTemplateOptions: sourceResult.eligible ? sourceResult.templates.entries
      .filter((entry) => entry.kind === "follow_up_template")
      .map((entry) => ({
        code: entry.code,
        title: entry.title,
        summary: entry.summary,
      })) : [],
    activePublication,
    publicationRecipient,
  }
}

export const listReportVersions = (
  engagementId: string,
  scope: EngagementScope,
): Promise<ReportVersionSummary[]> => getReportVersions(engagementId, scope)

export const getPublishedPortalDocument = (
  engagementId: string,
  scope: EngagementScope,
): Promise<DocumentPublicationSummary | null> =>
  getActivePublicationForClient(engagementId, scope)

export const publishConsultantReport = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  versionId: string,
  options: {
    title?: string
    managerMessage?: string | null
    notifyClient?: boolean
  } = {},
): Promise<PublicationResult> => {
  const sourceResult = await acceptedSources(engagement, scope)
  const version = await getReportVersionById(versionId, engagement.id, scope)
  if (!version) return refusedPublication("version_not_found")
  if (version.status !== "active") {
    return refusedPublication("historical_version_readonly")
  }
  if (version.reviewState !== "approved") return refusedPublication("not_approved")
  if (
    !sourceResult.eligible ||
    isReportVersionStale(version.sourceSnapshot, sourceResult.snapshot)
  ) {
    return refusedPublication("stale_update")
  }

  const pdfArtifact = await ensureReportPdfArtifact(scope, engagement.id, version)
  if (!pdfArtifact) return refusedPublication("pdf_artifact_missing")
  const clientAccess = await getActiveDiscoveryAccessByEngagement(
    { workspaceId: engagement.workspaceId },
    engagement.id,
  )
  if (!clientAccess) return refusedPublication("no_client_recipient")

  const published = await publishReportVersion(scope, {
    engagementId: engagement.id,
    versionId,
    pdfArtifactId: pdfArtifact.id,
    rendererVersion: REPORT_PDF_RENDERER_VERSION,
    publishedByUserId: scope.userId,
    clientUserId: clientAccess.userId,
    title: options.title ?? version.report.title,
    managerMessage: options.managerMessage ?? null,
  })

  if (!published.published) return refusedPublication(published.reason)

  await appendAuditTrail({
    workspaceId: scope.workspaceId,
    userId: scope.userId,
    engagementId: engagement.id,
    eventType: "document_published",
    payload: {
      reportVersionId: versionId,
      publicationId: published.publication.id,
    },
  })

  await notifyClientInApp(engagement, published.publication)

  const publication =
    options.notifyClient === false
      ? published.publication
      : await notifyClientByEmail(
          engagement,
          scope,
          published.publication,
          `initial:${published.publication.id}`,
        )

  return { success: true, publication }
}

export const revokeConsultantReportPublication = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
): Promise<PublicationResult> => {
  const revoked = await revokeActivePublication(scope, {
    engagementId: engagement.id,
    revokedByUserId: scope.userId,
  })

  if (!revoked.revoked) return refusedPublication("no_active_publication")

  await appendAuditTrail({
    workspaceId: scope.workspaceId,
    userId: scope.userId,
    engagementId: engagement.id,
    eventType: "document_publication_revoked",
    payload: { publicationId: revoked.publication.id },
  })

  return { success: true, publication: revoked.publication }
}

export const retryPublicationNotification = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  requestKey: string = randomUUID(),
): Promise<PublicationResult> => {
  const publication = await getActivePublication(engagement.id, scope)
  if (!publication) return refusedPublication("no_active_publication")
  if (!publication.clientUserId || !publication.pdfArtifactId) {
    return refusedPublication("no_active_publication")
  }

  const notified = await notifyClientByEmail(engagement, scope, publication, requestKey)
  return { success: true, publication: notified }
}

export const renderReportVersionPdf = async (
  versionId: string,
  engagementId: string,
  scope: EngagementScope,
): Promise<Buffer | null> => {
  const existing = await getReportPdfArtifactBytes(scope, {
    engagementId,
    versionId,
    rendererVersion: REPORT_PDF_RENDERER_VERSION,
  })
  if (existing) return existing

  const version = await getReportVersionById(versionId, engagementId, scope)
  if (!version || version.reviewState !== "approved") return null

  const artifact = await ensureReportPdfArtifact(scope, engagementId, version)
  return artifact?.bytes ?? null
}

export const renderPublishedReportPdf = async (
  versionId: string,
  engagementId: string,
  scope: EngagementScope,
): Promise<Buffer | null> => {
  return getPublishedPdfArtifactBytesForClient(engagementId, versionId, scope)
}

const acceptedSources = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
): Promise<
  | {
      eligible: true
      sources: ReportSourceBundle
      snapshot: ReturnType<typeof reportSourceSnapshot>
      templates: KnowledgePackage
    }
  | { eligible: false; missingAcceptedSources: string[] }
> => {
  const [opportunities, recommendations, roadmap] = await Promise.all([
    getActiveOpportunityVersion(engagement.id, scope),
    getActiveRecommendationVersion(engagement.id, scope),
    getActiveRoadmapVersion(engagement.id, scope),
  ])
  const assessment = toAssessment(engagement)
  const missing: string[] = []

  if (engagement.discoveryStatus !== "accepted") missing.push("discovery")
  if (assessment === null || engagement.assessmentReviewState !== "accepted") {
    missing.push("assessment")
  }
  if (opportunities?.reviewState !== "accepted") missing.push("opportunities")
  if (recommendations?.reviewState !== "accepted") missing.push("recommendations")
  if (roadmap?.reviewState !== "accepted") missing.push("roadmap")
  if (recommendations?.reviewState === "accepted" && roadmap?.reviewState === "accepted") {
    const dispositionFailure = validateRecommendationDispositions(
      recommendations,
      roadmap,
    )
    if (dispositionFailure) missing.push(dispositionFailure)
  }

  if (
    missing.length > 0 ||
    assessment === null ||
    opportunities === null ||
    recommendations === null ||
    roadmap === null
  ) {
    return { eligible: false, missingAcceptedSources: missing }
  }

  const sources = {
    discovery: toDiscoveryProfile(engagement),
    assessment,
    assessmentRevision: engagement.assessmentRevision,
    opportunities,
    recommendations,
    roadmap,
  }

  const templates = await retrieveKnowledgePackage(engagement, "report", {
    assessment,
    opportunities: opportunities.prioritization,
    recommendations: recommendations.recommendationSet,
  })

  return {
    eligible: true,
    sources,
    snapshot: reportSourceSnapshot(sources, citableTemplatesOf(templates)),
    templates,
  }
}

const validateRecommendationDispositions = (
  recommendations: ReportSourceBundle["recommendations"],
  roadmap: ReportSourceBundle["roadmap"],
): string | null => {
  const recommendationIds = new Set(
    recommendations.recommendationSet.recommendations.map((recommendation) => recommendation.id),
  )
  const seen = new Set<string>()

  for (const disposition of roadmap.roadmap.recommendationDispositions) {
    if (!recommendationIds.has(disposition.recommendationId)) {
      return "roadmap_disposition_unknown_recommendation"
    }
    if (seen.has(disposition.recommendationId)) {
      return "roadmap_disposition_duplicate"
    }
    seen.add(disposition.recommendationId)
    if (
      disposition.disposition === "deferred" &&
      disposition.rationale.trim().length === 0
    ) {
      return "roadmap_deferred_rationale"
    }
  }

  return seen.size === recommendationIds.size
    ? null
    : "roadmap_disposition_missing"
}

const getPublicationRecipient = async (engagement: EngagementWithOrganization) => {
  const clientAccess = await getActiveDiscoveryAccessByEngagement(
    { workspaceId: engagement.workspaceId },
    engagement.id,
  )
  if (!clientAccess) return null

  const client = await getWorkspaceUserById(
    { workspaceId: engagement.workspaceId },
    clientAccess.userId,
  )
  if (!client || client.role !== "CLIENT") return null

  return {
    userId: client.id,
    email: client.email,
    displayName: client.displayName,
  }
}

type PersistOutcome =
  | { stored: true; version: ReportVersionDetail }
  | { stored: false; reason: "version_conflict" | "persistence_failed" }

const persistVersion = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  report: ReportVersionDetail["report"],
): Promise<PersistOutcome> => {
  try {
    const created = await createReportVersion(scope, {
      workspaceId: scope.workspaceId,
      engagementId: engagement.id,
      report,
      sourceSnapshot: report.sourceSnapshot,
      createdByUserId: scope.userId,
    })
    return created.created
      ? { stored: true, version: created.version }
      : { stored: false, reason: created.reason }
  } catch (error) {
    logger.error("PERSIST_REPORT_VERSION_FAILED", failureIdentity(error))
    return { stored: false, reason: "persistence_failed" }
  }
}

const REPORT_PDF_RENDERER_VERSION = "report-pdf.v3"

const ensureReportPdfArtifact = async (
  scope: EngagementScope,
  engagementId: string,
  version: ReportVersionDetail,
): Promise<{ id: string; bytes: Buffer } | null> => {
  try {
    const contentHash = createSha256Hash(canonicalReportContent(version.report))
    const bytes = renderReportPdf(version.report)
    // Hashed before storage, so the hash still identifies the document the
    // client receives once the stored bytes are ciphertext (roadmap Phase 10).
    const pdfHash = createSha256Hash(bytes.toString("base64"))
    const policy = await getCompliancePolicy({ workspaceId: scope.workspaceId })
    const artifact = await createReportPdfArtifact(scope, {
      workspaceId: scope.workspaceId,
      engagementId,
      reportVersionId: version.id,
      rendererVersion: REPORT_PDF_RENDERER_VERSION,
      contentHash,
      pdfHash,
      bytes,
      encryptAtRest: policy.encryptDocumentsAtRest,
    })

    return { id: artifact.id, bytes }
  } catch (error) {
    logger.error("REPORT_PDF_ARTIFACT_FAILED", failureIdentity(error))
    return null
  }
}

const notifyClientByEmail = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  publication: DocumentPublicationSummary,
  requestKey: string,
): Promise<DocumentPublicationSummary> => {
  if (!publication.clientUserId) return publication
  const reservation = await reservePublicationEmailAttempt(publication.id, {
    workspaceId: scope.workspaceId,
    engagementId: engagement.id,
    requestKey,
  })
  if (!reservation.reserved) return reservation.publication

  const client = await getWorkspaceUserById(
    { workspaceId: scope.workspaceId },
    publication.clientUserId,
  )
  if (!client || client.role !== "CLIENT" || client.emailVerifiedAt === null) {
    return finalizePublicationEmailAttempt(publication.id, {
      requestKey,
      failure: "client_email_unavailable",
    })
  }

  try {
    const delivery = await emailDelivery.send(
      renderEmail("document_published", client.email, {
        portalUrl: `${process.env.CLIENT_ORIGIN ?? "http://localhost:3000"}/portal/engagements/${engagement.id}`,
      }),
    )
    const updated = await finalizePublicationEmailAttempt(publication.id, {
      requestKey,
      deliveredAt: null,
      failure: delivery.delivered ? null : delivery.reason,
    })
    await appendAuditTrail({
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      engagementId: engagement.id,
      eventType: delivery.delivered
        ? "document_notification_sent"
        : "document_notification_failed",
      payload: { publicationId: publication.id, requestKey },
    })
    return updated
  } catch (error) {
    logger.error("REPORT_PUBLICATION_EMAIL_FAILED", {
      publicationId: publication.id,
      ...failureIdentity(error),
    })
    const updated = await finalizePublicationEmailAttempt(publication.id, {
      requestKey,
      failure: "provider_unavailable",
    })
    await appendAuditTrail({
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      engagementId: engagement.id,
      eventType: "document_notification_failed",
      payload: { publicationId: publication.id, requestKey },
    })
    return updated
  }
}

const notifyClientInApp = async (
  engagement: EngagementWithOrganization,
  publication: DocumentPublicationSummary,
) => {
  if (!publication.clientUserId) return

  await raiseNotification({
    workspaceId: engagement.workspaceId,
    userId: publication.clientUserId,
    engagementId: engagement.id,
    kind: "document_published",
    payload: {
      engagementId: engagement.id,
      reportVersionId: publication.reportVersionId,
      publicationId: publication.id,
    },
  })
}

const recordReportRun = async (
  input: CreateAnalysisRunInput,
): Promise<string | null> => {
  try {
    const run = await createAnalysisRun(input)
    return run.id
  } catch (error) {
    logger.error("RECORD_REPORT_RUN_FAILED", failureIdentity(error))
    return null
  }
}

const citableTemplatesOf = (knowledgePackage: {
  entries: {
    code: string
    kind: string
    title: string
    summary: string
    revision: number
    fingerprint: string
  }[]
}): CitableFollowUpTemplate =>
  new Map(
    knowledgePackage.entries.map((entry) => [
      entry.code,
      {
        kind: entry.kind,
        title: entry.title,
        summary: entry.summary,
        revision: entry.revision,
        fingerprint: entry.fingerprint,
      },
    ]),
  )

const generationError = (
  parsed: ReturnType<typeof parseConsultantReport>,
  outputReview: { accepted: boolean },
  resolution: (FollowUpResolution & { report?: unknown }) | null,
  persisted: PersistOutcome | null,
): string | undefined => {
  if (!outputReview.accepted) {
    return "AI output contained personal data and was refused."
  }

  if (!parsed.success) return parsed.error
  if (isUnresolvedFollowUp(resolution)) {
    return JSON.stringify(groundingDetail(resolution))
  }
  if (persisted?.stored === false) return persisted.reason
  return undefined
}

const isUnresolvedFollowUp = (
  resolution: (FollowUpResolution & { report?: unknown }) | null,
): resolution is Extract<FollowUpResolution, { resolved: false }> =>
  resolution !== null && resolution.resolved === false

const groundingDetail = (
  resolution: Extract<FollowUpResolution, { resolved: false }>,
): ReportGroundingDetail => ({
  unknownTemplateCodes: resolution.unknownTemplateCodes,
  nonTemplateCodes: resolution.nonTemplateCodes,
  ungroundedQuestions: resolution.ungroundedQuestions,
  invalidSourceReferences: resolution.invalidSourceReferences,
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
  failure: Exclude<GenerateReportFailure, "ai_not_permitted">,
): Extract<GenerateReportResult, { success: false }> => ({
  success: false,
  failure,
  messageId: FAILURE_MESSAGE[failure],
})

const refusedSave = (
  failure: SaveReportFailure,
): Extract<SaveReportResult, { success: false }> => ({
  success: false,
  failure,
  messageId: FAILURE_MESSAGE[failure],
})

const refusedApproval = (
  failure: SaveReportFailure,
): Extract<ApproveReportResult, { success: false }> => ({
  success: false,
  failure,
  messageId: FAILURE_MESSAGE[failure],
})

const refusedPublication = (
  failure: PublishReportFailure,
): Extract<PublicationResult, { success: false }> => ({
  success: false,
  failure,
  messageId: FAILURE_MESSAGE[failure],
})

const mintFollowUpQuestionId = (): string => `follow-up-${randomUUID()}`
