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

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

const TEST_DATABASE_PREFIX = "phase8_report_test_"
const skippableWithoutDatabase = isEnabled(process.env.INTEGRATION_TESTS_OPTIONAL)
const environment = await prepareDatabase()

if (!environment) {
  test(
    "the report publication storage path needs PostgreSQL",
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
    getActivePublicationForClient,
    getReportPdfArtifactBytes,
    publishReportVersion,
    reservePublicationEmailAttempt,
    finalizePublicationEmailAttempt,
    saveReportVersion,
  } = await import("./consultant-report-version.repository.js")
  const {
    renderPublishedReportPdf,
    renderReportVersionPdf,
  } = await import("../services/consultant-report.service.js")
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

  const workspace = await prisma.workspace.create({
    data: { name: "Acme Consulting" },
  })
  const organization = await prisma.organization.create({
    data: { workspaceId: workspace.id, name: "Client GmbH" },
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
  const clientIdentity = await authenticationProvider.registerIdentity({
    email: "client@example.com",
    name: "Client",
    password: "correct-horse-battery-staple",
  })
  assert.equal(clientIdentity.success, true)
  const clientAuthUserId = clientIdentity.success ? clientIdentity.authUserId : ""
  await authenticationProvider.confirmEmail({ authUserId: clientAuthUserId })
  const otherClientIdentity = await authenticationProvider.registerIdentity({
    email: "other-client@example.com",
    name: "Other Client",
    password: "correct-horse-battery-staple",
  })
  assert.equal(otherClientIdentity.success, true)
  const otherClientAuthUserId = otherClientIdentity.success
    ? otherClientIdentity.authUserId
    : ""
  await authenticationProvider.confirmEmail({ authUserId: otherClientAuthUserId })

  const client = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "client@example.com",
      displayName: "Client",
      role: "CLIENT",
      authUserId: clientAuthUserId,
      emailVerifiedAt: new Date(),
    },
  })
  const otherClient = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "other-client@example.com",
      displayName: "Other Client",
      role: "CLIENT",
      authUserId: otherClientAuthUserId,
      emailVerifiedAt: new Date(),
    },
  })
  const engagement = await prisma.engagement.create({
    data: {
      workspaceId: workspace.id,
      organizationId: organization.id,
      owningManagerId: manager.id,
      title: "Support review",
    },
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

  const managerScope = {
    workspaceId: workspace.id,
    userId: manager.id,
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
  const auditEventsFor = async (engagementId: string): Promise<
    {
      engagementId: string | null
      userId: string | null
      eventType: string
      payload: Record<string, unknown>
    }[]
  > => {
    const rows = await prisma.auditTrail.findMany({
      where: { engagementId },
      orderBy: { createdAt: "asc" },
      select: {
        engagementId: true,
        userId: true,
        eventType: true,
        payload: true,
      },
    })

    return rows.map((row) => ({
      ...row,
      payload: row.payload as Record<string, unknown>,
    }))
  }

  test("concurrent publication is idempotent and stores one active publication", async () => {
    const version = await approvedVersion("report_v1", 1)
    const previewBytes = await renderReportVersionPdf(
      version.id,
      engagement.id,
      managerScope,
    )
    assert.ok(previewBytes)
    const artifact = await prisma.reportPdfArtifact.findFirstOrThrow({
      where: { reportVersionId: version.id },
      select: { id: true, bytes: true },
    })

    const [first, second] = await Promise.all([
      publishReportVersion(managerScope, {
        engagementId: engagement.id,
        versionId: version.id,
        pdfArtifactId: artifact.id,
        publishedByUserId: manager.id,
        clientUserId: client.id,
        title: "Published report",
      }),
      publishReportVersion(managerScope, {
        engagementId: engagement.id,
        versionId: version.id,
        pdfArtifactId: artifact.id,
        publishedByUserId: manager.id,
        clientUserId: client.id,
        title: "Published report",
      }),
    ])

    assert.equal(first.published, true)
    assert.equal(second.published, true)
    if (!first.published || !second.published) return
    assert.equal(first.publication.id, second.publication.id)
    assert.equal(
      await prisma.documentPublication.count({
        where: { engagementId: engagement.id, status: "active" },
      }),
      1,
    )

    const portalBytes = await renderPublishedReportPdf(
      version.id,
      engagement.id,
      clientScope,
    )
    assert.ok(portalBytes)
    assert.deepEqual(portalBytes, Buffer.from(artifact.bytes))
    assert.deepEqual(portalBytes, previewBytes)
    assert.equal(
      await renderPublishedReportPdf(version.id, engagement.id, otherClientScope),
      null,
    )
  })

  test("current PDF renderer is selected for preview and required for publication", async () => {
    const version = await approvedVersion("renderer_v3_report", 3)
    await createReportPdfArtifact(managerScope, {
      workspaceId: workspace.id,
      engagementId: engagement.id,
      reportVersionId: version.id,
      rendererVersion: "report-pdf.v1",
      contentHash: "old_content",
      encryptAtRest: false,
      pdfHash: "old_pdf",
      bytes: Buffer.from("old renderer bytes"),
    })

    const previewBytes = await renderReportVersionPdf(
      version.id,
      engagement.id,
      managerScope,
    )
    assert.ok(previewBytes)
    assert.notDeepEqual(previewBytes, Buffer.from("old renderer bytes"))
    assert.deepEqual(
      await getReportPdfArtifactBytes(managerScope, {
        engagementId: engagement.id,
        versionId: version.id,
        rendererVersion: "report-pdf.v1",
      }),
      Buffer.from("old renderer bytes"),
    )
    assert.deepEqual(
      await getReportPdfArtifactBytes(managerScope, {
        engagementId: engagement.id,
        versionId: version.id,
        rendererVersion: "report-pdf.v3",
      }),
      previewBytes,
    )

    const oldArtifact = await prisma.reportPdfArtifact.findFirstOrThrow({
      where: { reportVersionId: version.id, rendererVersion: "report-pdf.v1" },
      select: { id: true },
    })
    const rejected = await publishReportVersion(managerScope, {
      engagementId: engagement.id,
      versionId: version.id,
      pdfArtifactId: oldArtifact.id,
      rendererVersion: "report-pdf.v3",
      publishedByUserId: manager.id,
      clientUserId: client.id,
      title: "Renderer guarded report",
    })
    assert.deepEqual(rejected, { published: false, reason: "pdf_artifact_missing" })
  })

  test("notification attempt reservation is idempotent before finalization", async () => {
    const fixture = await publishedRouteFixture("notification_idempotent")

    const [first, second] = await Promise.all([
      reservePublicationEmailAttempt(fixture.publicationId, {
        workspaceId: workspace.id,
        engagementId: fixture.engagementId,
        requestKey: "notify-once",
      }),
      reservePublicationEmailAttempt(fixture.publicationId, {
        workspaceId: workspace.id,
        engagementId: fixture.engagementId,
        requestKey: "notify-once",
      }),
    ])

    assert.equal([first.reserved, second.reserved].filter(Boolean).length, 1)
    assert.equal(
      await prisma.documentNotificationAttempt.count({
        where: { publicationId: fixture.publicationId, requestKey: "notify-once" },
      }),
      1,
    )

    const finalized = await finalizePublicationEmailAttempt(fixture.publicationId, {
      requestKey: "notify-once",
      failure: "provider_unavailable",
    })
    assert.equal(finalized.notificationAttempts.at(-1)?.outcome, "failed")

    const third = await reservePublicationEmailAttempt(fixture.publicationId, {
      workspaceId: workspace.id,
      engagementId: fixture.engagementId,
      requestKey: "notify-once",
    })
    assert.equal(third.reserved, false)
    assert.equal(
      await prisma.documentNotificationAttempt.count({
        where: { publicationId: fixture.publicationId, requestKey: "notify-once" },
      }),
      1,
    )
  })

  test("report version lifecycle keeps review states explicit", async () => {
    const route = await routeEngagement("lifecycle_report")
    const snapshot = sourceSnapshot(10)
    const created = await createReportVersion(managerScope, {
      workspaceId: workspace.id,
      engagementId: route.id,
      report: report("Lifecycle", snapshot),
      sourceSnapshot: snapshot,
      createdByUserId: manager.id,
    })
    assert.equal(created.created, true)
    if (!created.created) throw new Error("report version was not created")

    const draftApproval = await approveReportVersion(managerScope, {
      versionId: created.version.id,
      engagementId: route.id,
      expectedRevision: 0,
      approvedByUserId: manager.id,
      approvedSourceFingerprint: snapshot.fingerprint,
    })
    assert.equal(draftApproval.approved, false)
    assert.equal(draftApproval.approved ? "" : draftApproval.reason, "not_in_review")

    const savedDraft = await saveReportVersion(managerScope, {
      versionId: created.version.id,
      engagementId: route.id,
      expectedRevision: 0,
      report: report("Lifecycle draft", snapshot),
      reviewState: "draft",
      sourceSnapshot: snapshot,
      modifiedByUserId: manager.id,
    })
    assert.equal(savedDraft.saved, true)
    if (!savedDraft.saved) throw new Error("draft save failed")
    assert.equal(savedDraft.version.reviewState, "draft")

    const submitted = await saveReportVersion(managerScope, {
      versionId: savedDraft.version.id,
      engagementId: route.id,
      expectedRevision: savedDraft.version.revision,
      report: report("Lifecycle submitted", snapshot),
      reviewState: "manager_review",
      sourceSnapshot: snapshot,
      modifiedByUserId: manager.id,
    })
    assert.equal(submitted.saved, true)
    if (!submitted.saved) throw new Error("submit save failed")
    assert.equal(submitted.version.reviewState, "manager_review")

    const returnedToDraft = await saveReportVersion(managerScope, {
      versionId: submitted.version.id,
      engagementId: route.id,
      expectedRevision: submitted.version.revision,
      report: report("Lifecycle returned", snapshot),
      reviewState: "draft",
      sourceSnapshot: snapshot,
      modifiedByUserId: manager.id,
    })
    assert.equal(returnedToDraft.saved, true)
    if (!returnedToDraft.saved) throw new Error("return to draft failed")
    assert.equal(returnedToDraft.version.reviewState, "draft")

    const withdrawnApproval = await approveReportVersion(managerScope, {
      versionId: returnedToDraft.version.id,
      engagementId: route.id,
      expectedRevision: returnedToDraft.version.revision,
      approvedByUserId: manager.id,
      approvedSourceFingerprint: snapshot.fingerprint,
    })
    assert.equal(withdrawnApproval.approved, false)
    assert.equal(
      withdrawnApproval.approved ? "" : withdrawnApproval.reason,
      "not_in_review",
    )

    const resubmitted = await saveReportVersion(managerScope, {
      versionId: returnedToDraft.version.id,
      engagementId: route.id,
      expectedRevision: returnedToDraft.version.revision,
      report: report("Lifecycle resubmitted", snapshot),
      reviewState: "manager_review",
      sourceSnapshot: snapshot,
      modifiedByUserId: manager.id,
    })
    assert.equal(resubmitted.saved, true)
    if (!resubmitted.saved) throw new Error("resubmit failed")

    const approved = await approveReportVersion(managerScope, {
      versionId: resubmitted.version.id,
      engagementId: route.id,
      expectedRevision: resubmitted.version.revision,
      approvedByUserId: manager.id,
      approvedSourceFingerprint: snapshot.fingerprint,
    })
    assert.equal(approved.approved, true)
    if (!approved.approved) throw new Error("approval failed")

    const editApproved = await saveReportVersion(managerScope, {
      versionId: approved.version.id,
      engagementId: route.id,
      expectedRevision: approved.version.revision,
      report: report("Lifecycle new draft", snapshot),
      reviewState: "draft",
      sourceSnapshot: snapshot,
      modifiedByUserId: manager.id,
    })
    assert.equal(editApproved.saved, true)
    if (!editApproved.saved) throw new Error("approved edit failed")
    assert.notEqual(editApproved.version.id, approved.version.id)
    assert.equal(editApproved.version.reviewState, "draft")
    assert.equal(editApproved.version.status, "active")
  })

  test("report lifecycle mutations append transactional audit events and denied transitions do not", async () => {
    const route = await routeEngagement("lifecycle_audit_report")
    const snapshot = sourceSnapshot(11)
    const created = await createReportVersion(managerScope, {
      workspaceId: workspace.id,
      engagementId: route.id,
      report: report("Audit lifecycle", snapshot),
      sourceSnapshot: snapshot,
      createdByUserId: manager.id,
    })
    assert.equal(created.created, true)
    if (!created.created) throw new Error("report version was not created")

    let events = await auditEventsFor(route.id)
    assert.deepEqual(events.map((entry) => entry.eventType), [
      "report_version_created",
    ])
    assert.equal(events[0].userId, manager.id)
    assert.equal(events[0].payload.reportVersionId, created.version.id)

    const deniedApproval = await approveReportVersion(managerScope, {
      versionId: created.version.id,
      engagementId: route.id,
      expectedRevision: created.version.revision,
      approvedByUserId: manager.id,
      approvedSourceFingerprint: snapshot.fingerprint,
    })
    assert.equal(deniedApproval.approved, false)
    assert.deepEqual(
      (await auditEventsFor(route.id)).map((entry) => entry.eventType),
      ["report_version_created"],
    )

    const submitted = await saveReportVersion(managerScope, {
      versionId: created.version.id,
      engagementId: route.id,
      expectedRevision: created.version.revision,
      report: report("Audit submitted", snapshot),
      reviewState: "manager_review",
      sourceSnapshot: snapshot,
      modifiedByUserId: manager.id,
    })
    assert.equal(submitted.saved, true)
    if (!submitted.saved) throw new Error("submit save failed")

    const approved = await approveReportVersion(managerScope, {
      versionId: submitted.version.id,
      engagementId: route.id,
      expectedRevision: submitted.version.revision,
      approvedByUserId: manager.id,
      approvedSourceFingerprint: snapshot.fingerprint,
    })
    assert.equal(approved.approved, true)
    if (!approved.approved) throw new Error("approval failed")

    const editedApproved = await saveReportVersion(managerScope, {
      versionId: approved.version.id,
      engagementId: route.id,
      expectedRevision: approved.version.revision,
      report: report("Audit replacement draft", snapshot),
      reviewState: "draft",
      sourceSnapshot: snapshot,
      modifiedByUserId: manager.id,
    })
    assert.equal(editedApproved.saved, true)
    if (!editedApproved.saved) throw new Error("approved edit failed")

    events = await auditEventsFor(route.id)
    assert.deepEqual(events.map((entry) => entry.eventType), [
      "report_version_created",
      "report_submitted_for_review",
      "report_approved",
      "report_version_created",
      "report_approved_version_superseded",
    ])
    assert.deepEqual(
      events.map((entry) => entry.engagementId),
      Array.from({ length: 5 }, () => route.id),
    )
    assert.deepEqual(
      events.map((entry) => entry.userId),
      Array.from({ length: 5 }, () => manager.id),
    )
    assert.equal(events[3].payload.reportVersionId, editedApproved.version.id)
    assert.equal(
      events[4].payload.supersededReportVersionId,
      approved.version.id,
    )
    assert.equal(events[4].payload.newReportVersionId, editedApproved.version.id)
  })

  test("new approved publication supersedes exactly the old active publication", async () => {
    const previous = await prisma.documentPublication.findFirstOrThrow({
      where: { engagementId: engagement.id, status: "active" },
      select: { id: true },
    })
    const version = await approvedVersion("report_v2", 2)
    await renderReportVersionPdf(version.id, engagement.id, managerScope)
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
      title: "Published report update",
    })

    assert.equal(published.published, true)
    assert.equal(
      await prisma.documentPublication.count({
        where: { engagementId: engagement.id, status: "active" },
      }),
      1,
    )
    assert.equal(
      (
        await prisma.documentPublication.findUniqueOrThrow({
          where: { id: previous.id },
          select: { status: true },
        })
      ).status,
      "superseded",
    )
  })

  test("legacy nullable active publications are not client-visible", async () => {
    const legacyEngagement = await prisma.engagement.create({
      data: {
        workspaceId: workspace.id,
        organizationId: organization.id,
        owningManagerId: manager.id,
        title: "Legacy report",
      },
    })
    const version = await approvedVersion("legacy_report", 1, legacyEngagement.id)
    await prisma.documentPublication.create({
      data: {
        workspaceId: workspace.id,
        engagementId: legacyEngagement.id,
        reportVersionId: version.id,
        publishedByUserId: manager.id,
      },
    })

    assert.equal(
      await getActivePublicationForClient(legacyEngagement.id, clientScope),
      null,
    )
  })

  test("associated Client can download the exact active published PDF", async () => {
    const fixture = await publishedRouteFixture("route_exact_pdf")

    const response = await portalPdf(
      clientCookie,
      fixture.engagementId,
      fixture.versionId,
    )

    assert.equal(response.status, 200)
    assert.deepEqual(response.bytes, fixture.pdfBytes)
  })

  test("Client B cannot use a copied Client A document URL", async () => {
    const fixture = await publishedRouteFixture("route_copied_url")

    const response = await portalPdf(
      otherClientCookie,
      fixture.engagementId,
      fixture.versionId,
    )

    assert.equal(response.status, 404)
  })

  test("unauthenticated actor cannot download a published document", async () => {
    const fixture = await publishedRouteFixture("route_unauthenticated")

    const response = await portalPdf("", fixture.engagementId, fixture.versionId)

    assert.equal(response.status, 401)
  })

  test("revoked publication immediately denies a previously working URL", async () => {
    const fixture = await publishedRouteFixture("route_revoked")
    assert.equal(
      (await portalPdf(clientCookie, fixture.engagementId, fixture.versionId)).status,
      200,
    )

    await prisma.documentPublication.update({
      where: { id: fixture.publicationId },
      data: { status: "revoked", revokedAt: new Date(), revokedByUserId: manager.id },
    })

    assert.equal(
      (await portalPdf(clientCookie, fixture.engagementId, fixture.versionId)).status,
      404,
    )
  })

  test("superseded publication is not downloadable through the Client Portal", async () => {
    const fixture = await publishedRouteFixture("route_superseded")
    const next = await approvedVersion("route_superseding", 2, fixture.engagementId)
    await renderReportVersionPdf(next.id, fixture.engagementId, managerScope)
    const artifact = await prisma.reportPdfArtifact.findFirstOrThrow({
      where: { reportVersionId: next.id },
      select: { id: true },
    })
    await publishReportVersion(managerScope, {
      engagementId: fixture.engagementId,
      versionId: next.id,
      pdfArtifactId: artifact.id,
      publishedByUserId: manager.id,
      clientUserId: client.id,
      title: "Superseding report",
    })

    assert.equal(
      (await portalPdf(clientCookie, fixture.engagementId, fixture.versionId)).status,
      404,
    )
  })

  test("unpublished ReportVersion is not downloadable", async () => {
    const fixture = await routeEngagement("route_unpublished")
    const version = await approvedVersion("route_unpublished_report", 1, fixture.id)
    await renderReportVersionPdf(version.id, fixture.id, managerScope)

    assert.equal((await portalPdf(clientCookie, fixture.id, version.id)).status, 404)
  })

  test("incomplete legacy publication is not listed or downloadable", async () => {
    const fixture = await routeEngagement("route_legacy_incomplete")
    const version = await approvedVersion("route_legacy_report", 1, fixture.id)
    await prisma.documentPublication.create({
      data: {
        workspaceId: workspace.id,
        engagementId: fixture.id,
        reportVersionId: version.id,
        publishedByUserId: manager.id,
      },
    })

    const documents = await portalJson(clientCookie, `/portal/engagements/${fixture.id}/documents`)
    assert.equal(documents.status, 200)
    assert.deepEqual(documents.body.data?.documents, [])
    assert.equal((await portalPdf(clientCookie, fixture.id, version.id)).status, 404)
  })

  test("DiscoveryAccess expiry or revocation does not remove valid document publication access", async () => {
    const fixture = await publishedRouteFixture("route_discovery_revoked")
    await prisma.discoveryAccess.update({
      where: {
        engagementId_userId: {
          engagementId: fixture.engagementId,
          userId: client.id,
        },
      },
      data: {
        status: "revoked",
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() - 60_000),
      },
    })

    assert.equal(
      (await portalPdf(clientCookie, fixture.engagementId, fixture.versionId)).status,
      200,
    )
  })

  async function approvedVersion(
    title: string,
    versionNumber: number,
    engagementId = engagement.id,
  ) {
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

  async function publishedRouteFixture(title: string) {
    const route = await routeEngagement(title)
    const version = await approvedVersion(title, 1, route.id)
    const pdfBytes = await renderReportVersionPdf(version.id, route.id, managerScope)
    assert.ok(pdfBytes)
    const artifact = await prisma.reportPdfArtifact.findFirstOrThrow({
      where: { reportVersionId: version.id },
      select: { id: true },
    })
    const publication = await publishReportVersion(managerScope, {
      engagementId: route.id,
      versionId: version.id,
      pdfArtifactId: artifact.id,
      publishedByUserId: manager.id,
      clientUserId: client.id,
      title,
    })
    assert.equal(publication.published, true)
    if (!publication.published) throw new Error("publication failed")

    return {
      engagementId: route.id,
      versionId: version.id,
      publicationId: publication.publication.id,
      pdfBytes,
    }
  }

  async function routeEngagement(title: string) {
    const route = await prisma.engagement.create({
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
        engagementId: route.id,
        userId: client.id,
        grantedByUserId: manager.id,
        status: "active",
        acceptedAt: new Date(),
      },
    })
    return route
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

  async function portalJson(cookie: string, routePath: string) {
    const response = await fetch(`${baseUrl}${routePath}`, {
      headers: cookie ? { cookie } : undefined,
    })
    return {
      status: response.status,
      body: (await response.json()) as {
        status: boolean
        data?: { documents?: unknown[] }
      },
    }
  }

  async function portalPdf(cookie: string, engagementId: string, versionId: string) {
    const response = await fetch(
      `${baseUrl}/portal/engagements/${engagementId}/documents/${versionId}/pdf`,
      { headers: cookie ? { cookie } : undefined },
    )
    return {
      status: response.status,
      bytes:
        response.headers.get("content-type") === "application/pdf"
          ? Buffer.from(await response.arrayBuffer())
          : Buffer.from(await response.text()),
    }
  }
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
    followUpQuestions: [
      {
        id: "follow_up_1",
        question: "Who owns escalation review?",
        sourceType: "assessment_gap",
        sourceGapId: "gap_1",
        sourceFingerprint: "gap_fp_1",
        sourceDescription: "Confirm escalation ownership",
        templateCode: null,
        templateEntryId: null,
        templateVersion: null,
        templateFingerprint: null,
        templateTitle: null,
        rationale: "Ownership is needed before launch.",
        status: "approved",
      },
    ],
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
    gaps: [
      {
        id: "gap_1",
        sourceType: "assessment_gap",
        description: "Confirm escalation ownership",
        fingerprint: "gap_fp_1",
      },
    ],
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
    console.warn(`Skipping the report publication integration suite: ${reason}`)
    return null
  }

  throw new Error(
    `The report publication integration suite requires PostgreSQL. ${reason}\n` +
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
