import assert from "node:assert/strict"
import http from "node:http"
import { after, beforeEach, mock, test } from "node:test"

import express from "express"

import type { DiscoveryTransitionFailure } from "../services/discovery.service.js"

type RouteMockEngagement = {
  id: string
  workspaceId: string
  owningManagerId: string
  organization: { id: string; name: string; industry: string | null }
}

const engagement: RouteMockEngagement = {
  id: "eng_1",
  workspaceId: "ws_1",
  owningManagerId: "user_1",
  organization: {
    id: "org_1",
    name: "Example Org",
    industry: null,
  },
}

// The acting user is established at the boundary and passed inward; these tests
// exercise the transition outcomes with the real AccessPolicy in the loop.
const actingUser = {
  id: "user_1",
  workspaceId: "ws_1",
  role: "ADMIN" as const,
  email: "admin@example.com",
  displayName: "Admin",
}

let transitionResult:
  | {
      success: true
      engagement: RouteMockEngagement
    }
  | {
      success: false
      failure: DiscoveryTransitionFailure
      messageId: string
      messageParams: Record<string, string>
      unexplainedBaselineSubjects?: string[]
    }

mock.module("../repositories/engagement.repository.js", {
  namedExports: {
    engagementScopeWhere: () => ({}),
    createEngagement: async () => engagement,
    getEngagementById: async (id: string) =>
      id === engagement.id ? engagement : null,
    getEngagements: async () => [],
    toDiscoveryProfile: () => ({}),
    toDiscoveryWorkflowState: () => ({}),
    updateEngagement: async () => engagement,
  },
})

mock.module("../lib/prisma.js", {
  namedExports: {
    prisma: {},
  },
})

mock.module("../lib/auth-context.js", {
  namedExports: {
    requireActingUser: async () => actingUser,
  },
})

mock.module("../repositories/access.repository.js", {
  namedExports: {
    appendAuditTrail: async () => ({}),
    getDiscoveryAccessForClient: async () => null,
    getActiveDiscoveryAccessByEngagement: async () => null,
    createNotification: async () => ({}),
  },
})

mock.module("../repositories/organization.repository.js", {
  namedExports: {
    getOrganizationById: async () => engagement.organization,
  },
})

mock.module("../repositories/analysis-run.repository.js", {
  namedExports: {
    getAnalysisRunsByEngagementId: async () => [],
    createAnalysisRun: async () => ({}),
  },
})

mock.module("../services/discovery.service.js", {
  namedExports: {
    saveDiscoveryProfile: async () => engagement,
    transitionDiscovery: async () => transitionResult,
  },
})

mock.module("../services/analysis.service.js", {
  namedExports: {
    analyzeEngagement: async () => ({ success: true, report: {}, evaluation: {} }),
  },
})

mock.module("../services/assessment.service.js", {
  namedExports: {
    generateAssessment: async () => ({
      success: true,
      assessment: {},
      reviewState: "consultant_edited",
      evaluation: {},
    }),
    saveAssessment: async () => engagement,
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
    saveOpportunities: async () => engagement,
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

const { default: router } = await import("./engagements.js")

const app = express()
app.use(express.json())
app.use("/engagements", router)

const server = await new Promise<http.Server>((resolve) => {
  resolve(app.listen(0))
})

const baseUrl = (() => {
  const address = server.address()

  assert.ok(address && typeof address === "object", "test server did not start")

  return `http://127.0.0.1:${address.port}`
})()

after(() => {
  server.close()
})

beforeEach(() => {
  transitionResult = {
    success: false,
    failure: "actor_not_permitted",
    messageId: "discovery.error.actor_not_permitted",
    messageParams: { actor: "client", transition: "accept" },
  }
})

test("Discovery transition validation returns a structured identifier", async () => {
  const response = await fetch(`${baseUrl}/engagements/eng_1/discovery/return`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor: "consultant" }),
  })
  const body = (await response.json()) as {
    status: boolean
    message: string
    errors?: { fieldErrors?: Record<string, string[]> }
  }

  assert.equal(response.status, 400)
  assert.equal(body.status, false)
  assert.equal(body.message, "discovery.error.invalid_transition_input")
  assert.ok(body.errors?.fieldErrors?.notes?.length)
})

test("Discovery transition refusals return identifiers and params", async () => {
  const response = await fetch(`${baseUrl}/engagements/eng_1/discovery/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor: "client" }),
  })
  const body = (await response.json()) as {
    status: boolean
    message: string
    data?: {
      failure: DiscoveryTransitionFailure
      messageParams: Record<string, string>
    }
  }

  assert.equal(response.status, 403)
  assert.equal(body.status, false)
  assert.equal(body.message, "discovery.error.actor_not_permitted")
  assert.deepEqual(body.data?.messageParams, {
    actor: "client",
    transition: "accept",
  })
})

test("Discovery baseline refusals return identifiers and the unexplained subjects", async () => {
  transitionResult = {
    success: false,
    failure: "baseline_not_explained",
    messageId: "discovery.error.baseline_not_explained",
    messageParams: { subjectCount: "2" },
    unexplainedBaselineSubjects: ["business_impact", "error_frequency"],
  }

  const response = await fetch(`${baseUrl}/engagements/eng_1/discovery/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor: "consultant" }),
  })
  const body = (await response.json()) as {
    status: boolean
    message: string
    data?: {
      failure: DiscoveryTransitionFailure
      messageParams: Record<string, string>
      unexplainedBaselineSubjects: string[]
    }
  }

  assert.equal(response.status, 422)
  assert.equal(body.status, false)
  assert.equal(body.message, "discovery.error.baseline_not_explained")
  assert.deepEqual(body.data?.messageParams, { subjectCount: "2" })
  assert.deepEqual(body.data?.unexplainedBaselineSubjects, [
    "business_impact",
    "error_frequency",
  ])
})
