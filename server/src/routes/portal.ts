import { Router, type Response } from "express"
import type { ZodError } from "zod"

import { discoveryTransitionMessageIds } from "../../../shared/discovery-messages.js"
import {
  saveDiscoveryProfileSchema,
  submitDiscoverySchema,
} from "../schemas/discovery.schema.js"
import { requireActingUser } from "../lib/auth-context.js"
import { failureIdentity } from "../lib/failure-identity.js"
import { appendAuditTrail } from "../repositories/access.repository.js"
import {
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

const invalidPortalInput = (res: Response, error: ZodError) =>
  res.status(400).json({
    status: false,
    message: "portal.error.invalid_input",
    errors: error.flatten(),
  })

export default router
