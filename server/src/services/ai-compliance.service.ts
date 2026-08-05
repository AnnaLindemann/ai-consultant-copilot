import {
  decideAiProcessing,
  outputClassificationFor,
} from "../domain/compliance/compliance.js"
import {
  findPersonalIdentifiers,
  redactPersonalIdentifiers,
} from "../domain/compliance/pii.js"
import { logger } from "../lib/application-logger.js"
import { failureIdentity } from "../lib/failure-identity.js"
import { getDefaultLlmConfig } from "../lib/llm-config.js"
import {
  createAnalysisRun,
  type AnalysisRunStage,
} from "../repositories/analysis-run.repository.js"
import {
  countStageRunsAwaitingReview,
  markStageRunsReviewed,
} from "../repositories/compliance.repository.js"
import { resolveAiModelApproval } from "./ai-model-approval.service.js"
import {
  getCompliancePolicy,
  getWorkspaceDpia,
  recordComplianceEvent,
} from "./compliance.service.js"
import { activeConsentFacts } from "./engagement-compliance.service.js"

import {
  aiDenialMessageId,
  aiOutputRejectionMessageId,
  type ComplianceMessageId,
} from "../../../shared/compliance-messages.js"
import type {
  AiDenialReason,
  AiOutputScanOutcome,
  AiProcessingPurpose,
  DataClassification,
  EngagementAiProcessingPermission,
  EngagementDpiaScreening,
  HumanReviewStatus,
  LegalBasis,
  PiiRedactionStatus,
} from "../../../shared/compliance.schema.js"
import type { EngagementScope } from "../domain/access/access.js"

// The gate every AI-assisted step passes through before a prompt leaves for a
// provider, and again before what came back is used (roadmap Phase 10).
//
// It is the *single* enforcement point for "AI processing never bypasses
// Workspace policy or engagement-specific restrictions", in the same way
// `authorization.service.ts` is the single enforcement point for access. A
// stage asks it and uses the prompt it hands back; a stage that built its own
// rule, or that sent the prompt it started with rather than the one the gate
// returned, would be the defect this module exists to prevent.
//
// Three outcomes are refusals, and they are refused in different places for a
// reason:
//
//  - **A policy refusal** — permission, classification, a missing legal basis,
//    a withdrawn consent, an unscreened DPIA, an ungoverned provider or model —
//    happens before the pipeline runs at all. Nothing was run, so no Analysis
//    Run is recorded; the refusal is a denied AI request in the append-only
//    Audit Trail, which is where the roadmap puts it.
//  - **A redaction failure** happens *inside* the pipeline, after the prompt
//    was built. That is a failed AI-assisted step, so it is recorded as an
//    Analysis Run with its error, as every other failed step is
//    (coding-standards.md §7), and audited as well.
//  - **A rejected result** happens after the request ran and personal
//    identifiers came back in the response. The run happened and is recorded;
//    what it produced may not be used.
//
// In all three cases engagement state is untouched and the original text is
// never sent as a fallback.

// The compliance metadata every AI-assisted Analysis Run carries (roadmap Phase
// 10). Provider, model and prompt version are already on the run; these are the
// ones the phase adds.
export type AiComplianceMetadata = {
  purpose: AiProcessingPurpose
  inputClassification: DataClassification
  outputClassification: DataClassification
  piiRedactionStatus: PiiRedactionStatus
  piiRedactionCount: number
  outputScanOutcome: AiOutputScanOutcome
  humanReviewStatus: HumanReviewStatus
  aiModelApprovalId: string | null
}

export type AiComplianceDecision =
  | {
      permitted: true
      // The prompt as it may actually be sent. When the policy required
      // redaction this is the redacted text, and it is the only text the caller
      // may pass to the provider.
      prompt: string
      provider: string
      model: string
      compliance: AiComplianceMetadata
      // The rules the response is scanned against. Carried on the decision so
      // `reviewAiOutput` needs no second policy read, and so the output is
      // always scanned with the rules the input was redacted with.
      outputScanRules: ReturnType<typeof scanRulesOf>
    }
  | {
      permitted: false
      reason: AiDenialReason
      // What the consultant is told, as an identifier the frontend localizes.
      messageId: ComplianceMessageId
    }

