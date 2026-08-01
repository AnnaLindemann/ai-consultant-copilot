import { Router } from "express"

import {
  consultingKnowledgeEntryDraftSchema,
  consultingKnowledgeFilterSchema,
} from "../../../shared/consulting-knowledge.schema.js"
import { requireActingUser } from "../lib/auth-context.js"
import { failureIdentity } from "../lib/failure-identity.js"
import {
  authorizeEngagementAction,
  authorizeWorkspaceAction,
  denyRequest,
} from "../services/authorization.service.js"
import {
  browseKnowledge,
  createKnowledgeEntry,
  getKnowledgeEntry,
  retrieveKnowledgePackage,
  updateKnowledgeEntry,
  type KnowledgeCurateResult,
} from "../services/consulting-knowledge.service.js"
import { toAssessment } from "../repositories/engagement.repository.js"

import type { Response } from "express"

const router = Router()

// The curated Consulting Knowledge Base (roadmap Phase 5).
//
// The knowledge base is a product-level asset shared across workspaces, so
// these routes carry no workspace scope of their own — but they are still
// authorized on every request through the one shared decision point
// (coding-standards.md §6A). An ADMIN curates; a MANAGER reads; a CLIENT is
// refused by deny-by-default, because `knowledge.read` names no CLIENT.
//
// The Client Portal deliberately has no route here and no knowledge in its
// responses: internal frameworks, AI-readiness criteria, and curated guidance
// are consultant-facing (domain-model.md §2 "Client Portal"; architecture.md
// §7A.5).

// The two knowledge-consuming stages, taken from the path rather than guessed,
// so a caller cannot ask for a stage the phase does not retrieve for.
const RETRIEVAL_STAGE = {
  "discovery-package": "discovery",
  "assessment-package": "assessment",
} as const

router.get("/", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "knowledge.read")
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = consultingKnowledgeFilterSchema.safeParse({
    ...req.query,
    limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    includeInactive:
      req.query.includeInactive === undefined
        ? undefined
        : req.query.includeInactive === "true",
  })

  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "knowledge.error.invalid_input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const results = await browseKnowledge(parseResult.data)

    return res.json({
      status: true,
      message: "knowledge.message.loaded",
      data: { results },
    })
  } catch (error) {
    console.error("LOAD_KNOWLEDGE_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

router.get("/entries/:code", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "knowledge.read")
  if (!authorized.permitted) return denyRequest(res, authorized)

  try {
    const entry = await getKnowledgeEntry(req.params.code)

    if (entry === null) {
      return res
        .status(404)
        .json({ status: false, message: "knowledge.error.not_found" })
    }

    return res.json({
      status: true,
      message: "knowledge.message.loaded",
      data: { entry },
    })
  } catch (error) {
    console.error("LOAD_KNOWLEDGE_ENTRY_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

router.post("/entries", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "knowledge.curate")
  if (!authorized.permitted) return denyRequest(res, authorized)

  const parseResult = consultingKnowledgeEntryDraftSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "knowledge.error.invalid_input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const result = await createKnowledgeEntry(actingUser, parseResult.data)
    if (!result.success) return curationFailure(res, result)

    return res.status(201).json({
      status: true,
      message: "knowledge.message.saved",
      data: { entry: result.entry },
    })
  } catch (error) {
    console.error("CREATE_KNOWLEDGE_ENTRY_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// Editing and deactivating are the same request: an entry is retired by saving
// it with `active: false`, which removes it from every retrieval without
// deleting curated work or invalidating the codes an earlier Analysis Run
// recorded.
router.patch("/entries/:code", async (req, res) => {
  const actingUser = await requireActingUser(req, res)
  if (!actingUser) return

  const authorized = await authorizeWorkspaceAction(actingUser, "knowledge.curate")
  if (!authorized.permitted) return denyRequest(res, authorized)

  const revision = Number(req.body?.revision)
  if (!Number.isInteger(revision) || revision < 0) {
    return res.status(400).json({
      status: false,
      message: "knowledge.error.invalid_input",
    })
  }

  const parseResult = consultingKnowledgeEntryDraftSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      status: false,
      message: "knowledge.error.invalid_input",
      errors: parseResult.error.flatten(),
    })
  }

  try {
    const result = await updateKnowledgeEntry(
      actingUser,
      req.params.code,
      revision,
      parseResult.data,
    )

    if (!result.success) return curationFailure(res, result)

    return res.json({
      status: true,
      message: "knowledge.message.updated",
      data: { entry: result.entry },
    })
  } catch (error) {
    console.error("UPDATE_KNOWLEDGE_ENTRY_FAILED", failureIdentity(error))
    return internalError(res)
  }
})

// The retrieval a stage view reads. It is authorized as an action *on the
// engagement* — not merely as "may read knowledge" — so a Manager cannot use
// the knowledge surface as a side door into a colleague's engagement, and a
// refusal is audited like every other engagement denial (architecture.md §7A.2).
for (const [segment, stage] of Object.entries(RETRIEVAL_STAGE)) {
  router.get(`/engagements/:id/${segment}`, async (req, res) => {
    const actingUser = await requireActingUser(req, res)
    if (!actingUser) return

    const authorized = await authorizeEngagementAction(
      actingUser,
      "knowledge.read",
      req.params.id,
    )
    if (!authorized.permitted) return denyRequest(res, authorized)

    try {
      const knowledgePackage = await retrieveKnowledgePackage(
        authorized.resource,
        stage,
        stage === "assessment" ? toAssessment(authorized.resource) : null,
      )

      return res.json({
        status: true,
        message: "knowledge.message.loaded",
        data: { knowledgePackage },
      })
    } catch (error) {
      console.error("LOAD_KNOWLEDGE_PACKAGE_FAILED", failureIdentity(error))
      return internalError(res)
    }
  })
}

const curationFailure = (
  res: Response,
  result: Extract<KnowledgeCurateResult, { success: false }>,
) => {
  switch (result.failure) {
    case "not_found":
      return res
        .status(404)
        .json({ status: false, message: "knowledge.error.not_found" })
    case "duplicate_code":
      return res
        .status(409)
        .json({ status: false, message: "knowledge.error.duplicate_code" })
    case "conflict":
      return res.status(409).json({
        status: false,
        message: "knowledge.error.conflict",
        data: { currentRevision: result.currentRevision },
      })
    case "invalid_relationship":
      return res.status(400).json({
        status: false,
        message: "knowledge.error.invalid_relationship",
        data: { violations: result.violations },
      })
  }
}

const internalError = (res: Response) =>
  res.status(500).json({ status: false, message: "knowledge.error.internal" })

export default router
