import { Router, type Response } from "express"
import type { ZodError } from "zod"

import { discoveryTransitionMessageIds } from "../../../shared/discovery-messages.js"

import {
  createEngagementSchema,
  updateEngagementSchema,
} from "../schemas/engagement.schema.js"
import {
  returnDiscoverySchema,
  reviewDiscoverySchema,
  saveDiscoveryProfileSchema,
  submitDiscoverySchema,
} from "../schemas/discovery.schema.js"
import {
  createEngagement,
  getEngagementById,
  getEngagements,
  toDiscoveryProfile,
  toDiscoveryWorkflowState,
  updateEngagement,
  type EngagementWithOrganization,
} from "../repositories/engagement.repository.js"
import { getOrganizationById } from "../repositories/organization.repository.js"
import { analyzeEngagement } from "../services/analysis.service.js"
import { getAnalysisRunsByEngagementId } from "../repositories/analysis-run.repository.js"
import {
  saveDiscoveryProfile,
  transitionDiscovery,
  type DiscoveryTransitionFailure,
  type TransitionDiscoveryInput,
} from "../services/discovery.service.js"
import {
  generateAssessmentSchema,
  saveAssessmentSchema,
} from "../schemas/assessment.schema.js"
import {
  generateAssessment,
  saveAssessment,
} from "../services/assessment.service.js"

const router = Router()

// How a refused or failed assessment generation is reported at the boundary:
// the consultant is missing a precondition (422), their own edits are protected
// (409), or the AI provider itself failed (502).
const assessmentFailureStatus = {
  discovery_not_ready: 422,
  consultant_edits_protected: 409,
  ai_output_invalid: 422,
  ai_step_failed: 502,
} as const

// How a refused Discovery review transition is reported at the boundary: the
// actor does not hold that authority (403), the workflow is not in a state that
// allows it (409), or discovery is not yet complete enough to submit (422).
const discoveryTransitionFailureStatus: Record<
  DiscoveryTransitionFailure,
  number
> = {
  actor_not_permitted: 403,
  illegal_transition: 409,
  baseline_not_explained: 422,
}

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
      data: withDiscoveryState(engagement),
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

// Save the Engagement-owned Discovery Profile as a complete snapshot. Values
// may be cleared back to null/empty lists as understanding changes, and gaps —
// including the value & measurement baseline's — are explicit data rather than
// inferred or invented by the application. The contributor is required so each
// changed section is attributed to whoever actually provided it.
router.patch("/:id/discovery", async (req, res) => {
  const parseResult = saveDiscoveryProfileSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "discovery.error.invalid_profile",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const existing = await getEngagementById(req.params.id)
    if (!existing) {
      return res.status(404).json({
        status: false,
        message: "discovery.error.engagement_not_found",
      })
    }

    const engagement = await saveDiscoveryProfile(
      existing,
      parseResult.data.profile,
      parseResult.data.contributor,
    )

    return res.json({
      status: true,
      message: "discovery.message.profile_saved",
      data: withDiscoveryState(engagement),
    })
  } catch (error) {
    console.error("SAVE DISCOVERY PROFILE ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "discovery.error.internal",
    })
  }
})

// The Discovery review workflow (Phase 2 Extension). Submitting is the
// contributor's checkpoint; accepting, returning, and reopening are the
// consultant's review authority. No transition touches discovery content.
router.post("/:id/discovery/submit", async (req, res) => {
  const parseResult = submitDiscoverySchema.safeParse(req.body ?? {})
  if (!parseResult.success) return invalidTransitionInput(res, parseResult.error)

  return runDiscoveryTransition(res, req.params.id, {
    transition: "submit",
    actor: parseResult.data.actor,
  })
})

router.post("/:id/discovery/return", async (req, res) => {
  const parseResult = returnDiscoverySchema.safeParse(req.body ?? {})
  if (!parseResult.success) return invalidTransitionInput(res, parseResult.error)

  return runDiscoveryTransition(res, req.params.id, {
    transition: "return",
    actor: parseResult.data.actor,
    notes: parseResult.data.notes,
  })
})

