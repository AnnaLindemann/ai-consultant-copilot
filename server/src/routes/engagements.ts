import { Router, type Response } from "express"
import type { ZodError } from "zod"

import { discoveryTransitionMessageIds } from "../../../shared/discovery-messages.js"
import {
  engagementScopeOf,
  type ActingUser,
  type EngagementScope,
} from "../domain/access/access.js"
import { requireActingUser } from "../lib/auth-context.js"
import {
  authorizeEngagementAction,
  authorizeWorkspaceAction,
  denyRequest,
} from "../services/authorization.service.js"

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
  getEngagements,
  toDiscoveryProfile,
  toDiscoveryWorkflowState,
  updateEngagement,
  type EngagementWithOrganization,
} from "../repositories/engagement.repository.js"
import { getOrganizationById } from "../repositories/organization.repository.js"
import { analyzeEngagement } from "../services/analysis.service.js"
import { getAnalysisRunsByEngagementId } from "../repositories/analysis-run.repository.js"
import { appendAuditTrail } from "../repositories/access.repository.js"
import {
  notifyEngagementClient,
  raiseNotification,
} from "../services/notification.service.js"
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
import {
  prioritizeOpportunitiesSchema,
  saveOpportunitiesSchema,
} from "../schemas/opportunities.schema.js"
import {
  getOpportunityVersionState,
  listOpportunityVersions,
  prioritizeOpportunities,
  saveOpportunities,
  type PrioritizeOpportunitiesFailure,
  type SaveOpportunitiesFailure,
} from "../services/opportunities.service.js"
import { getOpportunityVersionById } from "../repositories/opportunity-version.repository.js"
import { failureIdentity } from "../lib/failure-identity.js"

const router = Router()

// The consultant workbench surface. Every route establishes the acting user,
// then asks the AccessPolicy through `authorizeEngagementAction` /
// `authorizeWorkspaceAction`. The engagement a handler works on is the one the
// authorization already loaded through the workspace-scoped repository, so
// there is no second, unscoped fetch (architecture.md §7A.2, §7A.4).

// How a refused or failed assessment generation is reported at the boundary:
// the consultant is missing a precondition (422), their own edits are protected
// (409), or the AI provider itself failed (502).
const assessmentFailureStatus = {
  discovery_not_ready: 422,
  consultant_edits_protected: 409,
  ai_output_invalid: 422,
  ai_step_failed: 502,
} as const

// How a refused or failed prioritization is reported at the boundary: the
// consultant is missing a precondition (422), a second regeneration got there
// first (409), the AI provider itself failed (502), or the validated version
// could not be stored (500). Output that cites findings the Assessment does not
// contain is unusable output, reported like any other (422).
const opportunitiesFailureStatus: Record<
  PrioritizeOpportunitiesFailure,
  number
> = {
  assessment_not_ready: 422,
  consultant_edits_protected: 409,
  ai_output_invalid: 422,
  ai_output_ungrounded: 422,
  ai_step_failed: 502,
  version_conflict: 409,
  persistence_failed: 500,
}

// How a refused save is reported. A save aimed at a version the caller cannot
// reach is refused exactly as one aimed at a version that does not exist (404,
// architecture.md §7A.4); a save that lost a race or aimed at a preserved
// version is a conflict (409), because the caller's own next step differs in
// each case.
const saveOpportunitiesFailureStatus: Record<SaveOpportunitiesFailure, number> =
  {
    assessment_not_ready: 422,
    ai_output_ungrounded: 422,
    success_criteria_placeholder: 422,
    version_not_found: 404,
    historical_version_readonly: 409,
    stale_update: 409,
  }

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

