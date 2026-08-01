import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

import { config as loadDotenv } from "dotenv"
import { Client } from "pg"

import type {
  TechnologyPackage,
  TechnologyProfile,
  TechnologyProposalReview,
  TechnologyUpdateHistoryEntry,
  TechnologyUpdateProposal,
} from "../../../shared/technology-knowledge.schema.js"

// The curated Technology Knowledge Base and its Technology Curator against
// **real** storage: the migration chain a deployment applies, the real
// Prisma-backed technology tables, the real shipped seed, the real deterministic
// retrieval, and the real routes behind a real Better Auth session.
//
// The domain suite proves the rules without a database, which is right for the
// rules but leaves the seams unproven: whether the seed reaches storage and
// survives the Json round-trip, whether the approval gate really is the only
// way a profile changes, whether the history is genuinely append-only in the
// database, whether a Manager and a Client are refused everything, and whether
// the retrieval contract Phase 6 will consume actually returns stable codes.
//
// No AI provider is involved: nothing in Phase 5A calls a model.
//
// Deterministic and isolated in the same way as the other integration suites:
// its own throwaway database, migrated with the deployment chain and dropped
// afterwards. It **does not skip** — `npm run test:integration` is part of the
// acceptance path.

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

const TEST_DATABASE_PREFIX = "phase5a_technology_test_"

const skippableWithoutDatabase = isEnabled(process.env.INTEGRATION_TESTS_OPTIONAL)

const environment = await prepareDatabase()

