import { Router } from "express"

import {
  createEngagementSchema,
  updateEngagementSchema,
} from "../schemas/engagement.schema.js"
import {
  createEngagement,
  getEngagementById,
  getEngagements,
  updateEngagement,
} from "../repositories/engagement.repository.js"
import { getOrganizationById } from "../repositories/organization.repository.js"
import { analyzeEngagement } from "../services/analysis.service.js"
import { getAnalysisRunsByEngagementId } from "../repositories/analysis-run.repository.js"

const router = Router()

router.get("/", async (_req, res) => {
  try {
    const engagements = await getEngagements()

    return res.json({
      status: true,
      message: "Engagements loaded",
      data: engagements,
    })
  } catch (error) {
    console.error("LOAD ENGAGEMENTS ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

router.get("/:id", async (req, res) => {
  try {
    const engagement = await getEngagementById(req.params.id)

    if (!engagement) {
      return res.status(404).json({
        status: false,
        message: "Engagement not found",
      })
    }

    return res.json({
      status: true,
      message: "Engagement loaded",
      data: engagement,
    })
  } catch (error) {
    console.error("LOAD ENGAGEMENT DETAILS ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

router.post("/", async (req, res) => {
  const parseResult = createEngagementSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "invalid input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    // The engagement must belong to a real Organization; a dangling
    // organizationId is rejected before we attempt to persist.
    const organization = await getOrganizationById(
      parseResult.data.organizationId,
    )
    if (!organization) {
      return res.status(404).json({
        status: false,
        message: "Organization not found",
      })
    }

    const engagement = await createEngagement(parseResult.data)

    return res.status(201).json({
      status: true,
      message: "Engagement created",
      data: engagement,
    })
  } catch (error) {
    console.error("CREATE ENGAGEMENT ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

// Save (update) an engagement — persist edited content and/or advance its
// methodology stage, so the consultant can resume where they left off
// (roadmap Phase 1).
router.patch("/:id", async (req, res) => {
  const parseResult = updateEngagementSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "invalid input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const existing = await getEngagementById(req.params.id)
    if (!existing) {
      return res.status(404).json({
        status: false,
        message: "Engagement not found",
      })
    }

    const engagement = await updateEngagement(req.params.id, parseResult.data)

    return res.json({
      status: true,
      message: "Engagement saved",
      data: engagement,
    })
  } catch (error) {
    console.error("SAVE ENGAGEMENT ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

router.get("/:id/analysis-runs", async (req, res) => {
  try {
    const engagement = await getEngagementById(req.params.id)

    if (!engagement) {
      return res.status(404).json({
        status: false,
        message: "Engagement not found",
      })
    }

    const analysisRuns = await getAnalysisRunsByEngagementId(req.params.id)

    return res.json({
      status: true,
      data: analysisRuns,
    })
  } catch (error) {
    console.error("GET ANALYSIS RUNS ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Failed to load analysis runs",
    })
  }
})

router.post("/:id/analyze", async (req, res) => {
  try {
    const engagement = await getEngagementById(req.params.id)

    if (!engagement) {
      return res.status(404).json({ status: false, message: "Engagement not found" })
    }

    const result = await analyzeEngagement(engagement)

    if (!result.success) {
      return res.status(422).json({
        status: false,
        message: "LLM output failed validation",
        data: {
          evaluation: result.evaluation,
          error: result.error,
        },
      })
    }

    return res.status(200).json({
      status: true,
      message: "Analysis completed",
      data: {
        report: result.report,
        evaluation: result.evaluation,
      },
    })
  } catch (error) {
    console.error("ANALYSIS ERROR:", error)
    return res.status(500).json({ status: false, message: "Analysis failed" })
  }
})

export default router