router.post("/:id/discovery/accept", async (req, res) => {
  const parseResult = reviewDiscoverySchema.safeParse(req.body ?? {})
  if (!parseResult.success) return invalidTransitionInput(res, parseResult.error)

  return runDiscoveryTransition(res, req.params.id, {
    transition: "accept",
    actor: parseResult.data.actor,
  })
})

router.post("/:id/discovery/reopen", async (req, res) => {
  const parseResult = reviewDiscoverySchema.safeParse(req.body ?? {})
  if (!parseResult.success) return invalidTransitionInput(res, parseResult.error)

  return runDiscoveryTransition(res, req.params.id, {
    transition: "reopen",
    actor: parseResult.data.actor,
  })
})

// Generate the AI-assisted Assessment draft from the persisted Discovery
// Profile. Re-runnable against updated discovery without restarting the
// engagement (roadmap Phase 3).
router.post("/:id/assessment", async (req, res) => {
  const parseResult = generateAssessmentSchema.safeParse(req.body ?? {})
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "invalid input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const engagement = await getEngagementById(req.params.id)
    if (!engagement) {
      return res.status(404).json({
        status: false,
        message: "Engagement not found",
      })
    }

    const result = await generateAssessment(engagement, {
      replaceConsultantEdits: parseResult.data.replaceConsultantEdits ?? false,
    })

    if (!result.success) {
      // The consultant sees why no draft was produced; engagement state is
      // unchanged in every failure case (architecture.md §13).
      return res.status(assessmentFailureStatus[result.failure]).json({
        status: false,
        message: result.error,
        data: {
          failure: result.failure,
          evaluation: result.evaluation,
        },
      })
    }

    return res.json({
      status: true,
      message: "Assessment draft generated",
      data: {
        assessment: result.assessment,
        reviewState: result.reviewState,
        evaluation: result.evaluation,
      },
    })
  } catch (error) {
    console.error("GENERATE ASSESSMENT ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

// Save the consultant's reviewed Assessment as a complete snapshot — the AI
// draft is theirs to edit, override, or accept (agent-rules.md §10).
router.patch("/:id/assessment", async (req, res) => {
  const parseResult = saveAssessmentSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "invalid assessment",
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

    const engagement = await saveAssessment(
      req.params.id,
      parseResult.data.assessment,
      parseResult.data.reviewState ?? "consultant_edited",
    )

    return res.json({
      status: true,
      message: "Assessment saved",
      data: engagement,
    })
  } catch (error) {
    console.error("SAVE ASSESSMENT ERROR:", error)

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

// The engagement row plus the Discovery Profile and review state assembled
// from it, so the client renders what the backend holds rather than mapping
// stored columns into domain shapes itself (architecture.md §7).
const withDiscoveryState = (engagement: EngagementWithOrganization) => ({
  ...engagement,
  discoveryProfile: toDiscoveryProfile(engagement),
  discoveryWorkflow: toDiscoveryWorkflowState(engagement),
})

const invalidTransitionInput = (res: Response, error: ZodError) =>
  res.status(400).json({
    status: false,
    message: "discovery.error.invalid_transition_input",
    errors: error.flatten(),
  })

// The four review transitions differ only in their payload, so they share one
// path from "engagement exists" to a structured outcome.
const runDiscoveryTransition = async (
  res: Response,
  engagementId: string,
  input: TransitionDiscoveryInput,
) => {
  try {
    const engagement = await getEngagementById(engagementId)
    if (!engagement) {
      return res.status(404).json({
        status: false,
        message: "discovery.error.engagement_not_found",
      })
    }

    const result = await transitionDiscovery(engagement, input)

    if (!result.success) {
      // Discovery content is unchanged in every refusal case. The refusal is
      // reported as an identifier plus its parameters; the frontend renders it
      // in the user's language (architecture.md §7.1).
      return res.status(discoveryTransitionFailureStatus[result.failure]).json({
        status: false,
        message: result.messageId,
        data: {
          failure: result.failure,
          messageParams: result.messageParams,
          unexplainedBaselineSubjects: result.unexplainedBaselineSubjects,
        },
      })
    }

    return res.json({
      status: true,
      message: discoveryTransitionMessageIds[input.transition],
      data: withDiscoveryState(result.engagement),
    })
  } catch (error) {
    console.error("DISCOVERY TRANSITION ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "discovery.error.internal",
    })
  }
}

export default router
