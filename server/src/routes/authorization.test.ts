import assert from "node:assert/strict"
import http from "node:http"
import { after, beforeEach, mock, test } from "node:test"

import express from "express"

import type { AuditEventType } from "../../../shared/access.schema.js"

// The access-control gate at the boundary (implementation-workflow §13.6a):
// isolation is proven by the *denials*, through the real routes, the real
// AccessPolicy, and the real workspace-scoped repository filter — with only the
// database and the authentication provider replaced.
//
// What each test proves: an unauthenticated request reaches nothing; a request
// from another workspace and a request for a colleague's engagement are refused
// exactly as a missing engagement is; a Client reaches nothing but their own
// discovery; revoked access ends immediately; and every denial appends a
// `denied_permission` entry to the append-only Audit Trail.

type Row = {
  id: string
  workspaceId: string
  owningManagerId: string
  organization: { id: string; name: string; industry: string | null }
}

type DiscoveryAccessRow = {
  id: string
  workspaceId: string
  engagementId: string
  userId: string
  status: "pending" | "active" | "revoked" | "expired"
  expiresAt: Date | null
  grantedByUserId: string
}

const WORKSPACE = "ws_1"
const OTHER_WORKSPACE = "ws_2"

const ownedByOwner: Row = {
  id: "eng_owner",
  workspaceId: WORKSPACE,
  owningManagerId: "user_owner",
  organization: { id: "org_1", name: "Example Org", industry: null },
}

const ownedByColleague: Row = {
  id: "eng_colleague",
  workspaceId: WORKSPACE,
  owningManagerId: "user_colleague",
  organization: { id: "org_1", name: "Example Org", industry: null },
}

const inOtherWorkspace: Row = {
  id: "eng_other_workspace",
  workspaceId: OTHER_WORKSPACE,
  owningManagerId: "user_other_owner",
  organization: { id: "org_2", name: "Other Org", industry: null },
}

const ENGAGEMENTS = [ownedByOwner, ownedByColleague, inOtherWorkspace]

const users = {
  administrator: {
    id: "user_admin",
    workspaceId: WORKSPACE,
    role: "ADMIN" as const,
    email: "admin@example.com",
    displayName: "Admin",
  },
  owner: {
    id: "user_owner",
    workspaceId: WORKSPACE,
    role: "MANAGER" as const,
    email: "owner@example.com",
    displayName: "Owner",
  },
  colleague: {
    id: "user_colleague",
    workspaceId: WORKSPACE,
    role: "MANAGER" as const,
    email: "colleague@example.com",
    displayName: "Colleague",
  },
  otherWorkspaceAdmin: {
    id: "user_other_admin",
    workspaceId: OTHER_WORKSPACE,
    role: "ADMIN" as const,
    email: "admin@other.example.com",
    displayName: "Other Admin",
  },
  client: {
    id: "user_client",
    workspaceId: WORKSPACE,
    role: "CLIENT" as const,
    email: "client@example.com",
    displayName: "Client",
  },
}

// Who the next request is from. `null` means an unauthenticated request.
let signedInAs: (typeof users)[keyof typeof users] | null = users.administrator

// The Discovery Access rows the fake store holds.
let discoveryAccessRows: DiscoveryAccessRow[] = []

type AuditEntry = {
  workspaceId: string
  userId: string | null
  engagementId: string | null
  eventType: AuditEventType
  payload: Record<string, unknown>
}

// Every audit entry the routes appended during a test.
let auditEntries: AuditEntry[] = []
let roadmapGenerateResult: unknown = {
  success: true,
  version: null,
  evaluation: {},
}
let roadmapSaveResult: unknown = { success: true, version: null }

// Which audit writes the store refuses, so the "the entry could not be stored"
// paths can be driven the way a real constraint violation would drive them.
let rejectAuditEntry: (entry: AuditEntry) => boolean = () => false

// What the process reported about audit writes it could not complete. A lost
// governance record has to be observable, so the report itself is asserted on.
let auditFailureLogs: string[] = []

// The real repository reach rule, applied to the fake store: an Administrator
// sees their workspace, a Manager sees what they own, and a Client sees only the
// engagements their own active, unexpired Discovery Access names.
const withinReach = (row: Row) => {
  const actor = signedInAs
  if (!actor) return false
  if (row.workspaceId !== actor.workspaceId) return false

  switch (actor.role) {
    case "ADMIN":
      return true
    case "MANAGER":
      return row.owningManagerId === actor.id
    case "CLIENT":
      return discoveryAccessRows.some(
        (access) =>
          access.engagementId === row.id &&
          access.workspaceId === actor.workspaceId &&
          access.userId === actor.id &&
          access.status === "active" &&
          (access.expiresAt === null || access.expiresAt > new Date()),
      )
  }
}

mock.module("../lib/prisma.js", { namedExports: { prisma: {} } })

mock.module("../lib/auth/authentication-provider.js", {
  namedExports: {
    authenticationProvider: {
      resolveIdentity: async () =>
        signedInAs
          ? {
              authUserId: `auth_${signedInAs.id}`,
              email: signedInAs.email,
              emailVerified: true,
              actingUser: signedInAs,
            }
          : null,
    },
  },
})

