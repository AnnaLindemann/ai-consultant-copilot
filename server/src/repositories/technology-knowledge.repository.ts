import type {
  Prisma,
  TechnologyCategory as TechnologyCategoryRow,
  TechnologyProfile as TechnologyProfileRow,
  TechnologySource as TechnologySourceRow,
} from "@prisma/client"

import { prisma } from "../lib/prisma.js"
import {
  technologyCategorySeed,
  technologyProfileSeed,
  technologySourceSeed,
} from "../domain/technology/technology-knowledge-seed.js"
import {
  technologyCategorySchema,
  technologyProfileSchema,
  technologySourceSchema,
  type TechnologyCategory,
  type TechnologyCategoryDraft,
  type TechnologyProfile,
  type TechnologyProfileStatus,
  type TechnologySource,
  type TechnologySourceDraft,
} from "../../../shared/technology-knowledge.schema.js"

// Persistence for the curated Technology Knowledge Base (roadmap Phase 5A).
//
// Like the Consulting Knowledge Base's repository it takes **no workspace
// scope**: the knowledge base holds no client-specific content and is a
// product-level asset shared across workspaces (architecture.md §9).
//
// **This module cannot write a Technology Profile.** Reading profiles lives
// here; creating and changing one lives only in `technology-curator.repository`
// behind an approved proposal. That is deliberate and structural: the "only
// write path is the Technology Curator" invariant (architecture.md §9.3) is
// held by there being no other function that can, not by everyone remembering
// not to call one.
//
// --- Why Categories and Sources are curated directly ------------------------
//
// This is a **deliberate, reviewed interpretation** of the governing
// documentation, recorded here because the documentation can bear two readings
// and a future reader should not have to re-derive the choice.
//
// The gate as written is broad — *"**every** update to the Technology Knowledge
// Base flows through a Technology Update Proposal"* (roadmap Phase 5A DoD), and
// *"the **only** way the Technology Knowledge Base changes…"* (architecture.md
// §9.3; coding-standards.md §6). Read literally, that would cover these two
// registries as well.
//
// It is applied to **Technology Profiles only**, for three reasons:
//
//  1. **A proposal cannot structurally target anything else.** domain-model.md
//     §2 defines a proposal as targeting *"the Technology Knowledge Base (a
//     specific Technology Profile within a Technology Category)"* — the
//     category is the classification of the targeted profile, never the target.
//     No documented proposal shape changes a category or a source.
//  2. **The documentation describes these two as curated registries.**
//     architecture.md Assumptions: categories *"can be added or nested **through
//     curation** without a code change"*. domain-model.md §2: a Technology
//     Source *"is not itself a Technology Profile; it is a **curated registry**
//     of trusted origins"*.
//  3. **The gate could not otherwise bootstrap.** Every proposal must cite at
//     least one *existing* Technology Source. A proposal that adds a source
//     could never satisfy its own precondition, so the registry has to be
//     writable outside the gate for the gate to work at all.
//
// The gate's stated purpose supports this too: coding-standards.md §6 requires
// *"no autonomous-AI write and no engagement-reachable write"*. Neither
// registry has either — both are Administrator-only, authorized through the
// shared AccessPolicy, revision-protected, and audited.
//
// **Reviewed and confirmed** as the Phase 5A interpretation: a single
// governance rule covering all three record kinds would require new proposal
// semantics (a polymorphic target on the append-only history) plus a new,
// undocumented exemption for source bootstrapping — extending the approved
// architecture rather than implementing it, which is a documentation decision
// under implementation-workflow.md §9, not an implementation choice.
//
// So the rule this codebase holds is precise: **no Technology *Profile* changes
// without an approved proposal.** The registries around it are curated data.

let seedPromise: Promise<void> | null = null

// Seeding happens at most once per process and only into an *empty* knowledge
// base, exactly as the Consulting Knowledge Base's does. A curator's work is
// never overwritten by a restart: the moment the base holds a single profile,
// this is a no-op forever.
//
// The seed is the initial product catalogue, not a bypass of the curator: after
// it, every addition and modification goes through propose → approve → apply →
// history.
export const ensureTechnologyKnowledgeSeeded = async () => {
  if (seedPromise === null) {
    seedPromise = seedTechnologyKnowledgeIfEmpty().catch((error: unknown) => {
      // A failed seed must not poison the process: the next caller retries
      // rather than inheriting a rejected promise forever.
      seedPromise = null
      throw error
    })
  }

  await seedPromise
}

