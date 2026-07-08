import { prisma } from "../lib/prisma.js"

import type { CreateOrganizationInput } from "../schemas/organization.schema.js"

// Persistence for the Organization grouping. Kept behind a repository so routes
// depend on this seam rather than Prisma directly (architecture.md §6). An
// Organization holds identity + context only and owns many Engagements.

export const createOrganization = async (input: CreateOrganizationInput) => {
  return prisma.organization.create({
    data: {
      name: input.name,
      industry: input.industry,
      companySize: input.companySize,
      geography: input.geography,
      notes: input.notes,
    },
  })
}

export const getOrganizations = async () => {
  return prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { engagements: true } },
    },
  })
}

export const getOrganizationById = async (id: string) => {
  return prisma.organization.findUnique({
    where: { id },
  })
}
