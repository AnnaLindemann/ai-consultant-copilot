import { Router, type Response } from "express"
import type { ZodError } from "zod"

import { discoveryTransitionMessageIds } from "../../../shared/discovery-messages.js"
import {
  saveDiscoveryProfileSchema,
  submitDiscoverySchema,
} from "../schemas/discovery.schema.js"
import { submitClientFeedbackSchema } from "../schemas/consultant-report.schema.js"
import { requireActingUser } from "../lib/auth-context.js"
import { failureIdentity } from "../lib/failure-identity.js"
import { appendAuditTrail } from "../repositories/access.repository.js"
import {
  authorizePortalDocumentAction,
  authorizePortalDiscoveryAction,
  denyRequest,
} from "../services/authorization.service.js"
import { raiseNotification } from "../services/notification.service.js"
import {
  toDiscoveryProfile,
  toDiscoveryWorkflowState,
} from "../repositories/engagement.repository.js"
import {
  saveDiscoveryProfile,
  transitionDiscovery,
} from "../services/discovery.service.js"
import {
  getPublishedPortalDocument,
  renderPublishedReportPdf,
} from "../services/consultant-report.service.js"
import {
  getClientPortalFeedback,
  submitFeedback,
} from "../services/feedback.service.js"

const router = Router()

// The Client Discovery Portal — its own narrow surface, authorized as *client +
// valid Discovery Access + this engagement's discovery* (architecture.md §7A.5,
// §11 of the decisions list). It serves one engagement's Discovery and nothing
// else: no engagement list, no assessment, no analysis runs, no cost, no report.
//
// It deliberately does not reuse the consultant endpoints with a filter
// applied. Narrowness is the safeguard.

router.get("/engagements/:id/discovery", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizePortalDiscoveryAction(
    actingUser,
    "portal.discovery.read",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  // The portal carries the client's own discovery and nothing else. Curated
  // consulting knowledge — frameworks, AI-readiness criteria, guidance — is
  // internal and never reaches a client surface (domain-model.md §2 "Client
  // Portal"; architecture.md §7A.5).
  return res.json({
    status: true,
    data: {
      discoveryProfile: toDiscoveryProfile(authorized.resource),
      discoveryWorkflow: toDiscoveryWorkflowState(authorized.resource),
    },
  })
})

router.patch("/engagements/:id/discovery", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizePortalDiscoveryAction(
    actingUser,
    "portal.discovery.save",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = saveDiscoveryProfileSchema.safeParse(req.body)
  if (!parseResult.success) return invalidPortalInput(res, parseResult.error)

  try {
    // Whatever the request claims, a portal save is client-provided content.
    // The contributor is taken from the authenticated role, not from the body,
    // so client-provided content can never be attributed to the consultant
    // (domain-model.md §3A.3).
    const updated = await saveDiscoveryProfile(
      authorized.resource,
      authorized.scope,
      parseResult.data.profile,
      "client",
    )

    return res.json({
      status: true,
      message: "discovery.message.profile_saved",
      data: {
        discoveryProfile: toDiscoveryProfile(updated),
        discoveryWorkflow: toDiscoveryWorkflowState(updated),
      },
    })
  } catch (error) {
    // Identifiers only. This handler runs behind a client's session, and a
    // database error arrives with the failing statement and its parameters
    // attached — which here is the client's own discovery content
    // (`failure-identity.ts`).
    console.error("PORTAL_SAVE_DISCOVERY_FAILED", {
      engagementId: authorized.resource.id,
      ...failureIdentity(error),
    })

    return res.status(500).json({
      status: false,
      message: "discovery.error.internal",
    })
  }
})

router.post("/engagements/:id/discovery/submit", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizePortalDiscoveryAction(
    actingUser,
    "portal.discovery.submit",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = submitDiscoverySchema.safeParse(req.body ?? {})
  if (!parseResult.success) return invalidPortalInput(res, parseResult.error)

  try {
    // The actor is the authenticated role, not the declared one: a client
    // cannot submit as the consultant, and therefore cannot reach the
    // consultant's review transitions.
    const result = await transitionDiscovery(
      authorized.resource,
      authorized.scope,
      { transition: "submit", actor: "client" },
    )

    if (!result.success) {
      return res.status(result.failure === "actor_not_permitted" ? 403 : 409).json({
        status: false,
        message: result.messageId,
        data: {
          failure: result.failure,
          messageParams: result.messageParams,
          unexplainedBaselineSubjects: result.unexplainedBaselineSubjects,
        },
      })
    }

    await appendAuditTrail({
      workspaceId: authorized.scope.workspaceId,
      userId: actingUser.id,
      engagementId: authorized.resource.id,
      eventType: "discovery_submitted",
      payload: { transition: "submit", actor: "client" },
    })

    // The consultant who owns the engagement is the one who needs to review it.
    await raiseNotification({
      workspaceId: authorized.resource.workspaceId,
      userId: authorized.resource.owningManagerId,
      engagementId: authorized.resource.id,
      kind: "discovery_submitted",
      payload: {
        engagementId: authorized.resource.id,
        submittedBy: actingUser.id,
      },
    })

    return res.json({
      status: true,
      message: discoveryTransitionMessageIds.submit,
      data: {
        discoveryProfile: toDiscoveryProfile(result.engagement),
        discoveryWorkflow: toDiscoveryWorkflowState(result.engagement),
      },
    })
  } catch (error) {
    console.error("PORTAL_SUBMIT_DISCOVERY_FAILED", {
      engagementId: authorized.resource.id,
      ...failureIdentity(error),
    })

    return res.status(500).json({
      status: false,
      message: "discovery.error.internal",
    })
  }
})