// --- Reads -----------------------------------------------------------------

export type TechnologyProfileQuery = {
  categoryCode?: string
  status?: TechnologyProfileStatus
}

export const listTechnologyProfiles = async (
  query: TechnologyProfileQuery = {},
): Promise<TechnologyProfile[]> => {
  await ensureTechnologyKnowledgeSeeded()

  const rows = await prisma.technologyProfile.findMany({
    where: {
      ...(query.categoryCode === undefined
        ? {}
        : { categoryCode: query.categoryCode }),
      ...(query.status === undefined ? {} : { status: query.status }),
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })

  return rows.map(toProfile)
}

export const getTechnologyProfileByCode = async (
  code: string,
): Promise<TechnologyProfile | null> => {
  await ensureTechnologyKnowledgeSeeded()

  const row = await prisma.technologyProfile.findUnique({ where: { code } })
  return row === null ? null : toProfile(row)
}

export const listTechnologyCategories = async (
  includeInactive = false,
): Promise<TechnologyCategory[]> => {
  await ensureTechnologyKnowledgeSeeded()

  const rows = await prisma.technologyCategory.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })

  return rows.map(toCategory)
}

export const listTechnologySources = async (
  includeInactive = false,
): Promise<TechnologySource[]> => {
  await ensureTechnologyKnowledgeSeeded()

  const rows = await prisma.technologySource.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ code: "asc" }],
  })

  return rows.map(toSource)
}

// --- Registry curation -----------------------------------------------------

export type RegistryWriteResult<TRecord> =
  | { status: "saved"; record: TRecord }
  | { status: "duplicate_code" }
  | { status: "not_found" }
  | { status: "conflict"; currentRevision: number }

export const createTechnologyCategory = async (
  draft: TechnologyCategoryDraft,
  updatedByUserId: string | null,
): Promise<RegistryWriteResult<TechnologyCategory>> => {
  await ensureTechnologyKnowledgeSeeded()

  const existing = await prisma.technologyCategory.findUnique({
    where: { code: draft.code },
  })
  if (existing !== null) return { status: "duplicate_code" }

  const row = await prisma.technologyCategory.create({
    data: { ...categoryRow(draft), revision: 0, updatedByUserId },
  })

  return { status: "saved", record: toCategory(row) }
}

// An update is refused unless the curator was looking at the revision they are
// writing over, so two administrators editing the same record cannot silently
// clobber one another. The revision is bumped by the repository, never supplied
// by the caller.
export const updateTechnologyCategory = async (
  code: string,
  expectedRevision: number,
  draft: TechnologyCategoryDraft,
  updatedByUserId: string | null,
): Promise<RegistryWriteResult<TechnologyCategory>> => {
  await ensureTechnologyKnowledgeSeeded()

  const current = await prisma.technologyCategory.findUnique({ where: { code } })
  if (current === null) return { status: "not_found" }
  if (current.revision !== expectedRevision) {
    return { status: "conflict", currentRevision: current.revision }
  }

  // The revision is part of the WHERE, not only the read above: two concurrent
  // writers that both passed the check cannot both apply.
  const applied = await prisma.technologyCategory.updateMany({
    where: { code, revision: expectedRevision },
    data: {
      ...categoryRow({ ...draft, code }),
      revision: expectedRevision + 1,
      updatedByUserId,
    },
  })

  if (applied.count === 0) {
    const latest = await prisma.technologyCategory.findUnique({ where: { code } })
    return latest === null
      ? { status: "not_found" }
      : { status: "conflict", currentRevision: latest.revision }
  }

  const row = await prisma.technologyCategory.findUniqueOrThrow({ where: { code } })
  return { status: "saved", record: toCategory(row) }
}

export const createTechnologySource = async (
  draft: TechnologySourceDraft,
  updatedByUserId: string | null,
): Promise<RegistryWriteResult<TechnologySource>> => {
  await ensureTechnologyKnowledgeSeeded()

  const existing = await prisma.technologySource.findUnique({
    where: { code: draft.code },
  })
  if (existing !== null) return { status: "duplicate_code" }

  const row = await prisma.technologySource.create({
    data: { ...sourceRow(draft), revision: 0, updatedByUserId },
  })

  return { status: "saved", record: toSource(row) }
}

