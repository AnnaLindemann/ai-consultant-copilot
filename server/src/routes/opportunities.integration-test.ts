import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

import { config as loadDotenv } from "dotenv"
import { Client } from "pg"

import type { Assessment } from "../../../shared/assessment.schema.js"
import type {
  OpportunityPrioritization,
  OpportunityVersionDetail,
  OpportunityVersionState,
  OpportunityVersionSummary,
} from "../../../shared/opportunity.schema.js"

// The prioritization stage against **real** storage: the migration chain a
// deployment applies, the real Prisma-backed Engagement aggregate, the real
// versioned Opportunity store, the real workspace-scoped repositories, and the
// real routes behind a real Better Auth session.
//
// The unit suites replace the database at its module seam, which is right for
// proving the stage's rules but leaves the seam itself unproven: whether the
// versions the migration creates are the rows the repository writes, whether a
// version survives the Json round-trip with its citations, criteria, and ranks
// intact, whether regeneration really leaves the earlier version untouched,
// whether the database itself refuses two active versions, and whether the new
// routes are scoped like every other engagement-side route. No AI provider is
// involved — versions are created through the real repository, and every route
// exercised here is refused or answered before an LLM would be called.
//
// Deterministic and isolated in the same way as the Better Auth suite: its own
// throwaway database, migrated with the deployment chain and dropped afterwards.
// It touches neither the development database nor any other test's state, and
// **it does not skip** — `npm run test:integration` is part of the acceptance
// path.

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

const TEST_DATABASE_PREFIX = "phase4_opportunities_test_"

const skippableWithoutDatabase = isEnabled(
  process.env.INTEGRATION_TESTS_OPTIONAL,
)

const environment = await prepareDatabase()