mock.module("../repositories/engagement.repository.js", {
  namedExports: {
    engagementScopeWhere: () => ({}),
    getEngagementById: async (id: string, scope: { userId: string }) => {
      assert.ok(scope, "getEngagementById was called without a workspace scope")
      const row = ENGAGEMENTS.find((engagement) => engagement.id === id)
      return row && withinReach(row) ? row : null
    },
    getEngagements: async (scope: { workspaceId: string }) => {
      assert.ok(scope, "getEngagements was called without a workspace scope")
      return ENGAGEMENTS.filter(withinReach)
    },
    getEngagementsByOrganizationId: async (scope: { workspaceId: string }) => {
      assert.ok(scope, "an organization's engagements were listed unscoped")
      return ENGAGEMENTS.filter(withinReach)
    },
    createEngagement: async () => ownedByOwner,
    updateEngagement: async () => ownedByOwner,
    toDiscoveryProfile: () => ({}),
    toDiscoveryWorkflowState: () => ({}),
    toAssessment: () => null,
  },
})

// The curated knowledge the engagement routes now retrieve. Mocked at the
// repository seam so the real deterministic retrieval still runs, without a
// database (coding-standards.md §9).
mock.module("../repositories/consulting-knowledge.repository.js", {
  namedExports: {
    ensureConsultingKnowledgeSeeded: async () => {},
    listConsultingKnowledgeEntries: async () => [],
    getConsultingKnowledgeEntryByCode: async () => null,
    createConsultingKnowledgeEntry: async () => {
      throw new Error("an engagement route must never write to the knowledge base")
    },
    updateConsultingKnowledgeEntry: async () => {
      throw new Error("an engagement route must never write to the knowledge base")
    },
  },
})


mock.module("../repositories/access.repository.js", {
  namedExports: {
    appendAuditTrail: async (entry: AuditEntry) => {
      if (rejectAuditEntry(entry)) {
        // Shaped like the failure this guards against: the database refusing a
        // foreign key that names a row the caller may not read.
        throw Object.assign(new Error("insert or update violates foreign key"), {
          name: "PrismaClientKnownRequestError",
          code: "P2003",
        })
      }

      auditEntries.push(entry)
      return entry
    },
    getDiscoveryAccessForClient: async (
      scope: { workspaceId: string },
      engagementId: string,
      userId: string,
    ) =>
      discoveryAccessRows.find(
        (access) =>
          access.workspaceId === scope.workspaceId &&
          access.engagementId === engagementId &&
          access.userId === userId,
      ) ?? null,
    getActiveDiscoveryAccessByEngagement: async () => null,
    createNotification: async () => ({}),
    listUsersByWorkspace: async () => [],
    listInvitationsByWorkspace: async () => [],
    listAuditTrailByWorkspace: async () => [],
    listDiscoveryAccessByWorkspace: async () => [],
    listNotificationsForUser: async () => [],
  },
})

mock.module("../repositories/organization.repository.js", {
  namedExports: {
    getOrganizations: async () => [],
    getOrganizationById: async () => null,
    createOrganization: async () => ({}),
  },
})

mock.module("../repositories/analysis-run.repository.js", {
  namedExports: {
    getAnalysisRunsByEngagementId: async () => [{ id: "run_1" }],
    createAnalysisRun: async () => ({}),
  },
})

mock.module("../services/discovery.service.js", {
  namedExports: {
    saveDiscoveryProfile: async () => ownedByOwner,
    transitionDiscovery: async () => ({
      success: true,
      engagement: ownedByOwner,
    }),
  },
})

mock.module("../services/analysis.service.js", {
  namedExports: {
    analyzeEngagement: async () => ({
      success: true,
      report: {},
      evaluation: {},
    }),
  },
})

mock.module("../services/assessment.service.js", {
  namedExports: {
    generateAssessment: async () => ({
      success: true,
      assessment: {},
      reviewState: "ai_draft",
      evaluation: {},
    }),
    saveAssessment: async () => ownedByOwner,
  },
})

mock.module("../services/opportunities.service.js", {
  namedExports: {
    prioritizeOpportunities: async () => ({
      success: true,
      prioritization: { summary: "", opportunities: [], gaps: [] },
      reviewState: "ai_draft",
      evaluation: {},
    }),
    saveOpportunities: async () => ownedByOwner,
    getOpportunityVersionState: async () => ({
      activeVersion: null,
      stale: false,
      currentAssessmentRevision: 0,
      currentAssessmentFingerprint: null,
    }),
    listOpportunityVersions: async () => [],
    getOpportunityVersionById: async () => null,
  },
})

mock.module("../services/recommendations.service.js", {
  namedExports: {
    generateRecommendations: async () => ({
      success: true,
      version: null,
      evaluation: {},
    }),
    saveRecommendations: async () => ({ success: true, version: null }),
    getRecommendationStageState: async () => ({
      activeVersion: null,
      stale: false,
      currentOpportunityVersionId: null,
      currentOpportunityVersionNumber: null,
      currentOpportunityFingerprint: null,
      groundingOptions: { knowledge: [], technology: [] },
    }),
    listRecommendationVersions: async () => [],
  },
})