router.get("/engagements/:id/documents", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizePortalDocumentAction(
    actingUser,
    "portal.documents.read",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const publication = await getPublishedPortalDocument(
      req.params.id,
      authorized.scope,
    )

    return res.json({
      status: true,
      data: {
        documents: publication
          ? [
              {
                id: publication.id,
                title: publication.title,
                managerMessage: publication.managerMessage,
                reportVersionId: publication.reportVersionId,
                reportVersionNumber: publication.reportVersionNumber,
                publishedAt: publication.publishedAt,
              },
            ]
          : [],
      },
    })
  } catch (error) {
    console.error("PORTAL_DOCUMENTS_FAILED", {
      engagementId: req.params.id,
      ...failureIdentity(error),
    })

    return res.status(500).json({
      status: false,
      message: "portal.error.internal",
    })
  }
})

router.get("/engagements/:id/documents/:versionId/pdf", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizePortalDocumentAction(
    actingUser,
    "portal.documents.download",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const pdf = await renderPublishedReportPdf(
      req.params.versionId,
      req.params.id,
      authorized.scope,
    )

    if (!pdf) {
      return res.status(404).json({
        status: false,
        message: "auth.error.not_found",
      })
    }

    await appendAuditTrail({
      workspaceId: authorized.scope.workspaceId,
      userId: actingUser.id,
      engagementId: req.params.id,
      eventType: "document_downloaded",
      payload: { reportVersionId: req.params.versionId },
    })

    res.setHeader("content-type", "application/pdf")
    res.setHeader(
      "content-disposition",
      `inline; filename="report-${req.params.versionId}.pdf"`,
    )
    return res.send(pdf)
  } catch (error) {
    console.error("PORTAL_DOCUMENT_PDF_FAILED", {
      engagementId: req.params.id,
      ...failureIdentity(error),
    })

    return res.status(500).json({
      status: false,
      message: "portal.error.internal",
    })
  }
})

router.post("/engagements/:id/feedback", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizePortalDocumentAction(
    actingUser,
    "portal.feedback.submit",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = submitClientFeedbackSchema.safeParse(req.body)
  if (!parseResult.success) return invalidPortalInput(res, parseResult.error)

  try {
    const discoveryAuthorized = await authorizePortalDiscoveryAction(
      actingUser,
      "portal.discovery.read",
      req.params.id,
    )
    if (!discoveryAuthorized.permitted) return denyRequest(res, discoveryAuthorized)

    const result = await submitFeedback(
      discoveryAuthorized.resource,
      discoveryAuthorized.scope,
      parseResult.data,
    )

    if (!result.success) {
      return res.status(result.failure === "publication_not_found" ? 404 : 409).json({
        status: false,
        message: result.messageId,
        data: { failure: result.failure },
      })
    }

    // Only a newly created Feedback notifies. An idempotent replay is the same
    // Feedback arriving twice, and the Manager is not told twice. Raising it is
    // best-effort by construction, so a failed notification never undoes the
    // Feedback that is already persisted (architecture.md §7A.7).
    if (result.created) {
      await raiseNotification({
        workspaceId: discoveryAuthorized.resource.workspaceId,
        userId: discoveryAuthorized.resource.owningManagerId,
        engagementId: discoveryAuthorized.resource.id,
        kind: "client_feedback_submitted",
        payload: {
          feedbackId: result.feedback.id,
          publicationId: result.feedback.sourcePublicationId,
        },
      })
    }

    // `result.feedback` is a `ClientPortalFeedbackSummary` all the way from the
    // repository's narrow `select`, so no internal field exists to leak here —
    // on creation or on replay of an already-classified Feedback.
    return res.status(result.created ? 201 : 200).json({
      status: true,
      message: "feedback.message.submitted",
      data: { feedback: result.feedback },
    })
  } catch (error) {
    console.error("PORTAL_SUBMIT_FEEDBACK_FAILED", {
      engagementId: req.params.id,
      ...failureIdentity(error),
    })

    return res.status(500).json({
      status: false,
      message: "feedback.error.internal",
    })
  }
})

router.get("/engagements/:id/feedback", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizePortalDiscoveryAction(
    actingUser,
    "portal.discovery.read",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const feedback = await getClientPortalFeedback(
      authorized.resource,
      authorized.scope,
    )

    return res.json({
      status: true,
      message: "feedback.message.loaded",
      data: { feedback },
    })
  } catch (error) {
    console.error("PORTAL_LOAD_FEEDBACK_FAILED", {
      engagementId: req.params.id,
      ...failureIdentity(error),
    })

    return res.status(500).json({
      status: false,
      message: "feedback.error.internal",
    })
  }
})

const invalidPortalInput = (res: Response, error: ZodError) =>
  res.status(400).json({
    status: false,
    message: "portal.error.invalid_input",
    errors: error.flatten(),
  })

export default router
