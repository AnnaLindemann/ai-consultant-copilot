import assert from "node:assert/strict"
import { after, beforeEach, mock, test } from "node:test"

import express from "express"

import { compliancePolicyRepositoryMock } from "../domain/compliance/compliance-policy.fixture.js"
import { getDefaultLlmConfig } from "../lib/llm-config.js"

// The provider/model this deployment is configured to call. Named through the
// configuration rather than as a literal, so these authorization cases keep
// testing *who may approve a model* rather than which model happens to be the
// current default (audit §12).
const configuredLlm = getDefaultLlmConfig()


// The access-control gate over the Security, Privacy & AI Compliance surface
// (implementation-workflow §13.6a): the phase adds reachable data, so its
// isolation is proven by the **denials**, through the real routes, the real
// AccessPolicy, and the real workspace-scoped reach rule.
//
// What each test proves: a Manager cannot configure the workspace's policy,
// read the workspace-wide dashboard, export a client's data or erase it; a
// Manager cannot reach a colleague's engagement or another workspace's, by any
// of these routes; a Client reaches none of it; an unauthenticated caller
// reaches nothing; and every denial appends to the append-only Audit Trail.

type Row = {
  id: string
  workspaceId: string
  owningManagerId: string
  dataClassification: string
  aiProcessingPermission: string
  aiProcessingPermissionNotes: string | null
  aiProcessingPermissionUpdatedAt: Date | null
  aiProcessingPermissionUpdatedByUserId: string | null
  processingPurpose: string | null
  legalBasis: string
  legalBasisNote: string | null
  privacyProcessingConfirmedAt: Date | null
  privacyProcessingConfirmedByUserId: string | null
  dpiaScreening: string
  dpiaScreeningNote: string | null
  legalHold: boolean
  legalHoldReason: string | null
  organization: { id: string; name: string; industry: string | null }
}

const WORKSPACE = "ws_1"
const OTHER_WORKSPACE = "ws_2"

const engagementRow = (overrides: Partial<Row>): Row => ({
  id: "eng_owner",
  workspaceId: WORKSPACE,
  owningManagerId: "user_owner",
  dataClassification: "confidential",
  aiProcessingPermission: "allowed",
  aiProcessingPermissionNotes: null,
  aiProcessingPermissionUpdatedAt: null,
  aiProcessingPermissionUpdatedByUserId: null,
  processingPurpose: null,
  legalBasis: "not_assessed",
  legalBasisNote: null,
  privacyProcessingConfirmedAt: null,
  privacyProcessingConfirmedByUserId: null,
  dpiaScreening: "not_assessed",
  dpiaScreeningNote: null,
  legalHold: false,
  legalHoldReason: null,
  organization: { id: "org_1", name: "Example Org", industry: null },
  ...overrides,
})

const ownedByOwner = engagementRow({})
const ownedByColleague = engagementRow({
  id: "eng_colleague",
  owningManagerId: "user_colleague",
})
const inOtherWorkspace = engagementRow({
  id: "eng_other_workspace",
  workspaceId: OTHER_WORKSPACE,
  owningManagerId: "user_other_owner",
})

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

let signedInAs: (typeof users)[keyof typeof users] | null = users.administrator
let auditEntries: { eventType: string; payload: Record<string, unknown> }[] = []

// The real repository reach rule, applied to the fake store.
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
      return false
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
  },
})

mock.module("../repositories/access.repository.js", {
  namedExports: {
    appendAuditTrail: async (entry: {
      eventType: string
      payload: Record<string, unknown>
    }) => {
      auditEntries.push(entry)
      return entry
    },
    getDiscoveryAccessForClient: async () => null,
  },
})

mock.module("../repositories/compliance.repository.js", {
  namedExports: {
    ...compliancePolicyRepositoryMock(),
    updateEngagementCompliance: async () => true,
    readEngagementForExport: async (id: string) => {
      const row = ENGAGEMENTS.find((engagement) => engagement.id === id)
      return row && withinReach(row)
        ? { ...row, organizationId: "org_1", reportVersions: [], analysisRuns: [] }
        : null
    },
    deleteEngagementPermanently: async () => true,
  },
})