mock.module("../services/implementation-roadmap.service.js", {
  namedExports: {
    generateImplementationRoadmap: async () => roadmapGenerateResult,
    saveImplementationRoadmap: async () => roadmapSaveResult,
    getRoadmapStageState: async () => ({
      activeVersion: null,
      stale: false,
      acceptedRecommendationVersionId: null,
      acceptedRecommendationVersionNumber: null,
      acceptedRecommendationFingerprint: null,
      acceptedRecommendationsAvailable: false,
      implementationPatternOptions: [],
    }),
    listRoadmapVersions: async () => [],
  },
})

mock.module("../repositories/implementation-roadmap-version.repository.js", {
  namedExports: {
    getActiveRoadmapVersion: async () => null,
    getRoadmapVersionById: async () => null,
  },
})

mock.module("../repositories/consultant-report-version.repository.js", {
  namedExports: {
    createReportVersion: async () => ({ created: false, reason: "version_conflict" }),
    getActivePublication: async () => null,
    getActiveReportVersion: async () => null,
    getReportVersions: async () => [],
    getReportVersionById: async () => null,
    linkReportVersionAnalysisRun: async () => undefined,
    markPublicationEmailAttempt: async () => null,
    publishReportVersion: async () => ({ published: false, reason: "version_not_found" }),
    revokeActivePublication: async () => ({ revoked: false, reason: "no_active_publication" }),
    saveReportVersion: async () => ({ saved: false, reason: "version_not_found" }),
  },
})

mock.module("../services/consultant-report.service.js", {
  namedExports: {
    approveConsultantReport: async () => ({ success: false, failure: "version_not_found" }),
    generateConsultantReport: async () => ({ success: false, failure: "sources_not_ready" }),
    getPublishedPortalDocument: async () => null,
    getReportStageState: async () => ({
      activeVersion: null,
      stale: false,
      eligible: false,
      missingAcceptedSources: [],
      currentSourceSnapshot: null,
      followUpTemplateOptions: [],
      activePublication: null,
      publicationRecipient: null,
    }),
    listReportVersions: async () => [],
    publishConsultantReport: async () => ({ success: false, failure: "version_not_found" }),
    renderPublishedReportPdf: async () => null,
    renderReportVersionPdf: async () => null,
    retryPublicationNotification: async () => ({ success: false, failure: "no_active_publication" }),
    revokeConsultantReportPublication: async () => ({ success: false, failure: "no_active_publication" }),
    saveConsultantReport: async () => ({ success: false, failure: "version_not_found" }),
  },
})

mock.module("../services/access.service.js", {
  namedExports: {
    listWorkspaceUsers: async () => [],
    listWorkspaceInvitations: async () => [],
    listWorkspaceAudit: async () => [],
    listWorkspaceDiscoveryAccess: async () => [],
    listOwnNotifications: async () => [],
    readOwnNotification: async () => ({ success: true, notification: {} }),
    issueStaffInvitation: async () => ({
      success: true,
      invitation: { id: "inv_1", email: "x@example.com", role: "MANAGER" },
      delivery: { delivered: false, channel: "log", reason: "logged_not_sent" },
    }),
    revokeStaffInvitation: async () => ({ success: true, invitation: {} }),
    grantDiscoveryAccess: async () => ({ success: true, access: {} }),
    revokeDiscoveryAccessById: async () => ({ success: true, access: {} }),
    changeUserRole: async () => ({ success: true, user: {} }),
    transferEngagementOwnership: async () => ({ success: true, engagement: {} }),
    bootstrapFirstAdministrator: async () => ({ success: false, failure: "bootstrap_unavailable" }),
    registerClient: async () => ({ success: true }),
    resendVerification: async () => undefined,
    signIn: async () => ({ success: true, setHeaders: [], actingUser: null }),
    signOut: async () => [],
    acceptStaffInvitation: async () => ({ success: true, user: {} }),
  },
})

const { default: engagementsRouter } = await import("./engagements.js")
const { default: portalRouter } = await import("./portal.js")
const { default: authRouter } = await import("./auth.js")
const { default: organizationsRouter } = await import("./organizations.js")

const app = express()
app.use(express.json())
app.use("/engagements", engagementsRouter)
app.use("/portal", portalRouter)
app.use("/auth", authRouter)
app.use("/organizations", organizationsRouter)

const server = app.listen(0)

const baseUrl = (() => {
  const address = server.address()
  assert.ok(address && typeof address === "object", "test server did not start")
  return `http://127.0.0.1:${address.port}`
})()

// Audit-write failures are reported to the error console, so the console is
// captured for the tests that assert the report happened. The failures these
// tests provoke are expected ones, so they are recorded rather than printed;
// the original console is restored when the file is done.
const reportedErrors = console.error
console.error = (...args: unknown[]) => {
  auditFailureLogs.push(args.map((arg) => JSON.stringify(arg) ?? String(arg)).join(" "))
}

after(() => {
  console.error = reportedErrors
  server.close()
})

