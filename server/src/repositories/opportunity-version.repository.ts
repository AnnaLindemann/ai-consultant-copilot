import { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"
import { engagementScopeWhere } from "./engagement.repository.js"

import type { DatabaseClient } from "../lib/prisma.js"
import type { EngagementScope } from "../domain/access/access.js"
import type {
  OpportunityPrioritization,
  OpportunityReviewState,
  OpportunityVersionDetail,
  OpportunityVersionSummary,
} from "../../../shared/opportunity.schema.js"

// Persistence for the engagement's versioned Opportunity snapshots (roadmap
// Phase 4). Every operation takes the workspace-and-ownership scope as a
// required parameter and applies it *through the owning engagement*, so a
// version is reachable exactly when its engagement is — historical versions
// included (coding-standards.md §6A; architecture.md §7A.4).

type OpportunityVersionRow = Prisma.OpportunityVersionGetPayload<{
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
// unique indexes mean the same thing to a caller: someone else created a
// version for this engagement between our read and our write.
const UNIQUE_VIOLATION = "P2002"

export type CreateOpportunityVersionInput = {
  workspaceId: string
  engagementId: string
  prioritization: OpportunityPrioritization
  sourceAssessmentRevision: number
  sourceAssessmentFingerprint: string
  createdByUserId: string
}

export type CreateOpportunityVersionResult =
  | { created: true; version: OpportunityVersionDetail }
  | { created: false; reason: "version_conflict" }

// Add the next version and make it the active one, in a single transaction.
//
// The order is deliberate: the version that *was* active is superseded first,
// then the new one is inserted. Nothing is rewritten and nothing is deleted —
// the superseded row keeps its content, its citations, and the Assessment
// fingerprint it was generated from, exactly as they stood (architecture.md
// §4.3). A new version therefore becomes active only once it has been
// generated, validated, and persisted; if the insert fails, the previous
// version is still the active one.
export const createOpportunityVersion = async (
  scope: EngagementScope,
  input: CreateOpportunityVersionInput,
): Promise<CreateOpportunityVersionResult> => {
  await assertEngagementInScope(input.engagementId, scope)

  try {
    const version = await prisma.$transaction(async (tx) => {
      const highest = await tx.opportunityVersion.findFirst({
        where: { engagementId: input.engagementId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      })

      await tx.opportunityVersion.updateMany({
        where: { engagementId: input.engagementId, status: "active" },
        data: { status: "superseded" },
      })

      return tx.opportunityVersion.create({
        data: {
          workspaceId: input.workspaceId,
          engagementId: input.engagementId,
          versionNumber: (highest?.versionNumber ?? 0) + 1,
          status: "active",
          content: input.prioritization as unknown as Prisma.InputJsonValue,
          reviewState: "ai_draft",
          sourceAssessmentRevision: input.sourceAssessmentRevision,
          sourceAssessmentFingerprint: input.sourceAssessmentFingerprint,
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

// Link a version to the Analysis Run behind the generation that produced it.
// It is a separate write because the run's own record is only complete once the
// persistence outcome is known — a conflict or a storage failure belongs on the
// run as much as a provider failure does (architecture.md §8).
export const linkOpportunityVersionAnalysisRun = async (
  versionId: string,
  analysisRunId: string,
) => {
  await prisma.opportunityVersion.update({
    where: { id: versionId },
    data: { analysisRunId },
  })
}

export type SaveOpportunityVersionInput = {
  versionId: string
  engagementId: string
  expectedRevision: number
  prioritization: OpportunityPrioritization
  reviewState: Exclude<OpportunityReviewState, "ai_draft">
  modifiedByUserId: string
}

export type SaveOpportunityVersionResult =
  | { saved: true; version: OpportunityVersionDetail }
  | {
      saved: false
      reason: "version_not_found" | "historical_version_readonly" | "stale_update"
      currentRevision?: number
    }

// Autosave the consultant's edits *into* the active version.
//
// Editing is not versioning: re-ordering by hand, correcting a rationale, or
// filling in a baseline changes the version being worked on rather than
// producing a new one. What protects that from concurrent and stale writes is
// the revision the caller read: the update only lands on the row that still
// carries it, so a second writer working from an older read is refused instead
// of silently overwriting the first (architecture.md §13).
//
// A superseded version is refused outright — it is the record of what was
// prioritized then, and a save reaching it would destroy exactly what keeping
// it is for.
export const saveOpportunityVersion = async (
  scope: EngagementScope,
  input: SaveOpportunityVersionInput,
): Promise<SaveOpportunityVersionResult> => {
  const current = await prisma.opportunityVersion.findFirst({
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

  // The revision is part of the filter, not only of the check above: between
  // the read and this write another autosave may have landed, and the row must
  // refuse us rather than take our older content.
  const updated = await prisma.opportunityVersion.updateMany({
    where: {
      id: input.versionId,
      status: "active",
      revision: input.expectedRevision,
    },
    data: {
      content: input.prioritization as unknown as Prisma.InputJsonValue,
      reviewState: input.reviewState,
      revision: { increment: 1 },
      lastModifiedAt: new Date(),
      lastModifiedByUserId: input.modifiedByUserId,
    },
  })

  if (updated.count === 0) {
    const latest = await prisma.opportunityVersion.findUnique({
      where: { id: input.versionId },
      select: { revision: true },
    })

    return {
      saved: false,
      reason: "stale_update",
      currentRevision: latest?.revision,
    }
  }

  const version = await prisma.opportunityVersion.findUniqueOrThrow({
    where: { id: input.versionId },
    include: withActors,
  })

  return { saved: true, version: toVersionDetail(version) }
}

// The version being worked on, or null before the stage has been run at all.
export const getActiveOpportunityVersion = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<OpportunityVersionDetail | null> => {
  const version = await prisma.opportunityVersion.findFirst({
    where: {
      engagementId,
      status: "active",
      engagement: engagementScopeWhere(scope),
    },
    include: withActors,
  })

  return version && toVersionDetail(version)
}

// The engagement's whole version history, newest first. Historical versions are
// read through the same scope as the active one: preserving a version never
// widens who may see it (coding-standards.md §6A).
export const getOpportunityVersions = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<OpportunityVersionSummary[]> => {
  const versions = await prisma.opportunityVersion.findMany({
    where: { engagementId, engagement: engagementScopeWhere(scope) },
    orderBy: { versionNumber: "desc" },
    include: withActors,
  })

  return versions.map(toVersionSummary)
}

export const getOpportunityVersionById = async (
  versionId: string,
  engagementId: string,
  scope: EngagementScope,
  client: DatabaseClient = prisma,
): Promise<OpportunityVersionDetail | null> => {
  const version = await client.opportunityVersion.findFirst({
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
  version: OpportunityVersionRow,
): OpportunityVersionSummary => ({
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
  sourceAssessmentRevision: version.sourceAssessmentRevision,
  sourceAssessmentFingerprint: version.sourceAssessmentFingerprint,
  analysisRunId: version.analysisRunId,
  opportunityCount: prioritizationOf(version).opportunities.length,
})

const toVersionDetail = (
  version: OpportunityVersionRow,
): OpportunityVersionDetail => ({
  ...toVersionSummary(version),
  prioritization: prioritizationOf(version),
})

const prioritizationOf = (
  version: OpportunityVersionRow,
): OpportunityPrioritization =>
  version.content as unknown as OpportunityPrioritization

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