mock.module("../repositories/consultant-report-version.repository.js", {
  namedExports: {
    getReportPdfArtifactBytes: async () => null,
  },
})

const { default: complianceRouter } = await import("./compliance.js")

const app = express()
app.use(express.json())
app.use("/compliance", complianceRouter)

const server = app.listen(0)

const baseUrl = (() => {
  const address = server.address()
  assert.ok(address && typeof address === "object", "test server did not start")
  return `http://127.0.0.1:${address.port}`
})()

after(() => server.close())

beforeEach(() => {
  signedInAs = users.administrator
  auditEntries = []
  process.env.LLM_PROVIDER = configuredLlm.provider
  process.env.LLM_MODEL = configuredLlm.model
  process.env.DOCUMENT_ACCESS_SECRET = "test-document-access-secret"
})

const request = async (
  path: string,
  call: { method?: string; body?: unknown } = {},
) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: call.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: call.body === undefined ? undefined : JSON.stringify(call.body),
  })

  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as {
      status?: boolean
      message?: string
      data?: Record<string, unknown>
    },
  }
}

test("an unauthenticated caller reaches no compliance surface", async () => {
  signedInAs = null

  for (const path of [
    "/compliance/policy",
    "/compliance/dashboard",
    "/compliance/engagements/eng_owner",
  ]) {
    const response = await request(path)
    assert.equal(response.status, 401, `${path} answered an unauthenticated caller`)
  }
})

test("a Manager may read the policy but may not configure it", async () => {
  signedInAs = users.owner

  const read = await request("/compliance/policy")
  assert.equal(read.status, 200)

  const write = await request("/compliance/policy", {
    method: "PATCH",
    body: { aiProcessingPermitted: false },
  })
  assert.equal(write.status, 403)
  assert.equal(write.body.message, "auth.error.forbidden")

  // The denial is in the append-only Audit Trail.
  assert.equal(
    auditEntries.some(
      (entry) =>
        entry.eventType === "denied_permission" &&
        entry.payload.action === "compliance.policy.manage",
    ),
    true,
  )
})

test("a Manager may not read the workspace-wide Compliance Dashboard", async () => {
  signedInAs = users.owner

  const response = await request("/compliance/dashboard")

  assert.equal(response.status, 403)
  assert.equal(
    auditEntries.some(
      (entry) => entry.payload.action === "compliance.dashboard.read",
    ),
    true,
  )
})

test("new workspace compliance controls are Administrator-only", async () => {
  signedInAs = users.owner

  const attempts: { path: string; method?: string; body?: unknown }[] = [
    { path: "/compliance/dpia" },
    {
      path: "/compliance/dpia",
      method: "PATCH",
      body: { status: "approved" },
    },
    { path: "/compliance/ai-model-approvals" },
    {
      path: "/compliance/ai-model-approvals",
      method: "POST",
      body: {
        provider: configuredLlm.provider,
        model: configuredLlm.model,
        status: "approved",
        dpaStatus: "in_place",
        promptRetention: "not_retained",
        trainingUse: "excluded",
      },
    },
    { path: "/compliance/retention/preview" },
    {
      path: "/compliance/retention/execute",
      method: "POST",
      body: { categories: ["documents"], confirm: "execute_retention" },
    },
    {
      path: "/compliance/identifier-rules/preview",
      method: "POST",
      body: { text: "anna@example.com" },
    },
  ]

  for (const attempt of attempts) {
    const response = await request(attempt.path, {
      method: attempt.method ?? "GET",
      body: attempt.body,
    })

    assert.equal(response.status, 403, `${attempt.path} reached a Manager`)
  }
})

