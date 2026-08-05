import { Router } from "express"

import {
  technologyCategoryDraftSchema,
  technologyHistoryFilterSchema,
  technologyProfileFilterSchema,
  technologyProposalDecisionSchema,
  technologyProposalFilterSchema,
  technologyRetrievalContextSchema,
  technologySourceDraftSchema,
  technologyUpdateProposalDraftSchema,
} from "../../../shared/technology-knowledge.schema.js"
import { requireActingUser } from "../lib/auth-context.js"
import { logger } from "../lib/application-logger.js"
import { failureIdentity } from "../lib/failure-identity.js"
import {
  authorizeWorkspaceAction,
  denyRequest,
} from "../services/authorization.service.js"
import { appendAuditTrail } from "../repositories/access.repository.js"
import {
  browseTechnologyProfiles,
  curateCategory,
  curateSource,
  getTechnologyCategories,
  getTechnologyProfile,
  getTechnologySources,
  retrieveTechnologyPackage,
  type RegistryCurateResult,
} from "../services/technology-knowledge.service.js"
import {
  decideTechnologyProposal,
  getProposalReview,
  getTechnologyProposals,
  getTechnologyUpdateHistory,
  proposeTechnologyUpdate,
} from "../services/technology-curator.service.js"

import type { Response } from "express"
import type { AuditEventType } from "../../../shared/access.schema.js"

const router = Router()

// The curated Technology Knowledge Base and its Technology Curator (roadmap
// Phase 5A).
//
// Like the Consulting Knowledge Base's routes these carry no workspace scope of
// their own — the knowledge base is a product-level asset shared across
// workspaces (architecture.md §9) — but every request is still authorized
// through the one shared decision point (coding-standards.md §6A). An
// Administrator curates and decides; a MANAGER and a CLIENT are both refused by
// deny-by-default, because none of the three technology actions names them.
//
// The Client Portal deliberately has no route here and no technology knowledge
// in its responses.
//
// **No route here writes a Technology Profile directly.** A change reaches the
// knowledge base only by an administrator approving a proposal, and that is the
// only path this router exposes (architecture.md §9.3).

// --- Reading the knowledge base --------------------------------------------