router.get("/", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "engagement.list")
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    // Listings are scoped exactly as record fetches are: an Administrator sees
    // their workspace, a Manager sees what they own, and nothing crosses a
    // workspace boundary (architecture.md §7A.4).
    const engagements = await getEngagements(engagementScopeOf(actingUser))

    return res.json({
      status: true,
      message: "Engagements loaded",
      data: engagements,
    })
  } catch (error) {
    console.error("LOAD_ENGAGEMENTS_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

router.get("/:id", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.read",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    // The Opportunity stage answers with the version being worked on and
    // whether the Assessment has moved on beneath it, so a consultant resuming
    // an engagement sees at once that regenerating is worth considering
    // (agent-rules.md §15).
    const opportunities = await getOpportunityVersionState(
      authorized.resource,
      authorized.scope,
    )

    return res.json({
      status: true,
      message: "Engagement loaded",
      data: { ...withDiscoveryState(authorized.resource), opportunities },
    })
  } catch (error) {
    console.error("LOAD_ENGAGEMENT_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

router.post("/", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "engagement.create",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = createEngagementSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "invalid input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    // The engagement must belong to a real Organization in the caller's own
    // workspace; a dangling or out-of-workspace organizationId is refused
    // before we attempt to persist.
    const organization = await getOrganizationById(
      parseResult.data.organizationId,
      engagementScopeOf(actingUser),
    )
    if (!organization) {
      return res.status(404).json({
        status: false,
        message: "Organization not found",
      })
    }

    const engagement = await createEngagement(
      engagementScopeOf(actingUser),
      parseResult.data,
    )

    return res.status(201).json({
      status: true,
      message: "Engagement created",
      data: engagement,
    })
  } catch (error) {
    console.error("CREATE_ENGAGEMENT_FAILED", failureIdentity(error))

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
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.update",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = updateEngagementSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "invalid input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const engagement = await updateEngagement(
      req.params.id,
      authorized.scope,
      parseResult.data,
    )

    return res.json({
      status: true,
      message: "Engagement saved",
      data: engagement,
    })
  } catch (error) {
    console.error("SAVE_ENGAGEMENT_FAILED", failureIdentity(error))

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
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "discovery.save",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = saveDiscoveryProfileSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "discovery.error.invalid_profile",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const engagement = await saveDiscoveryProfile(
      authorized.resource,
      authorized.scope,
      parseResult.data.profile,
      parseResult.data.contributor,
    )

    return res.json({
      status: true,
      message: "discovery.message.profile_saved",
      data: withDiscoveryState(engagement),
    })
  } catch (error) {
    console.error("SAVE_DISCOVERY_PROFILE_FAILED", failureIdentity(error))

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
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "discovery.submit",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = submitDiscoverySchema.safeParse(req.body ?? {})
  if (!parseResult.success) return invalidTransitionInput(res, parseResult.error)

  // A consultant submitting through the workbench submits as the consultant;
  // a client's submission has its own portal endpoint. Claiming to act as the
  // other party is refused rather than trusted.
  if (parseResult.data.actor !== "consultant") {
    return res.status(403).json({
      status: false,
      message: "auth.error.forbidden",
    })
  }

  return runDiscoveryTransition(res, actingUser, authorized.resource, authorized.scope, {
    transition: "submit",
    actor: "consultant",
  })
})

router.post("/:id/discovery/return", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "discovery.review",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = returnDiscoverySchema.safeParse(req.body ?? {})
  if (!parseResult.success) return invalidTransitionInput(res, parseResult.error)

  return runDiscoveryTransition(res, actingUser, authorized.resource, authorized.scope, {
    transition: "return",
    actor: "consultant",
    notes: parseResult.data.notes,
  })
})

router.post("/:id/discovery/accept", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "discovery.review",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = reviewDiscoverySchema.safeParse(req.body ?? {})
  if (!parseResult.success) return invalidTransitionInput(res, parseResult.error)

  return runDiscoveryTransition(res, actingUser, authorized.resource, authorized.scope, {
    transition: "accept",
    actor: "consultant",
  })
})

router.post("/:id/discovery/reopen", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "discovery.review",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = reviewDiscoverySchema.safeParse(req.body ?? {})
  if (!parseResult.success) return invalidTransitionInput(res, parseResult.error)

  return runDiscoveryTransition(res, actingUser, authorized.resource, authorized.scope, {
    transition: "reopen",
    actor: "consultant",
  })
})

