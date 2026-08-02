import { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"
import { engagementScopeWhere } from "./engagement.repository.js"

import type { EngagementScope } from "../domain/access/access.js"
import type {
  Roadmap,
  RoadmapReviewState,
  RoadmapVersionDetail,
  RoadmapVersionSummary,
} from "../../../shared/implementation-roadmap.schema.js"

type RoadmapVersionRow = Prisma.ImplementationRoadmapVersionGetPayload<{
  include: {
    createdBy: { select: { id: true; displayName: true; email: true } }
    lastModifiedBy: { select: { id: true; displayName: true; email: true } }
  }
}>

const withActors = {
  createdBy: { select: { id: true, displayName: true, email: true } },
  lastModifiedBy: { select: { id: true, displayName: true, email: true } },
} as const

const UNIQUE_VIOLATION = "P2002"

export type CreateRoadmapVersionInput = {
  workspaceId: string
  engagementId: string
  roadmap: Roadmap
  sourceRecommendationVersionId: string
  sourceRecommendationVersionNumber: number
  sourceRecommendationFingerprint: string
  createdByUserId: string
}

export type CreateRoadmapVersionResult =
  | { created: true; version: RoadmapVersionDetail }
  | { created: false; reason: "version_conflict" }

export const createRoadmapVersion = async (
  scope: EngagementScope,
  input: CreateRoadmapVersionInput,
): Promise<CreateRoadmapVersionResult> => {
  await assertEngagementInScope(input.engagementId, scope)

  try {
    const version = await prisma.$transaction(async (tx) => {
      const highest = await tx.implementationRoadmapVersion.findFirst({
        where: { engagementId: input.engagementId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      })

      await tx.implementationRoadmapVersion.updateMany({
        where: { engagementId: input.engagementId, status: "active" },
        data: { status: "superseded" },
      })

      return tx.implementationRoadmapVersion.create({
        data: {
          workspaceId: input.workspaceId,
          engagementId: input.engagementId,
          versionNumber: (highest?.versionNumber ?? 0) + 1,
          status: "active",
          content: input.roadmap as unknown as Prisma.InputJsonValue,
          reviewState: "ai_draft",
          sourceRecommendationVersionId: input.sourceRecommendationVersionId,
          sourceRecommendationVersionNumber:
            input.sourceRecommendationVersionNumber,
          sourceRecommendationFingerprint:
            input.sourceRecommendationFingerprint,
          createdByUserId: input.createdByUserId,
          lastModifiedByUserId: input.createdByUserId,
        },
        include: withActors,
      })
    })

    return { created: true, version: toVersionDetail(version) }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { created: false, reason: "version_conflict" }
    }

    throw error
  }
}

export const linkRoadmapVersionAnalysisRun = async (
  versionId: string,
  analysisRunId: string,
) => {
  await prisma.implementationRoadmapVersion.update({
    where: { id: versionId },
    data: { analysisRunId },
  })
}

export type SaveRoadmapVersionInput = {
  versionId: string
  engagementId: string
  expectedRevision: number
  roadmap: Roadmap
  reviewState: Exclude<RoadmapReviewState, "ai_draft">
  sourceRecommendationFingerprint: string
  modifiedByUserId: string
}

export type SaveRoadmapVersionResult =
  | { saved: true; version: RoadmapVersionDetail }
  | {
      saved: false
      reason: "version_not_found" | "historical_version_readonly" | "stale_update"
      currentRevision?: number
    }

export const saveRoadmapVersion = async (
  scope: EngagementScope,
  input: SaveRoadmapVersionInput,
): Promise<SaveRoadmapVersionResult> => {
  const current = await prisma.implementationRoadmapVersion.findFirst({
    where: {
      id: input.versionId,
      engagementId: input.engagementId,
      engagement: engagementScopeWhere(scope),
    },
    select: {
      id: true,
      status: true,
      revision: true,
      reviewState: true,
      workspaceId: true,
      engagementId: true,
      versionNumber: true,
      sourceRecommendationVersionId: true,
      sourceRecommendationVersionNumber: true,
      sourceRecommendationFingerprint: true,
    },
  })

  if (!current) return { saved: false, reason: "version_not_found" }
  if (current.status !== "active") {
    return { saved: false, reason: "historical_version_readonly" }
  }
  if (current.revision !== input.expectedRevision) {
    return {
      saved: false,
      reason: "stale_update",
      currentRevision: current.revision,
    }
  }

  if (current.reviewState === "accepted") {
    const version = await prisma.$transaction(async (tx) => {
      const highest = await tx.implementationRoadmapVersion.findFirst({
        where: { engagementId: input.engagementId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      })

      await tx.implementationRoadmapVersion.update({
        where: { id: current.id },
        data: { status: "superseded" },
      })

      return tx.implementationRoadmapVersion.create({
        data: {
          workspaceId: current.workspaceId,
          engagementId: current.engagementId,
          versionNumber: (highest?.versionNumber ?? current.versionNumber) + 1,
          status: "active",
          content: input.roadmap as unknown as Prisma.InputJsonValue,
          reviewState: input.reviewState,
          sourceRecommendationVersionId: current.sourceRecommendationVersionId,
          sourceRecommendationVersionNumber:
            current.sourceRecommendationVersionNumber,
          sourceRecommendationFingerprint: input.sourceRecommendationFingerprint,
          createdByUserId: input.modifiedByUserId,
          lastModifiedByUserId: input.modifiedByUserId,
        },
        include: withActors,
      })
    })

    return { saved: true, version: toVersionDetail(version) }
  }

  const updated = await prisma.implementationRoadmapVersion.updateMany({
    where: {
      id: input.versionId,
      status: "active",
      revision: input.expectedRevision,
    },
    data: {
      content: input.roadmap as unknown as Prisma.InputJsonValue,
      reviewState: input.reviewState,
      sourceRecommendationFingerprint: input.sourceRecommendationFingerprint,
      revision: { increment: 1 },
      lastModifiedAt: new Date(),
      lastModifiedByUserId: input.modifiedByUserId,
    },
  })

  if (updated.count === 0) {
    const latest = await prisma.implementationRoadmapVersion.findUnique({
      where: { id: input.versionId },
      select: { revision: true },
    })

    return {
      saved: false,
      reason: "stale_update",
      currentRevision: latest?.revision,
    }
  }

  const version = await prisma.implementationRoadmapVersion.findUniqueOrThrow({
    where: { id: input.versionId },
    include: withActors,
  })

  return { saved: true, version: toVersionDetail(version) }
}

export const getActiveRoadmapVersion = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<RoadmapVersionDetail | null> => {
  const version = await prisma.implementationRoadmapVersion.findFirst({
    where: {
      engagementId,
      status: "active",
      engagement: engagementScopeWhere(scope),
    },
    include: withActors,
  })

  return version && toVersionDetail(version)
}

export const getRoadmapVersions = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<RoadmapVersionSummary[]> => {
  const versions = await prisma.implementationRoadmapVersion.findMany({
    where: { engagementId, engagement: engagementScopeWhere(scope) },
    orderBy: { versionNumber: "desc" },
    include: withActors,
  })

  return versions.map(toVersionSummary)
}

export const getRoadmapVersionById = async (
  versionId: string,
  engagementId: string,
  scope: EngagementScope,
): Promise<RoadmapVersionDetail | null> => {
  const version = await prisma.implementationRoadmapVersion.findFirst({
    where: {
      id: versionId,
      engagementId,
      engagement: engagementScopeWhere(scope),
    },
    include: withActors,
  })

  return version && toVersionDetail(version)
}

const toVersionSummary = (
  version: RoadmapVersionRow,
): RoadmapVersionSummary => ({
  id: version.id,
  versionNumber: version.versionNumber,
  status: version.status,
  reviewState: version.reviewState,
  revision: version.revision,
  createdAt: version.createdAt.toISOString(),
  createdByUserId: version.createdByUserId,
  createdByName: actorName(version.createdBy),
  lastModifiedAt: version.lastModifiedAt.toISOString(),
  lastModifiedByUserId: version.lastModifiedByUserId,
  lastModifiedByName: actorName(version.lastModifiedBy),
  sourceRecommendationVersionId: version.sourceRecommendationVersionId,
  sourceRecommendationVersionNumber: version.sourceRecommendationVersionNumber,
  sourceRecommendationFingerprint: version.sourceRecommendationFingerprint,
  analysisRunId: version.analysisRunId,
  phaseCount: roadmapOf(version).phases.length,
})

const toVersionDetail = (version: RoadmapVersionRow): RoadmapVersionDetail => ({
  ...toVersionSummary(version),
  roadmap: roadmapOf(version),
})

const roadmapOf = (version: RoadmapVersionRow): Roadmap =>
  version.content as unknown as Roadmap

const actorName = (
  actor: { displayName: string | null; email: string } | null,
): string | null => actor && (actor.displayName ?? actor.email)

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_VIOLATION

const assertEngagementInScope = async (
  engagementId: string,
  scope: EngagementScope,
) => {
  const engagement = await prisma.engagement.findFirst({
    where: { id: engagementId, ...engagementScopeWhere(scope) },
    select: { id: true },
  })

  if (!engagement) {
    throw new Error("Engagement not found")
  }
}
