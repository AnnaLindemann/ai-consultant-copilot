import { Router } from "express"

import { createOrganizationSchema } from "../schemas/organization.schema.js"
import {
  createOrganization,
  getOrganizationById,
  getOrganizations,
} from "../repositories/organization.repository.js"
import { getEngagementsByOrganizationId } from "../repositories/engagement.repository.js"

const router = Router()

router.get("/", async (_req, res) => {
  try {
    const organizations = await getOrganizations()

    return res.json({
      status: true,
      message: "Organizations loaded",
      data: organizations,
    })
  } catch (error) {
    console.error("LOAD ORGANIZATIONS ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

router.post("/", async (req, res) => {
  const parseResult = createOrganizationSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "invalid input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const organization = await createOrganization(parseResult.data)

    return res.status(201).json({
      status: true,
      message: "Organization created",
      data: organization,
    })
  } catch (error) {
    console.error("CREATE ORGANIZATION ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

router.get("/:id", async (req, res) => {
  try {
    const organization = await getOrganizationById(req.params.id)

    if (!organization) {
      return res.status(404).json({
        status: false,
        message: "Organization not found",
      })
    }

    return res.json({
      status: true,
      message: "Organization loaded",
      data: organization,
    })
  } catch (error) {
    console.error("LOAD ORGANIZATION DETAILS ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

router.get("/:id/engagements", async (req, res) => {
  try {
    const organization = await getOrganizationById(req.params.id)

    if (!organization) {
      return res.status(404).json({
        status: false,
        message: "Organization not found",
      })
    }

    const engagements = await getEngagementsByOrganizationId(req.params.id)

    return res.json({
      status: true,
      message: "Engagements loaded",
      data: engagements,
    })
  } catch (error) {
    console.error("LOAD ORGANIZATION ENGAGEMENTS ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

export default router
