import { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"
import { engagementScopeWhere } from "./engagement.repository.js"

import type { EngagementScope } from "../domain/access/access.js"
import type { AuditEventType } from "../../../shared/access.schema.js"
import type {
  ConsultantReportContent,
  DocumentPublicationSummary,
  NotificationAttemptOutcome,
  ReportReviewState,
  ReportSourceSnapshot,
  ReportVersionDetail,
  ReportVersionSummary,
} from "../../../shared/consultant-report.schema.js"

type ReportVersionRow = Prisma.ConsultantReportVersionGetPayload<{
  include: {
    createdBy: { select: { id: true; displayName: true; email: true } }
    lastModifiedBy: { select: { id: true; displayName: true; email: true } }
    approvedBy: { select: { id: true; displayName: true; email: true } }
    publications: {
      include: {
        reportVersion: { select: { versionNumber: true } }
        notificationAttempts: true
      }
    }
  }
}>

const withRelations = {
  createdBy: { select: { id: true, displayName: true, email: true } },
  lastModifiedBy: { select: { id: true, displayName: true, email: true } },
  approvedBy: { select: { id: true, displayName: true, email: true } },
  publications: {
    include: {
      reportVersion: { select: { versionNumber: true } },
      notificationAttempts: { orderBy: { createdAt: "asc" as const } },
    },
  },
} as const

const UNIQUE_VIOLATION = "P2002"

export type CreateReportVersionInput = {
  workspaceId: string
  engagementId: string
  report: ConsultantReportContent
  sourceSnapshot: ReportSourceSnapshot
  createdByUserId: string
}

export type CreateReportVersionResult =
  | { created: true; version: ReportVersionDetail }
  | { created: false; reason: "version_conflict" }

export const createReportVersion = async (
  scope: EngagementScope,
  input: CreateReportVersionInput,
): Promise<CreateReportVersionResult> => {
  await assertEngagementInScope(input.engagementId, scope)

  try {
    const version = await prisma.$transaction(async (tx) => {
      const highest = await tx.consultantReportVersion.findFirst({
        where: { engagementId: input.engagementId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      })
      const active = await tx.consultantReportVersion.findFirst({
        where: { engagementId: input.engagementId, status: "active" },
        select: { id: true, reviewState: true },
      })

      await tx.consultantReportVersion.updateMany({
        where: { engagementId: input.engagementId, status: "active" },
        data: { status: "superseded" },
      })

      const created = await tx.consultantReportVersion.create({
        data: {
          workspaceId: input.workspaceId,
          engagementId: input.engagementId,
          versionNumber: (highest?.versionNumber ?? 0) + 1,
          status: "active",
          reviewState: "draft",
          content: input.report as unknown as Prisma.InputJsonValue,
          sourceSnapshot: input.sourceSnapshot as unknown as Prisma.InputJsonValue,
          ...snapshotColumns(input.sourceSnapshot),
          createdByUserId: input.createdByUserId,
          lastModifiedByUserId: input.createdByUserId,
        },
        include: withRelations,
      })
      await createReportAuditEntry(tx, {
        workspaceId: scope.workspaceId,
        userId: input.createdByUserId,
        engagementId: input.engagementId,
        eventType: "report_version_created",
        payload: {
          reportVersionId: created.id,
          reportVersionNumber: created.versionNumber,
        },
      })
      if (active?.reviewState === "approved") {
        await createReportAuditEntry(tx, {
          workspaceId: scope.workspaceId,
          userId: input.createdByUserId,
          engagementId: input.engagementId,
          eventType: "report_approved_version_superseded",
          payload: {
            supersededReportVersionId: active.id,
            newReportVersionId: created.id,
          },
        })
      }

      return created
    })

    return { created: true, version: toVersionDetail(version) }
  } catch (error) {
    if (isUniqueViolation(error)) return { created: false, reason: "version_conflict" }
    throw error
  }
}

export type SaveReportVersionInput = {
  versionId: string
  engagementId: string
  expectedRevision: number
  report: ConsultantReportContent
  reviewState: Exclude<ReportReviewState, "approved">
  sourceSnapshot: ReportSourceSnapshot
  modifiedByUserId: string
}

export type SaveReportVersionResult =
  | { saved: true; version: ReportVersionDetail }
  | {
      saved: false
      reason:
        | "version_not_found"
        | "historical_version_readonly"
        | "immutable_version_readonly"
        | "stale_update"
      currentRevision?: number
    }

export const saveReportVersion = async (
  scope: EngagementScope,
  input: SaveReportVersionInput,
): Promise<SaveReportVersionResult> => {
  const current = await prisma.consultantReportVersion.findFirst({
    where: {
      id: input.versionId,
      engagementId: input.engagementId,
      engagement: engagementScopeWhere(scope),
    },
    select: { id: true, status: true, revision: true, reviewState: true, versionNumber: true },
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

  if (current.reviewState === "approved") {
    const version = await prisma.$transaction(async (tx) => {
      const existing = await tx.consultantReportVersion.findUniqueOrThrow({
        where: { id: current.id },
        select: {
          workspaceId: true,
          engagementId: true,
          versionNumber: true,
        },
      })
      const highest = await tx.consultantReportVersion.findFirst({
        where: { engagementId: input.engagementId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      })

      await tx.consultantReportVersion.update({
        where: { id: current.id },
        data: { status: "superseded" },
      })

      const created = await tx.consultantReportVersion.create({
        data: {
          workspaceId: existing.workspaceId,
          engagementId: existing.engagementId,
          versionNumber: (highest?.versionNumber ?? existing.versionNumber) + 1,
          status: "active",
          reviewState: "draft",
          content: input.report as unknown as Prisma.InputJsonValue,
          sourceSnapshot: input.sourceSnapshot as unknown as Prisma.InputJsonValue,
          ...snapshotColumns(input.sourceSnapshot),
          createdByUserId: input.modifiedByUserId,
          lastModifiedByUserId: input.modifiedByUserId,
        },
        include: withRelations,
      })
      await createReportAuditEntry(tx, {
        workspaceId: scope.workspaceId,
        userId: input.modifiedByUserId,
        engagementId: input.engagementId,
        eventType: "report_version_created",
        payload: {
          reportVersionId: created.id,
          reportVersionNumber: created.versionNumber,
        },
      })
      await createReportAuditEntry(tx, {
        workspaceId: scope.workspaceId,
        userId: input.modifiedByUserId,
        engagementId: input.engagementId,
        eventType: "report_approved_version_superseded",
        payload: {
          supersededReportVersionId: current.id,
          newReportVersionId: created.id,
        },
      })

      return created
    })

    return { saved: true, version: toVersionDetail(version) }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.consultantReportVersion.updateMany({
      where: {
        id: input.versionId,
        status: "active",
        revision: input.expectedRevision,
        reviewState: { not: "approved" },
      },
      data: {
        content: input.report as unknown as Prisma.InputJsonValue,
        reviewState: input.reviewState,
        sourceSnapshot: input.sourceSnapshot as unknown as Prisma.InputJsonValue,
        ...snapshotColumns(input.sourceSnapshot),
        revision: { increment: 1 },
        lastModifiedAt: new Date(),
        lastModifiedByUserId: input.modifiedByUserId,
      },
    })
    if (
      result.count > 0 &&
      current.reviewState !== "manager_review" &&
      input.reviewState === "manager_review"
    ) {
      await createReportAuditEntry(tx, {
        workspaceId: scope.workspaceId,
        userId: input.modifiedByUserId,
        engagementId: input.engagementId,
        eventType: "report_submitted_for_review",
        payload: {
          reportVersionId: input.versionId,
          reportVersionNumber: current.versionNumber,
        },
      })
    }
    return result
  })

  if (updated.count === 0) {
    const latest = await prisma.consultantReportVersion.findUnique({
      where: { id: input.versionId },
      select: { revision: true },
    })

    return { saved: false, reason: "stale_update", currentRevision: latest?.revision }
  }

  const version = await prisma.consultantReportVersion.findUniqueOrThrow({
    where: { id: input.versionId },
    include: withRelations,
  })

  return { saved: true, version: toVersionDetail(version) }
}

export type ApproveReportVersionResult =
  | { approved: true; version: ReportVersionDetail }
  | {
      approved: false
      reason:
        | "version_not_found"
        | "historical_version_readonly"
        | "not_in_review"
        | "stale_update"
      currentRevision?: number
    }

export const approveReportVersion = async (
  scope: EngagementScope,
  input: {
    versionId: string
    engagementId: string
    expectedRevision: number
    approvedByUserId: string
    approvedSourceFingerprint: string
  },
): Promise<ApproveReportVersionResult> => {
  const current = await prisma.consultantReportVersion.findFirst({
    where: {
      id: input.versionId,
      engagementId: input.engagementId,
      engagement: engagementScopeWhere(scope),
    },
    select: { id: true, status: true, revision: true, reviewState: true, versionNumber: true },
  })

  if (!current) return { approved: false, reason: "version_not_found" }
  if (current.status !== "active") {
    return { approved: false, reason: "historical_version_readonly" }
  }
  if (current.reviewState !== "manager_review") {
    return { approved: false, reason: "not_in_review" }
  }
  if (current.revision !== input.expectedRevision) {
    return {
      approved: false,
      reason: "stale_update",
      currentRevision: current.revision,
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.consultantReportVersion.updateMany({
      where: {
        id: input.versionId,
        status: "active",
        reviewState: "manager_review",
        revision: input.expectedRevision,
      },
      data: {
        reviewState: "approved",
        revision: { increment: 1 },
        approvedAt: new Date(),
        approvedByUserId: input.approvedByUserId,
        approvedSourceFingerprint: input.approvedSourceFingerprint,
        lastModifiedAt: new Date(),
        lastModifiedByUserId: input.approvedByUserId,
      },
    })
    if (result.count > 0) {
      await createReportAuditEntry(tx, {
        workspaceId: scope.workspaceId,
        userId: input.approvedByUserId,
        engagementId: input.engagementId,
        eventType: "report_approved",
        payload: {
          reportVersionId: input.versionId,
          reportVersionNumber: current.versionNumber,
        },
      })
    }
    return result
  })

  if (updated.count === 0) {
    const latest = await prisma.consultantReportVersion.findUnique({
      where: { id: input.versionId },
      select: { revision: true },
    })

    return {
      approved: false,
      reason: "stale_update",
      currentRevision: latest?.revision,
    }
  }

  const version = await prisma.consultantReportVersion.findUniqueOrThrow({
    where: { id: input.versionId },
    include: withRelations,
  })

  return { approved: true, version: toVersionDetail(version) }
}

export const linkReportVersionAnalysisRun = async (
  versionId: string,
  analysisRunId: string,
) => {
  await prisma.consultantReportVersion.update({
    where: { id: versionId },
    data: { analysisRunId },
  })
}

export const getActiveReportVersion = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<ReportVersionDetail | null> => {
  const version = await prisma.consultantReportVersion.findFirst({
    where: { engagementId, status: "active", engagement: engagementScopeWhere(scope) },
    include: withRelations,
  })

  return version && toVersionDetail(version)
}

export const getReportVersions = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<ReportVersionSummary[]> => {
  const versions = await prisma.consultantReportVersion.findMany({
    where: { engagementId, engagement: engagementScopeWhere(scope) },
    orderBy: { versionNumber: "desc" },
    include: withRelations,
  })

  return versions.map(toVersionSummary)
}

export const getReportVersionById = async (
  versionId: string,
  engagementId: string,
  scope: EngagementScope,
): Promise<ReportVersionDetail | null> => {
  const version = await prisma.consultantReportVersion.findFirst({
    where: { id: versionId, engagementId, engagement: engagementScopeWhere(scope) },
    include: withRelations,
  })

  return version && toVersionDetail(version)
}

export const publishReportVersion = async (
  scope: EngagementScope,
  input: {
    engagementId: string
    versionId: string
    pdfArtifactId: string
    rendererVersion?: string
    publishedByUserId: string
    clientUserId: string | null
    title: string
    managerMessage?: string | null
  },
): Promise<
  | { published: true; publication: DocumentPublicationSummary }
  | {
      published: false
      reason:
        | "version_not_found"
        | "historical_version_readonly"
        | "not_approved"
        | "pdf_artifact_missing"
    }
> => {
  const version = await getReportVersionById(input.versionId, input.engagementId, scope)
  if (!version) return { published: false, reason: "version_not_found" }
  if (version.status !== "active") {
    return { published: false, reason: "historical_version_readonly" }
  }
  if (version.reviewState !== "approved") return { published: false, reason: "not_approved" }

  const artifact = await prisma.reportPdfArtifact.findFirst({
    where: {
      id: input.pdfArtifactId,
      workspaceId: scope.workspaceId,
      engagementId: input.engagementId,
      reportVersionId: input.versionId,
      rendererVersion: input.rendererVersion,
    },
    select: { id: true },
  })
  if (!artifact) return { published: false, reason: "pdf_artifact_missing" }

  try {
    const publication = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "Engagement"
        WHERE "id" = ${input.engagementId}
          AND "workspaceId" = ${scope.workspaceId}
        FOR UPDATE
      `
      const existing = await tx.documentPublication.findFirst({
        where: {
          engagementId: input.engagementId,
          workspaceId: scope.workspaceId,
          status: "active",
        },
        include: {
          reportVersion: { select: { versionNumber: true } },
          notificationAttempts: { orderBy: { createdAt: "asc" } },
        },
      })
      if (existing?.reportVersionId === input.versionId) return existing

      if (existing) {
        await tx.documentPublication.update({
          where: { id: existing.id },
          data: {
            status: "superseded",
            revokedAt: new Date(),
            revokedByUserId: input.publishedByUserId,
          },
        })
      }

      return tx.documentPublication.create({
        data: {
          workspaceId: scope.workspaceId,
          engagementId: input.engagementId,
          reportVersionId: input.versionId,
          pdfArtifactId: input.pdfArtifactId,
          clientUserId: input.clientUserId,
          publishedByUserId: input.publishedByUserId,
          title: input.title,
          managerMessage: input.managerMessage ?? null,
        },
        include: {
          reportVersion: { select: { versionNumber: true } },
          notificationAttempts: { orderBy: { createdAt: "asc" } },
        },
      })
    })

    return { published: true, publication: toPublicationSummary(publication) }
  } catch (error) {
    if (isUniqueViolation(error)) {
      const publication = await getActivePublication(input.engagementId, scope)
      if (publication?.reportVersionId === input.versionId) {
        return { published: true, publication }
      }
    }
    throw error
  }
}

export const revokeActivePublication = async (
  scope: EngagementScope,
  input: { engagementId: string; revokedByUserId: string },
): Promise<
  | { revoked: true; publication: DocumentPublicationSummary }
  | { revoked: false; reason: "no_active_publication" }
> => {
  const current = await prisma.documentPublication.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      engagementId: input.engagementId,
      status: "active",
      engagement: engagementScopeWhere(scope),
    },
    include: {
      reportVersion: { select: { versionNumber: true } },
      notificationAttempts: { orderBy: { createdAt: "asc" } },
    },
  })
  if (!current) return { revoked: false, reason: "no_active_publication" }

  const publication = await prisma.documentPublication.update({
    where: { id: current.id },
    data: {
      status: "revoked",
      revokedAt: new Date(),
      revokedByUserId: input.revokedByUserId,
    },
    include: {
      reportVersion: { select: { versionNumber: true } },
      notificationAttempts: { orderBy: { createdAt: "asc" } },
    },
  })

  return { revoked: true, publication: toPublicationSummary(publication) }
}

export const getActivePublication = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<DocumentPublicationSummary | null> => {
  const publication = await prisma.documentPublication.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      engagementId,
      status: "active",
      engagement: engagementScopeWhere(scope),
    },
    include: {
      reportVersion: { select: { versionNumber: true } },
      notificationAttempts: { orderBy: { createdAt: "asc" } },
    },
  })

  return publication && toPublicationSummary(publication)
}

export const getActivePublicationForClient = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<DocumentPublicationSummary | null> => {
  const publication = await prisma.documentPublication.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      engagementId,
      clientUserId: scope.userId,
      status: "active",
      pdfArtifactId: { not: null },
      title: { not: null },
    },
    include: {
      reportVersion: { select: { versionNumber: true } },
      notificationAttempts: { orderBy: { createdAt: "asc" } },
    },
  })

  return publication && toPublicationSummary(publication)
}

export const createReportPdfArtifact = async (
  scope: EngagementScope,
  input: {
    workspaceId: string
    engagementId: string
    reportVersionId: string
    rendererVersion: string
    contentHash: string
    pdfHash: string
    bytes: Buffer
  },
) => {
  await assertEngagementInScope(input.engagementId, scope)

  return prisma.reportPdfArtifact.upsert({
    where: {
      reportVersionId_rendererVersion: {
        reportVersionId: input.reportVersionId,
        rendererVersion: input.rendererVersion,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      engagementId: input.engagementId,
      reportVersionId: input.reportVersionId,
      rendererVersion: input.rendererVersion,
      contentHash: input.contentHash,
      pdfHash: input.pdfHash,
      bytes: new Uint8Array(input.bytes),
    },
    update: {},
  })
}

export const getReportPdfArtifactBytes = async (
  scope: EngagementScope,
  input: { engagementId: string; versionId: string; rendererVersion?: string },
): Promise<Buffer | null> => {
  const artifact = await prisma.reportPdfArtifact.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      engagementId: input.engagementId,
      reportVersionId: input.versionId,
      rendererVersion: input.rendererVersion,
      engagement: engagementScopeWhere(scope),
    },
    orderBy: { createdAt: "desc" },
    select: { bytes: true },
  })

  return artifact?.bytes ? Buffer.from(artifact.bytes) : null
}

export const getPublishedPdfArtifactBytesForClient = async (
  engagementId: string,
  reportVersionId: string,
  scope: EngagementScope,
): Promise<Buffer | null> => {
  const publication = await prisma.documentPublication.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      engagementId,
      reportVersionId,
      clientUserId: scope.userId,
      status: "active",
      pdfArtifactId: { not: null },
      title: { not: null },
    },
    select: { pdfArtifact: { select: { bytes: true } } },
  })

  return publication?.pdfArtifact?.bytes ? Buffer.from(publication.pdfArtifact.bytes) : null
}

export const reservePublicationEmailAttempt = async (
  publicationId: string,
  input: {
    workspaceId: string
    engagementId: string
    requestKey: string
  },
): Promise<
  | { reserved: true; publication: DocumentPublicationSummary }
  | { reserved: false; publication: DocumentPublicationSummary }
> => {
  try {
    const publication = await prisma.$transaction(async (tx) => {
    const existingAttempt = await tx.documentNotificationAttempt.findUnique({
      where: {
        publicationId_requestKey: {
          publicationId,
          requestKey: input.requestKey,
        },
      },
    })

    if (existingAttempt) {
      const current = await tx.documentPublication.findUniqueOrThrow({
        where: { id: publicationId },
        include: {
          reportVersion: { select: { versionNumber: true } },
          notificationAttempts: { orderBy: { createdAt: "asc" } },
        },
      })
      return { reserved: false as const, publication: current }
    }

    await tx.documentNotificationAttempt.create({
      data: {
        workspaceId: input.workspaceId,
        engagementId: input.engagementId,
        publicationId,
        requestKey: input.requestKey,
        outcome: "pending",
      },
    })

    const updated = await tx.documentPublication.update({
      where: { id: publicationId },
      data: {
        emailNotificationAttemptedAt: new Date(),
      },
      include: {
        reportVersion: { select: { versionNumber: true } },
        notificationAttempts: { orderBy: { createdAt: "asc" } },
      },
    })

    return { reserved: true as const, publication: updated }
    })

    return {
      reserved: publication.reserved,
      publication: toPublicationSummary(publication.publication),
    }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const publication = await prisma.documentPublication.findUniqueOrThrow({
      where: { id: publicationId },
      include: {
        reportVersion: { select: { versionNumber: true } },
        notificationAttempts: { orderBy: { createdAt: "asc" } },
      },
    })
    return { reserved: false, publication: toPublicationSummary(publication) }
  }
}

export const finalizePublicationEmailAttempt = async (
  publicationId: string,
  input: {
    requestKey: string
    deliveredAt?: Date | null
    failure?: string | null
    providerMessageId?: string | null
  },
): Promise<DocumentPublicationSummary> => {
  const publication = await prisma.$transaction(async (tx) => {
    await tx.documentNotificationAttempt.update({
      where: {
        publicationId_requestKey: {
          publicationId,
          requestKey: input.requestKey,
        },
      },
      data: {
        outcome: input.failure ? "failed" : "sent",
        errorCategory: input.failure ?? null,
        providerMessageId: input.providerMessageId ?? null,
      },
    })

    return tx.documentPublication.update({
      where: { id: publicationId },
      data: {
        emailNotificationAttemptedAt: new Date(),
        emailNotificationDeliveredAt: input.failure ? null : input.deliveredAt ?? null,
        emailNotificationFailure: input.failure ?? null,
      },
      include: {
        reportVersion: { select: { versionNumber: true } },
        notificationAttempts: { orderBy: { createdAt: "asc" } },
      },
    })
  })

  return toPublicationSummary(publication)
}

const toVersionSummary = (version: ReportVersionRow): ReportVersionSummary => ({
  id: version.id,
  versionNumber: version.versionNumber,
  status: version.status,
  reviewState: version.reviewState,
  revision: version.revision,
  approvedAt: version.approvedAt?.toISOString() ?? null,
  approvedByUserId: version.approvedByUserId,
  approvedSourceFingerprint: version.approvedSourceFingerprint,
  createdAt: version.createdAt.toISOString(),
  createdByUserId: version.createdByUserId,
  createdByName: actorName(version.createdBy),
  lastModifiedAt: version.lastModifiedAt.toISOString(),
  lastModifiedByUserId: version.lastModifiedByUserId,
  lastModifiedByName: actorName(version.lastModifiedBy),
  sourceSnapshot: sourceSnapshotOf(version),
  analysisRunId: version.analysisRunId,
  followUpQuestionCount: reportOf(version).followUpQuestions.length,
  publication:
    version.publications
      .map(toPublicationSummary)
      .find((publication) => publication.status === "active") ?? null,
})

const toVersionDetail = (version: ReportVersionRow): ReportVersionDetail => ({
  ...toVersionSummary(version),
  report: reportOf(version),
})

const reportOf = (version: ReportVersionRow): ConsultantReportContent =>
  version.content as unknown as ConsultantReportContent

const sourceSnapshotOf = (version: {
  sourceDiscoveryFingerprint: string
  sourceAssessmentRevision: number
  sourceAssessmentFingerprint: string
  sourceOpportunityVersionId: string
  sourceOpportunityVersionNumber: number
  sourceOpportunityFingerprint: string
  sourceRecommendationVersionId: string
  sourceRecommendationVersionNumber: number
  sourceRecommendationFingerprint: string
  sourceRoadmapVersionId: string
  sourceRoadmapVersionNumber: number
  sourceRoadmapFingerprint: string
  sourceSnapshot?: Prisma.JsonValue | null
}): ReportSourceSnapshot => ({
  ...fallbackSourceSnapshot(version),
  ...(version.sourceSnapshot as object | null ?? {}),
}) as ReportSourceSnapshot

const snapshotColumns = (snapshot: ReportSourceSnapshot) => ({
  sourceDiscoveryFingerprint: snapshot.discoveryFingerprint,
  sourceAssessmentRevision: snapshot.assessmentRevision,
  sourceAssessmentFingerprint: snapshot.assessmentFingerprint,
  sourceOpportunityVersionId: snapshot.opportunityVersionId,
  sourceOpportunityVersionNumber: snapshot.opportunityVersionNumber,
  sourceOpportunityFingerprint: snapshot.opportunityFingerprint,
  sourceRecommendationVersionId: snapshot.recommendationVersionId,
  sourceRecommendationVersionNumber: snapshot.recommendationVersionNumber,
  sourceRecommendationFingerprint: snapshot.recommendationFingerprint,
  sourceRoadmapVersionId: snapshot.roadmapVersionId,
  sourceRoadmapVersionNumber: snapshot.roadmapVersionNumber,
  sourceRoadmapFingerprint: snapshot.roadmapFingerprint,
})

const createReportAuditEntry = (
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string
    userId: string
    engagementId: string
    eventType: AuditEventType
    payload: Record<string, unknown>
  },
) =>
  tx.auditTrail.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      engagementId: input.engagementId,
      eventType: input.eventType,
      payload: input.payload as Prisma.InputJsonValue,
    },
  })

const toPublicationSummary = (publication: {
  id: string
  reportVersionId: string
  reportVersion: { versionNumber: number }
  status: "active" | "revoked" | "superseded"
  publishedAt: Date
  publishedByUserId: string
  revokedAt: Date | null
  revokedByUserId: string | null
  emailNotificationAttemptedAt: Date | null
  emailNotificationDeliveredAt: Date | null
  emailNotificationFailure: string | null
  clientUserId?: string | null
  title?: string | null
  managerMessage?: string | null
  pdfArtifactId?: string | null
  notificationAttempts?: {
    id: string
    requestKey: string
    outcome: NotificationAttemptOutcome
    errorCategory: string | null
    createdAt: Date
  }[]
}): DocumentPublicationSummary => ({
  id: publication.id,
  reportVersionId: publication.reportVersionId,
  reportVersionNumber: publication.reportVersion.versionNumber,
  status: publication.status,
  publishedAt: publication.publishedAt.toISOString(),
  publishedByUserId: publication.publishedByUserId,
  revokedAt: publication.revokedAt?.toISOString() ?? null,
  revokedByUserId: publication.revokedByUserId,
  emailNotificationAttemptedAt:
    publication.emailNotificationAttemptedAt?.toISOString() ?? null,
  emailNotificationDeliveredAt:
    publication.emailNotificationDeliveredAt?.toISOString() ?? null,
  emailNotificationFailure: publication.emailNotificationFailure,
  clientUserId: publication.clientUserId ?? null,
  title: publication.title ?? `Consultant Report, Fassung ${publication.reportVersion.versionNumber}`,
  managerMessage: publication.managerMessage ?? null,
  pdfArtifactId: publication.pdfArtifactId ?? null,
  notificationAttempts: (publication.notificationAttempts ?? []).map((attempt) => ({
    id: attempt.id,
    requestKey: attempt.requestKey,
    outcome: attempt.outcome,
    errorCategory: attempt.errorCategory,
    attemptedAt: attempt.createdAt.toISOString(),
  })),
})

const fallbackSourceSnapshot = (version: {
  sourceDiscoveryFingerprint: string
  sourceAssessmentRevision: number
  sourceAssessmentFingerprint: string
  sourceOpportunityVersionId: string
  sourceOpportunityVersionNumber: number
  sourceOpportunityFingerprint: string
  sourceRecommendationVersionId: string
  sourceRecommendationVersionNumber: number
  sourceRecommendationFingerprint: string
  sourceRoadmapVersionId: string
  sourceRoadmapVersionNumber: number
  sourceRoadmapFingerprint: string
}): ReportSourceSnapshot => ({
  fingerprint: [
    version.sourceDiscoveryFingerprint,
    version.sourceAssessmentRevision,
    version.sourceAssessmentFingerprint,
    version.sourceOpportunityVersionId,
    version.sourceOpportunityVersionNumber,
    version.sourceOpportunityFingerprint,
    version.sourceRecommendationVersionId,
    version.sourceRecommendationVersionNumber,
    version.sourceRecommendationFingerprint,
    version.sourceRoadmapVersionId,
    version.sourceRoadmapVersionNumber,
    version.sourceRoadmapFingerprint,
  ].join(":"),
  discoveryFingerprint: version.sourceDiscoveryFingerprint,
  assessmentRevision: version.sourceAssessmentRevision,
  assessmentFingerprint: version.sourceAssessmentFingerprint,
  opportunityVersionId: version.sourceOpportunityVersionId,
  opportunityVersionNumber: version.sourceOpportunityVersionNumber,
  opportunityFingerprint: version.sourceOpportunityFingerprint,
  opportunityVersions: [
    {
      id: version.sourceOpportunityVersionId,
      versionNumber: version.sourceOpportunityVersionNumber,
      fingerprint: version.sourceOpportunityFingerprint,
    },
  ],
  recommendationVersionId: version.sourceRecommendationVersionId,
  recommendationVersionNumber: version.sourceRecommendationVersionNumber,
  recommendationFingerprint: version.sourceRecommendationFingerprint,
  recommendationVersions: [
    {
      id: version.sourceRecommendationVersionId,
      versionNumber: version.sourceRecommendationVersionNumber,
      fingerprint: version.sourceRecommendationFingerprint,
    },
  ],
  recommendationDispositions: [],
  roadmapVersionId: version.sourceRoadmapVersionId,
  roadmapVersionNumber: version.sourceRoadmapVersionNumber,
  roadmapFingerprint: version.sourceRoadmapFingerprint,
  gaps: [],
  followUpTemplates: [],
})

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

  if (!engagement) throw new Error("Engagement not found")
}
