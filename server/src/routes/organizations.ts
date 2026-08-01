import { Router } from "express"

import { engagementScopeOf } from "../domain/access/access.js"
import { requireActingUser } from "../lib/auth-context.js"
import {
  authorizeWorkspaceAction,
  denyRequest,
} from "../services/authorization.service.js"
import { createOrganizationSchema } from "../schemas/organization.schema.js"
import {
  createOrganization,
  getOrganizationById,
  getOrganizations,
} from "../repositories/organization.repository.js"
import { getEngagementsByOrganizationId } from "../repositories/engagement.repository.js"
import { failureIdentity } from "../lib/failure-identity.js"

const router = Router()

// The Organization grouping surface. Like the engagement routes, it establishes
// the acting user and asks the AccessPolicy; the workspace scope then travels
// into every query, counts included (architecture.md §7A.4).

router.get("/", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "organization.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const organizations = await getOrganizations(engagementScopeOf(actingUser))

    return res.json({
      status: true,
      message: "organization.message.list_loaded",
      data: organizations,
    })
  } catch (error) {
    console.error("LOAD_ORGANIZATIONS_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "organization.error.internal",
    })
  }
})

router.post("/", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "organization.create",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = createOrganizationSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "organization.error.invalid_input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const organization = await createOrganization(
      engagementScopeOf(actingUser),
      parseResult.data,
    )

    return res.status(201).json({
      status: true,
      message: "organization.message.created",
      data: organization,
    })
  } catch (error) {
    console.error("CREATE_ORGANIZATION_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "organization.error.internal",
    })
  }
})

router.get("/:id", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "organization.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const organization = await getOrganizationById(
      req.params.id,
      engagementScopeOf(actingUser),
    )

    if (!organization) {
      // An organization in another workspace is refused exactly as a missing
      // one is (architecture.md §7A.4).
      return res.status(404).json({
        status: false,
        message: "auth.error.not_found",
      })
    }

    return res.json({
      status: true,
      message: "organization.message.loaded",
      data: organization,
    })
  } catch (error) {
    console.error("LOAD_ORGANIZATION_DETAILS_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "organization.error.internal",
    })
  }
})

router.get("/:id/engagements", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "engagement.list",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const organization = await getOrganizationById(
      req.params.id,
      engagementScopeOf(actingUser),
    )

    if (!organization) {
      return res.status(404).json({
        status: false,
        message: "auth.error.not_found",
      })
    }

    // Scoped by role as well as workspace: a Manager sees the engagements they
    // own within this organization, not a colleague's.
    const engagements = await getEngagementsByOrganizationId(
      engagementScopeOf(actingUser),
      req.params.id,
    )

    return res.json({
      status: true,
      message: "engagement.message.list_loaded",
      data: engagements,
    })
  } catch (error) {
    console.error("LOAD_ORGANIZATION_ENGAGEMENTS_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "engagement.error.internal",
    })
  }
})

export default router