if (!environment) {
  test(
    "the Technology Knowledge Base storage path needs PostgreSQL",
    { skip: "INTEGRATION_TESTS_OPTIONAL is set and no database was reachable" },
    () => {},
  )
} else {
  const { databaseUrl, adminUrl, databaseName } = environment

  process.env.DATABASE_URL = databaseUrl
  process.env.BETTER_AUTH_SECRET = "integration-test-secret-not-used-elsewhere"
  process.env.CLIENT_ORIGIN = "http://localhost:3000"
  process.env.SERVER_BASE_URL = "http://localhost:8787"
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM

  const { prisma } = await import("../lib/prisma.js")
  const { authenticationProvider } = await import(
    "../lib/auth/authentication-provider.js"
  )
  const { default: express } = await import("express")
  const { default: technologyRouter } = await import("./technology.js")
  const { default: portalRouter } = await import("./portal.js")

  const app = express()
  app.use(express.json())
  app.use("/technology", technologyRouter)
  app.use("/portal", portalRouter)

  const server = app.listen(0)
  const address = server.address()
  assert.ok(address && typeof address === "object", "test server did not start")
  const baseUrl = `http://127.0.0.1:${address.port}`

  after(async () => {
    server.close()
    await prisma.$disconnect()
    await dropDatabase(adminUrl, databaseName)
  })

  // --- The world the routes read from --------------------------------------

  const workspace = await prisma.workspace.create({ data: { name: "Acme Consulting" } })

  const admin = await signedInUser({
    email: "admin@example.com",
    displayName: "Real Administrator",
    role: "ADMIN",
    workspaceId: workspace.id,
  })

  const manager = await signedInUser({
    email: "manager@example.com",
    displayName: "Real Manager",
    role: "MANAGER",
    workspaceId: workspace.id,
  })

  const client = await signedInUser({
    email: "client@example.com",
    displayName: "Real Client",
    role: "CLIENT",
    workspaceId: workspace.id,
  })

  // --- Reach ---------------------------------------------------------------

  test("an unauthenticated caller reaches no part of the Technology Knowledge Base", async () => {
    for (const routePath of [
      "/technology/profiles",
      "/technology/registries",
      "/technology/proposals",
      "/technology/history",
    ]) {
      const response = await request(routePath)
      assert.equal(response.status, 401, `${routePath} answered without a session`)
      assert.equal(response.body.data, undefined)
    }
  })

  test("an ADMIN can read the curated technology knowledge", async () => {
    const response = await request("/technology/profiles", { cookie: admin.cookie })

    assert.equal(response.status, 200)
    const profiles = response.body.data?.profiles as TechnologyProfile[]
    assert.ok(profiles.length > 0, "the shipped catalogue did not reach storage")
  })

  test("a MANAGER reaches no part of the Technology Knowledge Base", async () => {
    for (const routePath of [
      "/technology/profiles",
      "/technology/registries",
      "/technology/proposals",
      "/technology/history",
    ]) {
      const response = await request(routePath, { cookie: manager.cookie })

      assert.equal(response.status, 403, `${routePath} answered a MANAGER`)
      assert.equal(response.body.data, undefined, `${routePath} leaked data`)
    }
  })

  test("a CLIENT reaches no part of the Technology Knowledge Base", async () => {
    for (const routePath of [
      "/technology/profiles",
      "/technology/profiles/openai-gpt-5",
      "/technology/registries",
      "/technology/proposals",
      "/technology/history",
    ]) {
      const response = await request(routePath, { cookie: client.cookie })

      assert.equal(response.status, 403, `${routePath} answered a CLIENT`)
      assert.equal(response.body.data, undefined, `${routePath} leaked data`)
    }
  })

  test("a MANAGER cannot curate or decide, however the interface presents it", async () => {
    const proposed = await request("/technology/proposals", {
      method: "POST",
      cookie: manager.cookie,
      body: proposalDraft({ profileCode: "manager-should-not-propose" }),
    })
    assert.equal(proposed.status, 403)

    const category = await request("/technology/categories/manager-invented", {
      method: "PUT",
      cookie: manager.cookie,
      body: { title: "Nope", summary: "Nope", sortOrder: 99, active: true },
    })
    assert.equal(category.status, 403)

    assert.equal(
      await prisma.technologyUpdateProposal.count({
        where: { profileCode: "manager-should-not-propose" },
      }),
      0,
      "a refused proposal still wrote a row",
    )
    assert.equal(
      await prisma.technologyCategory.count({ where: { code: "manager-invented" } }),
      0,
      "a refused category still wrote a row",
    )
  })

  test("a denied attempt is recorded in the append-only Audit Trail", async () => {
    const before = await prisma.auditTrail.count({
      where: { eventType: "denied_permission" },
    })

    await request("/technology/profiles", { cookie: client.cookie })

    const after = await prisma.auditTrail.count({
      where: { eventType: "denied_permission" },
    })
    assert.ok(after > before, "a technology denial was not audited")
  })

  test("the Client Portal exposes no technology route and no technology content", async () => {
    const response = await request("/portal/technology")
    assert.equal(response.status, 404)
  })

  // --- The shipped catalogue ------------------------------------------------

  test("the shipped catalogue survives the Json round-trip intact", async () => {
    const response = await request("/technology/profiles/openai-gpt-5", {
      cookie: admin.cookie,
    })

    assert.equal(response.status, 200)
    const profile = response.body.data?.profile as TechnologyProfile

    assert.equal(profile.categoryCode, "ai-models")
    assert.ok(profile.details.role.length > 0)
    assert.ok(profile.details.strengths.length > 0)
    assert.ok(profile.details.limitations.length > 0)
    assert.ok(profile.details.suitability.length > 0)
  })

  test("every shipped profile is classified under exactly one existing category", async () => {
    const profiles = await prisma.technologyProfile.findMany({
      select: { code: true, categoryCode: true },
    })
    const categories = new Set(
      (await prisma.technologyCategory.findMany({ select: { code: true } })).map(
        (one) => one.code,
      ),
    )

    assert.ok(profiles.length > 0)
    for (const profile of profiles) {
      assert.ok(
        categories.has(profile.categoryCode),
        `${profile.code} names a category that does not exist`,
      )
    }
  })

  test("the approved category set ships in full", async () => {
    const codes = (
      await prisma.technologyCategory.findMany({ select: { code: true } })
    ).map((one) => one.code)

    for (const expected of [
      "ai-models",
      "ai-providers",
      "embedding-models",
      "speech",
      "ocr",
      "vector-databases",
      "rerankers",
      "mcp-servers",
      "browser-computer-use",
      "workflow-engines",
      "evaluation-frameworks",
      "monitoring",
      "deployment-patterns",
    ]) {
      assert.ok(codes.includes(expected), `the category ${expected} is missing`)
    }
  })

  test("a seeded profile declares its official origin without claiming approval", async () => {
    // The seed is the initial product catalogue, not an approved change. It
    // therefore says where the information came from — and says, just as
    // plainly, that no human approved it.
    const retrieved = await previewRetrieval({
      categoryCodes: ["ai-models"],
      situationText: [],
    })

    const seeded = retrieved.profiles.find((one) => one.code === "openai-gpt-5")
    assert.ok(seeded)
    assert.equal(seeded.provenance.origin, "product_seed")
    assert.deepEqual(seeded.provenance.sourceCodes, ["openai"])
    assert.equal(seeded.provenance.proposalId, null)
    assert.equal(seeded.provenance.appliedAt, null)
  })

  test("every seeded profile names an official source that exists in the registry", async () => {
    const seeded = await prisma.technologyProfile.findMany({
      where: { origin: "product_seed" },
      select: { code: true, originSourceCodes: true },
    })
    const known = new Set(
      (await prisma.technologySource.findMany({ select: { code: true } })).map(
        (one) => one.code,
      ),
    )

    assert.ok(seeded.length > 0)
    for (const profile of seeded) {
      const codes = profile.originSourceCodes as string[]
      assert.ok(codes.length > 0, `${profile.code} declares no origin source`)
      for (const code of codes) {
        assert.ok(known.has(code), `${profile.code} names unknown source ${code}`)
      }
    }
  })

  test("the seed appends nothing to the Technology Update History", async () => {
    // Origin metadata and approval history are separate records, and only the
    // curator writes the second one. A seeded profile has origin, and no
    // history entry whatsoever.
    const seededCodes = (
      await prisma.technologyProfile.findMany({
        where: { origin: "product_seed" },
        select: { code: true },
      })
    ).map((one) => one.code)

    const entriesForSeeded = await prisma.technologyUpdateHistory.count({
      where: { profileCode: { in: seededCodes } },
    })

    assert.equal(entriesForSeeded, 0, "the seed fabricated approval history")
  })

  // --- The approval gate ----------------------------------------------------

  test("there is no route that writes a Technology Profile directly", async () => {
    // Every shape a caller might reasonably try. The knowledge base changes by
    // approving a proposal and by nothing else (architecture.md §9.3).
    for (const attempt of [
      { path: "/technology/profiles", method: "POST" },
      { path: "/technology/profiles/openai-gpt-5", method: "PUT" },
      { path: "/technology/profiles/openai-gpt-5", method: "PATCH" },
      { path: "/technology/profiles/openai-gpt-5", method: "DELETE" },
    ]) {
      const response = await request(attempt.path, {
        method: attempt.method,
        cookie: admin.cookie,
        body: { title: "Direkt geschrieben" },
      })

      assert.equal(
        response.status,
        404,
        `${attempt.method} ${attempt.path} exists and should not`,
      )
    }

    const untouched = await prisma.technologyProfile.findUniqueOrThrow({
      where: { code: "openai-gpt-5" },
    })
    assert.equal(untouched.title, "OpenAI GPT-5")
  })

  test("a drafted proposal changes nothing until it is approved", async () => {
    const before = await prisma.technologyProfile.count()

    const created = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: proposalDraft({ profileCode: "mistral-large" }),
    })

    assert.equal(created.status, 201)
    const proposal = created.body.data?.proposal as TechnologyUpdateProposal
    assert.equal(proposal.status, "pending")

    assert.equal(await prisma.technologyProfile.count(), before)
    assert.equal(
      await prisma.technologyProfile.count({ where: { code: "mistral-large" } }),
      0,
      "a pending proposal already wrote the profile",
    )
    assert.equal(await prisma.technologyUpdateHistory.count(), 0)
  })

  test("approving writes the profile and appends the history in one step", async () => {
    const created = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: proposalDraft({ profileCode: "cohere-rerank", categoryCode: "rerankers" }),
    })
    const proposal = created.body.data?.proposal as TechnologyUpdateProposal

    const decided = await request(`/technology/proposals/${proposal.id}/decision`, {
      method: "POST",
      cookie: admin.cookie,
      body: { decision: "approve" },
    })

    assert.equal(decided.status, 200)
    assert.equal(decided.body.message, "technology.message.proposal_approved")

    const written = await prisma.technologyProfile.findUnique({
      where: { code: "cohere-rerank" },
    })
    assert.ok(written, "an approved proposal did not write the profile")

    const history = await prisma.technologyUpdateHistory.findMany({
      where: { profileCode: "cohere-rerank" },
    })
    assert.equal(history.length, 1)
    assert.deepEqual(history[0]?.sourceCodes, ["mistral"])
    assert.equal(history[0]?.approvedByUserId, admin.user.id)
  })

  test("a rejected proposal changes nothing and appends no history", async () => {
    const created = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: proposalDraft({ profileCode: "rejected-technology" }),
    })
    const proposal = created.body.data?.proposal as TechnologyUpdateProposal

    const historyBefore = await prisma.technologyUpdateHistory.count()

    const decided = await request(`/technology/proposals/${proposal.id}/decision`, {
      method: "POST",
      cookie: admin.cookie,
      body: { decision: "reject", note: "Quelle nicht ausreichend." },
    })

    assert.equal(decided.status, 200)
    assert.equal(decided.body.message, "technology.message.proposal_rejected")

    assert.equal(
      await prisma.technologyProfile.count({ where: { code: "rejected-technology" } }),
      0,
      "a rejected proposal wrote a profile",
    )
    // The Technology Update History records approved revisions only.
    assert.equal(await prisma.technologyUpdateHistory.count(), historyBefore)

    const stored = await prisma.technologyUpdateProposal.findUniqueOrThrow({
      where: { id: proposal.id },
    })
    assert.equal(stored.status, "rejected")
    assert.equal(stored.decisionNote, "Quelle nicht ausreichend.")
  })

  test("a decided proposal cannot be decided a second time", async () => {
    const created = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: proposalDraft({ profileCode: "decided-twice" }),
    })
    const proposal = created.body.data?.proposal as TechnologyUpdateProposal

    const first = await request(`/technology/proposals/${proposal.id}/decision`, {
      method: "POST",
      cookie: admin.cookie,
      body: { decision: "approve" },
    })
    assert.equal(first.status, 200)

    const second = await request(`/technology/proposals/${proposal.id}/decision`, {
      method: "POST",
      cookie: admin.cookie,
      body: { decision: "approve" },
    })

    assert.equal(second.status, 409)
    assert.equal(second.body.message, "technology.error.already_decided")

    assert.equal(
      await prisma.technologyUpdateHistory.count({
        where: { profileCode: "decided-twice" },
      }),
      1,
      "a second approval appended a second history entry",
    )
  })

  test("a proposal citing a source the registry does not contain is refused", async () => {
    const response = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: proposalDraft({
        profileCode: "ungrounded-technology",
        sourceCodes: ["invented-vendor"],
      }),
    })

    assert.equal(response.status, 422)
    assert.equal(response.body.message, "technology.error.unknown_source")
    assert.equal(
      await prisma.technologyUpdateProposal.count({
        where: { profileCode: "ungrounded-technology" },
      }),
      0,
    )
  })

  test("a proposal naming a category that does not exist is refused", async () => {
    const response = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: proposalDraft({
        profileCode: "miscategorized",
        categoryCode: "no-such-category",
      }),
    })

    assert.equal(response.status, 422)
    assert.equal(response.body.message, "technology.error.unknown_category")
  })

  test("revising an existing profile keeps its history and bumps its revision", async () => {
    const created = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: proposalDraft({
        changeKind: "revise",
        profileCode: "cohere-rerank",
        categoryCode: "rerankers",
        title: "Cohere Rerank (überarbeitet)",
      }),
    })
    const proposal = created.body.data?.proposal as TechnologyUpdateProposal

    await request(`/technology/proposals/${proposal.id}/decision`, {
      method: "POST",
      cookie: admin.cookie,
      body: { decision: "approve" },
    })

    const revised = await prisma.technologyProfile.findUniqueOrThrow({
      where: { code: "cohere-rerank" },
    })
    assert.equal(revised.title, "Cohere Rerank (überarbeitet)")
    assert.equal(revised.revision, 1)

    // The earlier entry is still there: the history accumulates, it is not
    // replaced.
    assert.equal(
      await prisma.technologyUpdateHistory.count({
        where: { profileCode: "cohere-rerank" },
      }),
      2,
    )
  })

  test("an approved change flips origin to curator and supersedes the seed declaration", async () => {
    const before = await prisma.technologyProfile.findUniqueOrThrow({
      where: { code: "zapier" },
    })
    assert.equal(before.origin, "product_seed")
    assert.deepEqual(before.originSourceCodes, ["zapier"])

    const created = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: proposalDraft({
        changeKind: "revise",
        profileCode: "zapier",
        categoryCode: "workflow-engines",
        title: "Zapier (überarbeitet)",
        matchTerms: ["zapier"],
      }),
    })
    const proposal = created.body.data?.proposal as TechnologyUpdateProposal

    await request(`/technology/proposals/${proposal.id}/decision`, {
      method: "POST",
      cookie: admin.cookie,
      body: { decision: "approve" },
    })

    const after = await prisma.technologyProfile.findUniqueOrThrow({
      where: { code: "zapier" },
    })

    // From the first approved change the history is the record, so the seed's
    // declaration is cleared rather than left to contradict it.
    assert.equal(after.origin, "curator")
    assert.deepEqual(after.originSourceCodes, [])

    const retrieved = await previewRetrieval({
      categoryCodes: ["workflow-engines"],
      situationText: ["zapier"],
    })
    const found = retrieved.profiles.find((one) => one.code === "zapier")
    assert.ok(found)
    assert.equal(found.provenance.origin, "curator")
    assert.deepEqual(found.provenance.sourceCodes, ["mistral"])
    assert.equal(found.provenance.proposalId, proposal.id)
  })

  test("deprecating retires a profile from retrieval without deleting it", async () => {
    const created = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        changeKind: "deprecate",
        profileCode: "cohere-rerank",
        categoryCode: "rerankers",
        proposedProfile: null,
        rationale: "Vom Anbieter abgekündigt.",
        assumptions: [],
        gaps: [],
        sourceCodes: ["mistral"],
      },
    })
    const proposal = created.body.data?.proposal as TechnologyUpdateProposal

    await request(`/technology/proposals/${proposal.id}/decision`, {
      method: "POST",
      cookie: admin.cookie,
      body: { decision: "approve" },
    })

    const retired = await prisma.technologyProfile.findUniqueOrThrow({
      where: { code: "cohere-rerank" },
    })
    assert.equal(retired.status, "deprecated")
    // Retired, not erased: the curated work and its history survive.
    assert.equal(retired.title, "Cohere Rerank (überarbeitet)")

    const retrieved = await previewRetrieval({
      categoryCodes: ["rerankers"],
      situationText: [],
    })
    assert.equal(retrieved.codes.includes("cohere-rerank"), false)
  })

  // --- The append-only history ----------------------------------------------

  test("the Technology Update History is never rewritten as changes accumulate", async () => {
    const entries = await prisma.technologyUpdateHistory.findMany({
      where: { profileCode: "cohere-rerank" },
      orderBy: { appliedAt: "asc" },
    })

    assert.equal(entries.length, 3, "create, revise, and deprecate should all be recorded")
    assert.deepEqual(
      entries.map((one) => one.changeKind),
      ["create", "revise", "deprecate"],
    )

    // Each entry keeps the profile as it read at the time, so the history
    // answers how the knowledge base came to say what it says.
    const snapshots = entries.map(
      (one) => (one.appliedProfile as { status: string }).status,
    )
    assert.deepEqual(snapshots, ["active", "active", "deprecated"])
  })

  test("the history table has no updatedAt column, because an entry is never rewritten", async () => {
    const { rows } = await rawQuery<{ column_name: string }>(
      databaseUrl,
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'TechnologyUpdateHistory'`,
    )

    const columns = rows.map((row) => row.column_name)
    assert.equal(columns.includes("updatedAt"), false)
    assert.equal(columns.includes("appliedAt"), true)
  })

  test("no route can edit or remove a history entry", async () => {
    const entry = await prisma.technologyUpdateHistory.findFirstOrThrow()

    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const response = await request(`/technology/history/${entry.id}`, {
        method,
        cookie: admin.cookie,
        body: {},
      })

      assert.equal(response.status, 404, `${method} on a history entry exists`)
    }

    assert.ok(
      await prisma.technologyUpdateHistory.findUnique({ where: { id: entry.id } }),
    )
  })

  // --- Retrieval ------------------------------------------------------------

  test("repeated retrieval returns identical, identically ordered results", async () => {
    const context = {
      categoryCodes: [],
      situationText: ["Wir brauchen semantische Suche über frühere Vorgänge"],
    }

    const first = await previewRetrieval(context)
    const second = await previewRetrieval(context)
    const third = await previewRetrieval(context)

    assert.ok(first.codes.length > 0, "nothing was retrieved for a real context")
    assert.deepEqual(first.codes, second.codes)
    assert.deepEqual(first.codes, third.codes)
  })

  test("retrieval returns only codes that exist as stored profiles", async () => {
    const retrieved = await previewRetrieval({
      categoryCodes: [],
      situationText: ["workflow automatisierung ticketsystem semantische suche"],
    })

    const stored = new Set(
      (await prisma.technologyProfile.findMany({ select: { code: true } })).map(
        (one) => one.code,
      ),
    )

    assert.ok(retrieved.codes.length > 0)
    for (const code of retrieved.codes) {
      assert.ok(stored.has(code), `retrieval returned ${code}, which is not stored`)
    }
  })

  test("retrieval scopes to the requested category", async () => {
    const retrieved = await previewRetrieval({
      categoryCodes: ["workflow-engines"],
      situationText: ["automatisierung"],
    })

    const profiles = await prisma.technologyProfile.findMany({
      where: { code: { in: retrieved.codes } },
      select: { categoryCode: true },
    })

    assert.ok(retrieved.codes.length > 0)
    assert.ok(profiles.every((one) => one.categoryCode === "workflow-engines"))
  })

  test("retrieval hands over a limited package, not the whole knowledge base", async () => {
    const total = await prisma.technologyProfile.count()
    const retrieved = await previewRetrieval({
      categoryCodes: [],
      situationText: [],
    })

    assert.ok(retrieved.codes.length <= 10)
    assert.ok(retrieved.codes.length < total || total <= 10)
  })

  test("a profile changed through the curator carries its approved provenance", async () => {
    const created = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: proposalDraft({
        profileCode: "voyage-embeddings",
        categoryCode: "embedding-models",
        matchTerms: ["voyage"],
      }),
    })
    const proposal = created.body.data?.proposal as TechnologyUpdateProposal

    await request(`/technology/proposals/${proposal.id}/decision`, {
      method: "POST",
      cookie: admin.cookie,
      body: { decision: "approve" },
    })

    const retrieved = await previewRetrieval({
      categoryCodes: ["embedding-models"],
      situationText: ["voyage"],
    })

    const found = retrieved.profiles.find((one) => one.code === "voyage-embeddings")
    assert.ok(found, "the approved profile was not retrievable")
    assert.deepEqual(found.provenance.sourceCodes, ["mistral"])
    assert.ok(found.provenance.appliedAt !== null)
    assert.equal(found.provenance.proposalId, proposal.id)
  })

  // --- Review ---------------------------------------------------------------

  test("a proposal is reviewable with its diff and only the sources it cites", async () => {
    const created = await request("/technology/proposals", {
      method: "POST",
      cookie: admin.cookie,
      body: proposalDraft({ profileCode: "reviewable-technology" }),
    })
    const proposal = created.body.data?.proposal as TechnologyUpdateProposal

    const response = await request(`/technology/proposals/${proposal.id}`, {
      cookie: admin.cookie,
    })

    assert.equal(response.status, 200)
    const review = response.body.data?.review as TechnologyProposalReview

    assert.equal(review.currentProfile, null)
    assert.deepEqual(
      review.sources.map((one) => one.code),
      ["mistral"],
    )
    assert.ok(review.diff.some((one) => one.changed))
  })

  // --- Registry curation ----------------------------------------------------

  test("an ADMIN can add a category and a source, with revision protection", async () => {
    const created = await request("/technology/categories/agent-frameworks", {
      method: "PUT",
      cookie: admin.cookie,
      body: {
        title: "Agent Frameworks",
        summary: "Frameworks für agentische Abläufe.",
        sortOrder: 14,
        active: true,
      },
    })
    assert.equal(created.status, 200)

    const stale = await request("/technology/categories/agent-frameworks", {
      method: "PUT",
      cookie: admin.cookie,
      body: {
        title: "Nochmal",
        summary: "Nochmal.",
        sortOrder: 14,
        active: true,
        revision: 99,
      },
    })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.message, "technology.error.conflict")
    assert.equal(stale.body.data?.currentRevision, 0)
  })

  test("a duplicate category code is refused rather than overwriting", async () => {
    const response = await request("/technology/categories/ai-models", {
      method: "PUT",
      cookie: admin.cookie,
      body: {
        title: "Überschrieben",
        summary: "Überschrieben.",
        sortOrder: 1,
        active: true,
      },
    })

    assert.equal(response.status, 409)
    assert.equal(response.body.message, "technology.error.duplicate_code")

    const untouched = await prisma.technologyCategory.findUniqueOrThrow({
      where: { code: "ai-models" },
    })
    assert.equal(untouched.title, "AI Models")
  })

  // --- Seeding and isolation ------------------------------------------------

  test("restarting the application never overwrites curated technology knowledge", async () => {
    const countBefore = await prisma.technologyProfile.count()

    const restartSpecifier: string =
      "../repositories/technology-knowledge.repository.js?restart=1"
    const restarted = (await import(restartSpecifier)) as {
      ensureTechnologyKnowledgeSeeded: () => Promise<void>
    }
    await restarted.ensureTechnologyKnowledgeSeeded()

    assert.equal(await prisma.technologyProfile.count(), countBefore)

    // The profile the curator retired stays retired; the seed does not revive it.
    const retired = await prisma.technologyProfile.findUniqueOrThrow({
      where: { code: "cohere-rerank" },
    })
    assert.equal(retired.status, "deprecated")
  })

  test("the Technology Knowledge Base carries no workspace column to leak across", async () => {
    // Both knowledge bases are product-level, shared assets outside the Phase 3A
    // isolation boundary (architecture.md §9). Its absence is the guarantee.
    for (const table of [
      "TechnologyCategory",
      "TechnologyProfile",
      "TechnologySource",
      "TechnologyUpdateProposal",
      "TechnologyUpdateHistory",
    ]) {
      const { rows } = await rawQuery<{ column_name: string }>(
        databaseUrl,
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = '${table}'`,
      )

      const columns = rows.map((row) => row.column_name)
      assert.equal(columns.includes("workspaceId"), false, `${table} has a workspaceId`)
      assert.equal(
        columns.includes("engagementId"),
        false,
        `${table} points into an engagement`,
      )
    }
  })

  test("curation appends to the Audit Trail without touching the Analysis Run log", async () => {
    const analysisRuns = await prisma.analysisRun.count()

    const curationEvents = await prisma.auditTrail.count({
      where: {
        eventType: {
          in: [
            "technology_proposal_created",
            "technology_proposal_approved",
            "technology_proposal_rejected",
          ],
        },
      },
    })

    assert.ok(curationEvents > 0, "curation was not audited")
    // Three governance logs, three purposes, never merged.
    assert.equal(analysisRuns, 0, "curation recorded an engagement Analysis Run")
  })

  // --- Helpers --------------------------------------------------------------

  async function previewRetrieval(context: {
    categoryCodes: string[]
    situationText: string[]
  }): Promise<TechnologyPackage> {
    const response = await request("/technology/retrieval-preview", {
      method: "POST",
      cookie: admin.cookie,
      body: context,
    })

    assert.equal(response.status, 200, "retrieval preview was refused")
    return response.body.data?.technologyPackage as TechnologyPackage
  }

  async function signedInUser(input: {
    email: string
    displayName: string
    role: "ADMIN" | "MANAGER" | "CLIENT"
    workspaceId: string
  }) {
    const password = "correct-horse-battery-staple"
    const identity = await authenticationProvider.registerIdentity({
      email: input.email,
      name: input.displayName,
      password,
    })
    assert.equal(identity.success, true, "Better Auth refused to create an identity")
    const authUserId = identity.success ? identity.authUserId : ""
    await authenticationProvider.confirmEmail({ authUserId })

    const user = await prisma.user.create({
      data: {
        workspaceId: input.workspaceId,
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        authUserId,
        emailVerifiedAt: new Date(),
      },
    })

    const session = await authenticationProvider.startSession({
      email: input.email,
      password,
    })
    assert.equal(session.success, true, "Better Auth refused a correct password")

    const cookie = session.success
      ? session.setHeaders
          .filter(([name]) => name === "set-cookie")
          .map(([, value]) => value.split(";")[0])
          .join("; ")
      : ""

    return { user, cookie }
  }

  function request(
    routePath: string,
    init: { method?: string; body?: unknown; cookie?: string } = {},
  ) {
    return fetch(`${baseUrl}${routePath}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }).then(async (response) => ({
      status: response.status,
      body: (await response.json().catch(() => ({}))) as {
        status?: boolean
        message?: string
        data?: Record<string, unknown>
      },
    }))
  }
}

// A proposal a curator would plausibly write. Every field the contract requires,
// with the profile content matching the target the proposal names.
function proposalDraft(
  overrides: {
    changeKind?: "create" | "revise" | "deprecate"
    profileCode?: string
    categoryCode?: string
    title?: string
    matchTerms?: string[]
    sourceCodes?: string[]
  } = {},
) {
  const profileCode = overrides.profileCode ?? "proposed-technology"
  const categoryCode = overrides.categoryCode ?? "ai-models"

  return {
    changeKind: overrides.changeKind ?? "create",
    profileCode,
    categoryCode,
    proposedProfile: {
      code: profileCode,
      categoryCode,
      title: overrides.title ?? "Vorgeschlagene Technologie",
      summary: "Eine kuratierte Beschreibung.",
      details: {
        role: "Erfüllt eine bestimmte Aufgabe in einer Lösung.",
        strengths: ["Bewährt im produktiven Einsatz"],
        limitations: ["Verarbeitung erfolgt beim Anbieter"],
        suitability: ["Wiederkehrende Standardanfragen"],
      },
      matchTerms: overrides.matchTerms ?? [],
      tags: [],
      status: "active",
      sortOrder: 50,
    },
    rationale: "Offiziell angekündigt und dokumentiert.",
    assumptions: [],
    gaps: [],
    sourceCodes: overrides.sourceCodes ?? ["mistral"],
  }
}

async function rawQuery<T extends Record<string, unknown>>(
  connectionString: string,
  sql: string,
) {
  const client = new Client({ connectionString })
  await client.connect()

  try {
    return await client.query<T>(sql)
  } finally {
    await client.end()
  }
}

async function prepareDatabase() {
  loadDotenv({ path: path.join(serverRoot, ".env") })

  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!configured) {
    return unavailable(
      "Neither TEST_DATABASE_URL nor DATABASE_URL is set, so there is no PostgreSQL to create the test database on.",
    )
  }

  const databaseName = `${TEST_DATABASE_PREFIX}${process.pid}_${Date.now()}`
  const url = new URL(configured)
  const adminUrl = new URL(configured)
  adminUrl.pathname = "/postgres"

  const admin = new Client({ connectionString: adminUrl.toString() })

  try {
    await admin.connect()
  } catch (error) {
    return unavailable(
      `Cannot reach PostgreSQL at ${adminUrl.host} (${failureCode(error)}). ` +
        "Start it with `docker compose up -d`.",
    )
  }

  try {
    await dropStaleDatabases(admin)
    await admin.query(`CREATE DATABASE "${databaseName}"`)
  } finally {
    await admin.end()
  }

  url.pathname = `/${databaseName}`
  const databaseUrl = url.toString()

  const prismaBin = path.join(
    serverRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma",
  )

  try {
    execFileSync(prismaBin, ["migrate", "deploy"], {
      cwd: serverRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
      timeout: 180_000,
    })
  } catch (error) {
    await dropDatabase(adminUrl.toString(), databaseName)
    throw new Error(
      `The Prisma migration chain failed to apply to a fresh database: ${failureCode(error)}`,
    )
  }

  return { databaseUrl, adminUrl: adminUrl.toString(), databaseName }
}

function unavailable(reason: string): null {
  if (skippableWithoutDatabase) {
    console.warn(`Skipping the Technology Knowledge Base integration suite: ${reason}`)
    return null
  }

  throw new Error(
    `The Technology Knowledge Base integration suite requires PostgreSQL. ${reason}\n` +
      "Run it with `npm run test:integration` once a database is reachable, " +
      "or `npm run test:integration:optional` to skip it while working offline.",
  )
}

async function dropStaleDatabases(admin: Client) {
  const { rows } = await admin.query<{ datname: string }>(
    `SELECT datname
       FROM pg_database
      WHERE datname LIKE $1
        AND NOT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE pg_stat_activity.datname = pg_database.datname
        )`,
    [`${TEST_DATABASE_PREFIX}%`],
  )

  for (const { datname } of rows) {
    await admin.query(`DROP DATABASE IF EXISTS "${datname}"`)
  }
}

async function dropDatabase(adminUrl: string, databaseName: string) {
  const admin = new Client({ connectionString: adminUrl })
  await admin.connect()

  try {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}

function isEnabled(value: string | undefined): boolean {
  const flag = value?.trim().toLowerCase()
  return flag === "1" || flag === "true" || flag === "yes"
}

// Enough to tell a stopped container from a wrong password, and no more: the
// connection string this failed on carries the database password.
function failureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code)
  }

  return error instanceof Error ? error.name : "unknown error"
}