beforeEach(() => {
  signedInAs = users.administrator
  auditEntries = []
  auditFailureLogs = []
  roadmapGenerateResult = {
    success: true,
    version: null,
    evaluation: {},
  }
  roadmapSaveResult = { success: true, version: null }
  rejectAuditEntry = () => false
  discoveryAccessRows = [
    {
      id: "access_1",
      workspaceId: WORKSPACE,
      engagementId: ownedByOwner.id,
      userId: users.client.id,
      status: "active",
      expiresAt: null,
      grantedByUserId: users.owner.id,
    },
  ]
})

type Call = { method?: string; body?: unknown }

const request = async (path: string, call: Call = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: call.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: call.body === undefined ? undefined : JSON.stringify(call.body),
  })

  return {
    status: response.status,
    body: (await response.json()) as {
      status: boolean
      message: string
      data?: Record<string, unknown>
    },
  }
}

const ungroundedRoadmapResult = () => ({
  success: false,
  failure: "ai_output_ungrounded",
  messageId: "roadmap.error.ai_output_ungrounded",
  unknownRecommendationIds: ["rec_unknown"],
  missingRecommendationIds: ["rec_missing"],
  unknownImplementationPatternCodes: ["pattern_unknown"],
  nonImplementationPatternCodes: ["pattern_wrong_kind"],
  dependencyErrors: ["dependency_cycle"],
  dispositionErrors: ["included_recommendation_not_linked"],
})

const validRoadmapSaveRequest = () => ({
  versionId: "roadmap_version_1",
  expectedRevision: 0,
  roadmap: {
    summary: "Roadmap summary",
    recommendationDispositions: [
      { recommendationId: "rec_1", disposition: "included" },
    ],
    assumptions: [],
    gaps: [],
    phases: [
      {
        id: "phase_1",
        sequenceOrder: 1,
        title: "Phase 1",
        objective: "Prepare the implementation",
        scope: ["Prepare"],
        expectedOutcome: "Preparation complete",
        linkedRecommendationIds: ["rec_1"],
        dependencyPhaseIds: [],
        explicitPrerequisites: [],
        readinessConsiderations: [],
        risks: [],
        assumptions: [],
        effort: null,
        sequencingRationale: "This phase starts the roadmap.",
        implementationPatternGrounding: [],
      },
    ],
  },
  reviewState: "consultant_edited",
})

const validReportSaveRequest = () => ({
  versionId: "report_version_1",
  expectedRevision: 0,
  report: {
    title: "Consultant Report",
    executiveSummary: "Report summary.",
    engagementContext: {
      organizationName: "Example Org",
      engagementTitle: "AI review",
      department: "Operations",
      statedProblem: "Slow support handling.",
      desiredOutcome: "Faster routing.",
      businessImpact: "Customer waiting time.",
    },
    assessmentSummary: "The engagement is ready for a bounded pilot.",
    prioritizedProblems: [
      {
        opportunityId: "opp_1",
        title: "Manual triage",
        problem: "Tickets wait for manual routing.",
        priorityRank: 1,
        rationale: "This is the main delay.",
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
        question: "Who owns pilot review?",
        sourceType: "assessment_gap",
        sourceDescription: "Confirm pilot owner",
        templateCode: null,
        rationale: "Ownership is needed before launch.",
        status: "draft",
      },
    ],
  },
  reviewState: "draft",
})