test("an Administrator can reach the new workspace compliance controls", async () => {
  signedInAs = users.administrator

  assert.equal((await request("/compliance/dpia")).status, 200)
  assert.equal(
    (
      await request("/compliance/dpia", {
        method: "PATCH",
        body: { status: "approved", documentReference: "dpia-2026" },
      })
    ).status,
    200,
  )
  assert.equal((await request("/compliance/ai-model-approvals")).status, 200)
  assert.equal(
    (
      await request("/compliance/ai-model-approvals", {
        method: "POST",
        body: {
          provider: configuredLlm.provider,
          model: configuredLlm.model,
          status: "approved",
          dpaStatus: "in_place",
          promptRetention: "not_retained",
          trainingUse: "excluded",
        },
      })
    ).status,
    201,
  )
  assert.equal((await request("/compliance/retention/preview")).status, 200)
  assert.equal(
    (
      await request("/compliance/retention/execute", {
        method: "POST",
        body: { categories: ["documents"], confirm: "execute_retention" },
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await request("/compliance/identifier-rules/preview", {
        method: "POST",
        body: { text: "anna@example.com" },
      })
    ).body.data?.matches instanceof Array,
    true,
  )
})

test("a Client reaches no compliance surface at all", async () => {
  signedInAs = users.client

  assert.equal((await request("/compliance/policy")).status, 403)
  assert.equal((await request("/compliance/dashboard")).status, 403)
  // A refusal about a named resource is disclosed exactly as a missing one.
  assert.equal(
    (await request("/compliance/engagements/eng_owner")).status,
    404,
  )
})

test("a Manager classifies their own engagement and not a colleague's", async () => {
  signedInAs = users.owner

  const own = await request("/compliance/engagements/eng_owner", {
    method: "PATCH",
    body: { dataClassification: "strictly_confidential" },
  })
  assert.equal(own.status, 200)
  assert.equal(
    auditEntries.some(
      (entry) => entry.eventType === "engagement_classification_changed",
    ),
    true,
  )

  // A colleague's engagement is refused exactly as a missing one is — the same
  // status, the same body, so the response cannot be used to discover that it
  // exists.
  const colleague = await request("/compliance/engagements/eng_colleague", {
    method: "PATCH",
    body: { dataClassification: "public" },
  })
  const missing = await request("/compliance/engagements/eng_nonexistent", {
    method: "PATCH",
    body: { dataClassification: "public" },
  })

  assert.equal(colleague.status, 404)
  assert.deepEqual(colleague.body, missing.body)
})

test("privacy and DPIA screening have dedicated engagement routes", async () => {
  signedInAs = users.owner

  const privacy = await request(
    "/compliance/engagements/eng_owner/privacy-processing",
    {
      method: "PATCH",
      body: {
        processingPurpose: "Assess support processes",
        legalBasis: "contract",
        legalBasisNote: "DPA section 4",
      },
    },
  )
  assert.equal(privacy.status, 200)

  const dpia = await request("/compliance/engagements/eng_owner/dpia-screening", {
    method: "PATCH",
    body: {
      dpiaScreening: "additional_not_required",
      dpiaScreeningNote: "standard operation",
    },
  })
  assert.equal(dpia.status, 200)
})

test("a Manager cannot fabricate GDPR consent", async () => {
  signedInAs = users.owner

  const response = await request("/compliance/engagements/eng_owner/consents", {
    method: "POST",
    body: {
      subjectName: "Client Contact",
      consentText: "Consent text",
      consentTextVersion: "v1",
      processingPurpose: "Assess support processes",
    },
  })

  assert.equal(response.status, 404)
})

test("GDPR consent is recorded only when the engagement basis is consent", async () => {
  signedInAs = users.administrator

  const refused = await request("/compliance/engagements/eng_owner/consents", {
    method: "POST",
    body: {
      subjectName: "Client Contact",
      consentText: "Consent text",
      consentTextVersion: "v1",
      processingPurpose: "Assess support processes",
    },
  })
  assert.equal(refused.status, 409)
  assert.equal(
    refused.body.message,
    "compliance.error.consent_requires_consent_basis",
  )

  const consentEngagement = engagementRow({
    id: "eng_consent",
    legalBasis: "consent",
  })
  ENGAGEMENTS.push(consentEngagement)

  try {
    const recorded = await request("/compliance/engagements/eng_consent/consents", {
      method: "POST",
      body: {
        subjectName: "Client Contact",
        consentText: "Consent text",
        consentTextVersion: "v1",
        processingPurpose: "Assess support processes",
      },
    })
    assert.equal(recorded.status, 201)
    assert.equal(recorded.body.message, "compliance.message.consent_recorded")
  } finally {
    ENGAGEMENTS.pop()
  }
})

test("an Administrator reaches no engagement in another workspace", async () => {
  signedInAs = users.otherWorkspaceAdmin

  const attempts: { path: string; method: string; body?: unknown }[] = [
    { path: "/compliance/engagements/eng_owner", method: "GET" },
    { path: "/compliance/engagements/eng_owner/export", method: "POST" },
    {
      path: "/compliance/engagements/eng_owner/erasure",
      method: "POST",
      body: { confirmEngagementId: "eng_owner", reason: "test" },
    },
  ]

  for (const attempt of attempts) {
    const response = await request(attempt.path, {
      method: attempt.method,
      body: attempt.body,
    })

    assert.equal(
      response.status,
      404,
      `${attempt.path} crossed a workspace boundary`,
    )
  }
})

test("exporting and erasing a client's record are the Administrator's alone", async () => {
  signedInAs = users.owner

  const exported = await request("/compliance/engagements/eng_owner/export", {
    method: "POST",
  })
  assert.equal(exported.status, 404)

  const erased = await request("/compliance/engagements/eng_owner/erasure", {
    method: "POST",
    body: { confirmEngagementId: "eng_owner", reason: "client asked" },
  })
  assert.equal(erased.status, 404)

  for (const action of [
    "compliance.export_client_data",
    "compliance.erase_client_data",
  ]) {
    assert.equal(
      auditEntries.some((entry) => entry.payload.action === action),
      true,
      `${action} was not audited as a denial`,
    )
  }
})

test("a legal hold refuses erasure and the refusal is not a silent success", async () => {
  signedInAs = users.administrator

  const held = engagementRow({ id: "eng_held", legalHold: true })
  ENGAGEMENTS.push(held)

  try {
    const response = await request("/compliance/engagements/eng_held/erasure", {
      method: "POST",
      body: { confirmEngagementId: "eng_held", reason: "client asked" },
    })

    assert.equal(response.status, 409)
    assert.equal(response.body.message, "compliance.error.legal_hold_active")
  } finally {
    ENGAGEMENTS.pop()
  }
})

test("an erasure whose confirmation does not match the engagement is refused", async () => {
  const response = await request("/compliance/engagements/eng_owner/erasure", {
    method: "POST",
    body: { confirmEngagementId: "eng_colleague", reason: "typo" },
  })

  assert.equal(response.status, 400)
  assert.equal(response.body.message, "compliance.error.confirmation_mismatch")
})

test("a signed download link is refused when it names somebody else", async () => {
  const { issueDocumentAccessToken } = await import(
    "../lib/document-access-token.js"
  )

  const token = issueDocumentAccessToken(
    {
      workspaceId: WORKSPACE,
      engagementId: ownedByOwner.id,
      reportVersionId: "ver_1",
      userId: users.owner.id,
    },
    15,
  )!

  // Presented by the Administrator, who is not who the link was issued to.
  signedInAs = users.administrator

  const response = await request(
    `/compliance/documents/download?token=${encodeURIComponent(token)}`,
  )

  assert.equal(response.status, 403)
  assert.equal(response.body.message, "compliance.error.download_link_invalid")
})

test("a signed download link cannot reach another workspace's document", async () => {
  const { issueDocumentAccessToken } = await import(
    "../lib/document-access-token.js"
  )

  // A link the other workspace's administrator forged for themselves, naming
  // this workspace's engagement. The claims are refused before the artifact is
  // read: a token narrows reach, it never widens it.
  const token = issueDocumentAccessToken(
    {
      workspaceId: WORKSPACE,
      engagementId: ownedByOwner.id,
      reportVersionId: "ver_1",
      userId: users.otherWorkspaceAdmin.id,
    },
    15,
  )!

  signedInAs = users.otherWorkspaceAdmin

  const response = await request(
    `/compliance/documents/download?token=${encodeURIComponent(token)}`,
  )

  assert.equal(response.status, 403)
})