if (!environment) {
  test(
    "the prioritization storage path needs PostgreSQL",
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
  const { createOpportunityVersion } = await import(
    "../repositories/opportunity-version.repository.js"
  )
  const { assessmentFingerprint } = await import(
    "../services/opportunities.service.js"
  )
  const { default: express } = await import("express")
  const { default: engagementsRouter } = await import("./engagements.js")

  const app = express()
  app.use(express.json())
  app.use("/engagements", engagementsRouter)

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
  const otherWorkspace = await prisma.workspace.create({
    data: { name: "Rival Consulting" },
  })

  const identity = await authenticationProvider.registerIdentity({
    email: "manager@example.com",
    name: "Real Manager",
    password: "correct-horse-battery-staple",
  })
  assert.equal(identity.success, true, "Better Auth refused to create the identity")
  const authUserId = identity.success ? identity.authUserId : ""
  await authenticationProvider.confirmEmail({ authUserId })

  const manager = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "manager@example.com",
      displayName: "Real Manager",
      role: "MANAGER",
      authUserId,
      emailVerifiedAt: new Date(),
    },
  })

  const otherManager = await prisma.user.create({
    data: {
      workspaceId: otherWorkspace.id,
      email: "rival@example.com",
      displayName: "Rival Manager",
      role: "MANAGER",
    },
  })

  const organization = await prisma.organization.create({
    data: { workspaceId: workspace.id, name: "Client GmbH" },
  })

  const foreignOrganization = await prisma.organization.create({
    data: { workspaceId: otherWorkspace.id, name: "Someone Else AG" },
  })

  const ownEngagement = await prisma.engagement.create({
    data: {
      workspaceId: workspace.id,
      organizationId: organization.id,
      owningManagerId: manager.id,
      title: "Customer Operations review",
    },
  })

  const foreignEngagement = await prisma.engagement.create({
    data: {
      workspaceId: otherWorkspace.id,
      organizationId: foreignOrganization.id,
      owningManagerId: otherManager.id,
      title: "Not Yours",
    },
  })

  const session = await authenticationProvider.startSession({
    email: "manager@example.com",
    password: "correct-horse-battery-staple",
  })
  assert.equal(session.success, true, "Better Auth refused a correct password")

  const cookie = session.success
    ? session.setHeaders
        .filter(([name]) => name === "set-cookie")
        .map(([, value]) => value.split(";")[0])
        .join("; ")
    : ""

  const request = (
    routePath: string,
    init: { method?: string; body?: unknown; cookie?: string } = {},
  ) =>
    fetch(`${baseUrl}${routePath}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }).then(async (response) => ({
      status: response.status,
      body: (await response.json()) as {
        status: boolean
        message?: string
        data?: Record<string, unknown>
      },
    }))

  const scope = {
    workspaceId: workspace.id,
    userId: manager.id,
    role: "MANAGER" as const,
  }

  // --- An Assessment, saved through the real route --------------------------
  //
  // Findings are sent without identities, exactly as the browser sends them;
  // the server mints one for each. Everything below cites those minted ids.

  const submittedAssessment = {
    summary: "Support triage is manual.",
    dimensions: {
      businessProcess: {
        summary: "Triage is manual.",
        findings: [
          {
            title: "Manual triage delays first response",
            detail: "Agents route every email by hand.",
            basis: "discovery_fact",
            supportingFacts: ["First response times are inconsistent."],
            assumptions: [],
            confidence: "medium",
          },
        ],
      },
      data: {
        summary: "Ticket data is split.",
        findings: [
          {
            title: "Ticket data is scattered across two systems",
            detail: "Two tools hold overlapping ticket records.",
            basis: "discovery_fact",
            supportingFacts: ["Email and live chat are separate."],
            assumptions: [],
            confidence: "medium",
          },
        ],
      },
      technology: { summary: "No tooling was recorded.", findings: [] },
      aiReadiness: { summary: "Readiness cannot yet be judged.", findings: [] },
      risks: { summary: "No risks are evidenced yet.", findings: [] },
      opportunities: { summary: "Triage is a candidate area.", findings: [] },
    },
    gaps: [],
  }

  const savedAssessment = await request(
    `/engagements/${ownEngagement.id}/assessment`,
    {
      method: "PATCH",
      cookie,
      body: { assessment: submittedAssessment, reviewState: "consultant_edited" },
    },
  )
  assert.equal(savedAssessment.status, 200, "the Assessment could not be saved")

  const storedAssessment = () =>
    prisma.engagement
      .findUniqueOrThrow({ where: { id: ownEngagement.id } })
      .then((engagement) => engagement.assessment as unknown as Assessment)

  const assessment = await storedAssessment()
  const triageFindingId = assessment.dimensions.businessProcess.findings[0].id
  const dataFindingId = assessment.dimensions.data.findings[0].id

  const unknownValue = (validationNote: string) => ({
    status: "unknown" as const,
    validationNote,
  })

  const successCriterion = () => ({
    metric: "Median first response time",
    measurementMethod: "Read from the helpdesk's response-time report.",
    dataSource: "Helpdesk reporting",
    baseline: unknownValue("Ask the client for last quarter's median."),
    target: unknownValue("Agree a target once the baseline is known."),
    timeframe: unknownValue("Agree a review date with the client."),
    assumptions: [],
  })

  const submittedOpportunity = (overrides: Record<string, unknown> = {}) => ({
    title: "Automate first-line triage",
    problem: "Manual triage delays first response.",
    improvement: "Route incoming requests by intent before an agent sees them.",
    sourceFindingIds: [triageFindingId],
    successCriteria: [successCriterion()],
    value: "high",
    effort: "medium",
    impact: "high",
    confidence: "medium",
    aiReadiness: {
      qualification: "conditional",
      rationale: "Depends on ticket data being reachable.",
      blockers: ["Ticket data is scattered across two systems."],
    },
    assumptions: [],
    priorityRank: 1,
    priorityRationale: "Highest value against moderate effort.",
    ...overrides,
  })

  const submittedPrioritization = (
    opportunities: Record<string, unknown>[] = [submittedOpportunity()],
  ) => ({
    summary: "Triage is where effort is best spent.",
    opportunities,
    gaps: ["Ticket volumes are unknown."],
  })

  // A stored version, created through the real repository — the same
  // transaction the generation path uses, without an AI provider.
  const storeVersion = (
    prioritization: OpportunityPrioritization,
    sourceAssessment: Assessment,
    sourceAssessmentRevision: number,
  ) =>
    createOpportunityVersion(scope, {
      workspaceId: workspace.id,
      engagementId: ownEngagement.id,
      prioritization,
      sourceAssessmentRevision,
      sourceAssessmentFingerprint: assessmentFingerprint(sourceAssessment),
      createdByUserId: manager.id,
    })

  const citation = (findingId: string, dimension: string, findingTitle: string) => ({
    findingId,
    dimension,
    findingTitle,
  })

  const storedPrioritization = (
    opportunities: Record<string, unknown>[],
  ): OpportunityPrioritization =>
    ({
      summary: "Triage is where effort is best spent.",
      opportunities,
      gaps: ["Ticket volumes are unknown."],
    }) as unknown as OpportunityPrioritization

  const storedOpportunity = (overrides: Record<string, unknown> = {}) => {
    const { sourceFindingIds, ...content } = submittedOpportunity()
    void sourceFindingIds

    return {
      ...content,
      sourceFindings: [
        citation(
          triageFindingId,
          "businessProcess",
          "Manual triage delays first response",
        ),
      ],
      ...overrides,
    }
  }

  // --- What the storage path must do ---------------------------------------

  const firstVersion = await storeVersion(
    storedPrioritization([storedOpportunity()]),
    assessment,
    1,
  )
  assert.equal(firstVersion.created, true, "version 1 could not be stored")
  const versionOne = firstVersion.created
    ? firstVersion.version
    : ({} as OpportunityVersionDetail)

  test("the first stored version is version 1, active, and generated from the Assessment", async () => {
    assert.equal(versionOne.versionNumber, 1)
    assert.equal(versionOne.status, "active")
    assert.equal(versionOne.reviewState, "ai_draft")
    assert.equal(versionOne.revision, 0)
    assert.equal(versionOne.sourceAssessmentRevision, 1)
    assert.equal(
      versionOne.sourceAssessmentFingerprint,
      assessmentFingerprint(assessment),
    )
    assert.equal(versionOne.createdByUserId, manager.id)
    assert.equal(versionOne.createdByName, "Real Manager")
  })

  test("a version survives the round-trip with its citations, criteria, and ranks intact", async () => {
    const resumed = await request(`/engagements/${ownEngagement.id}`, { cookie })
    const state = resumed.body.data?.opportunities as OpportunityVersionState

    assert.equal(resumed.status, 200)
    assert.equal(state.activeVersion?.versionNumber, 1)

    const stored = state.activeVersion!.prioritization
    // The parts a lossy round-trip would quietly drop: the citation that makes
    // an opportunity traceable, the success criterion that makes it
    // measurable, and the ranking that is the prioritization.
    assert.deepEqual(stored.opportunities[0].sourceFindings, [
      {
        findingId: triageFindingId,
        dimension: "businessProcess",
        findingTitle: "Manual triage delays first response",
      },
    ])
    assert.equal(stored.opportunities[0].successCriteria[0].metric, "Median first response time")
    assert.deepEqual(stored.opportunities[0].successCriteria[0].baseline, {
      status: "unknown",
      validationNote: "Ask the client for last quarter's median.",
    })
    assert.deepEqual(
      stored.opportunities.map((one) => one.priorityRank),
      [1],
    )
  })

  test("autosaving edits the active version rather than creating one", async () => {
    const saved = await request(`/engagements/${ownEngagement.id}/opportunities`, {
      method: "PATCH",
      cookie,
      body: {
        versionId: versionOne.id,
        expectedRevision: 0,
        prioritization: submittedPrioritization([
          submittedOpportunity({ title: "Automate triage, revised" }),
        ]),
        reviewState: "consultant_edited",
      },
    })

    assert.equal(saved.status, 200)
    assert.equal(saved.body.message, "opportunity.message.saved")

    const version = (saved.body.data as { version: OpportunityVersionDetail }).version
    assert.equal(version.versionNumber, 1)
    assert.equal(version.reviewState, "consultant_edited")
    // The revision moves with the save, which is what the next save is checked
    // against.
    assert.equal(version.revision, 1)
    assert.equal(version.lastModifiedByUserId, manager.id)

    const count = await prisma.opportunityVersion.count({
      where: { engagementId: ownEngagement.id },
    })
    assert.equal(count, 1, "editing created a version")
  })

  test("a save carrying an out-of-date revision is refused, and changes nothing", async () => {
    const before = await prisma.opportunityVersion.findUniqueOrThrow({
      where: { id: versionOne.id },
    })

    const refused = await request(
      `/engagements/${ownEngagement.id}/opportunities`,
      {
        method: "PATCH",
        cookie,
        body: {
          versionId: versionOne.id,
          // The revision this caller last read, now overtaken by the save above.
          expectedRevision: 0,
          prioritization: submittedPrioritization([
            submittedOpportunity({ title: "Written from a stale read" }),
          ]),
          reviewState: "consultant_edited",
        },
      },
    )

    assert.equal(refused.status, 409)
    assert.equal(refused.body.message, "opportunity.error.stale_update")
    assert.equal(
      (refused.body.data as { currentRevision: number }).currentRevision,
      before.revision,
    )

    const after = await prisma.opportunityVersion.findUniqueOrThrow({
      where: { id: versionOne.id },
    })
    assert.deepEqual(after.content, before.content)
    assert.equal(after.revision, before.revision)
  })

  test("a citation naming a finding the Assessment does not contain is refused server-side", async () => {
    const before = await prisma.opportunityVersion.findUniqueOrThrow({
      where: { id: versionOne.id },
    })

    const refused = await request(
      `/engagements/${ownEngagement.id}/opportunities`,
      {
        method: "PATCH",
        cookie,
        body: {
          versionId: versionOne.id,
          expectedRevision: before.revision,
          prioritization: submittedPrioritization([
            submittedOpportunity({ sourceFindingIds: ["finding_that_never_existed"] }),
          ]),
          reviewState: "consultant_edited",
        },
      },
    )

    assert.equal(refused.status, 422)
    assert.equal(refused.body.message, "opportunity.error.ai_output_ungrounded")
    assert.deepEqual(
      (refused.body.data as { unknownFindingIds: string[] }).unknownFindingIds,
      ["finding_that_never_existed"],
    )

    const after = await prisma.opportunityVersion.findUniqueOrThrow({
      where: { id: versionOne.id },
    })
    assert.deepEqual(after.content, before.content)
  })

  test("a prioritization that is not a real ordering is refused at the boundary", async () => {
    const before = await prisma.opportunityVersion.findUniqueOrThrow({
      where: { id: versionOne.id },
    })

    const refused = await request(
      `/engagements/${ownEngagement.id}/opportunities`,
      {
        method: "PATCH",
        cookie,
        body: {
          versionId: versionOne.id,
          expectedRevision: before.revision,
          prioritization: submittedPrioritization([
            submittedOpportunity({ priorityRank: 1 }),
            submittedOpportunity({
              title: "Consolidate ticket data",
              priorityRank: 1,
              sourceFindingIds: [dataFindingId],
            }),
          ]),
        },
      },
    )

    assert.equal(refused.status, 400)
    assert.equal(refused.body.message, "opportunity.error.invalid_input")
  })

  test("the database itself refuses a second active version for one engagement", async () => {
    // The transaction supersedes before it inserts, but the guarantee does not
    // rest on the transaction alone: the partial unique index the migration
    // adds is what makes two active versions impossible.
    await assert.rejects(
      prisma.opportunityVersion.create({
        data: {
          workspaceId: workspace.id,
          engagementId: ownEngagement.id,
          versionNumber: 99,
          status: "active",
          content: {} as never,
          sourceAssessmentRevision: 1,
          sourceAssessmentFingerprint: "whatever",
        },
      }),
    )
  })

  // --- Regeneration is additive --------------------------------------------

  test("a second version supersedes the first without altering a byte of it", async () => {
    const before = await prisma.opportunityVersion.findUniqueOrThrow({
      where: { id: versionOne.id },
    })

    const second = await storeVersion(
      storedPrioritization([
        {
          ...storedOpportunity(),
          title: "Consolidate ticket data",
          sourceFindings: [
            citation(
              dataFindingId,
              "data",
              "Ticket data is scattered across two systems",
            ),
          ],
        },
      ]),
      assessment,
      1,
    )

    assert.equal(second.created, true)
    if (!second.created) return

    assert.equal(second.version.versionNumber, 2)
    assert.equal(second.version.status, "active")

    const after = await prisma.opportunityVersion.findUniqueOrThrow({
      where: { id: versionOne.id },
    })
    assert.equal(after.status, "superseded")
    assert.deepEqual(after.content, before.content)
    assert.equal(after.revision, before.revision)
    assert.equal(after.reviewState, before.reviewState)
    assert.equal(
      after.sourceAssessmentFingerprint,
      before.sourceAssessmentFingerprint,
    )
    assert.deepEqual(after.lastModifiedAt, before.lastModifiedAt)
  })

  test("a save aimed at a superseded version is refused", async () => {
    const before = await prisma.opportunityVersion.findUniqueOrThrow({
      where: { id: versionOne.id },
    })

    const refused = await request(
      `/engagements/${ownEngagement.id}/opportunities`,
      {
        method: "PATCH",
        cookie,
        body: {
          versionId: versionOne.id,
          expectedRevision: before.revision,
          prioritization: submittedPrioritization(),
          reviewState: "consultant_edited",
        },
      },
    )

    assert.equal(refused.status, 409)
    assert.equal(
      refused.body.message,
      "opportunity.error.historical_version_readonly",
    )

    const after = await prisma.opportunityVersion.findUniqueOrThrow({
      where: { id: versionOne.id },
    })
    assert.deepEqual(after.content, before.content)
  })

  test("the version history lists every version, newest first", async () => {
    const listed = await request(
      `/engagements/${ownEngagement.id}/opportunities/versions`,
      { cookie },
    )

    assert.equal(listed.status, 200)
    const versions = (listed.body.data as { versions: OpportunityVersionSummary[] })
      .versions

    assert.deepEqual(
      versions.map((one) => one.versionNumber),
      [2, 1],
    )
    assert.deepEqual(
      versions.map((one) => one.status),
      ["active", "superseded"],
    )
    assert.equal(versions[1].createdByName, "Real Manager")
  })

  test("a preserved version can still be read, with what it cited at the time", async () => {
    const read = await request(
      `/engagements/${ownEngagement.id}/opportunities/versions/${versionOne.id}`,
      { cookie },
    )

    assert.equal(read.status, 200)
    const version = (read.body.data as { version: OpportunityVersionDetail }).version

    assert.equal(version.versionNumber, 1)
    assert.equal(version.status, "superseded")
    assert.equal(
      version.prioritization.opportunities[0].sourceFindings[0].findingId,
      triageFindingId,
    )
  })

  // --- Staleness ------------------------------------------------------------

  test("changing the Assessment marks the active version stale and changes no version", async () => {
    const before = await prisma.opportunityVersion.findMany({
      where: { engagementId: ownEngagement.id },
      orderBy: { versionNumber: "asc" },
    })

    const fresh = await request(`/engagements/${ownEngagement.id}`, { cookie })
    assert.equal(
      (fresh.body.data?.opportunities as OpportunityVersionState).stale,
      false,
      "the version was stale before the Assessment changed",
    )

    // Re-word a finding's title and add another. The consultant sends the ids
    // they already have, so the citation still resolves afterwards.
    const current = await storedAssessment()
    const edited = await request(`/engagements/${ownEngagement.id}/assessment`, {
      method: "PATCH",
      cookie,
      body: {
        assessment: {
          ...current,
          dimensions: {
            ...current.dimensions,
            businessProcess: {
              summary: "Triage is manual.",
              findings: [
                {
                  ...current.dimensions.businessProcess.findings[0],
                  title: "First response is delayed by hand-sorting",
                },
              ],
            },
          },
        },
        reviewState: "consultant_edited",
      },
    })
    assert.equal(edited.status, 200)

    const resumed = await request(`/engagements/${ownEngagement.id}`, { cookie })
    const state = resumed.body.data?.opportunities as OpportunityVersionState

    assert.equal(state.stale, true, "the Assessment changed but nothing said so")
    assert.equal(state.currentAssessmentRevision, 2)

    // Recognizing staleness never rewrites a conclusion (agent-rules.md §15).
    const after = await prisma.opportunityVersion.findMany({
      where: { engagementId: ownEngagement.id },
      orderBy: { versionNumber: "asc" },
    })
    assert.deepEqual(after, before)
  })

  test("re-wording a finding leaves the citation that names it still valid", async () => {
    // Identity is the id, not the title: the same citation resolves against the
    // re-worded Assessment, and the stored snapshot is refreshed to match.
    const active = await prisma.opportunityVersion.findFirstOrThrow({
      where: { engagementId: ownEngagement.id, status: "active" },
    })

    const saved = await request(`/engagements/${ownEngagement.id}/opportunities`, {
      method: "PATCH",
      cookie,
      body: {
        versionId: active.id,
        expectedRevision: active.revision,
        prioritization: submittedPrioritization([submittedOpportunity()]),
        reviewState: "consultant_edited",
      },
    })

    assert.equal(saved.status, 200)
    const version = (saved.body.data as { version: OpportunityVersionDetail }).version
    assert.deepEqual(version.prioritization.opportunities[0].sourceFindings, [
      {
        findingId: triageFindingId,
        dimension: "businessProcess",
        findingTitle: "First response is delayed by hand-sorting",
      },
    ])
  })

  // --- Access ---------------------------------------------------------------

  test("the prioritization routes are scoped like every other engagement route", async () => {
    // Through the real scoped repositories against real rows: the engagement
    // exists, and every refusal is indistinguishable from one that does not.
    const absent = await request("/engagements/eng_does_not_exist", { cookie })

    for (const call of [
      { method: "POST", body: {} },
      {
        method: "PATCH",
        body: {
          versionId: versionOne.id,
          expectedRevision: 0,
          prioritization: submittedPrioritization(),
        },
      },
    ]) {
      const foreign = await request(
        `/engagements/${foreignEngagement.id}/opportunities`,
        { ...call, cookie },
      )

      assert.equal(foreign.status, 404, `${call.method} crossed a workspace`)
      assert.deepEqual(foreign.body, absent.body)
    }

    // Nothing was written to the engagement that was refused.
    const untouched = await prisma.opportunityVersion.count({
      where: { engagementId: foreignEngagement.id },
    })
    assert.equal(untouched, 0)
  })

  test("version history and preserved versions follow the same workspace rules", async () => {
    const absent = await request("/engagements/eng_does_not_exist", { cookie })

    for (const routePath of [
      `/engagements/${foreignEngagement.id}/opportunities/versions`,
      `/engagements/${foreignEngagement.id}/opportunities/versions/${versionOne.id}`,
    ]) {
      const foreign = await request(routePath, { cookie })

      assert.equal(foreign.status, 404, `${routePath} crossed a workspace`)
      assert.deepEqual(foreign.body, absent.body)
    }
  })

  test("a version cannot be reached through an engagement that does not own it", async () => {
    // The version exists and the caller may reach the engagement — but the
    // version is not that engagement's, so it is refused as absent.
    const otherEngagement = await prisma.engagement.create({
      data: {
        workspaceId: workspace.id,
        organizationId: organization.id,
        owningManagerId: manager.id,
        title: "A second engagement",
      },
    })

    const read = await request(
      `/engagements/${otherEngagement.id}/opportunities/versions/${versionOne.id}`,
      { cookie },
    )

    assert.equal(read.status, 404)
    assert.equal(read.body.message, "opportunity.error.version_not_found")

    const saved = await request(
      `/engagements/${otherEngagement.id}/opportunities`,
      {
        method: "PATCH",
        cookie,
        body: {
          versionId: versionOne.id,
          expectedRevision: 0,
          prioritization: submittedPrioritization(),
        },
      },
    )

    assert.equal(saved.status, 422)
    assert.equal(saved.body.message, "opportunity.error.assessment_not_ready")
  })

  test("no unauthenticated request reaches the prioritization routes", async () => {
    for (const [routePath, call] of [
      [`/engagements/${ownEngagement.id}/opportunities`, { method: "POST", body: {} }],
      [
        `/engagements/${ownEngagement.id}/opportunities`,
        {
          method: "PATCH",
          body: {
            versionId: versionOne.id,
            expectedRevision: 0,
            prioritization: submittedPrioritization(),
          },
        },
      ],
      [`/engagements/${ownEngagement.id}/opportunities/versions`, {}],
      [
        `/engagements/${ownEngagement.id}/opportunities/versions/${versionOne.id}`,
        {},
      ],
    ] as const) {
      const response = await request(routePath, call)

      assert.equal(response.status, 401, `${routePath} answered unauthenticated`)
      assert.equal(response.body.message, "auth.error.unauthenticated")
    }
  })
}

// --- Building and dropping the test database -------------------------------

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
    console.warn(`Skipping the prioritization integration suite: ${reason}`)
    return null
  }

  throw new Error(
    `The prioritization integration suite requires PostgreSQL. ${reason}\n` +
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