// The facts about the engagement the decision needs. Taken as a narrow shape
// rather than the whole row so the gate can be exercised without a database.
export type AiComplianceSubject = {
  id: string
  workspaceId: string
  dataClassification: DataClassification
  aiProcessingPermission: EngagementAiProcessingPermission
  processingPurpose: string | null
  legalBasis: LegalBasis
  dpiaScreening: EngagementDpiaScreening
}

export type AuthorizeAiProcessingInput = {
  engagement: AiComplianceSubject
  scope: EngagementScope
  stage: AnalysisRunStage
  purpose: AiProcessingPurpose
  prompt: string
  promptVersion: string
  promptFingerprint: string
}

export const authorizeAiProcessing = async (
  input: AuthorizeAiProcessingInput,
): Promise<AiComplianceDecision> => {
  const policy = await getCompliancePolicy({
    workspaceId: input.engagement.workspaceId,
  })

  // Resolved before the decision, so the provider and model that are *checked*
  // are the ones that would actually be called. Checking one and calling
  // another would make the governed approvals decorative.
  const llmConfig = getDefaultLlmConfig()

  const [approval, dpia, consent] = await Promise.all([
    resolveAiModelApproval(
      { workspaceId: input.engagement.workspaceId },
      llmConfig.provider,
      llmConfig.model,
    ),
    getWorkspaceDpia({ workspaceId: input.engagement.workspaceId }),
    activeConsentFacts(input.engagement.id, input.scope),
  ])

  const decision = decideAiProcessing(policy, {
    inputClassification: input.engagement.dataClassification,
    permission: input.engagement.aiProcessingPermission,
    privacy: {
      processingPurpose: input.engagement.processingPurpose,
      legalBasis: input.engagement.legalBasis,
      activeConsent: consent,
    },
    dpiaScreening: input.engagement.dpiaScreening,
    workspaceDpiaStatus: dpia.status,
    approval,
  })

  if (!decision.permitted) {
    await recordDeniedAiRequest(input, decision.reason, {
      provider: llmConfig.provider,
      model: llmConfig.model,
    })

    return refusal(decision.reason)
  }

  const humanReviewStatus: HumanReviewStatus = decision.humanReviewRequired
    ? "pending"
    : "not_required"

  const approvalId = approval?.id ?? null
  const scanRules = scanRulesOf(policy)

  if (!decision.piiRedactionRequired) {
    return {
      permitted: true,
      prompt: input.prompt,
      provider: llmConfig.provider,
      model: llmConfig.model,
      outputScanRules: scanRules,
      compliance: {
        purpose: input.purpose,
        inputClassification: input.engagement.dataClassification,
        // Provisional: the final classification is assigned by
        // `reviewAiOutput`, after the response has actually been scanned.
        outputClassification: input.engagement.dataClassification,
        piiRedactionStatus: "not_required",
        piiRedactionCount: 0,
        outputScanOutcome: "not_scanned",
        humanReviewStatus,
        aiModelApprovalId: approvalId,
      },
    }
  }

  const redacted = redactPersonalIdentifiers(
    input.prompt,
    policy.personalIdentifierRules,
  )
  const remaining = findPersonalIdentifiers(
    redacted.text,
    policy.personalIdentifierRules,
  )

  // The verification pass is what makes the guarantee real rather than assumed.
  // If anything a rule recognizes survived the replacement, the request is
  // refused — the original text is never sent instead.
  if (remaining.length > 0) {
    await recordPiiRedactionFailure(input, remaining, {
      provider: llmConfig.provider,
      model: llmConfig.model,
      approvalId,
    })

    return refusal("pii_redaction_failed")
  }

  await recordComplianceEvent({
    workspaceId: input.engagement.workspaceId,
    userId: input.scope.userId,
    engagementId: input.engagement.id,
    eventType: "ai_pii_redaction_applied",
    payload: {
      stage: input.stage,
      purpose: input.purpose,
      // Counts and kinds only. A record of *what* was removed would carry the
      // personal data the removal exists to keep out of the logs.
      redactionCount: redacted.redactions.length,
      kinds: [...new Set(redacted.redactions.map(({ kind }) => kind))].sort(),
    },
  })

  return {
    permitted: true,
    prompt: redacted.text,
    provider: llmConfig.provider,
    model: llmConfig.model,
    outputScanRules: scanRules,
    compliance: {
      purpose: input.purpose,
      inputClassification: input.engagement.dataClassification,
      outputClassification: input.engagement.dataClassification,
      piiRedactionStatus: "applied",
      piiRedactionCount: redacted.redactions.length,
      outputScanOutcome: "not_scanned",
      humanReviewStatus,
      aiModelApprovalId: approvalId,
    },
  }
}

