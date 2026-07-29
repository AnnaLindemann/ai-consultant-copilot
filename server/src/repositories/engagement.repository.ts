import type { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"

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

// Persistence for the Engagement aggregate — the single engagement store that
// later phases attach their stage content to, not a parallel store (roadmap
// Phase 1; architecture.md §6). Kept behind a repository so routes depend on
// this seam rather than Prisma directly.

// An engagement loaded together with its owning Organization, so the company
// identity/context is available to read views and to the analysis prompt.
export type EngagementWithOrganization = Prisma.EngagementGetPayload<{
  include: { organization: true }
}>

export const createEngagement = async (input: CreateEngagementInput) => {
  const { organizationId, ...content } = input

  return prisma.engagement.create({
    data: {
      organization: { connect: { id: organizationId } },
      ...content,
    },
    include: { organization: true },
  })
}

export const getEngagements = async () => {
  return prisma.engagement.findMany({
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

export const getEngagementsByOrganizationId = async (organizationId: string) => {
  return prisma.engagement.findMany({
    where: { organizationId },
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
// for feeding the analysis prompt.
export const getEngagementById = async (
  id: string,
): Promise<EngagementWithOrganization | null> => {
  return prisma.engagement.findUnique({
    where: { id },
    include: { organization: true },
  })
}

// Save an engagement: persist a subset of its content and/or its stage marker.
// Undefined fields are left untouched, so a partial save never clears state.
export const updateEngagement = async (
  id: string,
  input: UpdateEngagementInput,
) => {
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
  discoveryProfile: DiscoveryProfile,
  workflow: {
    status: DiscoveryStatus
    contentProvenance: DiscoveryContentProvenance
  },
) => {
  const { valueMeasurementBaseline, ...profileColumns } = discoveryProfile

  return prisma.engagement.update({
    where: { id },
    data: {
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
  workflow: {
    status: DiscoveryStatus
    submittedAt?: Date
    submittedBy?: DiscoveryActor
    reviewedAt?: Date
    returnNotes?: string
  },
) => {
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
// move as one so a stored Assessment is never left without its review state.
export const updateEngagementAssessment = async (
  id: string,
  assessment: Assessment,
  reviewState: AssessmentReviewState,
) => {
  return prisma.engagement.update({
    where: { id },
    data: {
      assessment: assessment as Prisma.InputJsonValue,
      assessmentReviewState: reviewState,
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

const toStringList = (value: Prisma.JsonValue | null): string[] =>
  (value ?? []) as string[]
