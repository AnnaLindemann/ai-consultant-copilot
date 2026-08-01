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
  OpportunityVersionState,
} from "../../../shared/opportunity.schema.js"
import type {
  RecommendationSetSubmission,
  RecommendationStageState,
  RecommendationVersionDetail,
  RecommendationVersionSummary,
} from "../../../shared/recommendation.schema.js"

// The solution-matching stage against **real** storage: the migration chain a
// deployment applies, the real Prisma-backed Engagement aggregate, the real
// versioned Recommendation store, the real curated knowledge bases behind their
// real deterministic retrieval, the real workspace-scoped repositories, and the
// real routes behind a real Better Auth session.
//
// The unit suites replace the database and both knowledge bases at their module
// seams, which is right for proving the stage's rules but leaves those seams
// unproven: whether the retrieval really returns curated entries from a freshly
// migrated and seeded knowledge base, whether the grounding a recommendation
// carries survives the Json round-trip, whether the database itself refuses two
// active versions, and whether the new routes are scoped like every other
// engagement-side route. No AI provider is involved — versions are created
// through the real save route, and every route exercised here is refused or
// answered before an LLM would be called.
//
// Deterministic and isolated in the same way as the prioritization suite: its own
// throwaway database, migrated with the deployment chain and dropped afterwards.
// It touches neither the development database nor any other test's state, and
// **it does not skip** — `npm run test:integration` is part of the acceptance
// path.

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

const TEST_DATABASE_PREFIX = "phase6_recommendations_test_"

const skippableWithoutDatabase = isEnabled(
  process.env.INTEGRATION_TESTS_OPTIONAL,
)

const environment = await prepareDatabase()

