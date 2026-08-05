import { Router } from "express"

import { requireActingUser } from "../lib/auth-context.js"
import { logger } from "../lib/application-logger.js"
import { failureIdentity } from "../lib/failure-identity.js"
import {
  issueDocumentAccessToken,
  verifyDocumentAccessToken,
} from "../lib/document-access-token.js"
import { getReportPdfArtifactBytes } from "../repositories/consultant-report-version.repository.js"
import {
  authorizeEngagementAction,
  authorizeWorkspaceAction,
  denyRequest,
} from "../services/authorization.service.js"
import {
  executeRetention,
  getComplianceDashboard,
  getCompliancePolicyView,
  getWorkspaceDpia,
  previewRetention,
  recordComplianceEvent,
  updateCompliancePolicy,
  updateWorkspaceDpia,
} from "../services/compliance.service.js"
import {
  eraseClientData,
  exportClientData,
} from "../services/client-data.service.js"
import {
  getEngagementCompliance,
  recordEngagementConsent,
  saveEngagementCompliance,
  savePrivacyProcessing,
  withdrawEngagementConsent,
} from "../services/engagement-compliance.service.js"
import {
  getAiModelApproval,
  getAiModelApprovals,
  removeAiModelApproval,
  saveAiModelApproval,
} from "../services/ai-model-approval.service.js"
import { findPersonalIdentifiers } from "../domain/compliance/pii.js"

import {
  eraseClientDataSchema,
  executeRetentionSchema,
  previewPersonalIdentifierRulesSchema,
  recordEngagementConsentSchema,
  updateEngagementDpiaScreeningSchema,
  updateCompliancePolicySchema,
  updateEngagementComplianceSchema,
  updateEngagementPrivacyProcessingSchema,
  updateWorkspaceDpiaSchema,
  upsertAiModelApprovalSchema,
  withdrawEngagementConsentSchema,
} from "../../../shared/compliance.schema.js"

// The Security, Privacy & AI Compliance surface (roadmap Phase 10).
//
// Every route establishes the acting user, then asks the AccessPolicy through
// the shared decision point. The phase adds actions to that policy; it adds no
// rule of its own and no role (coding-standards.md §15).

const router = Router()

// --- The Workspace Compliance Policy ---------------------------------------

