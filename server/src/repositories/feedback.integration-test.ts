import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

import { config as loadDotenv } from "dotenv"
import { Client } from "pg"

import type {
  ConsultantReportContent,
  ReportSourceSnapshot,
} from "../../../shared/consultant-report.schema.js"
import type {
  FeedbackImpactStage,
  ReentryStageOutcome,
} from "../../../shared/feedback.schema.js"

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

const TEST_DATABASE_PREFIX = "phase9_feedback_test_"
const skippableWithoutDatabase = isEnabled(process.env.INTEGRATION_TESTS_OPTIONAL)
const environment = await prepareDatabase()

if (!environment) {
  test(
    "the Client Feedback storage path needs PostgreSQL",
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
  const {
    approveReportVersion,
    createReportPdfArtifact,
    createReportVersion,
    publishReportVersion,
  } = await import("./consultant-report-version.repository.js")
  const {
    classifyClientFeedback,
    closeClientFeedbackWithoutAction,
    completeFeedbackReentry,
    createClientFeedback,
    listClientPortalFeedback,
    listFeedback,
    listOpenReentries,
    openFeedbackReentry,
  } = await import("./feedback.repository.js")
  const { renderReportVersionPdf } = await import(
    "../services/consultant-report.service.js"
  )
  const { finishFeedbackReentry } = await import("../services/feedback.service.js")
  const { getEngagementById } = await import("./engagement.repository.js")
  const { default: express } = await import("express")
  const { default: portalRouter } = await import("../routes/portal.js")

  const app = express()
  app.use(express.json())
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

  const workspace = await prisma.workspace.create({ data: { name: "Acme Consulting" } })
  const otherWorkspace = await prisma.workspace.create({ data: { name: "Rival GmbH" } })
  const organization = await prisma.organization.create({
    data: { workspaceId: workspace.id, name: "Client GmbH" },
  })
  const otherOrganization = await prisma.organization.create({
    data: { workspaceId: otherWorkspace.id, name: "Other Client GmbH" },
  })
  const manager = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "manager@example.com",
      displayName: "Manager",
      role: "MANAGER",
      emailVerifiedAt: new Date(),
    },
  })
  const otherManager = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "colleague@example.com",
      displayName: "Colleague",
      role: "MANAGER",
      emailVerifiedAt: new Date(),
    },
  })
  const foreignManager = await prisma.user.create({
    data: {
      workspaceId: otherWorkspace.id,
      email: "rival@example.com",
      displayName: "Rival Manager",
      role: "MANAGER",
      emailVerifiedAt: new Date(),
    },
  })

  const client = await registeredClient("client@example.com", "Client", workspace.id)
  const otherClient = await registeredClient(
    "other-client@example.com",
    "Other Client",
    workspace.id,
  )

  const managerScope = {
    workspaceId: workspace.id,
    userId: manager.id,
    role: "MANAGER" as const,
  }
  const otherManagerScope = {
    workspaceId: workspace.id,
    userId: otherManager.id,
    role: "MANAGER" as const,
  }
  const foreignManagerScope = {
    workspaceId: otherWorkspace.id,
    userId: foreignManager.id,
    role: "MANAGER" as const,
  }
  const clientScope = {
    workspaceId: workspace.id,
    userId: client.id,
    role: "CLIENT" as const,
  }
  const otherClientScope = {
    workspaceId: workspace.id,
    userId: otherClient.id,
    role: "CLIENT" as const,
  }
  const clientCookie = await sessionCookie("client@example.com")
  const otherClientCookie = await sessionCookie("other-client@example.com")

  // --- Submission -------------------------------------------------------------

  test("Feedback binds to the exact publication and published ReportVersion", async () => {
    const fixture = await publishedFixture("bind")

    const submitted = await createClientFeedback(clientScope, {
      engagementId: fixture.engagementId,
      publicationId: fixture.publicationId,
      submissionKey: "submission-key-bind",
      content: "The roadmap sequence does not match our budget cycle.",
      submittedByUserId: client.id,
    })
    assert.ok("feedback" in submitted)
    if (!("feedback" in submitted)) return
    assert.equal(submitted.created, true)

    const row = await prisma.clientFeedback.findUniqueOrThrow({
      where: { id: submitted.feedback.id },
    })
    assert.equal(row.sourcePublicationId, fixture.publicationId)
    assert.equal(row.sourceReportVersionId, fixture.versionId)
    assert.equal(row.sourceReportVersionNumber, 1)
    assert.equal(row.workspaceId, workspace.id)
    assert.equal(row.engagementId, fixture.engagementId)
    assert.equal(row.submittedByUserId, client.id)
    assert.equal(row.status, "submitted")
    // Publication timestamps are derived from the publication, never supplied.
    assert.equal(
      row.sourceReportVersionPublishedAt.toISOString(),
      fixture.publishedAt.toISOString(),
    )
  })

  test("a retry with the same key returns the same Feedback rather than a second one", async () => {
    const fixture = await publishedFixture("idempotent")
    const submission = {
      engagementId: fixture.engagementId,
      publicationId: fixture.publicationId,
      submissionKey: "submission-key-idempotent",
      content: "Please revisit the phasing.",
      submittedByUserId: client.id,
    }

    const first = await createClientFeedback(clientScope, submission)
    const second = await createClientFeedback(clientScope, submission)

    assert.ok("feedback" in first && "feedback" in second)
    if (!("feedback" in first) || !("feedback" in second)) return
    assert.equal(first.created, true)
    assert.equal(second.created, false)
    assert.equal(first.feedback.id, second.feedback.id)
    assert.equal(
      await prisma.clientFeedback.count({ where: { engagementId: fixture.engagementId } }),
      1,
    )
  })

  test("concurrent identical retries create exactly one Feedback", async () => {
    const fixture = await publishedFixture("concurrent_submit")
    const submission = {
      engagementId: fixture.engagementId,
      publicationId: fixture.publicationId,
      submissionKey: "submission-key-concurrent",
      content: "Two clicks, one submission.",
      submittedByUserId: client.id,
    }

    const results = await Promise.all([
      createClientFeedback(clientScope, submission),
      createClientFeedback(clientScope, submission),
    ])

    const ids = results.flatMap((result) =>
      "feedback" in result ? [result.feedback.id] : [],
    )
    assert.equal(ids.length, 2)
    assert.equal(new Set(ids).size, 1)
    assert.equal(
      await prisma.clientFeedback.count({ where: { engagementId: fixture.engagementId } }),
      1,
    )
  })

  test("reusing a submission key with different content is refused, not silently answered", async () => {
    const fixture = await publishedFixture("key_reuse")
    const base = {
      engagementId: fixture.engagementId,
      publicationId: fixture.publicationId,
      submissionKey: "submission-key-reuse",
      submittedByUserId: client.id,
    }

    await createClientFeedback(clientScope, { ...base, content: "First statement." })
    const changed = await createClientFeedback(clientScope, {
      ...base,
      content: "A completely different statement.",
    })

    assert.deepEqual(changed, {
      created: false,
      reason: "invalid_idempotent_submission",
    })
  })

  test("the same text under a new key is a second, separate Feedback", async () => {
    const fixture = await publishedFixture("same_text")
    const base = {
      engagementId: fixture.engagementId,
      publicationId: fixture.publicationId,
      content: "We disagree with phase two.",
      submittedByUserId: client.id,
    }

    const first = await createClientFeedback(clientScope, {
      ...base,
      submissionKey: "submission-key-same-text-1",
    })
    const second = await createClientFeedback(clientScope, {
      ...base,
      submissionKey: "submission-key-same-text-2",
    })

    assert.ok("feedback" in first && "feedback" in second)
    if (!("feedback" in first) || !("feedback" in second)) return
    assert.notEqual(first.feedback.id, second.feedback.id)
    assert.equal(
      await prisma.clientFeedback.count({ where: { engagementId: fixture.engagementId } }),
      2,
    )
  })

  test("a revoked publication accepts no further Feedback", async () => {
    const fixture = await publishedFixture("revoked")
    await prisma.documentPublication.update({
      where: { id: fixture.publicationId },
      data: { status: "revoked", revokedAt: new Date(), revokedByUserId: manager.id },
    })

    assert.deepEqual(
      await createClientFeedback(clientScope, {
        engagementId: fixture.engagementId,
        publicationId: fixture.publicationId,
        submissionKey: "submission-key-revoked",
        content: "Too late.",
        submittedByUserId: client.id,
      }),
      { created: false, reason: "publication_not_found" },
    )
  })

  test("an approved but unpublished ReportVersion accepts no Feedback", async () => {
    const engagement = await engagementFor("unpublished")
    const version = await approvedVersion("unpublished_report", 1, engagement.id)

    assert.deepEqual(
      await createClientFeedback(clientScope, {
        engagementId: engagement.id,
        // There is no publication, so the client can only name something else.
        publicationId: version.id,
        submissionKey: "submission-key-unpublished",
        content: "Commenting on something never delivered.",
        submittedByUserId: client.id,
      }),
      { created: false, reason: "publication_not_found" },
    )
  })

  test("Client B cannot submit against Client A's publication", async () => {
    const fixture = await publishedFixture("wrong_client")

    assert.deepEqual(
      await createClientFeedback(otherClientScope, {
        engagementId: fixture.engagementId,
        publicationId: fixture.publicationId,
        submissionKey: "submission-key-wrong-client",
        content: "Not my report.",
        submittedByUserId: otherClient.id,
      }),
      { created: false, reason: "publication_not_found" },
    )
  })

  test("a publication cannot be reached through another Engagement or Workspace", async () => {
    const fixture = await publishedFixture("cross_scope")
    const otherEngagement = await engagementFor("cross_scope_other")

    assert.deepEqual(
      await createClientFeedback(clientScope, {
        engagementId: otherEngagement.id,
        publicationId: fixture.publicationId,
        submissionKey: "submission-key-cross-engagement",
        content: "Wrong engagement.",
        submittedByUserId: client.id,
      }),
      { created: false, reason: "publication_not_found" },
    )

    assert.deepEqual(
      await createClientFeedback(
        { ...clientScope, workspaceId: otherWorkspace.id },
        {
          engagementId: fixture.engagementId,
          publicationId: fixture.publicationId,
          submissionKey: "submission-key-cross-workspace",
          content: "Wrong workspace.",
          submittedByUserId: client.id,
        },
      ),
      { created: false, reason: "publication_not_found" },
    )
  })

  // --- Immutability -------------------------------------------------------------

  test("the lifecycle never rewrites the original Feedback", async () => {
    const fixture = await publishedFixture("immutable")
    const created = await submitFeedbackRow(fixture, "submission-key-immutable", "The original words.")
    const before = await prisma.clientFeedback.findUniqueOrThrow({
      where: { id: created.id },
    })

    const classified = await classifyClientFeedback(
      managerScope,
      {
        engagementId: fixture.engagementId,
        feedbackId: created.id,
        expectedRevision: 0,
        reviewedByUserId: manager.id,
        classification: "disagreement",
        impactedStages: ["roadmap"],
        managerSummary: "Client disputes the phasing.",
        managerDecision: "Re-sequence the roadmap.",
      },
      declaredImpact,
    )
    assert.equal(classified.classified, true)

    const after = await prisma.clientFeedback.findUniqueOrThrow({
      where: { id: created.id },
    })
    assert.equal(after.originalContent, before.originalContent)
    assert.equal(after.submittedByUserId, before.submittedByUserId)
    assert.equal(after.sourcePublicationId, before.sourcePublicationId)
    assert.equal(after.sourceReportVersionId, before.sourceReportVersionId)
    assert.equal(after.submittedAt.toISOString(), before.submittedAt.toISOString())
    assert.equal(after.submissionKey, before.submissionKey)
    assert.equal(after.workspaceId, before.workspaceId)
    assert.equal(after.engagementId, before.engagementId)
  })

  // --- Authorization on mutations -----------------------------------------------

  test("a colleague Manager and a foreign Workspace cannot classify this Feedback", async () => {
    const fixture = await publishedFixture("mutation_scope")
    const created = await submitFeedbackRow(fixture, "submission-key-scope", "Scope check.")

    const command = {
      engagementId: fixture.engagementId,
      feedbackId: created.id,
      expectedRevision: 0,
      reviewedByUserId: manager.id,
      classification: "clarification" as const,
      impactedStages: [],
      managerSummary: "Summary.",
      managerDecision: "Decision.",
    }

    // A colleague in the same workspace does not own this engagement.
    const colleague = await classifyClientFeedback(otherManagerScope, command, declaredImpact)
    assert.deepEqual(colleague, { classified: false, reason: "feedback_not_found" })

    // Another workspace is refused identically — same answer, no extra signal.
    const foreign = await classifyClientFeedback(foreignManagerScope, command, declaredImpact)
    assert.deepEqual(foreign, { classified: false, reason: "feedback_not_found" })

    // Naming the right Feedback under the wrong Engagement is refused too.
    const otherEngagement = await engagementFor("mutation_scope_other")
    const crossEngagement = await classifyClientFeedback(
      managerScope,
      { ...command, engagementId: otherEngagement.id },
      declaredImpact,
    )
    assert.deepEqual(crossEngagement, { classified: false, reason: "feedback_not_found" })

    // Nothing was written by any of the three refusals.
    const row = await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })
    assert.equal(row.status, "submitted")
    assert.equal(row.classification, null)
    assert.equal(row.revision, 0)
  })

  // --- Lifecycle ----------------------------------------------------------------

  test("classification records the actor and refuses terminal states", async () => {
    const fixture = await publishedFixture("lifecycle_classify")
    const created = await submitFeedbackRow(fixture, "submission-key-classify", "Classify me.")

    const classified = await classifyClientFeedback(
      managerScope,
      {
        engagementId: fixture.engagementId,
        feedbackId: created.id,
        expectedRevision: 0,
        reviewedByUserId: manager.id,
        classification: "new_fact",
        impactedStages: ["assessment"],
        managerSummary: "New volume figures.",
        managerDecision: "Revise the assessment.",
      },
      declaredImpact,
    )
    assert.equal(classified.classified, true)

    const row = await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })
    assert.equal(row.status, "classified")
    assert.equal(row.classification, "new_fact")
    assert.equal(row.reviewedByUserId, manager.id)
    assert.ok(row.reviewedAt)
    assert.equal(row.revision, 1)

    const closed = await closeClientFeedbackWithoutAction(
      managerScope,
      {
        engagementId: fixture.engagementId,
        feedbackId: created.id,
        expectedRevision: 1,
        closedByUserId: manager.id,
        reason: "Superseded by a later conversation.",
      },
      declaredImpact,
    )
    assert.equal(closed.closed, true)

    // Closed is terminal: re-classifying does not reopen it.
    const reclassified = await classifyClientFeedback(
      managerScope,
      {
        engagementId: fixture.engagementId,
        feedbackId: created.id,
        expectedRevision: 2,
        reviewedByUserId: manager.id,
        classification: "request",
        impactedStages: [],
        managerSummary: "Trying again.",
        managerDecision: "Trying again.",
      },
      declaredImpact,
    )
    assert.deepEqual(reclassified, {
      classified: false,
      reason: "invalid_feedback_transition",
    })
  })

  test("closing without action requires a reason", async () => {
    const fixture = await publishedFixture("close_reason")
    const created = await submitFeedbackRow(fixture, "submission-key-close", "Close me.")

    assert.deepEqual(
      await closeClientFeedbackWithoutAction(
        managerScope,
        {
          engagementId: fixture.engagementId,
          feedbackId: created.id,
          expectedRevision: 0,
          closedByUserId: manager.id,
          reason: "   ",
        },
        declaredImpact,
      ),
      { closed: false, reason: "missing_rationale" },
    )
  })

  test("re-entry cannot open before classification", async () => {
    const fixture = await publishedFixture("reentry_before")
    const created = await submitFeedbackRow(fixture, "submission-key-before", "Too early.")

    const opened = await openFeedbackReentry(
      managerScope,
      { ...reentrySources(fixture), feedbackId: created.id, expectedRevision: 0, openedByUserId: manager.id, impactedStages: ["roadmap"], plan: "A plan." },
      declaredImpact,
      () => [],
    )
    assert.deepEqual(opened, { opened: false, reason: "feedback_not_classified" })
    assert.equal(await prisma.feedbackReentry.count({ where: { feedbackId: created.id } }), 0)
  })

  test("exactly one re-entry stays open per Feedback, even under concurrency", async () => {
    const fixture = await publishedFixture("one_reentry")
    const created = await classifiedFeedback(fixture, "submission-key-one-reentry")

    const command = {
      ...reentrySources(fixture),
      feedbackId: created.id,
      expectedRevision: 1,
      openedByUserId: manager.id,
      impactedStages: ["roadmap" as const],
      plan: "Re-check the sequencing.",
    }

    const [first, second] = await Promise.all([
      openFeedbackReentry(managerScope, command, declaredImpact, () => []),
      openFeedbackReentry(managerScope, command, declaredImpact, () => []),
    ])

    assert.equal([first.opened, second.opened].filter(Boolean).length, 1)
    assert.equal(
      await prisma.feedbackReentry.count({ where: { feedbackId: created.id, status: "open" } }),
      1,
    )

    // A second attempt afterwards is refused as already open, not as a race.
    const third = await openFeedbackReentry(
      managerScope,
      { ...command, expectedRevision: 2 },
      declaredImpact,
      () => [],
    )
    assert.equal(third.opened, false)
  })

  test("completion requires an outcome for every impacted stage", async () => {
    const fixture = await publishedFixture("outcomes_required")
    const created = await classifiedFeedback(fixture, "submission-key-outcomes", [
      "roadmap",
      "report",
    ])
    const opened = await openFeedbackReentry(
      managerScope,
      {
        ...reentrySources(fixture),
        feedbackId: created.id,
        expectedRevision: 1,
        openedByUserId: manager.id,
        impactedStages: ["roadmap", "report"],
        plan: "Check both.",
      },
      declaredImpact,
      () => [],
    )
    assert.equal(opened.opened, true)
    if (!opened.opened) return

    const { validateReentryOutcomes } = await import("../domain/engagement/feedback.js")
    assert.equal(
      validateReentryOutcomes(["roadmap", "report"], [
        { stage: "roadmap", status: "waived", reason: "Still valid." },
      ]),
      "incomplete_reentry_outcome",
    )

    // The re-entry is untouched by the refusal.
    const row = await prisma.feedbackReentry.findUniqueOrThrow({
      where: { id: opened.reentry.id },
    })
    assert.equal(row.status, "open")
    assert.deepEqual(row.outcomes, [])
  })

  test("completing a re-entry resolves its Feedback and records the lineage", async () => {
    const fixture = await publishedFixture("complete")
    const created = await classifiedFeedback(fixture, "submission-key-complete")
    const opened = await openFeedbackReentry(
      managerScope,
      {
        ...reentrySources(fixture),
        feedbackId: created.id,
        expectedRevision: 1,
        openedByUserId: manager.id,
        impactedStages: ["roadmap"],
        plan: "Re-sequence.",
      },
      declaredImpact,
      () => [],
    )
    assert.equal(opened.opened, true)
    if (!opened.opened) return

    const completed = await completeFeedbackReentry(
      managerScope,
      {
        engagementId: fixture.engagementId,
        reentryId: opened.reentry.id,
        expectedRevision: 0,
        completedByUserId: manager.id,
        completionNote: "Roadmap confirmed unchanged after review.",
      },
      () => [],
      resolvesTo([
        {
          stage: "roadmap",
          status: "no_change_confirmed",
          reason: "The sequencing already matches the budget cycle.",
          resultArtifactId: null,
          resultVersionNumber: null,
          resultRevision: null,
          resultFingerprint: null,
        },
      ]),
    )
    assert.equal(completed.completed, true)

    const reentryRow = await prisma.feedbackReentry.findUniqueOrThrow({
      where: { id: opened.reentry.id },
    })
    assert.equal(reentryRow.status, "completed")
    assert.equal(reentryRow.completedByUserId, manager.id)
    assert.equal(reentryRow.sourceReportVersionId, fixture.versionId)

    const feedbackRow = await prisma.clientFeedback.findUniqueOrThrow({
      where: { id: created.id },
    })
    assert.equal(feedbackRow.status, "resolved")

    // Completing again is refused: the re-entry is no longer open.
    const again = await completeFeedbackReentry(
      managerScope,
      {
        engagementId: fixture.engagementId,
        reentryId: opened.reentry.id,
        expectedRevision: 1,
        completedByUserId: manager.id,
        completionNote: "Trying again.",
      },
      () => [],
      resolvesTo([]),
    )
    assert.deepEqual(again, {
      completed: false,
      reason: "invalid_feedback_transition",
    })
  })

  test("a completed re-entry cannot be completed from another Engagement's scope", async () => {
    const fixture = await publishedFixture("complete_scope")
    const created = await classifiedFeedback(fixture, "submission-key-complete-scope")
    const opened = await openFeedbackReentry(
      managerScope,
      {
        ...reentrySources(fixture),
        feedbackId: created.id,
        expectedRevision: 1,
        openedByUserId: manager.id,
        impactedStages: ["roadmap"],
        plan: "Re-sequence.",
      },
      declaredImpact,
      () => [],
    )
    assert.equal(opened.opened, true)
    if (!opened.opened) return

    const otherEngagement = await engagementFor("complete_scope_other")
    const wrongEngagement = await completeFeedbackReentry(
      managerScope,
      {
        engagementId: otherEngagement.id,
        reentryId: opened.reentry.id,
        expectedRevision: 0,
        completedByUserId: manager.id,
        completionNote: "Wrong engagement.",
      },
      () => [],
      resolvesTo([]),
    )
    assert.deepEqual(wrongEngagement, { completed: false, reason: "reentry_not_found" })

    const foreign = await completeFeedbackReentry(
      foreignManagerScope,
      {
        engagementId: fixture.engagementId,
        reentryId: opened.reentry.id,
        expectedRevision: 0,
        completedByUserId: foreignManager.id,
        completionNote: "Wrong workspace.",
      },
      () => [],
      resolvesTo([]),
    )
    assert.deepEqual(foreign, { completed: false, reason: "reentry_not_found" })

    assert.equal(
      (await prisma.feedbackReentry.findUniqueOrThrow({ where: { id: opened.reentry.id } }))
        .status,
      "open",
    )
  })

  test("a result that stops being valid before the completion transaction is refused", async () => {
    const fixture = await publishedFixture("toctou")
    const created = await classifiedFeedback(fixture, "submission-key-toctou", ["assessment"])
    const opened = await openFeedbackReentry(
      managerScope,
      {
        ...reentrySources(fixture),
        feedbackId: created.id,
        expectedRevision: 1,
        openedByUserId: manager.id,
        impactedStages: ["assessment"],
        plan: "Revise the assessment.",
      },
      declaredImpact,
      () => [],
    )
    assert.equal(opened.opened, true)
    if (!opened.opened) return

    // The Assessment moves on after the re-entry opened, which is exactly what
    // makes it a valid result for this stage.
    await prisma.engagement.update({
      where: { id: fixture.engagementId },
      data: {
        assessment: {
          summary: "Volumes re-measured after the client's note.",
          dimensions: {},
          gaps: [],
        },
        assessmentReviewState: "accepted",
        assessmentRevision: 5,
      },
    })

    // What a request handler holds: the engagement as it was when the request
    // began, and a completion that was valid at that moment.
    const engagement = await getEngagementById(fixture.engagementId, managerScope)
    assert.ok(engagement)
    if (!engagement) return
    const completion = {
      expectedRevision: 0,
      completionNote: "Assessment revised in response.",
      outcomes: [{ stage: "assessment" as const, status: "completed" as const }],
    }

    // …and then a colleague sends the Assessment back for revision before the
    // completion commits. The result is no longer an accepted Assessment.
    await prisma.engagement.update({
      where: { id: fixture.engagementId },
      data: { assessmentReviewState: "consultant_edited" },
    })

    const baseline = await auditEventsFor(fixture.engagementId)
    const refused = await finishFeedbackReentry(
      engagement,
      managerScope,
      opened.reentry.id,
      completion,
    )
    assert.equal(refused.success, false)
    if (refused.success) return
    assert.equal(refused.failure, "invalid_result_artifact")

    // Nothing about the re-entry moved: it is still open, at the same revision,
    // with no outcomes, its Feedback unresolved and no completion audited.
    const reentryRow = await prisma.feedbackReentry.findUniqueOrThrow({
      where: { id: opened.reentry.id },
    })
    assert.equal(reentryRow.status, "open")
    assert.equal(reentryRow.revision, 0)
    assert.deepEqual(reentryRow.outcomes, [])
    assert.equal(reentryRow.completedAt, null)
    assert.equal(
      (await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })).status,
      "reentry_open",
    )
    assert.deepEqual(await auditDelta(fixture.engagementId, baseline), [])

    // The same command, with the same already-loaded engagement object, is
    // accepted once the Assessment is accepted again — so the refusal came from
    // the state at completion time and not from the command.
    await prisma.engagement.update({
      where: { id: fixture.engagementId },
      data: { assessmentReviewState: "accepted" },
    })
    const completed = await finishFeedbackReentry(
      engagement,
      managerScope,
      opened.reentry.id,
      completion,
    )
    assert.equal(completed.success, true)
    if (!completed.success) return
    assert.deepEqual(completed.reentry.outcomes, [
      {
        stage: "assessment",
        status: "completed",
        reason: null,
        resultArtifactId: null,
        resultVersionNumber: null,
        resultRevision: 5,
        resultFingerprint: completed.reentry.outcomes[0]?.resultFingerprint ?? null,
      },
    ])
    assert.deepEqual(
      (await auditDelta(fixture.engagementId, baseline)).map((entry) => entry.eventType),
      ["feedback_reentry_completed"],
    )
  })

  // --- Audit --------------------------------------------------------------------

  test("each lifecycle step commits its audit event in the same transaction", async () => {
    const fixture = await publishedFixture("audit")
    // The Engagement Audit Trail is shared with the report lifecycle, so
    // publishing the fixture has already appended `report_version_created` and
    // `report_approved`. Every assertion below reads the *delta* from a baseline
    // taken here, which is also what proves the trail is append-only: the
    // baseline entries must still be there, unchanged and in order, afterwards.
    const baseline = await auditEventsFor(fixture.engagementId)
    assert.ok(baseline.length > 0, "the fixture was expected to have audited the report")

    const created = await submitFeedbackRow(fixture, "submission-key-audit", "Audit me.")

    assert.deepEqual(
      (await auditDelta(fixture.engagementId, baseline)).map((entry) => entry.eventType),
      ["client_feedback_submitted"],
    )
    assert.equal(
      (await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })).status,
      "submitted",
    )

    await classifyClientFeedback(
      managerScope,
      {
        engagementId: fixture.engagementId,
        feedbackId: created.id,
        expectedRevision: 0,
        reviewedByUserId: manager.id,
        classification: "request",
        impactedStages: ["roadmap"],
        managerSummary: "Summary.",
        managerDecision: "Decision.",
      },
      declaredImpact,
    )

    assert.deepEqual(
      (await auditDelta(fixture.engagementId, baseline)).map((entry) => entry.eventType),
      ["client_feedback_submitted", "client_feedback_classified"],
    )
    assert.equal(
      (await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })).status,
      "classified",
    )

    const opened = await openFeedbackReentry(
      managerScope,
      {
        ...reentrySources(fixture),
        feedbackId: created.id,
        expectedRevision: 1,
        openedByUserId: manager.id,
        impactedStages: ["roadmap"],
        plan: "Plan.",
      },
      declaredImpact,
      () => [],
    )
    assert.equal(opened.opened, true)
    if (!opened.opened) return

    assert.deepEqual(
      (await auditDelta(fixture.engagementId, baseline)).map((entry) => entry.eventType),
      [
        "client_feedback_submitted",
        "client_feedback_classified",
        "feedback_reentry_opened",
      ],
    )
    assert.equal(
      (await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })).status,
      "reentry_open",
    )

    await completeFeedbackReentry(
      managerScope,
      {
        engagementId: fixture.engagementId,
        reentryId: opened.reentry.id,
        expectedRevision: 0,
        completedByUserId: manager.id,
        completionNote: "Done.",
      },
      () => [],
      resolvesTo([
        {
          stage: "roadmap",
          status: "waived",
          reason: "Out of scope for this cycle.",
          resultArtifactId: null,
          resultVersionNumber: null,
          resultRevision: null,
          resultFingerprint: null,
        },
      ]),
    )

    // Each step appended exactly one event, in order, and each event is the one
    // that belongs to the record the step transitioned.
    const events = await auditDelta(fixture.engagementId, baseline)
    assert.deepEqual(events.map((entry) => entry.eventType), [
      "client_feedback_submitted",
      "client_feedback_classified",
      "feedback_reentry_opened",
      "feedback_reentry_completed",
    ])
    assert.equal(events[0].userId, client.id)
    assert.equal(events[0].payload.feedbackId, created.id)
    assert.equal(events[1].userId, manager.id)
    assert.equal(events[1].payload.feedbackId, created.id)
    assert.equal(events[2].payload.reentryId, opened.reentry.id)
    assert.equal(events[3].payload.feedbackId, created.id)
    assert.equal(events[3].payload.reentryId, opened.reentry.id)
    assert.equal(
      (await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })).status,
      "resolved",
    )
    // The client's own words are not copied into the access log.
    for (const entry of events) {
      assert.equal(JSON.stringify(entry.payload).includes("Audit me."), false)
    }
  })

  test("a refused transition writes no audit event and no state", async () => {
    const fixture = await publishedFixture("audit_refused")
    const created = await submitFeedbackRow(fixture, "submission-key-audit-refused", "Refused.")

    // Everything the refusal must leave exactly as it found it, captured
    // immediately before it — including the `client_feedback_submitted` event
    // the fixture submission legitimately appended.
    const baseline = await auditEventsFor(fixture.engagementId)
    const before = await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })

    const refused = await classifyClientFeedback(
      otherManagerScope,
      {
        engagementId: fixture.engagementId,
        feedbackId: created.id,
        expectedRevision: 0,
        reviewedByUserId: otherManager.id,
        classification: "request",
        impactedStages: [],
        managerSummary: "Summary.",
        managerDecision: "Decision.",
      },
      declaredImpact,
    )
    assert.deepEqual(refused, { classified: false, reason: "feedback_not_found" })

    assert.deepEqual(await auditDelta(fixture.engagementId, baseline), [])

    const after = await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })
    assert.deepEqual(after, before)
    assert.equal(after.status, "submitted")
    assert.equal(after.revision, 0)
    assert.equal(
      await prisma.feedbackReentry.count({ where: { feedbackId: created.id } }),
      0,
    )
  })

  test("a failing audit insert rolls the state change back with it", async () => {
    const fixture = await publishedFixture("audit_atomic")
    const created = await submitFeedbackRow(fixture, "submission-key-atomic", "Atomic.")
    const baseline = await auditEventsFor(fixture.engagementId)
    const before = await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })

    // The realistic failure is the audit insert itself: by the time it runs, the
    // state update has already succeeded in the same transaction. A constraint
    // added to `AuditTrail` for the duration of this test, narrowed to the one
    // event type, makes the *real* insert that the production transaction issues
    // fail inside PostgreSQL — nothing on the production path is stubbed, and
    // the constraint is dropped again below.
    await rejectAuditEvent("client_feedback_classified")
    try {
      await assert.rejects(() =>
        classifyClientFeedback(
          managerScope,
          {
            engagementId: fixture.engagementId,
            feedbackId: created.id,
            expectedRevision: 0,
            reviewedByUserId: manager.id,
            classification: "request",
            impactedStages: [],
            managerSummary: "Summary.",
            managerDecision: "Decision.",
          },
          declaredImpact,
        ),
      )
    } finally {
      await acceptAuditEvents()
    }

    // The state change went back with the audit event: no classification, no
    // revision bump, no event — and the history that was already there is intact.
    const after = await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })
    assert.deepEqual(after, before)
    assert.equal(after.status, "submitted")
    assert.equal(after.classification, null)
    assert.equal(after.revision, 0)
    assert.deepEqual(await auditDelta(fixture.engagementId, baseline), [])
    assert.equal(
      await prisma.auditTrail.count({
        where: { engagementId: fixture.engagementId, eventType: "client_feedback_classified" },
      }),
      0,
    )

    // With the constraint gone the same command succeeds, which is what makes
    // the rejection above attributable to the audit insert and nothing else.
    const retried = await classifyClientFeedback(
      managerScope,
      {
        engagementId: fixture.engagementId,
        feedbackId: created.id,
        expectedRevision: 0,
        reviewedByUserId: manager.id,
        classification: "request",
        impactedStages: [],
        managerSummary: "Summary.",
        managerDecision: "Decision.",
      },
      declaredImpact,
    )
    assert.equal(retried.classified, true)
    assert.deepEqual(
      (await auditDelta(fixture.engagementId, baseline)).map((entry) => entry.eventType),
      ["client_feedback_classified"],
    )
  })

  // --- Portal safety ------------------------------------------------------------

  const INTERNAL_FIELDS = [
    "classification",
    "impactedStages",
    "declaredImpactedStages",
    "managerSummary",
    "managerDecision",
    "closedNoActionReason",
    "reviewedAt",
    "reviewedByUserId",
    "reviewedByName",
    "sourceReportVersionId",
    "sourceSnapshotFingerprint",
    "submissionKey",
    "revision",
    "impact",
    "technicalStaleness",
    "sourceReport",
    "outcomes",
    "resultOptions",
    "plan",
  ]

  test("the portal submission response carries only client-safe fields", async () => {
    const fixture = await publishedFixture("portal_dto")

    const response = await portalPost(clientCookie, fixture.engagementId, {
      publicationId: fixture.publicationId,
      submissionKey: "submission-key-portal-dto",
      content: "Our budget cycle starts in April.",
    })

    assert.equal(response.status, 201)
    const feedback = response.body.data?.feedback as Record<string, unknown>
    assert.deepEqual(Object.keys(feedback).sort(), [
      "content",
      "id",
      "sourcePublicationId",
      "sourceReportVersionNumber",
      "status",
      "submittedAt",
    ])
    assertNoInternalFields(response.body)
  })

  test("an idempotent replay after internal classification discloses nothing", async () => {
    const fixture = await publishedFixture("portal_replay")
    const submission = {
      publicationId: fixture.publicationId,
      submissionKey: "submission-key-portal-replay",
      content: "Please reconsider phase two.",
    }

    const first = await portalPost(clientCookie, fixture.engagementId, submission)
    assert.equal(first.status, 201)
    const feedbackId = (first.body.data?.feedback as { id: string }).id

    // The Manager reviews it internally, with prose the client must never read.
    const classified = await classifyClientFeedback(
      managerScope,
      {
        engagementId: fixture.engagementId,
        feedbackId,
        expectedRevision: 0,
        reviewedByUserId: manager.id,
        classification: "disagreement",
        impactedStages: ["roadmap", "report"],
        managerSummary: "SECRET-INTERNAL-SUMMARY",
        managerDecision: "SECRET-INTERNAL-DECISION",
      },
      declaredImpact,
    )
    assert.equal(classified.classified, true)

    const replay = await portalPost(clientCookie, fixture.engagementId, submission)

    assert.equal(replay.status, 200)
    const body = JSON.stringify(replay.body)
    assert.equal(body.includes("SECRET-INTERNAL-SUMMARY"), false)
    assert.equal(body.includes("SECRET-INTERNAL-DECISION"), false)
    assert.equal(body.includes("disagreement"), false)
    assert.equal(body.includes(manager.id), false)
    assert.equal(body.includes(fixture.versionId), false)
    assertNoInternalFields(replay.body)

    // The status the Client does see is the lifecycle status, and nothing more.
    const feedback = replay.body.data?.feedback as Record<string, unknown>
    assert.equal(feedback.status, "classified")
    assert.equal(feedback.id, feedbackId)
  })

  test("the portal listing is scoped to the reading Client's own Feedback", async () => {
    const fixture = await publishedFixture("portal_listing")
    await submitFeedbackRow(fixture, "submission-key-portal-listing", "Mine.")

    const mine = await listClientPortalFeedback(fixture.engagementId, clientScope)
    assert.equal(mine.length, 1)
    assertNoInternalFields(mine[0])

    const theirs = await listClientPortalFeedback(fixture.engagementId, otherClientScope)
    assert.deepEqual(theirs, [])

    const listed = await portalGet(clientCookie, fixture.engagementId)
    assert.equal(listed.status, 200)
    assertNoInternalFields(listed.body)

    // Client B has no Discovery Access to this engagement and is refused.
    const foreign = await portalGet(otherClientCookie, fixture.engagementId)
    assert.equal(foreign.status, 404)
  })

  test("the Manager view of the same Feedback does carry the internal fields", async () => {
    const fixture = await publishedFixture("manager_view")
    const created = await submitFeedbackRow(fixture, "submission-key-manager-view", "Visible internally.")
    const classified = await classifyClientFeedback(
      managerScope,
      {
        engagementId: fixture.engagementId,
        feedbackId: created.id,
        expectedRevision: 0,
        reviewedByUserId: manager.id,
        classification: "clarification",
        impactedStages: ["report"],
        managerSummary: "Internal summary.",
        managerDecision: "Internal decision.",
      },
      declaredImpact,
    )
    assert.equal(classified.classified, true)

    // The classification is what the column holds, not only what the call
    // returned, so a Manager view that lost the stages later cannot be blamed on
    // the write.
    const row = await prisma.clientFeedback.findUniqueOrThrow({ where: { id: created.id } })
    assert.deepEqual(row.impactedStages, ["report"])

    // Read the Manager view afresh, after the classification committed.
    const [summary] = await listFeedback(fixture.engagementId, managerScope, declaredImpact)
    assert.equal(summary.classification, "clarification")
    assert.equal(summary.managerSummary, "Internal summary.")
    assert.equal(summary.managerDecision, "Internal decision.")
    assert.deepEqual(summary.impact.declaredImpactedStages, ["report"])
    assert.equal(summary.sourceReportVersionId, fixture.versionId)

    // …and a colleague who does not own the engagement sees none of it.
    assert.deepEqual(
      await listFeedback(fixture.engagementId, otherManagerScope, declaredImpact),
      [],
    )
    assert.deepEqual(
      await listOpenReentries(fixture.engagementId, foreignManagerScope, () => []),
      [],
    )
  })

  // --- Helpers ------------------------------------------------------------------

  function assertNoInternalFields(value: unknown) {
    const seen = JSON.stringify(value)
    for (const field of INTERNAL_FIELDS) {
      assert.equal(
        seen.includes(`"${field}"`),
        false,
        `the client-facing payload exposed "${field}"`,
      )
    }
  }

  // Stands in for the service's `impactViewFor`, which reports no staleness here
  // but *does* echo back the stages the repository read off the stored row. The
  // echo is the point: it is how the persisted `impactedStages` reach the
  // Manager DTO, so a stub that dropped them would hide a DTO that drops them.
  function declaredImpact(
    _sourceSnapshot: ReportSourceSnapshot,
    _sourceReportVersionId: string,
    declaredImpactedStages: FeedbackImpactStage[] = [],
  ) {
    return {
      declaredImpactedStages,
      technicalStaleness: {
        opportunities: false,
        recommendations: false,
        roadmap: false,
        report: false,
        reasons: [],
      },
      sourceReport: { superseded: false, sourcesChanged: false, reasons: [] },
      currentOpportunityVersionId: null,
      currentRecommendationVersionId: null,
      currentRoadmapVersionId: null,
      currentReportVersionId: null,
    }
  }

  function reentrySources(fixture: { engagementId: string; versionId: string }) {
    return {
      engagementId: fixture.engagementId,
      sourceDiscoveryFingerprint: "discovery_fp_source",
      sourceAssessmentRevision: 1,
      sourceAssessmentFingerprint: "assessment_fp_source",
      sourceOpportunityVersionId: null,
      sourceRecommendationVersionId: null,
      sourceRoadmapVersionId: null,
      sourceReportVersionId: fixture.versionId,
    }
  }

  async function submitFeedbackRow(
    fixture: { engagementId: string; publicationId: string },
    submissionKey: string,
    content: string,
  ) {
    const result = await createClientFeedback(clientScope, {
      engagementId: fixture.engagementId,
      publicationId: fixture.publicationId,
      submissionKey,
      content,
      submittedByUserId: client.id,
    })
    assert.ok("feedback" in result, "the fixture Feedback was not created")
    if (!("feedback" in result)) throw new Error("fixture submission failed")
    return result.feedback
  }

  async function classifiedFeedback(
    fixture: { engagementId: string; publicationId: string },
    submissionKey: string,
    impactedStages: FeedbackImpactStage[] = ["roadmap"],
  ) {
    const created = await submitFeedbackRow(fixture, submissionKey, "Please revise.")
    const classified = await classifyClientFeedback(
      managerScope,
      {
        engagementId: fixture.engagementId,
        feedbackId: created.id,
        expectedRevision: 0,
        reviewedByUserId: manager.id,
        classification: "changed_condition",
        impactedStages,
        managerSummary: "Conditions changed.",
        managerDecision: "Review the named stages.",
      },
      declaredImpact,
    )
    assert.equal(classified.classified, true)
    return created
  }

  async function auditEventsFor(engagementId: string) {
    const rows = await prisma.auditTrail.findMany({
      where: { engagementId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, userId: true, eventType: true, payload: true },
    })

    return rows.map((row) => ({
      ...row,
      payload: row.payload as Record<string, unknown>,
    }))
  }

  type AuditEvent = Awaited<ReturnType<typeof auditEventsFor>>[number]

  // What an operation appended to a trail that was not empty when it started.
  // Asserting the baseline is still there, byte for byte and in order, is the
  // append-only check; the returned tail is what the operation is judged on.
  async function auditDelta(engagementId: string, baseline: AuditEvent[]) {
    const events = await auditEventsFor(engagementId)
    assert.deepEqual(
      events.slice(0, baseline.length),
      baseline,
      "earlier audit history was rewritten or reordered",
    )
    return events.slice(baseline.length)
  }

  // Make PostgreSQL refuse one audit event type, for as long as the test needs
  // it. `NOT VALID` leaves the events other tests already wrote alone and still
  // enforces on every insert from here on.
  async function rejectAuditEvent(eventType: string) {
    // PostgreSQL takes no bind parameters in a utility statement, and the value
    // is a literal from this file, so it is inlined.
    assert.match(eventType, /^[a-z_]+$/)
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "AuditTrail"
         ADD CONSTRAINT "phase9_audit_insert_must_fail"
         CHECK ("eventType" <> '${eventType}') NOT VALID`,
    )
  }

  async function acceptAuditEvents() {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "AuditTrail" DROP CONSTRAINT IF EXISTS "phase9_audit_insert_must_fail"`,
    )
  }

  // The repository resolves a completion's outcomes inside its own transaction
  // and takes the stage rules from its caller; a repository-level test supplies
  // the resolution the service would have produced.
  function resolvesTo(outcomes: ReentryStageOutcome[]) {
    return async () => outcomes
  }

  async function registeredClient(email: string, name: string, workspaceId: string) {
    const identity = await authenticationProvider.registerIdentity({
      email,
      name,
      password: "correct-horse-battery-staple",
    })
    assert.equal(identity.success, true)
    const authUserId = identity.success ? identity.authUserId : ""
    await authenticationProvider.confirmEmail({ authUserId })

    return prisma.user.create({
      data: {
        workspaceId,
        email,
        displayName: name,
        role: "CLIENT",
        authUserId,
        emailVerifiedAt: new Date(),
      },
    })
  }

  async function engagementFor(title: string) {
    const engagement = await prisma.engagement.create({
      data: {
        workspaceId: workspace.id,
        organizationId: organization.id,
        owningManagerId: manager.id,
        title,
      },
      select: { id: true },
    })
    await prisma.discoveryAccess.create({
      data: {
        workspaceId: workspace.id,
        engagementId: engagement.id,
        userId: client.id,
        grantedByUserId: manager.id,
        status: "active",
        acceptedAt: new Date(),
      },
    })
    return engagement
  }

  async function approvedVersion(title: string, versionNumber: number, engagementId: string) {
    const snapshot = sourceSnapshot(versionNumber)
    const created = await createReportVersion(managerScope, {
      workspaceId: workspace.id,
      engagementId,
      report: report(title, snapshot),
      sourceSnapshot: snapshot,
      createdByUserId: manager.id,
    })
    assert.equal(created.created, true)
    if (!created.created) throw new Error("report version was not created")

    await prisma.consultantReportVersion.update({
      where: { id: created.version.id },
      data: { reviewState: "manager_review" },
    })
    const approved = await approveReportVersion(managerScope, {
      versionId: created.version.id,
      engagementId,
      expectedRevision: 0,
      approvedByUserId: manager.id,
      approvedSourceFingerprint: snapshot.fingerprint,
    })
    assert.equal(approved.approved, true)
    if (!approved.approved) throw new Error("report version was not approved")
    return approved.version
  }

  async function publishedFixture(title: string) {
    const engagement = await engagementFor(title)
    const version = await approvedVersion(title, 1, engagement.id)
    const pdfBytes = await renderReportVersionPdf(version.id, engagement.id, managerScope)
    assert.ok(pdfBytes)
    const artifact = await prisma.reportPdfArtifact.findFirstOrThrow({
      where: { reportVersionId: version.id },
      select: { id: true },
    })
    const published = await publishReportVersion(managerScope, {
      engagementId: engagement.id,
      versionId: version.id,
      pdfArtifactId: artifact.id,
      publishedByUserId: manager.id,
      clientUserId: client.id,
      title,
    })
    assert.equal(published.published, true)
    if (!published.published) throw new Error("publication failed")

    return {
      engagementId: engagement.id,
      versionId: version.id,
      publicationId: published.publication.id,
      publishedAt: new Date(published.publication.publishedAt),
    }
  }

  async function sessionCookie(email: string): Promise<string> {
    const session = await authenticationProvider.startSession({
      email,
      password: "correct-horse-battery-staple",
    })
    assert.equal(session.success, true)
    return session.success
      ? session.setHeaders
          .filter(([name]) => name === "set-cookie")
          .map(([, value]) => value.split(";")[0])
          .join("; ")
      : ""
  }

  async function portalPost(cookie: string, engagementId: string, body: unknown) {
    const response = await fetch(`${baseUrl}/portal/engagements/${engagementId}/feedback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    })
    return {
      status: response.status,
      body: (await response.json()) as {
        status: boolean
        message?: string
        data?: Record<string, unknown>
      },
    }
  }

  async function portalGet(cookie: string, engagementId: string) {
    const response = await fetch(`${baseUrl}/portal/engagements/${engagementId}/feedback`, {
      headers: cookie ? { cookie } : undefined,
    })
    return {
      status: response.status,
      body: (await response.json()) as {
        status: boolean
        data?: Record<string, unknown>
      },
    }
  }

  // Referenced so the unused-import check stays honest about what the suite
  // exercises through the report stack.
  void createReportPdfArtifact
  void otherOrganization
}

function report(title: string, sourceSnapshot: ReportSourceSnapshot): ConsultantReportContent {
  return {
    title,
    executiveSummary: "Support response should be improved.",
    engagementContext: {
      organizationName: "Client GmbH",
      engagementTitle: "Support review",
      department: "Operations",
      statedProblem: "Slow support replies",
      desiredOutcome: "Faster routing",
      businessImpact: "Customer wait time",
    },
    assessmentSummary: "A bounded pilot is ready.",
    prioritizedProblems: [
      {
        opportunityId: "opp_1",
        title: "Manual triage",
        problem: "Tickets wait for manual routing.",
        priorityRank: 1,
        rationale: "It is the main delay.",
      },
    ],
    recommendations: [
      {
        recommendationId: "rec_1",
        title: "Triage assistant",
        approach: "Classify tickets before routing.",
        rationale: "It matches the prioritized problem.",
        expectedValue: "Faster first response.",
        effort: { level: "medium", rationale: "Requires helpdesk integration." },
        confidence: "medium",
      },
    ],
    deferredRecommendations: [],
    roadmapSummary: "Pilot before expansion.",
    roadmapPhases: [
      {
        phaseId: "phase_1",
        sequenceOrder: 1,
        title: "Pilot",
        objective: "Validate routing quality.",
        expectedOutcome: "Known routing precision.",
      },
    ],
    assumptions: ["Helpdesk export is available."],
    risks: ["Routing errors need review."],
    nextSteps: ["Confirm pilot owner."],
    followUpQuestions: [],
    sourceSnapshot,
  }
}

function sourceSnapshot(seed: number): ReportSourceSnapshot {
  return {
    fingerprint: `source_fp_${seed}`,
    discoveryFingerprint: `discovery_fp_${seed}`,
    assessmentRevision: seed,
    assessmentFingerprint: `assessment_fp_${seed}`,
    opportunityVersionId: `oppv_${seed}`,
    opportunityVersionNumber: seed,
    opportunityFingerprint: `opp_fp_${seed}`,
    opportunityVersions: [
      { id: "opp_1", versionNumber: seed, priorityRank: 1, fingerprint: `opp_1_fp_${seed}` },
    ],
    recommendationVersionId: `recv_${seed}`,
    recommendationVersionNumber: seed,
    recommendationFingerprint: `rec_fp_${seed}`,
    recommendationVersions: [
      { id: "rec_1", versionNumber: seed, fingerprint: `rec_1_fp_${seed}` },
    ],
    recommendationDispositions: [{ recommendationId: "rec_1", disposition: "included" }],
    roadmapVersionId: `roadv_${seed}`,
    roadmapVersionNumber: seed,
    roadmapFingerprint: `road_fp_${seed}`,
    gaps: [],
    followUpTemplates: [],
  }
}

async function prepareDatabase(): Promise<{
  databaseUrl: string
  adminUrl: string
  databaseName: string
} | null> {
  loadDotenv({ path: path.join(serverRoot, ".env"), quiet: true })
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
      `Cannot reach PostgreSQL at ${adminUrl.host} (${failureCode(error)}). Start it with \`docker compose up -d\`.`,
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
    console.warn(`Skipping the Client Feedback integration suite: ${reason}`)
    return null
  }

  throw new Error(
    `The Client Feedback integration suite requires PostgreSQL. ${reason}\n` +
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

function failureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code)
  }

  return error instanceof Error ? error.name : "unknown error"
}
