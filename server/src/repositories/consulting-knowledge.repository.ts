import type { ConsultingKnowledgeEntry as ConsultingKnowledgeRow, Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma.js"
import { consultingKnowledgeSeed } from "../domain/knowledge/consulting-knowledge-seed.js"
import {
  consultingKnowledgeEntrySchema,
  type ConsultingKnowledgeEntry,
  type ConsultingKnowledgeKind,
} from "../../../shared/consulting-knowledge.schema.js"

// Persistence for the curated Consulting Knowledge Base.
//
// It is deliberately unlike every engagement-side repository in this codebase:
// it takes no workspace scope, because the knowledge base holds no
// client-specific content and is a product-level asset shared across workspaces
// (architecture.md §9). There is no operation here that an engagement stage can
// use to write — curation reaches this module through the curation service
// only, and the reference direction stays engagement → knowledge
// (architecture.md §9.4).

export type ConsultingKnowledgeQuery = {
  domainCode?: string
  kind?: ConsultingKnowledgeKind
  includeInactive?: boolean
}

let seedPromise: Promise<void> | null = null

// Seeding happens at most once per process and only into an *empty* knowledge
// base. An administrator's curated changes are never overwritten by a restart:
// the moment the base holds a single row, this is a no-op forever
// (roadmap Phase 5 "curation is a deliberate activity").
export const ensureConsultingKnowledgeSeeded = async () => {
  if (seedPromise === null) {
    seedPromise = ensureBaselineConsultingKnowledge().catch((error: unknown) => {
      // A failed seed must not poison the process: the next caller retries
      // rather than inheriting a rejected promise forever.
      seedPromise = null
      throw error
    })
  }

  await seedPromise
}

// Read the curated entries the caller's query narrows to. Retrieval and the
// curation browser both start here; the ranking and selection are the domain's,
// not the database's, so that the ordering is one reviewable rule rather than
// an ORDER BY that has to be kept in step with it.
export const listConsultingKnowledgeEntries = async (
  query: ConsultingKnowledgeQuery = {},
): Promise<ConsultingKnowledgeEntry[]> => {
  await ensureConsultingKnowledgeSeeded()

  const rows = await prisma.consultingKnowledgeEntry.findMany({
    where: {
      ...(query.includeInactive === true ? {} : { active: true }),
      ...(query.kind === undefined ? {} : { kind: query.kind }),
      ...(query.domainCode === undefined ? {} : { domainCode: query.domainCode }),
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })

  return rows.map(toEntry)
}

export const getConsultingKnowledgeEntryByCode = async (
  code: string,
): Promise<ConsultingKnowledgeEntry | null> => {
  await ensureConsultingKnowledgeSeeded()

  const row = await prisma.consultingKnowledgeEntry.findUnique({ where: { code } })
  return row === null ? null : toEntry(row)
}

export const createConsultingKnowledgeEntry = async (
  entry: ConsultingKnowledgeEntry,
  updatedByUserId: string | null,
): Promise<ConsultingKnowledgeEntry> => {
  await ensureConsultingKnowledgeSeeded()

  const row = await prisma.consultingKnowledgeEntry.create({
    data: { ...toRow(entry), updatedByUserId },
  })

  return toEntry(row)
}

export type ConsultingKnowledgeUpdateResult =
  | { status: "updated"; entry: ConsultingKnowledgeEntry }
  | { status: "not_found" }
  | { status: "conflict"; currentRevision: number }

// An update is refused unless the curator was looking at the revision they are
// writing over, so two administrators editing the same entry cannot silently
// clobber one another. The revision is bumped by the repository, never supplied
// by the caller.
export const updateConsultingKnowledgeEntry = async (
  code: string,
  expectedRevision: number,
  entry: Omit<ConsultingKnowledgeEntry, "code" | "revision">,
  updatedByUserId: string | null,
): Promise<ConsultingKnowledgeUpdateResult> => {
  await ensureConsultingKnowledgeSeeded()

  const current = await prisma.consultingKnowledgeEntry.findUnique({ where: { code } })
  if (current === null) return { status: "not_found" }
  if (current.revision !== expectedRevision) {
    return { status: "conflict", currentRevision: current.revision }
  }

  // The revision is part of the WHERE, not only the read above: two concurrent
  // writers that both passed the check cannot both apply.
  const applied = await prisma.consultingKnowledgeEntry.updateMany({
    where: { code, revision: expectedRevision },
    data: toRow({ ...entry, code, revision: expectedRevision + 1 }, updatedByUserId),
  })

  if (applied.count === 0) {
    const latest = await prisma.consultingKnowledgeEntry.findUnique({ where: { code } })
    return latest === null
      ? { status: "not_found" }
      : { status: "conflict", currentRevision: latest.revision }
  }

  const row = await prisma.consultingKnowledgeEntry.findUniqueOrThrow({ where: { code } })
  return { status: "updated", entry: toEntry(row) }
}

const ensureBaselineConsultingKnowledge = async () => {
  const count = await prisma.consultingKnowledgeEntry.count()
  if (count > 0) {
    await reconcileSeededFollowUpTemplateStageScopes()
    return
  }

  await prisma.consultingKnowledgeEntry.createMany({
    data: consultingKnowledgeSeed.map((entry) => toRow(entry, null)),
    skipDuplicates: true,
  })
}

const reconcileSeededFollowUpTemplateStageScopes = async () => {
  const seededTemplateCodes = new Set(
    consultingKnowledgeSeed
      .filter((entry) => entry.kind === "follow_up_template")
      .map((entry) => entry.code),
  )
  const rows = await prisma.consultingKnowledgeEntry.findMany({
    where: {
      code: { in: [...seededTemplateCodes] },
      kind: "follow_up_template",
    },
    select: { code: true, stageScopes: true },
  })

  for (const row of rows) {
    const currentScopes = Array.isArray(row.stageScopes)
      ? row.stageScopes.filter((scope): scope is string => typeof scope === "string")
      : []
    if (currentScopes.includes("report")) continue

    await prisma.consultingKnowledgeEntry.updateMany({
      where: {
        code: row.code,
        kind: "follow_up_template",
      },
      data: {
        stageScopes: [...currentScopes, "report"] as Prisma.InputJsonValue,
        revision: { increment: 1 },
      },
    })
  }
}

const toRow = (
  entry: ConsultingKnowledgeEntry,
  updatedByUserId?: string | null,
): Prisma.ConsultingKnowledgeEntryUncheckedCreateInput => ({
  code: entry.code,
  kind: entry.kind,
  domainCode: entry.domainCode,
  title: entry.title,
  summary: entry.summary,
  tags: entry.tags,
  matchTerms: entry.matchTerms,
  stageScopes: entry.stageScopes,
  taxonomyCodes: entry.taxonomyCodes,
  processCodes: entry.processCodes,
  problemCodes: entry.problemCodes,
  useCaseCodes: entry.useCaseCodes,
  relatedCodes: entry.relatedCodes,
  details: entry.details as Prisma.InputJsonValue,
  sortOrder: entry.sortOrder,
  active: entry.active,
  revision: entry.revision,
  ...(updatedByUserId === undefined ? {} : { updatedByUserId }),
})

// The Json columns are validated on the way out, not trusted: a row written by
// an older shape must fail loudly here rather than reach retrieval half-formed
// (architecture.md §6 "pair every Json payload with a Zod schema").
const toEntry = (row: ConsultingKnowledgeRow): ConsultingKnowledgeEntry =>
  consultingKnowledgeEntrySchema.parse({
    code: row.code,
    kind: row.kind,
    domainCode: row.domainCode,
    title: row.title,
    summary: row.summary,
    tags: row.tags,
    matchTerms: row.matchTerms,
    stageScopes: row.stageScopes,
    taxonomyCodes: row.taxonomyCodes,
    processCodes: row.processCodes,
    problemCodes: row.problemCodes,
    useCaseCodes: row.useCaseCodes,
    relatedCodes: row.relatedCodes,
    details: row.details,
    sortOrder: row.sortOrder,
    active: row.active,
    revision: row.revision,
  })