// A Manager may read the policy their work is governed by: being told the rules
// is not being able to change them, and a consultant who cannot see why an AI
// step was refused cannot act on the refusal.
router.get("/policy", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "compliance.policy.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const policy = await getCompliancePolicyView({
      workspaceId: actingUser.workspaceId,
    })

    return res.json({
      status: true,
      message: "compliance.message.policy_loaded",
      data: { policy },
    })
  } catch (error) {
    logger.error("COMPLIANCE_POLICY_LOAD_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

// Configure AI usage, retention, and data protection — without a code change,
// which is what the roadmap requires of this surface.
router.patch("/policy", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "compliance.policy.manage",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = updateCompliancePolicySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    const updated = await updateCompliancePolicy(
      { workspaceId: actingUser.workspaceId },
      actingUser.id,
      parsed.data,
    )

    if (!updated.success) {
      return res.status(400).json({
        status: false,
        message:
          updated.failure === "unsupported_default_legal_basis"
            ? "compliance.error.legal_basis_not_supported"
            : "compliance.error.invalid_input",
        data: { failure: updated.failure },
      })
    }

    const policy = await getCompliancePolicyView({
      workspaceId: actingUser.workspaceId,
    })

    return res.json({
      status: true,
      message: "compliance.message.policy_saved",
      data: { policy },
    })
  } catch (error) {
    logger.error("COMPLIANCE_POLICY_SAVE_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.post("/identifier-rules/preview", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "compliance.policy.manage",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = previewPersonalIdentifierRulesSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    const policy = await getCompliancePolicyView({
      workspaceId: actingUser.workspaceId,
    })
    const kinds = findPersonalIdentifiers(
      parsed.data.text,
      parsed.data.rules ?? policy.personalIdentifierRules,
    )

    return res.json({
      status: true,
      message: "compliance.message.identifier_preview_ready",
      data: {
        matches: [...new Set(kinds)].sort().map((kind) => ({
          kind,
          count: kinds.filter((candidate) => candidate === kind).length,
        })),
      },
    })
  } catch (error) {
    logger.error("IDENTIFIER_RULE_PREVIEW_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

// --- The Compliance Dashboard ----------------------------------------------

router.get("/dashboard", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "compliance.dashboard.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const dashboard = await getComplianceDashboard({
      workspaceId: actingUser.workspaceId,
    })

    return res.json({
      status: true,
      message: "compliance.message.policy_loaded",
      data: { dashboard },
    })
  } catch (error) {
    logger.error("COMPLIANCE_DASHBOARD_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.get("/dpia", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "workspace.dpia.manage",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    return res.json({
      status: true,
      message: "compliance.message.dpia_loaded",
      data: {
        dpia: await getWorkspaceDpia({ workspaceId: actingUser.workspaceId }),
      },
    })
  } catch (error) {
    logger.error("WORKSPACE_DPIA_LOAD_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.patch("/dpia", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "workspace.dpia.manage",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = updateWorkspaceDpiaSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    return res.json({
      status: true,
      message: "compliance.message.dpia_saved",
      data: {
        dpia: await updateWorkspaceDpia(
          { workspaceId: actingUser.workspaceId },
          actingUser.id,
          parsed.data,
        ),
      },
    })
  } catch (error) {
    logger.error("WORKSPACE_DPIA_SAVE_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.get("/ai-model-approvals", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "ai_model_approval.manage",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    return res.json({
      status: true,
      message: "compliance.message.model_approvals_loaded",
      data: {
        approvals: await getAiModelApprovals({
          workspaceId: actingUser.workspaceId,
        }),
      },
    })
  } catch (error) {
    logger.error("AI_MODEL_APPROVALS_LOAD_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.post("/ai-model-approvals", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "ai_model_approval.manage",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = upsertAiModelApprovalSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    const result = await saveAiModelApproval(
      { workspaceId: actingUser.workspaceId },
      actingUser.id,
      parsed.data,
    )

    return res.status(201).json({
      status: true,
      message: "compliance.message.model_approval_saved",
      data: { approval: result.approval },
    })
  } catch (error) {
    logger.error("AI_MODEL_APPROVAL_SAVE_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.post("/ai-model-approvals/:approvalId/revoke", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "ai_model_approval.manage",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const existing = await getAiModelApproval(
      { workspaceId: actingUser.workspaceId },
      req.params.approvalId,
    )
    if (existing === null) {
      return res
        .status(404)
        .json({ status: false, message: "compliance.error.not_found" })
    }

    const result = await saveAiModelApproval(
      { workspaceId: actingUser.workspaceId },
      actingUser.id,
      {
        provider: existing.provider,
        model: existing.model,
        technologyProfileCode: existing.technologyProfileCode,
        status: "revoked",
        dpaStatus: existing.dpaStatus,
        dpaReference: existing.dpaReference,
        processingRegion: existing.processingRegion,
        promptRetention: existing.promptRetention,
        trainingUse: existing.trainingUse,
        thirdCountryTransferMechanism: existing.thirdCountryTransferMechanism,
      },
    )

    return res.json({
      status: true,
      message: "compliance.message.model_approval_saved",
      data: { approval: result.approval },
    })
  } catch (error) {
    logger.error("AI_MODEL_APPROVAL_REVOKE_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.delete("/ai-model-approvals/:approvalId", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "ai_model_approval.manage",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const removed = await removeAiModelApproval(
      { workspaceId: actingUser.workspaceId },
      actingUser.id,
      req.params.approvalId,
    )

    if (!removed) {
      return res
        .status(404)
        .json({ status: false, message: "compliance.error.not_found" })
    }

    return res.json({
      status: true,
      message: "compliance.message.model_approval_removed",
    })
  } catch (error) {
    logger.error("AI_MODEL_APPROVAL_REMOVE_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.get("/retention/preview", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "retention.manage")
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    return res.json({
      status: true,
      message: "compliance.message.retention_preview_ready",
      data: {
        preview: await previewRetention(
          { workspaceId: actingUser.workspaceId },
          actingUser.id,
        ),
      },
    })
  } catch (error) {
    logger.error("RETENTION_PREVIEW_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.post("/retention/execute", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "retention.manage")
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = executeRetentionSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    return res.json({
      status: true,
      message: "compliance.message.retention_executed",
      data: {
        result: await executeRetention(
          { workspaceId: actingUser.workspaceId },
          actingUser.id,
          parsed.data,
        ),
      },
    })
  } catch (error) {
    logger.error("RETENTION_EXECUTE_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

// --- The engagement's own compliance state ---------------------------------

router.get("/engagements/:id", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.compliance.manage",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  return res.json({
    status: true,
    message: "compliance.message.policy_loaded",
    data: {
      compliance: await getEngagementCompliance(
        authorized.resource,
        authorized.scope,
      ),
    },
  })
})

router.patch("/engagements/:id", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.compliance.manage",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = updateEngagementComplianceSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    const updated = await saveEngagementCompliance(
      authorized.resource,
      authorized.scope,
      actingUser.id,
      parsed.data,
    )

    if (!updated.success) {
      return res
        .status(404)
        .json({ status: false, message: "compliance.error.not_found" })
    }

    const refreshed = await authorizeEngagementAction(
      actingUser,
      "engagement.compliance.manage",
      req.params.id,
    )
    if (!refreshed.permitted) return denyRequest(res, refreshed)

    return res.json({
      status: true,
      message: "compliance.message.engagement_saved",
      data: {
        compliance: await getEngagementCompliance(
          refreshed.resource,
          refreshed.scope,
        ),
      },
    })
  } catch (error) {
    logger.error("ENGAGEMENT_COMPLIANCE_SAVE_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.patch("/engagements/:id/privacy-processing", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.privacy_processing.manage",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = updateEngagementPrivacyProcessingSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    const updated = await savePrivacyProcessing(
      authorized.resource,
      authorized.scope,
      actingUser.id,
      parsed.data,
    )

    if (!updated.success) {
      return res.status(updated.failure === "not_found" ? 404 : 400).json({
        status: false,
        message:
          updated.failure === "legal_basis_not_supported"
            ? "compliance.error.legal_basis_not_supported"
            : "compliance.error.not_found",
        data: { failure: updated.failure },
      })
    }

    const refreshed = await authorizeEngagementAction(
      actingUser,
      "engagement.privacy_processing.manage",
      req.params.id,
    )
    if (!refreshed.permitted) return denyRequest(res, refreshed)

    return res.json({
      status: true,
      message: "compliance.message.privacy_processing_saved",
      data: {
        compliance: await getEngagementCompliance(
          refreshed.resource,
          refreshed.scope,
        ),
      },
    })
  } catch (error) {
    logger.error("ENGAGEMENT_PRIVACY_PROCESSING_SAVE_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.patch("/engagements/:id/dpia-screening", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.dpia_screening.manage",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = updateEngagementDpiaScreeningSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    const updated = await saveEngagementCompliance(
      authorized.resource,
      authorized.scope,
      actingUser.id,
      parsed.data,
    )

    if (!updated.success) {
      return res
        .status(404)
        .json({ status: false, message: "compliance.error.not_found" })
    }

    const refreshed = await authorizeEngagementAction(
      actingUser,
      "engagement.dpia_screening.manage",
      req.params.id,
    )
    if (!refreshed.permitted) return denyRequest(res, refreshed)

    return res.json({
      status: true,
      message: "compliance.message.engagement_saved",
      data: {
        compliance: await getEngagementCompliance(
          refreshed.resource,
          refreshed.scope,
        ),
      },
    })
  } catch (error) {
    logger.error("ENGAGEMENT_DPIA_SCREENING_SAVE_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.post("/engagements/:id/consents", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.consent.manage",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = recordEngagementConsentSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    const result = await recordEngagementConsent(
      authorized.resource,
      authorized.scope,
      actingUser.id,
      parsed.data,
    )

    if (!result.success) {
      return res.status(result.failure === "not_found" ? 404 : 409).json({
        status: false,
        message:
          result.failure === "consent_requires_consent_basis"
            ? "compliance.error.consent_requires_consent_basis"
            : "compliance.error.not_found",
        data: { failure: result.failure },
      })
    }

    return res.status(201).json({
      status: true,
      message: "compliance.message.consent_recorded",
      data: {
        consent: result.consent,
        compliance: await getEngagementCompliance(
          authorized.resource,
          authorized.scope,
        ),
      },
    })
  } catch (error) {
    logger.error("ENGAGEMENT_CONSENT_RECORD_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.post("/engagements/:id/consents/:consentId/withdraw", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.consent.manage",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = withdrawEngagementConsentSchema.safeParse({
    ...(req.body ?? {}),
    consentId: req.params.consentId,
  })
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    const result = await withdrawEngagementConsent(
      authorized.resource,
      authorized.scope,
      actingUser.id,
      parsed.data,
    )

    if (!result.success) {
      return res.status(result.failure === "not_found" ? 404 : 409).json({
        status: false,
        message:
          result.failure === "consent_already_withdrawn"
            ? "compliance.error.consent_already_withdrawn"
            : "compliance.error.not_found",
        data: { failure: result.failure },
      })
    }

    return res.json({
      status: true,
      message: "compliance.message.consent_withdrawn",
      data: {
        compliance: await getEngagementCompliance(
          authorized.resource,
          authorized.scope,
        ),
      },
    })
  } catch (error) {
    logger.error("ENGAGEMENT_CONSENT_WITHDRAW_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

// --- GDPR export and erasure -----------------------------------------------

router.post("/engagements/:id/export", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "compliance.export_client_data",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const result = await exportClientData(
      req.params.id,
      authorized.scope,
      actingUser.id,
    )

    if (!result.success) {
      return res.status(result.failure === "not_found" ? 404 : 403).json({
        status: false,
        message:
          result.failure === "not_found"
            ? "compliance.error.not_found"
            : "compliance.error.export_not_permitted",
      })
    }

    return res.json({
      status: true,
      message: "compliance.message.client_data_exported",
      data: { export: result.export },
    })
  } catch (error) {
    logger.error("CLIENT_DATA_EXPORT_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

router.post("/engagements/:id/erasure", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "compliance.erase_client_data",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parsed = eraseClientDataSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      status: false,
      message: "compliance.error.invalid_input",
      errors: parsed.error.flatten(),
    })
  }

  try {
    const result = await eraseClientData(
      req.params.id,
      authorized.scope,
      actingUser.id,
      parsed.data,
    )

    if (!result.success) {
      const status = { not_found: 404, legal_hold_active: 409, confirmation_mismatch: 400 }
      const message = {
        not_found: "compliance.error.not_found",
        legal_hold_active: "compliance.error.legal_hold_active",
        confirmation_mismatch: "compliance.error.confirmation_mismatch",
      } as const

      return res
        .status(status[result.failure])
        .json({ status: false, message: message[result.failure] })
    }

    return res.json({
      status: true,
      message: "compliance.message.client_data_erased",
    })
  } catch (error) {
    logger.error("CLIENT_DATA_ERASURE_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

// --- Expiring signed document links ----------------------------------------

// Issue a short-lived, signed link to one rendered report PDF. The lifetime
// comes from the workspace's Compliance Policy, and the token names one
// artifact, for one user, until one moment (roadmap Phase 10).
router.post(
  "/engagements/:id/documents/:versionId/download-link",
  async (req, res) => {
    const actingUser = await requireActingUser(req, res)
    if (!actingUser) return

    const authorized = await authorizeEngagementAction(
      actingUser,
      "document.download_link.issue",
      req.params.id,
    )
    if (!authorized.permitted) return denyRequest(res, authorized)

    try {
      const policy = await getCompliancePolicyView({
        workspaceId: actingUser.workspaceId,
      })

      const token = issueDocumentAccessToken(
        {
          workspaceId: actingUser.workspaceId,
          engagementId: req.params.id,
          reportVersionId: req.params.versionId,
          userId: actingUser.id,
        },
        policy.documentDownloadLinkTtlMinutes,
      )

      if (token === null) {
        logger.error("DOCUMENT_ACCESS_SIGNING_NOT_CONFIGURED", {
          workspaceId: actingUser.workspaceId,
        })
        return res
          .status(500)
          .json({ status: false, message: "compliance.error.internal" })
      }

      await recordComplianceEvent({
        workspaceId: actingUser.workspaceId,
        userId: actingUser.id,
        engagementId: req.params.id,
        eventType: "document_download_link_issued",
        payload: {
          reportVersionId: req.params.versionId,
          ttlMinutes: policy.documentDownloadLinkTtlMinutes,
        },
      })

      return res.json({
        status: true,
        message: "compliance.message.download_link_issued",
        data: {
          token,
          expiresInMinutes: policy.documentDownloadLinkTtlMinutes,
        },
      })
    } catch (error) {
      logger.error("DOCUMENT_DOWNLOAD_LINK_FAILED", failureIdentity(error))
      return res
        .status(500)
        .json({ status: false, message: "compliance.error.internal" })
    }
  },
)

// Consume a signed link.
//
// The token narrows what may be fetched; it never replaces the access decision.
// The caller is still established and still asked of the AccessPolicy, and the
// artifact is still read through the workspace-scoped repository — so a token
// naming another workspace's document is refused exactly as a request without
// one would be.
router.get("/documents/download", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const token = typeof req.query.token === "string" ? req.query.token : ""
  const verified = verifyDocumentAccessToken(token)

  // A malformed, forged, or expired token is refused the same way, and says
  // nothing about which of the three it was: a caller must not be able to tell
  // an expired token for a real document from a forged one for nothing.
  if (!verified.valid) {
    return res
      .status(403)
      .json({ status: false, message: "compliance.error.download_link_invalid" })
  }

  const claims = verified.claims

  if (
    claims.userId !== actingUser.id ||
    claims.workspaceId !== actingUser.workspaceId
  ) {
    return res
      .status(403)
      .json({ status: false, message: "compliance.error.download_link_invalid" })
  }

  const authorized = await authorizeEngagementAction(
    actingUser,
    "report.export_pdf",
    claims.engagementId,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const pdf = await getReportPdfArtifactBytes(authorized.scope, {
      engagementId: claims.engagementId,
      versionId: claims.reportVersionId,
    })

    if (pdf === null) {
      return res
        .status(404)
        .json({ status: false, message: "compliance.error.not_found" })
    }

    await recordComplianceEvent({
      workspaceId: actingUser.workspaceId,
      userId: actingUser.id,
      engagementId: claims.engagementId,
      eventType: "document_downloaded",
      payload: {
        reportVersionId: claims.reportVersionId,
        via: "signed_link",
        dataClassification: authorized.resource.dataClassification,
      },
    })

    res.setHeader("content-type", "application/pdf")
    res.setHeader(
      "content-disposition",
      `attachment; filename="report-${claims.reportVersionId}.pdf"`,
    )
    return res.send(pdf)
  } catch (error) {
    logger.error("DOCUMENT_DOWNLOAD_FAILED", failureIdentity(error))
    return res
      .status(500)
      .json({ status: false, message: "compliance.error.internal" })
  }
})

export default router
