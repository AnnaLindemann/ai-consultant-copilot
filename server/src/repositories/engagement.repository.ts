import type { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"

import type {
  CreateEngagementInput,
  UpdateEngagementInput,
} from "../schemas/engagement.schema.js"

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