// Generate the AI-assisted Assessment draft from the persisted Discovery
// Profile. Re-runnable against updated discovery without restarting the
// engagement (roadmap Phase 3).
router.post("/:id/assessment", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  // Triggering a generation is itself an authorized action, so no AI step can
  // be the route by which data crosses a boundary (architecture.md §5).
  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.generate",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = generateAssessmentSchema.safeParse(req.body ?? {})
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "invalid input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const result = await generateAssessment(authorized.resource, authorized.scope, {
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
    console.error("GENERATE_ASSESSMENT_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

// Save the consultant's reviewed Assessment as a complete snapshot — the AI
// draft is theirs to edit, override, or accept (agent-rules.md §10).
router.patch("/:id/assessment", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.update",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = saveAssessmentSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "invalid assessment",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const engagement = await saveAssessment(
      req.params.id,
      authorized.scope,
      parseResult.data.assessment,
      parseResult.data.reviewState ?? "consultant_edited",
    )

    return res.json({
      status: true,
      message: "Assessment saved",
      data: engagement,
    })
  } catch (error) {
    console.error("SAVE_ASSESSMENT_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    })
  }
})

// Derive, qualify, and prioritize the Opportunities from the persisted
// Assessment (roadmap Phase 4). Re-runnable after the Assessment changes,
// without restarting the engagement.
router.post("/:id/opportunities", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  // Triggering a generation is itself an authorized action, so no AI step can
  // be the route by which data crosses a boundary (architecture.md §5). The
  // stage inherits the existing access decision point; it adds no rule of its
  // own (coding-standards.md §15).
  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.generate",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = prioritizeOpportunitiesSchema.safeParse(req.body ?? {})
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "opportunity.error.invalid_input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const result = await prioritizeOpportunities(
      authorized.resource,
      authorized.scope,
      {
        replaceConsultantEdits:
          parseResult.data.replaceConsultantEdits ?? false,
      },
    )

    if (!result.success) {
      // The consultant sees why no new version was produced, as an identifier
      // the frontend renders in their language. In every failure case the
      // version they were working on is untouched (architecture.md §13;
      // coding-standards.md §12A).
      return res.status(opportunitiesFailureStatus[result.failure]).json({
        status: false,
        message: result.messageId,
        data: {
          failure: result.failure,
          evaluation: result.evaluation,
          unknownFindingIds: result.unknownFindingIds,
        },
      })
    }

    return res.status(201).json({
      status: true,
      message: "opportunity.message.prioritized",
      data: {
        version: result.version,
        evaluation: result.evaluation,
      },
    })
  } catch (error) {
    console.error("PRIORITIZE_OPPORTUNITIES_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "opportunity.error.internal",
    })
  }
})

// Save the consultant's reviewed Opportunities into the version they are
// working on — the AI draft is theirs to edit, re-order, override, or accept
// (agent-rules.md §10). This is the autosave path; it changes the active
// version and never creates one.
router.patch("/:id/opportunities", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.update",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = saveOpportunitiesSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "opportunity.error.invalid_input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const result = await saveOpportunities(
      authorized.resource,
      authorized.scope,
      {
        versionId: parseResult.data.versionId,
        expectedRevision: parseResult.data.expectedRevision,
        prioritization: parseResult.data.prioritization,
        reviewState: parseResult.data.reviewState ?? "consultant_edited",
      },
    )

    if (!result.success) {
      return res.status(saveOpportunitiesFailureStatus[result.failure]).json({
        status: false,
        message: result.messageId,
        data: {
          failure: result.failure,
          unknownFindingIds: result.unknownFindingIds,
          currentRevision: result.currentRevision,
        },
      })
    }

    return res.json({
      status: true,
      message:
        result.version.reviewState === "accepted"
          ? "opportunity.message.accepted"
          : "opportunity.message.saved",
      data: { version: result.version },
    })
  } catch (error) {
    console.error("SAVE_OPPORTUNITIES_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "opportunity.error.internal",
    })
  }
})

// The engagement's Opportunity version history. Preserved versions are read
// through the same authorization and the same workspace scope as the active
// one: keeping a version never widens who may see it (coding-standards.md §6A).
router.get("/:id/opportunities/versions", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.read",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const versions = await listOpportunityVersions(
      req.params.id,
      authorized.scope,
    )

    return res.json({
      status: true,
      message: "Opportunity versions loaded",
      data: { versions },
    })
  } catch (error) {
    console.error("LOAD_OPPORTUNITY_VERSIONS_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "opportunity.error.internal",
    })
  }
})

