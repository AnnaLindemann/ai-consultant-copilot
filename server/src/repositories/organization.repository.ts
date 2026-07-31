import { prisma } from "../lib/prisma.js"

import type { CreateOrganizationInput } from "../schemas/organization.schema.js"
import type { EngagementScope } from "./engagement.repository.js"

// Persistence for the Organization grouping. Kept behind a repository so routes
// depend on this seam rather than Prisma directly (architecture.md §6). An
// Organization holds identity + context only and owns many Engagements.

export const createOrganization = async (
  scope: EngagementScope,
  input: CreateOrganizationInput,
) => {
  return prisma.organization.create({
    data: {
      workspaceId: scope.workspaceId,
      name: input.name,
      industry: input.industry,
      companySize: input.companySize,
      geography: input.geography,
      notes: input.notes,
    },
  })
}

export const getOrganizations = async (scope: EngagementScope) => {
  return prisma.organization.findMany({
    where: { workspaceId: scope.workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { engagements: true } },
    },
  })
}

// The scope is required, as it is for every engagement-side read: an
// Organization in another workspace is not fetchable by identifier
// (coding-standards.md §6A).
export const getOrganizationById = async (
  id: string,
  scope: EngagementScope,
) => {
  return prisma.organization.findFirst({
    where: { id, workspaceId: scope.workspaceId },
  })
}
