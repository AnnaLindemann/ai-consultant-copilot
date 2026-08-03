import type { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"

import type { DatabaseClient } from "../lib/prisma.js"
import type {
  CreateEngagementInput,
  UpdateEngagementInput,
} from "../schemas/engagement.schema.js"
import {
  emptyValueMeasurementBaseline,
  type DiscoveryGap,
  type DiscoveryProfile,
  type ValueMeasurementBaseline,
} from "../../../shared/discovery-profile.schema.js"
import {
  emptyDiscoveryContentProvenance,
  type DiscoveryActor,
  type DiscoveryContentProvenance,
  type DiscoveryStatus,
  type DiscoveryWorkflowState,
} from "../../../shared/discovery-workflow.schema.js"
import type {
  Assessment,
  AssessmentReviewState,
} from "../../../shared/assessment.schema.js"
import {
  engagementReach,
  type EngagementScope,
} from "../domain/access/access.js"

// Persistence for the Engagement aggregate — the single engagement store that
// later phases attach their stage content to, not a parallel store (roadmap
// Phase 1; architecture.md §6). Kept behind a repository so routes depend on
// this seam rather than Prisma directly.

// An engagement loaded together with its owning Organization, so the company
// identity/context is available to read views and to the analysis prompt.
export type EngagementWithOrganization = Prisma.EngagementGetPayload<{
  include: { organization: true }
}>

// The workspace-and-ownership scope. It is a **required** parameter of every
// operation below, so no code path can read or write engagement-side data
// without it — isolation is a structural property here rather than something
// each service must remember (architecture.md §7A.4; coding-standards.md §6A).
// The scope type and the reach rule live in the domain, so the reach a query
// gets and the reach the AccessPolicy grants cannot drift apart.
export type { EngagementScope }

// Translate the domain's reach into a Prisma filter. A Client's reach is their
// own active, unexpired Discovery Access, so revocation and expiry end their
// reach in the query itself and not only in the policy check above it.
//
// Exported so a repository for something an engagement *owns* — the Opportunity
// versions — scopes its rows through the owning engagement with this same
// filter, rather than writing a second, drifting version of the reach rule.
export const engagementScopeWhere = (
  scope: EngagementScope,
  now: Date = new Date(),
): Prisma.EngagementWhereInput => {
  const reach = engagementReach(scope)

  switch (reach.kind) {
    case "whole_workspace":
      return { workspaceId: reach.workspaceId }
    case "owned_engagements":
      return {
        workspaceId: reach.workspaceId,
        owningManagerId: reach.owningManagerId,
      }
    case "granted_discovery":
      return {
        workspaceId: reach.workspaceId,
        discoveryAccesses: {
          some: {
            userId: reach.clientUserId,
            workspaceId: reach.workspaceId,
            status: "active",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      }
  }
}

const assertEngagementInScope = async (id: string, scope: EngagementScope) => {
  const engagement = await prisma.engagement.findFirst({
    where: { id, ...engagementScopeWhere(scope) },
    select: { id: true },
  })

  if (!engagement) {
    throw new Error("Engagement not found")
  }
}

export const createEngagement = async (
  scope: EngagementScope,
  input: CreateEngagementInput,
) => {
  const { organizationId, ...content } = input

  return prisma.engagement.create({
    data: {
      workspaceId: scope.workspaceId,
      owningManagerId: scope.userId,
      organizationId,
      ...content,
    },
    include: { organization: true },
  })
}

export const getEngagements = async (scope: EngagementScope) => {
  return prisma.engagement.findMany({
    where: engagementScopeWhere(scope),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      stage: true,
      createdAt: true,
      updatedAt: true,
      organization: {
        select: { id: true, name: true, industry: true },
      },
    },
  })
}

export const getEngagementsByOrganizationId = async (
  scope: EngagementScope,
  organizationId: string,
) => {
  return prisma.engagement.findMany({
    where: { ...engagementScopeWhere(scope), organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      stage: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

// Full engagement state (with its organization) for resuming an engagement and
// for feeding the analysis prompt. The scope is required: there is no unscoped
// way to fetch an engagement by identifier, which is what stops a direct-id
// request from crossing a workspace or ownership boundary.
export const getEngagementById = async (
  id: string,
  scope: EngagementScope,
  client: DatabaseClient = prisma,
): Promise<EngagementWithOrganization | null> => {
  return client.engagement.findFirst({
    where: { id, ...engagementScopeWhere(scope) },
    include: { organization: true },
  })
}


// Save an engagement: persist a subset of its content and/or its stage marker.
// Undefined fields are left untouched, so a partial save never clears state.
export const updateEngagement = async (
  id: string,
  scope: EngagementScope,
  input: UpdateEngagementInput,
) => {
  await assertEngagementInScope(id, scope)
  return prisma.engagement.update({
    where: { id },
    data: input,
    include: { organization: true },
  })
}

// Persist the complete Discovery Profile as one re-entrant stage update,
// together with what the save did to the review workflow. The fields remain on
// the Engagement aggregate; this is not a second state store. Content and its
// provenance move in one write, so a saved fact is never left unattributed.
export const updateEngagementDiscovery = async (
  id: string,
  scope: EngagementScope,
  discoveryProfile: DiscoveryProfile,
  workflow: {
    status: DiscoveryStatus
    contentProvenance: DiscoveryContentProvenance
  },
) => {
  const { valueMeasurementBaseline, ...profileColumns } = discoveryProfile

  await assertEngagementInScope(id, scope)
  return prisma.engagement.update({
    where: { id },
    data: {
      workspaceId: scope.workspaceId,
      ...profileColumns,
      valueMeasurementBaseline:
        valueMeasurementBaseline as unknown as Prisma.InputJsonValue,
      discoveryStatus: workflow.status,
      discoveryContentProvenance:
        workflow.contentProvenance as unknown as Prisma.InputJsonValue,
    },
    include: { organization: true },
  })
}

// Persist a Discovery review workflow transition. It touches no content
// column: submitting, returning, accepting, and reopening move where discovery
// stands, never what it says (architecture.md §7A.6).
export const updateEngagementDiscoveryWorkflow = async (
  id: string,
  scope: EngagementScope,
  workflow: {
    status: DiscoveryStatus
    submittedAt?: Date
    submittedBy?: DiscoveryActor
    reviewedAt?: Date
    returnNotes?: string
  },
) => {
  await assertEngagementInScope(id, scope)
  return prisma.engagement.update({
    where: { id },
    data: {
      discoveryStatus: workflow.status,
      discoverySubmittedAt: workflow.submittedAt,
      discoverySubmittedBy: workflow.submittedBy,
      discoveryReviewedAt: workflow.reviewedAt,
      discoveryReturnNotes: workflow.returnNotes,
    },
    include: { organization: true },
  })
}

// Persist the Assessment together with where it stands in review. Both fields
// move as one so a stored Assessment is never left without its review state,
// and the revision counter moves with them so a reader can say which Assessment
// a derived stage was prioritized from.
export const updateEngagementAssessment = async (
  id: string,
  scope: EngagementScope,
  assessment: Assessment,
  reviewState: AssessmentReviewState,
) => {
  await assertEngagementInScope(id, scope)
  return prisma.engagement.update({
    where: { id },
    data: {
      assessment: assessment as Prisma.InputJsonValue,
      assessmentReviewState: reviewState,
      assessmentRevision: { increment: 1 },
    },
    include: { organization: true },
  })
}

// Translate the persisted row into the Discovery Profile domain type. The Json
// columns were written from validated profiles, and Decimal budgets come back
// from Prisma as an object, so they are converted to the domain's plain number.
export const toDiscoveryProfile = (
  engagement: EngagementWithOrganization,
): DiscoveryProfile => ({
  department: engagement.department,

  statedProblem: engagement.statedProblem,
  painPoints: toStringList(engagement.painPoints),
  affectedUsers: toStringList(engagement.affectedUsers),
  businessImpact: engagement.businessImpact,
  urgency: engagement.urgency,

  currentProcess: engagement.currentProcess,
  processSteps: toStringList(engagement.processSteps),
  processFrequency: engagement.processFrequency,
  manualWorkLevel: engagement.manualWorkLevel,
  bottlenecks: toStringList(engagement.bottlenecks),

  currentTools: toStringList(engagement.currentTools),
  communicationChannels: toStringList(engagement.communicationChannels),
  integrationNeeds: toStringList(engagement.integrationNeeds),

  dataTypes: toStringList(engagement.dataTypes),
  dataLocation: toStringList(engagement.dataLocation),
  dataAvailability: engagement.dataAvailability,
  dataQuality: engagement.dataQuality,
  sensitiveData: engagement.sensitiveData,
  sensitiveDataTypes: toStringList(engagement.sensitiveDataTypes),

  gdprConcerns: engagement.gdprConcerns,
  budgetAmount:
    engagement.budgetAmount === null ? null : Number(engagement.budgetAmount),
  budgetCurrency: engagement.budgetCurrency,
  budgetNotes: engagement.budgetNotes,
  timeline: engagement.timeline,
  humanApprovalRequired: engagement.humanApprovalRequired,
  technicalConstraints: toStringList(engagement.technicalConstraints),

  desiredOutcome: engagement.desiredOutcome,
  successMetrics: toStringList(engagement.successMetrics),
  mvpScope: engagement.mvpScope,
  notes: engagement.notes,

  // An engagement saved before the Phase 2 Extension has no baseline column
  // yet; it resumes as "nothing quantitative captured", never as broken state.
  valueMeasurementBaseline:
    (engagement.valueMeasurementBaseline as ValueMeasurementBaseline | null) ??
    emptyValueMeasurementBaseline(),

  missingInformation: (engagement.missingInformation ?? []) as DiscoveryGap[],
})

// Translate the persisted row into the Discovery review workflow state — where
// discovery stands and who contributed which section of it.
export const toDiscoveryWorkflowState = (
  engagement: EngagementWithOrganization,
): DiscoveryWorkflowState => ({
  status: engagement.discoveryStatus,
  submittedAt: engagement.discoverySubmittedAt?.toISOString() ?? null,
  submittedBy: engagement.discoverySubmittedBy,
  reviewedAt: engagement.discoveryReviewedAt?.toISOString() ?? null,
  returnNotes: engagement.discoveryReturnNotes,
  contentProvenance:
    (engagement.discoveryContentProvenance as DiscoveryContentProvenance | null) ??
    emptyDiscoveryContentProvenance(),
})

// Translate the persisted Assessment into its domain type. The column was
// written from validated content, and an engagement that has not reached the
// stage yet reads back as "nothing produced yet" rather than as an empty shell
// that would have to be told apart from a real one.
export const toAssessment = (
  engagement: EngagementWithOrganization,
): Assessment | null => (engagement.assessment as Assessment | null) ?? null

const toStringList = (value: Prisma.JsonValue | null): string[] =>
  (value ?? []) as string[]