// The workbench routes that name one engagement, so each can be checked for
// every caller rather than one being checked and the rest assumed.
const engagementRoutes = (id: string): [string, Call][] => [
  [`/engagements/${id}`, {}],
  [`/engagements/${id}`, { method: "PATCH", body: { stage: "assessment" } }],
  [`/engagements/${id}/analysis-runs`, {}],
  [`/engagements/${id}/analyze`, { method: "POST" }],
  [`/engagements/${id}/assessment`, { method: "POST", body: {} }],
  [`/engagements/${id}/opportunities`, { method: "POST", body: {} }],
  [
    `/engagements/${id}/opportunities`,
    {
      method: "PATCH",
      body: {
        prioritization: {
          summary: "Nothing prioritized yet.",
          opportunities: [],
          gaps: [],
        },
      },
    },
  ],
  [`/engagements/${id}/opportunities/versions`, {}],
  [`/engagements/${id}/opportunities/versions/version_1`, {}],
  [`/engagements/${id}/recommendations`, { method: "POST", body: {} }],
  [
    `/engagements/${id}/recommendations`,
    {
      method: "PATCH",
      body: {
        versionId: "version_1",
        expectedRevision: 0,
        recommendationSet: {
          summary: "Nothing recommended yet.",
          recommendations: [],
          gaps: [],
        },
      },
    },
  ],
  [`/engagements/${id}/recommendations/versions`, {}],
  [`/engagements/${id}/recommendations/versions/version_1`, {}],
  [`/engagements/${id}/roadmap`, { method: "POST", body: {} }],
  [
    `/engagements/${id}/roadmap`,
    {
      method: "PATCH",
      body: {
        versionId: "version_1",
        expectedRevision: 0,
        roadmap: {
          summary: "No roadmap yet.",
          phases: [],
          assumptions: [],
          gaps: [],
        },
      },
    },
  ],
  [`/engagements/${id}/roadmap/versions`, {}],
  [`/engagements/${id}/roadmap/versions/version_1`, {}],
  [`/engagements/${id}/report`, { method: "POST", body: {} }],
  [`/engagements/${id}/report`, { method: "PATCH", body: validReportSaveRequest() }],
  [
    `/engagements/${id}/report/versions/report_version_1/approve`,
    { method: "POST", body: { expectedRevision: 0 } },
  ],
  [`/engagements/${id}/report/versions`, {}],
  [`/engagements/${id}/report/versions/report_version_1`, {}],
  [`/engagements/${id}/report/versions/report_version_1/pdf`, {}],
  [
    `/engagements/${id}/report/versions/report_version_1/publish`,
    {
      method: "POST",
      body: {
        title: "Client Report",
        managerMessage: "Please review the published report.",
      },
    },
  ],
  [`/engagements/${id}/report/publication/revoke`, { method: "POST" }],
  [
    `/engagements/${id}/report/publication/notify`,
    { method: "POST", body: { requestKey: "retry_1" } },
  ],
  [
    `/engagements/${id}/discovery`,
    { method: "PATCH", body: { profile: {}, contributor: "consultant" } },
  ],
  [
    `/engagements/${id}/discovery/submit`,
    { method: "POST", body: { actor: "consultant" } },
  ],
  [
    `/engagements/${id}/discovery/return`,
    { method: "POST", body: { actor: "consultant", notes: "please complete" } },
  ],
  [`/engagements/${id}/discovery/accept`, { method: "POST", body: { actor: "consultant" } }],
  [`/engagements/${id}/discovery/reopen`, { method: "POST", body: { actor: "consultant" } }],
]

// --- Unauthenticated access -------------------------------------------------

test("no unauthenticated path reaches engagement data", async () => {
  signedInAs = null

  const paths: [string, Call][] = [
    ["/engagements", {}],
    ["/organizations", {}],
    ["/auth/me", {}],
    ["/auth/notifications", {}],
    ["/auth/workspace/users", {}],
    ["/auth/workspace/audit", {}],
    ["/portal/engagements/eng_owner/discovery", {}],
    ...engagementRoutes(ownedByOwner.id),
  ]

  for (const [path, call] of paths) {
    const { status, body } = await request(path, call)

    assert.equal(status, 401, `${call.method ?? "GET"} ${path} was not refused`)
    assert.equal(body.message, "auth.error.unauthenticated")
  }
})

test("an unauthenticated denial records no audit entry against any workspace", async () => {
  signedInAs = null
  await request(`/engagements/${ownedByOwner.id}`)

  // There is no workspace to attribute the attempt to, and guessing one would
  // put a fabricated entry in an append-only log.
  assert.deepEqual(auditEntries, [])
})

// --- Cross-workspace access -------------------------------------------------

test("an Administrator cannot reach an engagement in another workspace", async () => {
  signedInAs = users.otherWorkspaceAdmin

  for (const [path, call] of engagementRoutes(ownedByOwner.id)) {
    const { status, body } = await request(path, call)

    assert.equal(status, 404, `${call.method ?? "GET"} ${path} crossed a workspace`)
    assert.equal(body.message, "auth.error.not_found")
  }
})

test("a listing never carries another workspace's engagements", async () => {
  signedInAs = users.otherWorkspaceAdmin

  const response = await fetch(`${baseUrl}/engagements`)
  const body = (await response.json()) as { data: Row[] }

  assert.equal(response.status, 200)
  assert.deepEqual(
    body.data.map((row) => row.id),
    [inOtherWorkspace.id],
    "a listing leaked an engagement from another workspace",
  )
})

test("an analysis-run history is not reachable across a workspace", async () => {
  signedInAs = users.otherWorkspaceAdmin

  const { status } = await request(`/engagements/${ownedByOwner.id}/analysis-runs`)

  assert.equal(status, 404)
})

// --- Cross-owner access -----------------------------------------------------

test("a Manager cannot reach a colleague's engagement by identifier", async () => {
  signedInAs = users.colleague

  for (const [path, call] of engagementRoutes(ownedByOwner.id)) {
    const { status, body } = await request(path, call)

    assert.equal(status, 404, `${call.method ?? "GET"} ${path} reached a colleague's engagement`)
    assert.equal(body.message, "auth.error.not_found")
  }
})

test("a Manager's listing carries only the engagements they own", async () => {
  signedInAs = users.colleague

  const response = await fetch(`${baseUrl}/engagements`)
  const body = (await response.json()) as { data: Row[] }

  assert.deepEqual(
    body.data.map((row) => row.id),
    [ownedByColleague.id],
  )
})