export const updateTechnologySource = async (
  code: string,
  expectedRevision: number,
  draft: TechnologySourceDraft,
  updatedByUserId: string | null,
): Promise<RegistryWriteResult<TechnologySource>> => {
  await ensureTechnologyKnowledgeSeeded()

  const current = await prisma.technologySource.findUnique({ where: { code } })
  if (current === null) return { status: "not_found" }
  if (current.revision !== expectedRevision) {
    return { status: "conflict", currentRevision: current.revision }
  }

  const applied = await prisma.technologySource.updateMany({
    where: { code, revision: expectedRevision },
    data: {
      ...sourceRow({ ...draft, code }),
      revision: expectedRevision + 1,
      updatedByUserId,
    },
  })

  if (applied.count === 0) {
    const latest = await prisma.technologySource.findUnique({ where: { code } })
    return latest === null
      ? { status: "not_found" }
      : { status: "conflict", currentRevision: latest.revision }
  }

  const row = await prisma.technologySource.findUniqueOrThrow({ where: { code } })
  return { status: "saved", record: toSource(row) }
}

// --- Seeding ---------------------------------------------------------------

// Emptiness is judged on the categories, because they are written first and
// everything else depends on them: a half-seeded base with categories but no
// profiles must not be re-seeded from the top.
const seedTechnologyKnowledgeIfEmpty = async () => {
  const count = await prisma.technologyCategory.count()
  if (count > 0) return

  await prisma.$transaction(async (tx) => {
    await tx.technologyCategory.createMany({
      data: technologyCategorySeed.map((category) => categoryRow(category)),
      skipDuplicates: true,
    })

    await tx.technologySource.createMany({
      data: technologySourceSeed.map((source) => sourceRow(source)),
      skipDuplicates: true,
    })

    // The profiles are written last: each one names a category, and the foreign
    // key means the categories have to exist first.
    await tx.technologyProfile.createMany({
      data: technologyProfileSeed.map((profile) => profileSeedRow(profile)),
      skipDuplicates: true,
    })
  })
}

// --- Row mapping -----------------------------------------------------------

const categoryRow = (
  category: TechnologyCategoryDraft,
): Prisma.TechnologyCategoryUncheckedCreateInput => ({
  code: category.code,
  title: category.title,
  summary: category.summary,
  sortOrder: category.sortOrder,
  active: category.active,
})

const sourceRow = (
  source: TechnologySourceDraft,
): Prisma.TechnologySourceUncheckedCreateInput => ({
  code: source.code,
  name: source.name,
  summary: source.summary,
  officialChannels: source.officialChannels as unknown as Prisma.InputJsonValue,
  active: source.active,
})

// Used by the seed alone. The curator's apply path builds its own row, because
// it also has to bump the revision and record the change in history.
const profileSeedRow = (
  profile: TechnologyProfile,
): Prisma.TechnologyProfileUncheckedCreateInput => ({
  code: profile.code,
  categoryCode: profile.categoryCode,
  title: profile.title,
  summary: profile.summary,
  details: profile.details as unknown as Prisma.InputJsonValue,
  matchTerms: profile.matchTerms,
  tags: profile.tags,
  status: profile.status,
  sortOrder: profile.sortOrder,
  origin: profile.origin,
  originSourceCodes: profile.originSourceCodes,
  revision: profile.revision,
})

// The Json columns are validated on the way out, not trusted: a row written by
// an older shape must fail loudly here rather than reach retrieval half-formed
// (architecture.md §6 "pair every Json payload with a Zod schema").
const toProfile = (row: TechnologyProfileRow): TechnologyProfile =>
  technologyProfileSchema.parse({
    code: row.code,
    categoryCode: row.categoryCode,
    title: row.title,
    summary: row.summary,
    details: row.details,
    matchTerms: row.matchTerms,
    tags: row.tags,
    status: row.status,
    sortOrder: row.sortOrder,
    origin: row.origin,
    originSourceCodes: row.originSourceCodes,
    revision: row.revision,
  })

const toCategory = (row: TechnologyCategoryRow): TechnologyCategory =>
  technologyCategorySchema.parse({
    code: row.code,
    title: row.title,
    summary: row.summary,
    sortOrder: row.sortOrder,
    active: row.active,
    revision: row.revision,
  })

const toSource = (row: TechnologySourceRow): TechnologySource =>
  technologySourceSchema.parse({
    code: row.code,
    name: row.name,
    summary: row.summary,
    officialChannels: row.officialChannels,
    active: row.active,
    revision: row.revision,
  })