if (!environment) {
  test(
    "the solution-matching storage path needs PostgreSQL",
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
  const { createRecommendationVersion } = await import(
    "../repositories/recommendation-version.repository.js"
  )
  const { assessmentFingerprint } = await import(
    "../services/opportunities.service.js"
  )
  const { opportunityFingerprint } = await import(
    "../services/recommendations.service.js"
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

  const workspace = await prisma.workspace.create({
    data: { name: "Acme Consulting" },
  })
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
      department: "Customer Support",
      // Enough of a situation for the curated match terms to resolve into
      // taxonomy and process codes, so the retrieval below is a real retrieval
      // rather than the curated baseline.
      statedProblem:
        "Der Email Support beantwortet Statusanfragen im Ticket System zu langsam.",
      currentProcess: "Jede Anfrage wird im Help Desk von Hand triagiert.",
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

  // --- An Assessment and a prioritization, through the real routes ----------

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
            supportingFacts: [
              "Agents sort every incoming email by hand.",
              "First response times are inconsistent.",
            ],
            assumptions: [],
            confidence: "medium",
          },
        ],
      },
      data: { summary: "Ticket data is split.", findings: [] },
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

  const assessment = (await prisma.engagement.findUniqueOrThrow({
    where: { id: ownEngagement.id },
  })) .assessment as unknown as Assessment
  const triageFindingId = assessment.dimensions.businessProcess.findings[0].id

  const unknownValue = (validationNote: string) => ({
    status: "unknown" as const,
    validationNote,
  })

  const storedOpportunity = (overrides: Record<string, unknown> = {}) => ({
    id: "opportunity_triage",
    title: "Automate first-line triage",
    problem: "Manual triage delays first response.",
    improvement: "Route incoming requests by intent before an agent sees them.",
    sourceFindings: [
      {
        findingId: triageFindingId,
        dimension: "businessProcess",
        findingTitle: "Manual triage delays first response",
      },
    ],
    successCriteria: [
      {
        metric: "Median first response time",
        measurementMethod: "Read from the helpdesk's response-time report.",
        dataSource: "Helpdesk reporting",
        baseline: unknownValue("Ask the client for last quarter's median."),
        target: unknownValue("Agree a target once the baseline is known."),
        timeframe: unknownValue("Agree a review date with the client."),
        assumptions: [],
      },
    ],
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

  const prioritization = (
    opportunities: Record<string, unknown>[] = [storedOpportunity()],
  ): OpportunityPrioritization =>
    ({
      summary: "Triage is where effort is best spent.",
      opportunities,
      gaps: ["Ticket volumes are unknown."],
    }) as unknown as OpportunityPrioritization

  const storedPrioritization = prioritization()

  const opportunityVersion = await createOpportunityVersion(scope, {
    workspaceId: workspace.id,
    engagementId: ownEngagement.id,
    prioritization: storedPrioritization,
    sourceAssessmentRevision: 1,
    sourceAssessmentFingerprint: assessmentFingerprint(assessment),
    createdByUserId: manager.id,
  })
  assert.equal(opportunityVersion.created, true, "the prioritization could not be stored")
  const opportunityVersionId = opportunityVersion.created
    ? opportunityVersion.version.id
    : ""

  // --- The curated grounding this engagement can actually draw on -----------
  //
  // Read through the real route, from the real seeded knowledge bases, so what
  // the tests below cite is what a real engagement would be offered.

  const resumed = await request(`/engagements/${ownEngagement.id}`, { cookie })
  assert.equal(resumed.status, 200, "the engagement could not be read")
  const stageState = resumed.body.data?.recommendations as RecommendationStageState

  const groundingEntry = stageState.groundingOptions.knowledge.find(
    (entry) => entry.kind === "ai_use_case" || entry.kind === "solution_pattern",
  )
  assert.ok(
    groundingEntry,
    "the Consulting Knowledge Base offered nothing that could ground a recommendation",
  )
  const technologyProfile = stageState.groundingOptions.technology[0]
  assert.ok(
    technologyProfile,
    "the Technology Knowledge Base offered no profile to name",
  )

  const submittedRecommendation = (overrides: Record<string, unknown> = {}) => ({
    title: "Intent-based triage with human approval",
    opportunityId: "opportunity_triage",
    approach: "Classify incoming requests by intent and route them before triage.",
    rationale: "The curated triage pattern fits an inbox sorted entirely by hand.",
    expectedValue: {
      summary: "Agents spend their first minutes answering rather than sorting.",
      drivers: ["Fewer manual routing decisions per request"],
    },
    effort: {
      level: "medium",
      rationale:
        "The approach reuses existing support workflows but needs integration.",
    },
    knowledgeGrounding: [
      {
        code: groundingEntry.code,
        rationale: "The curated entry describes exactly this inbox.",
      },
    ],
    technologyGrounding: [
      {
        code: technologyProfile.code,
        fitRationale: "Follows structured output formats for routing.",
      },
    ],
    assumptions: [],
    confidence: "medium",
    ...overrides,
  })

  const submittedSet = (
    recommendations: Record<string, unknown>[] = [submittedRecommendation()],
  ): RecommendationSetSubmission =>
    ({
      summary: "One grounded proposal for the prioritized triage opportunity.",
      recommendations,
      gaps: ["Ticket volumes are unknown."],
    }) as unknown as RecommendationSetSubmission

  // A stored version, created through the real repository — the same transaction
  // the generation path uses, without an AI provider.
  const storeVersion = (recommendationSet: unknown) =>
    createRecommendationVersion(scope, {
      workspaceId: workspace.id,
      engagementId: ownEngagement.id,
      recommendationSet: recommendationSet as never,
      sourceOpportunityVersionId: opportunityVersionId,
      sourceOpportunityVersionNumber: 1,
      sourceOpportunityFingerprint: opportunityFingerprint(
        opportunityVersion.created
          ? opportunityVersion.version
          : ({} as never),
      ),
      createdByUserId: manager.id,
    })

  const storedRecommendationSet = {
    summary: "One grounded proposal for the prioritized triage opportunity.",
    recommendations: [
      {
        id: "recommendation_1",
        title: "Intent-based triage with human approval",
        approach:
          "Classify incoming requests by intent and route them before triage.",
        rationale:
          "The curated triage pattern fits an inbox sorted entirely by hand.",
        expectedValue: {
          summary: "Agents spend their first minutes answering rather than sorting.",
          drivers: ["Fewer manual routing decisions per request"],
        },
        effort: {
          level: "medium",
          rationale:
            "The approach reuses existing support workflows but needs integration.",
        },
        opportunity: {
          opportunityId: "opportunity_triage",
          opportunityTitle: "Automate first-line triage",
          priorityRank: 1,
          discoveryTrace: [
            {
              findingId: triageFindingId,
              dimension: "businessProcess",
              findingTitle: "Manual triage delays first response",
              supportingFacts: [
                "Agents sort every incoming email by hand.",
                "First response times are inconsistent.",
              ],
            },
          ],
        },
        knowledgeGrounding: [
          {
            code: groundingEntry.code,
            kind: groundingEntry.kind,
            title: groundingEntry.title,
            rationale: "The curated entry describes exactly this inbox.",
          },
        ],
        technologyGrounding: [
          {
            code: technologyProfile.code,
            categoryCode: technologyProfile.categoryCode,
            title: technologyProfile.title,
            fitRationale: "Follows structured output formats for routing.",
          },
        ],
        assumptions: [],
        confidence: "medium",
      },
    ],
    gaps: ["Ticket volumes are unknown."],
  }

  const firstVersion = await storeVersion(storedRecommendationSet)
  assert.equal(firstVersion.created, true, "version 1 could not be stored")
  const versionOne = firstVersion.created
    ? firstVersion.version
    : ({} as RecommendationVersionDetail)

  // --- What the retrieval must actually offer ------------------------------

  test("the curated knowledge bases really ground this engagement", async () => {
    // Deterministic retrieval over the seeded bases, at the solution-matching
    // stage — not a fixture. If the curated content stopped offering an AI Use
    // Case or a Solution Pattern for a triage engagement, every recommendation
    // for it would be ungroundable, and this is where that shows.
    assert.ok(
      stageState.groundingOptions.knowledge.some(
        (entry) => entry.kind === "ai_use_case",
      ),
      "no AI Use Case was retrieved for a Customer Operations triage engagement",
    )
    assert.ok(
      stageState.groundingOptions.knowledge.some(
        (entry) => entry.kind === "solution_pattern",
      ),
      "no Solution Pattern was retrieved for a Customer Operations triage engagement",
    )
    assert.ok(
      stageState.groundingOptions.technology.length > 0,
      "no Technology Profile was retrieved",
    )
    // Retrieval is reproducible: the same engagement against unchanged
    // knowledge yields the same codes in the same order.
    const again = await request(`/engagements/${ownEngagement.id}`, { cookie })
    const repeated = again.body.data?.recommendations as RecommendationStageState
    assert.deepEqual(
      repeated.groundingOptions.knowledge.map((entry) => entry.code),
      stageState.groundingOptions.knowledge.map((entry) => entry.code),
    )
    assert.deepEqual(
      repeated.groundingOptions.technology.map((profile) => profile.code),
      stageState.groundingOptions.technology.map((profile) => profile.code),
    )
  })

  // --- What the storage path must do ---------------------------------------

  test("the first stored version is version 1, active, and matched against the prioritization", async () => {
    assert.equal(versionOne.versionNumber, 1)
    assert.equal(versionOne.status, "active")
    assert.equal(versionOne.reviewState, "ai_draft")
    assert.equal(versionOne.revision, 0)
    assert.equal(versionOne.sourceOpportunityVersionId, opportunityVersionId)
    assert.equal(versionOne.sourceOpportunityVersionNumber, 1)
    assert.equal(versionOne.createdByUserId, manager.id)
    assert.equal(versionOne.createdByName, "Real Manager")
  })

  test("a version survives the round-trip with its whole grounding intact", async () => {
    const read = await request(`/engagements/${ownEngagement.id}`, { cookie })
    const state = read.body.data?.recommendations as RecommendationStageState

    assert.equal(read.status, 200)
    assert.equal(state.activeVersion?.versionNumber, 1)

    const [stored] = state.activeVersion!.recommendationSet.recommendations

    // The three traces a lossy round-trip would quietly drop: backward to the
    // Opportunity and the discovery facts behind it, outward to the Consulting
    // Knowledge Base, and outward to the Technology Knowledge Base.
    assert.equal(stored.opportunity.opportunityId, "opportunity_triage")
    assert.deepEqual(stored.effort, {
      level: "medium",
      rationale:
        "The approach reuses existing support workflows but needs integration.",
    })
    assert.deepEqual(stored.opportunity.discoveryTrace[0].supportingFacts, [
      "Agents sort every incoming email by hand.",
      "First response times are inconsistent.",
    ])
    assert.equal(stored.knowledgeGrounding[0].code, groundingEntry.code)
    assert.equal(stored.knowledgeGrounding[0].kind, groundingEntry.kind)
    assert.equal(stored.technologyGrounding[0].code, technologyProfile.code)
    assert.equal(
      stored.technologyGrounding[0].fitRationale,
      "Follows structured output formats for routing.",
    )
    assert.deepEqual(state.activeVersion!.recommendationSet.gaps, [
      "Ticket volumes are unknown.",
    ])
  })

  test("saving through the real route resolves the consultant's citations", async () => {
    const active = await prisma.recommendationVersion.findFirstOrThrow({
      where: { engagementId: ownEngagement.id, status: "active" },
    })

    const saved = await request(`/engagements/${ownEngagement.id}/recommendations`, {
      method: "PATCH",
      cookie,
      body: {
        versionId: active.id,
        expectedRevision: active.revision,
        recommendationSet: submittedSet([
          submittedRecommendation({ title: "Revised by the consultant" }),
        ]),
        reviewState: "consultant_edited",
      },
    })

    assert.equal(saved.status, 200)
    const version = (saved.body.data as { version: RecommendationVersionDetail })
      .version

    assert.equal(version.versionNumber, 1, "editing must not create a version")
    assert.equal(version.revision, active.revision + 1)
    assert.equal(version.reviewState, "consultant_edited")

    const [stored] = version.recommendationSet.recommendations
    // Identity is minted on the server, and the snapshots are the server's too.
    assert.equal(typeof stored.id, "string")
    assert.ok(stored.id.length > 0)
    assert.equal(stored.opportunity.opportunityTitle, "Automate first-line triage")
    assert.equal(stored.knowledgeGrounding[0].title, groundingEntry.title)
    assert.equal(stored.technologyGrounding[0].title, technologyProfile.title)
  })

  test("a save citing knowledge that does not exist is refused, and names it", async () => {
    const active = await prisma.recommendationVersion.findFirstOrThrow({
      where: { engagementId: ownEngagement.id, status: "active" },
    })
    const before = await prisma.recommendationVersion.findMany({
      where: { engagementId: ownEngagement.id },
    })

    const saved = await request(`/engagements/${ownEngagement.id}/recommendations`, {
      method: "PATCH",
      cookie,
      body: {
        versionId: active.id,
        expectedRevision: active.revision,
        recommendationSet: submittedSet([
          submittedRecommendation({
            knowledgeGrounding: [
              { code: "no-such-entry", rationale: "Typed by hand." },
            ],
          }),
        ]),
        reviewState: "consultant_edited",
      },
    })

    assert.equal(saved.status, 422)
    assert.equal(saved.body.message, "recommendation.error.ai_output_ungrounded")
    assert.deepEqual(saved.body.data?.unknownKnowledgeCodes, ["no-such-entry"])

    // Nothing changed.
    const after = await prisma.recommendationVersion.findMany({
      where: { engagementId: ownEngagement.id },
    })
    assert.deepEqual(after, before)
  })

  test("a save aimed at a superseded version is refused by the store", async () => {
    const second = await storeVersion(storedRecommendationSet)
    assert.equal(second.created, true)

    const superseded = await prisma.recommendationVersion.findFirstOrThrow({
      where: { engagementId: ownEngagement.id, status: "superseded" },
    })

    const saved = await request(`/engagements/${ownEngagement.id}/recommendations`, {
      method: "PATCH",
      cookie,
      body: {
        versionId: superseded.id,
        expectedRevision: superseded.revision,
        recommendationSet: submittedSet(),
        reviewState: "consultant_edited",
      },
    })

    // The active version is the only editable one. A preserved version is
    // reachable — it is refused as read-only rather than as absent, because the
    // consultant's next step is to open the active version, not to wonder where
    // this one went.
    assert.equal(saved.status, 409)
    assert.equal(
      saved.body.message,
      "recommendation.error.historical_version_readonly",
    )

    const unchanged = await prisma.recommendationVersion.findUniqueOrThrow({
      where: { id: superseded.id },
    })
    assert.deepEqual(unchanged.content, superseded.content)
    assert.equal(unchanged.revision, superseded.revision)
  })

  test("the database itself refuses two active versions for one engagement", async () => {
    // The partial unique index, not the transaction that supersedes-then-inserts:
    // this is what makes two generations racing each other fail loudly.
    await assert.rejects(
      prisma.recommendationVersion.create({
        data: {
          workspaceId: workspace.id,
          engagementId: ownEngagement.id,
          versionNumber: 99,
          status: "active",
          content: storedRecommendationSet as never,
          sourceOpportunityVersionId: opportunityVersionId,
          sourceOpportunityVersionNumber: 1,
          sourceOpportunityFingerprint: "whatever",
        },
      }),
      /Unique constraint|P2002/,
    )
  })

  test("preserved versions are listed, newest first, and never rewritten", async () => {
    const listed = await request(
      `/engagements/${ownEngagement.id}/recommendations/versions`,
      { cookie },
    )

    assert.equal(listed.status, 200)
    const versions = (listed.body.data as { versions: RecommendationVersionSummary[] })
      .versions

    assert.deepEqual(
      versions.map((version) => version.versionNumber),
      [2, 1],
    )
    assert.deepEqual(
      versions.map((version) => version.status),
      ["active", "superseded"],
    )
  })

  test("re-prioritizing marks the recommendations stale without changing them", async () => {
    const before = await prisma.recommendationVersion.findMany({
      where: { engagementId: ownEngagement.id },
      orderBy: { versionNumber: "asc" },
    })

    // A new Opportunity version — the prioritization has moved on beneath the
    // recommendations that were matched against the old one.
    const reprioritized = await createOpportunityVersion(scope, {
      workspaceId: workspace.id,
      engagementId: ownEngagement.id,
      prioritization: prioritization([
        storedOpportunity({ improvement: "Route by intent, and escalate by SLA." }),
      ]),
      sourceAssessmentRevision: 1,
      sourceAssessmentFingerprint: assessmentFingerprint(assessment),
      createdByUserId: manager.id,
    })
    assert.equal(reprioritized.created, true)

    const read = await request(`/engagements/${ownEngagement.id}`, { cookie })
    const state = read.body.data?.recommendations as RecommendationStageState

    assert.equal(state.stale, true, "the prioritization changed but nothing said so")
    assert.equal(
      state.currentOpportunityVersionId,
      reprioritized.created ? reprioritized.version.id : "",
    )

    // Recognizing staleness never rewrites a conclusion (agent-rules.md §15).
    const after = await prisma.recommendationVersion.findMany({
      where: { engagementId: ownEngagement.id },
      orderBy: { versionNumber: "asc" },
    })
    assert.deepEqual(after, before)
  })

  test("an engagement with nothing prioritized cannot be matched", async () => {
    const bare = await prisma.engagement.create({
      data: {
        workspaceId: workspace.id,
        organizationId: organization.id,
        owningManagerId: manager.id,
        title: "Nothing prioritized yet",
      },
    })

    const generated = await request(`/engagements/${bare.id}/recommendations`, {
      method: "POST",
      cookie,
      body: {},
    })

    // Refused before any AI provider is reached, so this stays deterministic.
    assert.equal(generated.status, 422)
    assert.equal(
      generated.body.message,
      "recommendation.error.opportunities_not_ready",
    )
    assert.equal(
      await prisma.analysisRun.count({ where: { engagementId: bare.id } }),
      0,
      "a refused run recorded an Analysis Run",
    )
  })

  test("the prioritized Opportunities the panel offers carry their identity", async () => {
    // A Recommendation cites an Opportunity by id, so the id has to survive the
    // round-trip the consultant's surface reads from.
    const read = await request(`/engagements/${ownEngagement.id}`, { cookie })
    const opportunities = read.body.data?.opportunities as OpportunityVersionState

    assert.equal(
      opportunities.activeVersion?.prioritization.opportunities[0].id,
      "opportunity_triage",
    )
  })

  // --- Access ---------------------------------------------------------------

  test("the recommendation routes are scoped like every other engagement route", async () => {
    const absent = await request("/engagements/eng_does_not_exist", { cookie })

    for (const call of [
      { method: "POST", body: {} },
      {
        method: "PATCH",
        body: {
          versionId: versionOne.id,
          expectedRevision: 0,
          recommendationSet: submittedSet(),
        },
      },
    ]) {
      const foreign = await request(
        `/engagements/${foreignEngagement.id}/recommendations`,
        { ...call, cookie },
      )

      assert.equal(foreign.status, 404, `${call.method} crossed a workspace`)
      assert.deepEqual(foreign.body, absent.body)
    }

    // Nothing was written to the engagement that was refused.
    assert.equal(
      await prisma.recommendationVersion.count({
        where: { engagementId: foreignEngagement.id },
      }),
      0,
    )
  })

  test("version history and preserved versions follow the same workspace rules", async () => {
    const absent = await request("/engagements/eng_does_not_exist", { cookie })

    for (const routePath of [
      `/engagements/${foreignEngagement.id}/recommendations/versions`,
      `/engagements/${foreignEngagement.id}/recommendations/versions/${versionOne.id}`,
    ]) {
      const foreign = await request(routePath, { cookie })

      assert.equal(foreign.status, 404, `${routePath} crossed a workspace`)
      assert.deepEqual(foreign.body, absent.body)
    }
  })

  test("a version cannot be reached through an engagement that does not own it", async () => {
    const otherEngagement = await prisma.engagement.create({
      data: {
        workspaceId: workspace.id,
        organizationId: organization.id,
        owningManagerId: manager.id,
        title: "A second engagement",
      },
    })

    const read = await request(
      `/engagements/${otherEngagement.id}/recommendations/versions/${versionOne.id}`,
      { cookie },
    )

    assert.equal(read.status, 404)
    assert.equal(read.body.message, "recommendation.error.version_not_found")
  })

  test("no unauthenticated request reaches the recommendation routes", async () => {
    for (const [routePath, call] of [
      [
        `/engagements/${ownEngagement.id}/recommendations`,
        { method: "POST", body: {} },
      ],
      [
        `/engagements/${ownEngagement.id}/recommendations`,
        {
          method: "PATCH",
          body: {
            versionId: versionOne.id,
            expectedRevision: 0,
            recommendationSet: submittedSet(),
          },
        },
      ],
      [`/engagements/${ownEngagement.id}/recommendations/versions`, {}],
      [
        `/engagements/${ownEngagement.id}/recommendations/versions/${versionOne.id}`,
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
    console.warn(`Skipping the solution-matching integration suite: ${reason}`)
    return null
  }

  throw new Error(
    `The solution-matching integration suite requires PostgreSQL. ${reason}\n` +
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