test("a Manager cannot administer the workspace", async () => {
  signedInAs = users.owner

  const paths: [string, Call][] = [
    ["/auth/workspace/users", {}],
    ["/auth/workspace/invitations", {}],
    ["/auth/workspace/audit", {}],
    ["/auth/invitations", { method: "POST", body: { email: "x@example.com", role: "MANAGER" } }],
    ["/auth/invitations/revoke", { method: "POST", body: { invitationId: "inv_1" } }],
    ["/auth/users/user_colleague/role", { method: "PATCH", body: { role: "ADMIN" } }],
  ]

  for (const [path, call] of paths) {
    const { status, body } = await request(path, call)

    assert.equal(status, 403, `${path} was reachable by a Manager`)
    assert.equal(body.message, "auth.error.forbidden")
  }
})

test("a Manager cannot transfer ownership of an engagement they own", async () => {
  signedInAs = users.owner

  const { status } = await request(
    `/auth/engagements/${ownedByOwner.id}/ownership`,
    { method: "PATCH", body: { managerId: users.colleague.id } },
  )

  assert.equal(status, 404)
})

test("roadmap generation preserves structured disposition validation details", async () => {
  signedInAs = users.owner
  roadmapGenerateResult = ungroundedRoadmapResult()

  const { status, body } = await request(`/engagements/${ownedByOwner.id}/roadmap`, {
    method: "POST",
    body: {},
  })

  assert.equal(status, 422)
  assert.equal(body.message, "roadmap.error.ai_output_ungrounded")
  assert.deepEqual(body.data?.unknownRecommendationIds, ["rec_unknown"])
  assert.deepEqual(body.data?.missingRecommendationIds, ["rec_missing"])
  assert.deepEqual(body.data?.unknownImplementationPatternCodes, [
    "pattern_unknown",
  ])
  assert.deepEqual(body.data?.dependencyErrors, ["dependency_cycle"])
  assert.deepEqual(body.data?.dispositionErrors, [
    "included_recommendation_not_linked",
  ])
})

test("roadmap save preserves structured disposition validation details", async () => {
  signedInAs = users.owner
  roadmapSaveResult = ungroundedRoadmapResult()

  const { status, body } = await request(`/engagements/${ownedByOwner.id}/roadmap`, {
    method: "PATCH",
    body: validRoadmapSaveRequest(),
  })

  assert.equal(status, 422)
  assert.equal(body.message, "roadmap.error.ai_output_ungrounded")
  assert.deepEqual(body.data?.unknownRecommendationIds, ["rec_unknown"])
  assert.deepEqual(body.data?.missingRecommendationIds, ["rec_missing"])
  assert.deepEqual(body.data?.unknownImplementationPatternCodes, [
    "pattern_unknown",
  ])
  assert.deepEqual(body.data?.dependencyErrors, ["dependency_cycle"])
  assert.deepEqual(body.data?.dispositionErrors, [
    "included_recommendation_not_linked",
  ])
})

// --- Client portal isolation -------------------------------------------------

test("a Client reaches nothing in the consultant workbench", async () => {
  signedInAs = users.client

  const paths: [string, Call][] = [
    ["/engagements", {}],
    ["/organizations", {}],
    ["/organizations/org_1", {}],
    ["/organizations/org_1/engagements", {}],
    ["/auth/workspace/users", {}],
    ["/auth/workspace/audit", {}],
    ...engagementRoutes(ownedByOwner.id),
  ]

  for (const [path, call] of paths) {
    const { status } = await request(path, call)

    assert.ok(
      status === 403 || status === 404,
      `a Client reached ${call.method ?? "GET"} ${path} (${status})`,
    )
  }
})

test("a Client reaches their own engagement's discovery through the portal", async () => {
  signedInAs = users.client

  const { status } = await request(`/portal/engagements/${ownedByOwner.id}/discovery`)

  assert.equal(status, 200)
})

test("a Client cannot reach the discovery of an engagement they are not associated with", async () => {
  signedInAs = users.client

  const paths: [string, Call][] = [
    [`/portal/engagements/${ownedByColleague.id}/discovery`, {}],
    [
      `/portal/engagements/${ownedByColleague.id}/discovery`,
      { method: "PATCH", body: { profile: {}, contributor: "client" } },
    ],
    [
      `/portal/engagements/${ownedByColleague.id}/discovery/submit`,
      { method: "POST", body: { actor: "client" } },
    ],
  ]

  for (const [path, call] of paths) {
    const { status, body } = await request(path, call)

    assert.equal(status, 404, `a Client reached ${path}`)
    assert.equal(body.message, "auth.error.not_found")
  }
})

test("a consultant cannot act through the client portal", async () => {
  for (const actor of [users.administrator, users.owner]) {
    signedInAs = actor

    const { status } = await request(
      `/portal/engagements/${ownedByOwner.id}/discovery`,
    )

    assert.equal(status, 404, `${actor.role} acted through the client portal`)
  }
})

// --- Revoked access ---------------------------------------------------------

test("revoking Discovery Access ends the client's access on the next request", async () => {
  signedInAs = users.client

  const before = await request(`/portal/engagements/${ownedByOwner.id}/discovery`)
  assert.equal(before.status, 200)

  discoveryAccessRows[0]!.status = "revoked"

  const after = await request(`/portal/engagements/${ownedByOwner.id}/discovery`)
  assert.equal(after.status, 404)
  assert.equal(after.body.message, "auth.error.not_found")
})

