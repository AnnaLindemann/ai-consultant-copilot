import { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"
import { engagementScopeWhere } from "./engagement.repository.js"

import type { EngagementScope } from "../domain/access/access.js"
import type {
  RecommendationReviewState,
  RecommendationSet,
  RecommendationVersionDetail,
  RecommendationVersionSummary,
} from "../../../shared/recommendation.schema.js"

// Persistence for the engagement's versioned Recommendation snapshots (roadmap
// Phase 6). Every operation takes the workspace-and-ownership scope as a
// required parameter and applies it *through the owning engagement*, so a
// version is reachable exactly when its engagement is — historical versions
// included (coding-standards.md §6A; architecture.md §7A.4).
//
// It follows `opportunity-version.repository` deliberately: the two stages store
// the same kind of thing, and a second shape would be a second set of rules to
// keep in step.

type RecommendationVersionRow = Prisma.RecommendationVersionGetPayload<{
  include: {
    createdBy: { select: { id: true; displayName: true; email: true } }
    lastModifiedBy: { select: { id: true; displayName: true; email: true } }
  }
}>

const withActors = {
  createdBy: { select: { id: true, displayName: true, email: true } },
  lastModifiedBy: { select: { id: true, displayName: true, email: true } },
} as const

// Postgres reports a violated unique index as P2002. For this table both of its
// unique indexes mean the same thing to a caller: someone else created a version
// for this engagement between our read and our write.
const UNIQUE_VIOLATION = "P2002"

export type CreateRecommendationVersionInput = {
  workspaceId: string
  engagementId: string
  recommendationSet: RecommendationSet
  sourceOpportunityVersionId: string
  sourceOpportunityVersionNumber: number
  sourceOpportunityFingerprint: string
  createdByUserId: string
}

export type CreateRecommendationVersionResult =
  | { created: true; version: RecommendationVersionDetail }
  | { created: false; reason: "version_conflict" }

// Add the next version and make it the active one, in a single transaction.
//
// The order is deliberate: the version that *was* active is superseded first,
// then the new one is inserted. Nothing is rewritten and nothing is deleted —
// the superseded row keeps its content, its grounding, and the Opportunity
// fingerprint it was matched against, exactly as they stood (architecture.md
// §4.3). A new version therefore becomes active only once it has been generated,
// validated, and persisted; if the insert fails, the previous version is still
// the active one.
export const createRecommendationVersion = async (
  scope: EngagementScope,
  input: CreateRecommendationVersionInput,
): Promise<CreateRecommendationVersionResult> => {
  await assertEngagementInScope(input.engagementId, scope)

  try {
    const version = await prisma.$transaction(async (tx) => {
      const highest = await tx.recommendationVersion.findFirst({
        where: { engagementId: input.engagementId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      })

      await tx.recommendationVersion.updateMany({
        where: { engagementId: input.engagementId, status: "active" },
        data: { status: "superseded" },
      })

      return tx.recommendationVersion.create({
        data: {
          workspaceId: input.workspaceId,
          engagementId: input.engagementId,
          versionNumber: (highest?.versionNumber ?? 0) + 1,
          status: "active",
          content: input.recommendationSet as unknown as Prisma.InputJsonValue,
          reviewState: "ai_draft",
          sourceOpportunityVersionId: input.sourceOpportunityVersionId,
          sourceOpportunityVersionNumber: input.sourceOpportunityVersionNumber,
          sourceOpportunityFingerprint: input.sourceOpportunityFingerprint,
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

// Link a version to the Analysis Run behind the generation that produced it. It
// is a separate write because the run's own record is only complete once the
// persistence outcome is known — a conflict or a storage failure belongs on the
// run as much as a provider failure does (architecture.md §8).
export const linkRecommendationVersionAnalysisRun = async (
  versionId: string,
  analysisRunId: string,
) => {
  await prisma.recommendationVersion.update({
    where: { id: versionId },
    data: { analysisRunId },
  })
}

export type SaveRecommendationVersionInput = {
  versionId: string
  engagementId: string
  expectedRevision: number
  recommendationSet: RecommendationSet
  reviewState: Exclude<RecommendationReviewState, "ai_draft">
  modifiedByUserId: string
}

export type SaveRecommendationVersionResult =
  | { saved: true; version: RecommendationVersionDetail }
  | {
      saved: false
      reason: "version_not_found" | "historical_version_readonly" | "stale_update"
      currentRevision?: number
    }

// Autosave the consultant's edits *into* the active version.
//
// Editing is not versioning: correcting a rationale, re-grounding a proposal, or
// overriding a confidence changes the version being worked on rather than
// producing a new one. What protects that from concurrent and stale writes is
// the revision the caller read: the update only lands on the row that still
// carries it, so a second writer working from an older read is refused instead
// of silently overwriting the first (architecture.md §13).
//
// A superseded version is refused outright — it is the record of what was
// recommended then, and a save reaching it would destroy exactly what keeping it
// is for.
export const saveRecommendationVersion = async (
  scope: EngagementScope,
  input: SaveRecommendationVersionInput,
): Promise<SaveRecommendationVersionResult> => {
  const current = await prisma.recommendationVersion.findFirst({
    where: {
      id: input.versionId,
      engagementId: input.engagementId,
      engagement: engagementScopeWhere(scope),
    },
    select: { id: true, status: true, revision: true },
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

  // The revision is part of the filter, not only of the check above: between the
  // read and this write another autosave may have landed, and the row must
  // refuse us rather than take our older content.
  const updated = await prisma.recommendationVersion.updateMany({
    where: {
      id: input.versionId,
      status: "active",
      revision: input.expectedRevision,
    },
    data: {
      content: input.recommendationSet as unknown as Prisma.InputJsonValue,
      reviewState: input.reviewState,
      revision: { increment: 1 },
      lastModifiedAt: new Date(),
      lastModifiedByUserId: input.modifiedByUserId,
    },
  })

  if (updated.count === 0) {
    const latest = await prisma.recommendationVersion.findUnique({
      where: { id: input.versionId },
      select: { revision: true },
    })

    return {
      saved: false,
      reason: "stale_update",
      currentRevision: latest?.revision,
    }
  }

  const version = await prisma.recommendationVersion.findUniqueOrThrow({
    where: { id: input.versionId },
    include: withActors,
  })

  return { saved: true, version: toVersionDetail(version) }
}

// The version being worked on, or null before the stage has been run at all.
export const getActiveRecommendationVersion = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<RecommendationVersionDetail | null> => {
  const version = await prisma.recommendationVersion.findFirst({
    where: {
      engagementId,
      status: "active",
      engagement: engagementScopeWhere(scope),
    },
    include: withActors,
  })

  return version && toVersionDetail(version)
}

// The engagement's whole version history, newest first. Preserved versions are
// read through the same scope as the active one: keeping a version never widens
// who may see it (coding-standards.md §6A).
export const getRecommendationVersions = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<RecommendationVersionSummary[]> => {
  const versions = await prisma.recommendationVersion.findMany({
    where: { engagementId, engagement: engagementScopeWhere(scope) },
    orderBy: { versionNumber: "desc" },
    include: withActors,
  })

  return versions.map(toVersionSummary)
}

export const getRecommendationVersionById = async (
  versionId: string,
  engagementId: string,
  scope: EngagementScope,
): Promise<RecommendationVersionDetail | null> => {
  const version = await prisma.recommendationVersion.findFirst({
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
  version: RecommendationVersionRow,
): RecommendationVersionSummary => ({
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
  sourceOpportunityVersionId: version.sourceOpportunityVersionId,
  sourceOpportunityVersionNumber: version.sourceOpportunityVersionNumber,
  sourceOpportunityFingerprint: version.sourceOpportunityFingerprint,
  analysisRunId: version.analysisRunId,
  recommendationCount: recommendationSetOf(version).recommendations.length,
})

const toVersionDetail = (
  version: RecommendationVersionRow,
): RecommendationVersionDetail => ({
  ...toVersionSummary(version),
  recommendationSet: recommendationSetOf(version),
})

const recommendationSetOf = (
  version: RecommendationVersionRow,
): RecommendationSet => version.content as unknown as RecommendationSet

// Who created or last touched a version, for the reader. The display name if
// there is one, otherwise the address they are known by.
const actorName = (
  actor: { displayName: string | null; email: string } | null,
): string | null => actor && (actor.displayName ?? actor.email)

// The version-number index and the one-active-version index both mean the same
// thing here, so neither is told apart from the other.
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_VIOLATION

// A version's reach is its engagement's reach, so a write path proves the
// engagement is in scope before it touches anything.
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