// One version, with its content, for reading. A version outside the caller's
// reach is refused exactly as one that does not exist (architecture.md §7A.4).
router.get("/:id/opportunities/versions/:versionId", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.read",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const version = await getOpportunityVersionById(
      req.params.versionId,
      req.params.id,
      authorized.scope,
    )

    if (!version) {
      return res.status(404).json({
        status: false,
        message: "opportunity.error.version_not_found",
      })
    }

    return res.json({
      status: true,
      message: "Opportunity version loaded",
      data: { version },
    })
  } catch (error) {
    console.error("LOAD_OPPORTUNITY_VERSION_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "opportunity.error.internal",
    })
  }
})

router.get("/:id/analysis-runs", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  // Run history and the cost roll-up over it are as much a disclosure as the
  // engagement itself, so they are authorized and scoped identically
  // (architecture.md §8, §12).
  const authorized = await authorizeEngagementAction(
    actingUser,
    "analysis_run.read",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const analysisRuns = await getAnalysisRunsByEngagementId(
      actingUser.workspaceId,
      req.params.id,
    )

    return res.json({
      status: true,
      data: analysisRuns,
    })
  } catch (error) {
    console.error("GET_ANALYSIS_RUNS_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "Failed to load analysis runs",
    })
  }
})

router.post("/:id/analyze", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeEngagementAction(
    actingUser,
    "engagement.generate",
    req.params.id,
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const result = await analyzeEngagement(authorized.resource, authorized.scope)

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
    console.error("RUN_ANALYSIS_FAILED", failureIdentity(error))
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
// path from an authorized engagement to a structured outcome, one audit entry,
// and one notification.
const runDiscoveryTransition = async (
  res: Response,
  actingUser: ActingUser,
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  input: TransitionDiscoveryInput,
) => {
  try {
    const result = await transitionDiscovery(engagement, scope, input)

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

    await appendAuditTrail({
      workspaceId: scope.workspaceId,
      userId: actingUser.id,
      engagementId: engagement.id,
      eventType: DISCOVERY_AUDIT_EVENT[input.transition],
      payload: { transition: input.transition, actor: input.actor },
    })

    await notifyDiscoveryTransition(actingUser, engagement, input)

    return res.json({
      status: true,
      message: discoveryTransitionMessageIds[input.transition],
      data: withDiscoveryState(result.engagement),
    })
  } catch (error) {
    console.error("DISCOVERY_TRANSITION_FAILED", failureIdentity(error))

    return res.status(500).json({
      status: false,
      message: "discovery.error.internal",
    })
  }
}

const DISCOVERY_AUDIT_EVENT = {
  submit: "discovery_submitted",
  return: "discovery_returned",
  accept: "discovery_accepted",
  reopen: "discovery_reopened",
} as const

// Who each transition concerns. A consultant's submission notifies the owning
// Manager; a review outcome notifies the client who is working on the
// discovery. Payloads carry identifiers only — a notification never carries
// engagement content (architecture.md §7A.7).
const notifyDiscoveryTransition = async (
  actingUser: ActingUser,
  engagement: EngagementWithOrganization,
  input: TransitionDiscoveryInput,
) => {
  if (input.transition === "submit") {
    return raiseNotification({
      workspaceId: engagement.workspaceId,
      userId: engagement.owningManagerId,
      engagementId: engagement.id,
      kind: "discovery_submitted",
      payload: { engagementId: engagement.id, submittedBy: actingUser.id },
    })
  }

  return notifyEngagementClient({
    workspaceId: engagement.workspaceId,
    engagementId: engagement.id,
    kind: DISCOVERY_REVIEW_NOTIFICATION[input.transition],
    payload: { engagementId: engagement.id },
  })
}

// A review outcome the client is told about. `submit` is handled above, because
// it concerns the consultant rather than the client.
const DISCOVERY_REVIEW_NOTIFICATION = {
  submit: "discovery_submitted",
  return: "discovery_returned",
  accept: "discovery_accepted",
  reopen: "discovery_reopened",
} as const

export default router