export type AiOutputReview =
  | { accepted: true; compliance: AiComplianceMetadata }
  | {
      accepted: false
      // The metadata to record on the run that *did* happen, so the refusal is
      // accounted for rather than invisible.
      compliance: AiComplianceMetadata
      messageId: ComplianceMessageId
    }

// Scan what the model sent back, before it is classified or stored as usable
// content (roadmap Phase 10 corrections §5).
//
// The correction this implements: an output was previously downgraded from
// `personal_data` to `confidential` purely because the *input* had been
// redacted, which assumed a model cannot produce personal data that was not in
// its prompt. A model that quotes, infers, hallucinates or completes a
// placeholder can, and an unscanned response is not evidence of absence.
//
// So the response is scanned with the same rules the input was redacted with.
// A clean scan is what permits the downgrade; identifiers found mean the result
// is refused. Refusal is the smallest safe design here: the alternative — a
// protected review path for personal data the workbench never meant to hold —
// would be a second content lifecycle to secure, and the consultant can simply
// re-run the stage once the engagement's classification or rules are right.
//
// Nothing that was found is logged or audited beyond its *kind* and count. A
// record of what leaked would be the leak.
export const reviewAiOutput = async (input: {
  engagement: Pick<AiComplianceSubject, "id" | "workspaceId">
  scope: EngagementScope
  stage: AnalysisRunStage
  decision: Extract<AiComplianceDecision, { permitted: true }>
  responseText: string
}): Promise<AiOutputReview> => {
  const { decision } = input

  const found = findPersonalIdentifiers(
    input.responseText,
    decision.outputScanRules,
  )

  const outputScanOutcome: AiOutputScanOutcome =
    found.length > 0 ? "personal_data_detected" : "clean"

  const outputClassification = outputClassificationFor({
    inputClassification: decision.compliance.inputClassification,
    piiRedactionApplied: decision.compliance.piiRedactionStatus === "applied",
    outputScan: outputScanOutcome,
  })

  const compliance: AiComplianceMetadata = {
    ...decision.compliance,
    outputScanOutcome,
    outputClassification,
  }

  if (found.length === 0) return { accepted: true, compliance }

  await recordComplianceEvent({
    workspaceId: input.engagement.workspaceId,
    userId: input.scope.userId,
    engagementId: input.engagement.id,
    eventType: "ai_output_personal_data_detected",
    payload: {
      stage: input.stage,
      purpose: decision.compliance.purpose,
      // Kinds and count. Never the values, and never the response.
      kinds: [...found],
      kindCount: found.length,
      inputClassification: decision.compliance.inputClassification,
      piiRedactionStatus: decision.compliance.piiRedactionStatus,
    },
  })

  return {
    accepted: false,
    compliance,
    messageId: aiOutputRejectionMessageId(
      "output_personal_data_detected",
    ) as ComplianceMessageId,
  }
}

// Whether this stage still has AI output nobody has reviewed.
//
// Asked by the accept paths before content may reach a trusted state
// (`accepted`, `approved`). It is the server-side half of
// `humanApprovalRequiredForAiOutput`: without it, the policy would be a label
// on a checkbox (roadmap Phase 10 corrections §9).
export const stageAwaitsHumanReview = async (
  scope: EngagementScope,
  engagementId: string,
  stage: AnalysisRunStage,
): Promise<boolean> => {
  const pending = await countStageRunsAwaitingReview(
    { workspaceId: scope.workspaceId },
    engagementId,
    stage,
  )

  return pending > 0
}