router.get("/profiles", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_knowledge.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = technologyProfileFilterSchema.safeParse({
    ...req.query,
    limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
  })
  if (!parseResult.success) return invalidInput(res, parseResult.error.flatten())

  try {
    const profiles = await browseTechnologyProfiles(parseResult.data)

    return res.json({
      status: true,
      message: "technology.message.loaded",
      data: { profiles },
    })
  } catch (error) {
    logger.error("LOAD_TECHNOLOGY_PROFILES_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

router.get("/profiles/:code", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_knowledge.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const profile = await getTechnologyProfile(req.params.code)
    if (profile === null) return notFound(res)

    return res.json({
      status: true,
      message: "technology.message.loaded",
      data: { profile },
    })
  } catch (error) {
    logger.error("LOAD_TECHNOLOGY_PROFILE_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// The two registries the curation surface is built on, in one read: the
// category set a profile is classified under, and the trusted origins a
// proposal may cite.
router.get("/registries", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_knowledge.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const [categories, sources] = await Promise.all([
      getTechnologyCategories(),
      getTechnologySources(),
    ])

    return res.json({
      status: true,
      message: "technology.message.loaded",
      data: { categories, sources },
    })
  } catch (error) {
    logger.error("LOAD_TECHNOLOGY_REGISTRIES_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// --- Registry curation -----------------------------------------------------
//
// Categories and sources are the subsystem's registries — the organizing set
// and the trusted-origin list — and are curated directly. The technology
// knowledge itself is not: that is the curator's gated path below.

router.put("/categories/:code", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_knowledge.curate",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = technologyCategoryDraftSchema.safeParse({
    ...req.body,
    code: req.params.code,
  })
  if (!parseResult.success) return invalidInput(res, parseResult.error.flatten())

  const expectedRevision = revisionOf(req.body?.revision)
  if (expectedRevision === "invalid") return invalidInput(res)

  try {
    const result = await curateCategory(
      actingUser,
      parseResult.data,
      expectedRevision,
    )
    if (!result.success) return curationFailure(res, result)

    return res.json({
      status: true,
      message: "technology.message.category_saved",
      data: { category: result.record },
    })
  } catch (error) {
    logger.error("CURATE_TECHNOLOGY_CATEGORY_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

router.put("/sources/:code", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_knowledge.curate",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = technologySourceDraftSchema.safeParse({
    ...req.body,
    code: req.params.code,
  })
  if (!parseResult.success) return invalidInput(res, parseResult.error.flatten())

  const expectedRevision = revisionOf(req.body?.revision)
  if (expectedRevision === "invalid") return invalidInput(res)

  try {
    const result = await curateSource(
      actingUser,
      parseResult.data,
      expectedRevision,
    )
    if (!result.success) return curationFailure(res, result)

    return res.json({
      status: true,
      message: "technology.message.source_saved",
      data: { source: result.record },
    })
  } catch (error) {
    logger.error("CURATE_TECHNOLOGY_SOURCE_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// --- The Technology Curator ------------------------------------------------

router.get("/proposals", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_knowledge.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = technologyProposalFilterSchema.safeParse({
    ...req.query,
    limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
  })
  if (!parseResult.success) return invalidInput(res, parseResult.error.flatten())

  try {
    const proposals = await getTechnologyProposals(parseResult.data)

    return res.json({
      status: true,
      message: "technology.message.loaded",
      data: { proposals },
    })
  } catch (error) {
    logger.error("LOAD_TECHNOLOGY_PROPOSALS_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// One proposal assembled for review: the change, the profile as it stands, the
// diff between them, and the official sources it cites (UI Kit A11).
router.get("/proposals/:id", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_knowledge.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const review = await getProposalReview(req.params.id)
    if (review === null) return notFound(res)

    return res.json({
      status: true,
      message: "technology.message.loaded",
      data: { review },
    })
  } catch (error) {
    logger.error("LOAD_TECHNOLOGY_PROPOSAL_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// Draft a proposal. Drafting changes nothing in the knowledge base — it records
// what somebody proposes and why, pending an explicit human decision.
router.post("/proposals", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_knowledge.curate",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = technologyUpdateProposalDraftSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error.flatten())

  try {
    const result = await proposeTechnologyUpdate(actingUser, parseResult.data)

    if (!result.success) {
      return res.status(422).json({
        status: false,
        message: result.messageId,
        data: { failure: result.failure, unknownCodes: result.unknownCodes },
      })
    }

    await appendCuratorAudit(actingUser.workspaceId, actingUser.id, {
      eventType: "technology_proposal_created",
      proposalId: result.proposal.id,
      profileCode: result.proposal.profileCode,
      changeKind: result.proposal.changeKind,
    })

    return res.status(201).json({
      status: true,
      message: "technology.message.proposal_created",
      data: { proposal: result.proposal },
    })
  } catch (error) {
    logger.error("CREATE_TECHNOLOGY_PROPOSAL_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// The human-approval gate. This is the **only** route through which the
// Technology Knowledge Base changes, and it requires its own authority —
// drafting a proposal does not carry the right to approve it.
router.post("/proposals/:id/decision", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_proposal.decide",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = technologyProposalDecisionSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error.flatten())

  try {
    const result = await decideTechnologyProposal(
      actingUser,
      req.params.id,
      parseResult.data.decision,
      parseResult.data.note ?? null,
    )

    if (!result.success) {
      return res.status(result.failure === "not_found" ? 404 : 409).json({
        status: false,
        message: result.messageId,
        data: { failure: result.failure },
      })
    }

    await appendCuratorAudit(actingUser.workspaceId, actingUser.id, {
      eventType:
        parseResult.data.decision === "approve"
          ? "technology_proposal_approved"
          : "technology_proposal_rejected",
      proposalId: result.proposal.id,
      profileCode: result.proposal.profileCode,
      changeKind: result.proposal.changeKind,
    })

    return res.json({
      status: true,
      message:
        parseResult.data.decision === "approve"
          ? "technology.message.proposal_approved"
          : "technology.message.proposal_rejected",
      data: {
        proposal: result.proposal,
        historyEntry: result.historyEntry,
      },
    })
  } catch (error) {
    logger.error("DECIDE_TECHNOLOGY_PROPOSAL_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// The append-only Technology Update History. Read-only: there is no route that
// edits or removes an entry, and there is no repository function that could.
router.get("/history", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_knowledge.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = technologyHistoryFilterSchema.safeParse({
    ...req.query,
    limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
  })
  if (!parseResult.success) return invalidInput(res, parseResult.error.flatten())

  try {
    const entries = await getTechnologyUpdateHistory(parseResult.data)

    return res.json({
      status: true,
      message: "technology.message.loaded",
      data: { entries },
    })
  } catch (error) {
    logger.error("LOAD_TECHNOLOGY_HISTORY_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// --- Retrieval preview -----------------------------------------------------

// What a later stage would retrieve for a given context.
//
// It exists so the retrieval contract can be exercised and validated on its own
// before anything consumes it, and so a curator can see what their curation
// actually surfaces. It returns curated knowledge only — no engagement is named
// and none is read — and it is not a recommendation path.
router.post("/retrieval-preview", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(
    actingUser,
    "technology_knowledge.read",
  )
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = technologyRetrievalContextSchema.safeParse(req.body)
  if (!parseResult.success) return invalidInput(res, parseResult.error.flatten())

  try {
    const technologyPackage = await retrieveTechnologyPackage(parseResult.data)

    return res.json({
      status: true,
      message: "technology.message.retrieval_previewed",
      data: { technologyPackage },
    })
  } catch (error) {
    logger.error("PREVIEW_TECHNOLOGY_RETRIEVAL_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// --- Boundary helpers ------------------------------------------------------

// A create carries no revision; an update carries the one the curator read.
// Anything else is malformed rather than treated as a create, so a dropped
// field cannot silently turn an edit into a duplicate-code refusal.
const revisionOf = (value: unknown): number | null | "invalid" => {
  if (value === undefined || value === null) return null

  const revision = Number(value)
  return Number.isInteger(revision) && revision >= 0 ? revision : "invalid"
}

// Curation events are access- and governance-relevant, so they append to the
// workspace **Audit Trail** — who did what, when. That is deliberately separate
// from the Technology Update History, which records what the knowledge base
// itself came to say. Three governance logs, three purposes, never merged
// (architecture.md §7A.8, §8, §9.3).
//
// Best-effort, like every other audit append beside a completed action: the
// decision has already been made and must not be undone by a logging failure.
const appendCuratorAudit = async (
  workspaceId: string,
  userId: string,
  payload: {
    eventType: AuditEventType
    proposalId: string
    profileCode: string
    changeKind: string
  },
) => {
  const { eventType, ...rest } = payload

  try {
    await appendAuditTrail({ workspaceId, userId, eventType, payload: rest })
  } catch (error) {
    logger.error("AUDIT_APPEND_FAILED", {
      eventType,
      workspaceId,
      userId,
      ...failureIdentity(error),
    })
  }
}

const curationFailure = (
  res: Response,
  result: Extract<RegistryCurateResult<unknown>, { success: false }>,
) => {
  switch (result.failure) {
    case "not_found":
      return notFound(res)
    case "duplicate_code":
      return res
        .status(409)
        .json({ status: false, message: "technology.error.duplicate_code" })
    case "conflict":
      return res.status(409).json({
        status: false,
        message: "technology.error.conflict",
        data: { currentRevision: result.currentRevision },
      })
  }
}

const invalidInput = (res: Response, errors?: unknown) =>
  res.status(400).json({
    status: false,
    message: "technology.error.invalid_input",
    ...(errors === undefined ? {} : { errors }),
  })

const notFound = (res: Response) =>
  res.status(404).json({ status: false, message: "technology.error.not_found" })

const internalError = (res: Response) =>
  res.status(500).json({ status: false, message: "technology.error.internal" })

export default router