test("revoked access can no longer save or submit discovery", async () => {
  signedInAs = users.client
  discoveryAccessRows[0]!.status = "revoked"

  const saved = await request(
    `/portal/engagements/${ownedByOwner.id}/discovery`,
    { method: "PATCH", body: { profile: {}, contributor: "client" } },
  )
  const submitted = await request(
    `/portal/engagements/${ownedByOwner.id}/discovery/submit`,
    { method: "POST", body: { actor: "client" } },
  )

  assert.equal(saved.status, 404)
  assert.equal(submitted.status, 404)
})

test("expired Discovery Access ends the client's access", async () => {
  signedInAs = users.client
  discoveryAccessRows[0]!.expiresAt = new Date("2020-01-01T00:00:00.000Z")

  const { status } = await request(
    `/portal/engagements/${ownedByOwner.id}/discovery`,
  )

  assert.equal(status, 404)
})

// --- Non-revealing denials --------------------------------------------------

test("a cross-owner refusal is indistinguishable from a missing engagement", async () => {
  signedInAs = users.colleague

  const crossOwner = await request(`/engagements/${ownedByOwner.id}`)
  const missing = await request("/engagements/eng_does_not_exist")

  assert.equal(crossOwner.status, missing.status)
  assert.deepEqual(crossOwner.body, missing.body)
})

test("a cross-workspace refusal is indistinguishable from a missing engagement", async () => {
  signedInAs = users.otherWorkspaceAdmin

  const crossWorkspace = await request(`/engagements/${ownedByOwner.id}`)
  const missing = await request("/engagements/eng_does_not_exist")

  assert.equal(crossWorkspace.status, missing.status)
  assert.deepEqual(crossWorkspace.body, missing.body)
})

test("a denial body names no engagement, owner, or workspace", async () => {
  signedInAs = users.colleague

  const { body } = await request(`/engagements/${ownedByOwner.id}`)
  const serialized = JSON.stringify(body)

  for (const secret of [
    ownedByOwner.id,
    ownedByOwner.owningManagerId,
    ownedByOwner.workspaceId,
    ownedByOwner.organization.name,
  ]) {
    assert.equal(
      serialized.includes(secret),
      false,
      `a denial disclosed "${secret}"`,
    )
  }

  assert.deepEqual(body, { status: false, message: "auth.error.not_found" })
})

// --- Denied attempts are audited --------------------------------------------

test("a cross-owner denial appends a denied_permission audit entry", async () => {
  signedInAs = users.colleague

  await request(`/engagements/${ownedByOwner.id}`)

  assert.equal(auditEntries.length, 1)
  assert.deepEqual(
    {
      workspaceId: auditEntries[0]!.workspaceId,
      userId: auditEntries[0]!.userId,
      eventType: auditEntries[0]!.eventType,
    },
    {
      workspaceId: WORKSPACE,
      userId: users.colleague.id,
      eventType: "denied_permission",
    },
  )
  assert.equal(auditEntries[0]!.payload.action, "engagement.read")

  // The engagement was never read back — the scoped repository refused it — so
  // the relation stays empty and the identifier the Manager actually asked for
  // is what the entry carries.
  assert.equal(auditEntries[0]!.engagementId, null)
  assert.equal(auditEntries[0]!.payload.requestedEngagementId, ownedByOwner.id)
})

// --- Every denied attempt is recorded, resolvable identifier or not ----------
//
// The four attempts worth investigating are the ones whose identifier the
// caller's scope refuses to resolve. Writing one of them into the relational
// `engagementId` would be a foreign key to a row the caller may not read — or
// to no row at all — and the insert the architecture requires would be the one
// that fails.

const deniedAttempts: [string, () => void, string][] = [
  [
    "an engagement that does not exist",
    () => {
      signedInAs = users.owner
    },
    "eng_does_not_exist",
  ],
  [
    "an engagement in another workspace",
    () => {
      signedInAs = users.otherWorkspaceAdmin
    },
    ownedByOwner.id,
  ],
  [
    "an engagement owned by another manager",
    () => {
      signedInAs = users.colleague
    },
    ownedByOwner.id,
  ],
]

for (const [name, signIn, engagementId] of deniedAttempts) {
  test(`a denial naming ${name} is still recorded`, async () => {
    signIn()

    const { status } = await request(`/engagements/${engagementId}`)

    assert.equal(status, 404)
    assert.equal(auditEntries.length, 1, `nothing was recorded for ${name}`)
    assert.equal(auditEntries[0]!.eventType, "denied_permission")
    assert.equal(
      auditEntries[0]!.engagementId,
      null,
      "an unresolvable identifier was written to the relational column",
    )
    assert.equal(auditEntries[0]!.payload.requestedEngagementId, engagementId)
  })
}

test("a denial after an expired Discovery Access is recorded with the requested engagement", async () => {
  signedInAs = users.client
  discoveryAccessRows[0]!.expiresAt = new Date("2020-01-01T00:00:00.000Z")

  await request(`/portal/engagements/${ownedByOwner.id}/discovery`)

  assert.equal(auditEntries.length, 1)
  assert.equal(auditEntries[0]!.engagementId, null)
  assert.equal(auditEntries[0]!.payload.requestedEngagementId, ownedByOwner.id)
  assert.equal(auditEntries[0]!.payload.reason, "no_active_discovery_access")
})