// Record that an authorized human has reviewed what the AI produced for one
// stage.
//
// Called by the explicit human-review endpoint after authorization. Saving an
// ordinary draft is not a review, and used to clear the pending state anyway —
// the loophole these corrections close.
//
// It **throws** on failure rather than logging and continuing. A swallowed
// failure here would leave content accepted while the record of its review is
// missing, which is precisely the state the policy exists to make impossible;
// the caller refuses the acceptance instead, and the consultant retries.
export const recordHumanReviewOfAiOutput = async (
  scope: EngagementScope,
  engagementId: string,
  stage: AnalysisRunStage,
): Promise<void> => {
  await markStageRunsReviewed(
    { workspaceId: scope.workspaceId },
    engagementId,
    stage,
  )
}

export const markAiOutputReviewed = recordHumanReviewOfAiOutput

// The personal-identifier rules a response is scanned against. Extracted so the
// decision can carry them and the output is always scanned with exactly the
// rules the input was redacted with.
const scanRulesOf = (policy: {
  personalIdentifierRules: Awaited<
    ReturnType<typeof getCompliancePolicy>
  >["personalIdentifierRules"]
}) => policy.personalIdentifierRules

const refusal = (reason: AiDenialReason): AiComplianceDecision => ({
  permitted: false,
  reason,
  messageId: aiDenialMessageId(reason) as ComplianceMessageId,
})

const recordDeniedAiRequest = async (
  input: AuthorizeAiProcessingInput,
  reason: AiDenialReason,
  llm: { provider: string; model: string },
) =>
  recordComplianceEvent({
    workspaceId: input.engagement.workspaceId,
    userId: input.scope.userId,
    engagementId: input.engagement.id,
    eventType: "ai_request_denied",
    payload: {
      stage: input.stage,
      purpose: input.purpose,
      reason,
      provider: llm.provider,
      model: llm.model,
      inputClassification: input.engagement.dataClassification,
      aiProcessingPermission: input.engagement.aiProcessingPermission,
      legalBasis: input.engagement.legalBasis,
      dpiaScreening: input.engagement.dpiaScreening,
    },
  })

const recordPiiRedactionFailure = async (
  input: AuthorizeAiProcessingInput,
  remaining: readonly string[],
  llm: { provider: string; model: string; approvalId: string | null },
) => {
  await recordComplianceEvent({
    workspaceId: input.engagement.workspaceId,
    userId: input.scope.userId,
    engagementId: input.engagement.id,
    eventType: "ai_pii_redaction_failed",
    payload: {
      stage: input.stage,
      purpose: input.purpose,
      // Which *kinds* of identifier survived, never the values themselves.
      remainingKinds: [...remaining].sort(),
    },
  })

  // The step reached the pipeline and failed inside it, so the audit trail of
  // AI assistance keeps it — with no tokens, no cost, and the reason recorded.
  try {
    await createAnalysisRun({
      workspaceId: input.engagement.workspaceId,
      engagementId: input.engagement.id,
      stage: input.stage,
      provider: llm.provider,
      model: llm.model,
      promptVersion: input.promptVersion,
      promptFingerprint: input.promptFingerprint,
      jsonParseSuccess: false,
      schemaValid: false,
      errorMessage:
        "Personal identifiers could not be removed before AI processing; the request was not sent.",
      compliance: {
        purpose: input.purpose,
        inputClassification: input.engagement.dataClassification,
        outputClassification: input.engagement.dataClassification,
        piiRedactionStatus: "failed",
        piiRedactionCount: 0,
        outputScanOutcome: "not_scanned",
        humanReviewStatus: "not_required",
        aiModelApprovalId: llm.approvalId,
      },
    })
  } catch (error) {
    logger.error("CREATE_PII_REDACTION_FAILURE_RUN_FAILED", {
      engagementId: input.engagement.id,
      stage: input.stage,
      ...failureIdentity(error),
    })
  }
}