test("a denial about an engagement that was read back keeps the relation", async () => {
  // A Client's own engagement is within their reach, so the workbench route
  // loads it and the policy then refuses on role. Here — and only here — the
  // foreign key is known to hold, so the entry is linked as well as described.
  signedInAs = users.client

  await request(`/engagements/${ownedByOwner.id}`)

  assert.equal(auditEntries.length, 1)
  assert.equal(auditEntries[0]!.engagementId, ownedByOwner.id)
  assert.equal(auditEntries[0]!.payload.requestedEngagementId, ownedByOwner.id)
  assert.equal(auditEntries[0]!.payload.reason, "role_not_permitted")
})

test("a rejected relation is retried without it rather than lost", async () => {
  // What a foreign-key violation would look like if one ever happened: the
  // entry still lands, carrying the attempted identifier, and says the relation
  // was dropped.
  signedInAs = users.client
  rejectAuditEntry = (entry) => entry.engagementId !== null

  const { status } = await request(`/engagements/${ownedByOwner.id}`)

  assert.equal(status, 404, "a failing audit write changed the answer")
  assert.equal(auditEntries.length, 1)
  assert.equal(auditEntries[0]!.engagementId, null)
  assert.equal(auditEntries[0]!.payload.requestedEngagementId, ownedByOwner.id)
  assert.equal(auditEntries[0]!.payload.engagementRelationDropped, true)
})

test("an audit trail that refuses everything does not change the refusal", async () => {
  signedInAs = users.colleague
  rejectAuditEntry = () => true

  const failing = await request(`/engagements/${ownedByOwner.id}`)

  rejectAuditEntry = () => false
  const working = await request(`/engagements/${ownedByOwner.id}`)

  assert.equal(failing.status, working.status)
  assert.deepEqual(failing.body, working.body)

  // And the loss is observable rather than silent.
  assert.ok(
    auditFailureLogs.some((line) => line.includes("AUDIT_APPEND_FAILED")),
    "a lost audit entry was swallowed without a trace",
  )
})

test("a cross-workspace denial is audited against the caller's own workspace", async () => {
  signedInAs = users.otherWorkspaceAdmin

  await request(`/engagements/${ownedByOwner.id}`)

  assert.equal(auditEntries.length, 1)
  assert.equal(
    auditEntries[0]!.workspaceId,
    OTHER_WORKSPACE,
    "a denial must not be recorded in the workspace it failed to reach",
  )
  assert.equal(auditEntries[0]!.eventType, "denied_permission")
})

test("a Client's denied workbench attempt is audited", async () => {
  signedInAs = users.client

  await request("/engagements")

  assert.equal(auditEntries.length, 1)
  assert.deepEqual(
    {
      eventType: auditEntries[0]!.eventType,
      role: auditEntries[0]!.payload.role,
      reason: auditEntries[0]!.payload.reason,
    },
    {
      eventType: "denied_permission",
      role: "CLIENT",
      reason: "role_not_permitted",
    },
  )
})

test("a revoked client's denied portal attempt is audited", async () => {
  signedInAs = users.client
  discoveryAccessRows[0]!.status = "revoked"

  await request(`/portal/engagements/${ownedByOwner.id}/discovery`)

  assert.equal(auditEntries.length, 1)
  assert.deepEqual(
    {
      eventType: auditEntries[0]!.eventType,
      engagementId: auditEntries[0]!.engagementId,
      requestedEngagementId: auditEntries[0]!.payload.requestedEngagementId,
      reason: auditEntries[0]!.payload.reason,
    },
    {
      eventType: "denied_permission",
      // Revoked access is decided without loading the engagement, so the
      // relation is empty and the attempted identifier is in the payload.
      engagementId: null,
      requestedEngagementId: ownedByOwner.id,
      reason: "no_active_discovery_access",
    },
  )
})

test("a permitted request appends no denial entry", async () => {
  signedInAs = users.administrator

  const { status } = await request(`/engagements/${ownedByOwner.id}`)

  assert.equal(status, 200)
  assert.deepEqual(
    auditEntries.filter((entry) => entry.eventType === "denied_permission"),
    [],
  )
})

// --- The Client lifecycle at the boundary ------------------------------------

test("a staff invitation cannot create a Client", async () => {
  signedInAs = users.administrator

  const { status, body } = await request("/auth/invitations", {
    method: "POST",
    body: { email: "client@example.com", role: "CLIENT" },
  })

  assert.equal(status, 400, "a CLIENT invitation was accepted")
  assert.equal(body.message, "auth.error.invalid_input")
})

test("a staff invitation for a Manager is accepted", async () => {
  signedInAs = users.administrator

  const { status } = await request("/auth/invitations", {
    method: "POST",
    body: { email: "new.manager@example.com", role: "MANAGER" },
  })

  assert.equal(status, 201)
})
