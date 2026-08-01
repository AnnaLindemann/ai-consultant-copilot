import { Prisma } from "@prisma/client"

import type {
  TechnologyUpdateHistory as TechnologyUpdateHistoryRow,
  TechnologyUpdateProposal as TechnologyUpdateProposalRow,
  User,
} from "@prisma/client"

import { prisma } from "../lib/prisma.js"
import { ensureTechnologyKnowledgeSeeded } from "./technology-knowledge.repository.js"
import {
  technologyUpdateHistoryEntrySchema,
  technologyUpdateProposalSchema,
  type TechnologyProfileDraft,
  type TechnologyProposalFilter,
  type TechnologyProvenance,
  type TechnologyHistoryFilter,
  type TechnologyUpdateHistoryEntry,
  type TechnologyUpdateProposal,
  type TechnologyUpdateProposalDraft,
} from "../../../shared/technology-knowledge.schema.js"

// Persistence for the Technology Curator (roadmap Phase 5A; architecture.md
// §9.3).
//
// **This is the only module in the codebase that writes a Technology Profile**,
// and it does so in exactly one function — `applyApprovedProposal` — which is
// reachable only after an explicit human approval. There is no engagement-side
// path to it and no autonomous path to it; that is the whole point of keeping
// the profile write here rather than beside the profile reads.
//
// The Technology Update History is **append-only**: this module exposes append
// and read, and no update or delete function for it exists. That mirrors
// `AuditTrail`, whose append-only guarantee is likewise held by the absence of
// a mutation path rather than by a database trigger.

type ProposalRow = TechnologyUpdateProposalRow & {
  createdBy: Pick<User, "id" | "displayName" | "email"> | null
  decidedBy: Pick<User, "id" | "displayName" | "email"> | null
}

type HistoryRow = TechnologyUpdateHistoryRow & {
  approvedBy: Pick<User, "id" | "displayName" | "email"> | null
}

const withProposalActors = {
  createdBy: { select: { id: true, displayName: true, email: true } },
  decidedBy: { select: { id: true, displayName: true, email: true } },
} as const

const withHistoryActor = {
  approvedBy: { select: { id: true, displayName: true, email: true } },
} as const

// --- Proposals -------------------------------------------------------------

export const createTechnologyProposal = async (
  draft: TechnologyUpdateProposalDraft,
  createdByUserId: string,
): Promise<TechnologyUpdateProposal> => {
  await ensureTechnologyKnowledgeSeeded()

  const row = await prisma.technologyUpdateProposal.create({
    data: {
      changeKind: draft.changeKind,
      profileCode: draft.profileCode,
      categoryCode: draft.categoryCode,
      proposedProfile:
        draft.proposedProfile === null
          ? Prisma.DbNull
          : (draft.proposedProfile as unknown as Prisma.InputJsonValue),
      rationale: draft.rationale,
      assumptions: draft.assumptions,
      gaps: draft.gaps,
      sourceCodes: draft.sourceCodes,
      status: "pending",
      createdByUserId,
    },
    include: withProposalActors,
  })

  return toProposal(row)
}

export const listTechnologyProposals = async (
  filter: TechnologyProposalFilter = {},
): Promise<TechnologyUpdateProposal[]> => {
  await ensureTechnologyKnowledgeSeeded()

  const rows = await prisma.technologyUpdateProposal.findMany({
    where: {
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.profileCode === undefined
        ? {}
        : { profileCode: filter.profileCode }),
    },
    orderBy: [{ createdAt: "desc" }],
    take: filter.limit,
    include: withProposalActors,
  })

  return rows.map(toProposal)
}

export const getTechnologyProposalById = async (
  id: string,
): Promise<TechnologyUpdateProposal | null> => {
  await ensureTechnologyKnowledgeSeeded()

  const row = await prisma.technologyUpdateProposal.findUnique({
    where: { id },
    include: withProposalActors,
  })

  return row === null ? null : toProposal(row)
}

// Record a rejection. Nothing reaches the knowledge base and no history entry
// is written: the Technology Update History records **approved, applied**
// revisions only (domain-model.md §2). The proposal itself is kept, decided, as
// the governance record that the change was considered and refused.
//
// The pending status is part of the WHERE, so a proposal that was decided
// between the caller's read and this write is refused rather than re-decided.
export const rejectTechnologyProposal = async (
  id: string,
  decidedByUserId: string,
  note: string | null,
): Promise<TechnologyUpdateProposal | null> => {
  const applied = await prisma.technologyUpdateProposal.updateMany({
    where: { id, status: "pending" },
    data: {
      status: "rejected",
      decidedAt: new Date(),
      decidedByUserId,
      decisionNote: note,
    },
  })

  if (applied.count === 0) return null

  return getTechnologyProposalById(id)
}

// --- The one write path into the Technology Knowledge Base ------------------

export type ApplyProposalResult =
  | {
      applied: true
      proposal: TechnologyUpdateProposal
      historyEntry: TechnologyUpdateHistoryEntry
    }
  | { applied: false; reason: "already_decided" }

// Apply an approved proposal: write the profile, mark the proposal approved and
// applied, and append the history entry — all in **one transaction**.
//
// The three are inseparable by design. A profile that changed without a history
// entry would be an unexplained change in the knowledge base; a history entry
// without the profile change would be a lie about what happened. Either both
// land or neither does.
//
// The proposal's `pending` status is part of the update filter, so two
// administrators approving the same proposal at the same moment cannot both
// apply it: the second finds nothing to update and is told it was already
// decided.
export const applyApprovedProposal = async (
  proposalId: string,
  appliedProfile: TechnologyProfileDraft,
  sourceCodes: readonly string[],
  approvedByUserId: string,
): Promise<ApplyProposalResult> => {
  const now = new Date()

  const outcome = await prisma.$transaction(async (tx) => {
    const pending = await tx.technologyUpdateProposal.findUnique({
      where: { id: proposalId },
      select: { changeKind: true },
    })

    if (pending === null) return null

    const claimed = await tx.technologyUpdateProposal.updateMany({
      where: { id: proposalId, status: "pending" },
      data: {
        status: "approved",
        decidedAt: now,
        decidedByUserId: approvedByUserId,
        appliedAt: now,
      },
    })

    // Nobody claimed it, so nobody applies it. Returning rather than throwing
    // keeps a lost race a domain outcome instead of an error (architecture §13).
    if (claimed.count === 0) return null

    // The profile write. `upsert` covers `create` and `revise` alike: the
    // coherence rules in the domain have already decided which of the two this
    // proposal legitimately is, and re-deriving that here would duplicate them.
    const profile = await tx.technologyProfile.upsert({
      where: { code: appliedProfile.code },
      create: {
        code: appliedProfile.code,
        categoryCode: appliedProfile.categoryCode,
        title: appliedProfile.title,
        summary: appliedProfile.summary,
        details: appliedProfile.details as unknown as Prisma.InputJsonValue,
        matchTerms: appliedProfile.matchTerms,
        tags: appliedProfile.tags,
        status: appliedProfile.status,
        sortOrder: appliedProfile.sortOrder,
        // Applied through the approval gate, so the Technology Update History
        // is this profile's provenance from now on and the product's own seed
        // declaration is cleared rather than left to contradict it.
        origin: "curator",
        originSourceCodes: [],
        revision: 0,
      },
      update: {
        categoryCode: appliedProfile.categoryCode,
        title: appliedProfile.title,
        summary: appliedProfile.summary,
        details: appliedProfile.details as unknown as Prisma.InputJsonValue,
        matchTerms: appliedProfile.matchTerms,
        tags: appliedProfile.tags,
        status: appliedProfile.status,
        sortOrder: appliedProfile.sortOrder,
        origin: "curator",
        originSourceCodes: [],
        revision: { increment: 1 },
      },
    })

    const historyRow = await tx.technologyUpdateHistory.create({
      data: {
        proposalId,
        profileCode: profile.code,
        categoryCode: profile.categoryCode,
        changeKind: pending.changeKind,
        // Preserved on the entry rather than read back through the proposal:
        // the history must keep answering "from which official origin did this
        // come?" even if the registry later changes (architecture.md §9.3).
        sourceCodes: [...sourceCodes],
        // What the profile reads as now, kept so the history records how the
        // knowledge base came to say what it says — not merely that it moved.
        appliedProfile: {
          code: profile.code,
          categoryCode: profile.categoryCode,
          title: profile.title,
          summary: profile.summary,
          details: profile.details,
          matchTerms: profile.matchTerms,
          tags: profile.tags,
          status: profile.status,
          sortOrder: profile.sortOrder,
          origin: profile.origin,
          originSourceCodes: profile.originSourceCodes,
          revision: profile.revision,
        } as unknown as Prisma.InputJsonValue,
        approvedByUserId,
        appliedAt: now,
      },
      include: withHistoryActor,
    })

    return historyRow
  })

  if (outcome === null) return { applied: false, reason: "already_decided" }

  const proposal = await getTechnologyProposalById(proposalId)
  if (proposal === null) {
    // The transaction committed, so the proposal exists; a null here would mean
    // it was removed underneath us, which no code path does.
    throw new Error("The applied Technology Update Proposal could not be read back")
  }

  return {
    applied: true,
    proposal,
    historyEntry: toHistoryEntry(outcome),
  }
}

// --- The append-only history -----------------------------------------------
//
// Read only. There is deliberately no update and no delete function here, and
// adding one would be a review-blocking defect (coding-standards.md §6A).

export const listTechnologyUpdateHistory = async (
  filter: TechnologyHistoryFilter = {},
): Promise<TechnologyUpdateHistoryEntry[]> => {
  await ensureTechnologyKnowledgeSeeded()

  const rows = await prisma.technologyUpdateHistory.findMany({
    where: {
      ...(filter.profileCode === undefined
        ? {}
        : { profileCode: filter.profileCode }),
      ...(filter.categoryCode === undefined
        ? {}
        : { categoryCode: filter.categoryCode }),
    },
    orderBy: [{ appliedAt: "desc" }],
    take: filter.limit,
    include: withHistoryActor,
  })

  return rows.map(toHistoryEntry)
}

// The provenance of each profile that has one, keyed by profile code.
//
// It resolves to the **most recent applied** history entry per profile, which
// is what makes the audit record the single source of truth for provenance
// rather than a copy on the profile that could drift from it (decision D5).
//
// A seeded profile has no approved update behind it and therefore no entry
// here. That is the honest answer — the initial catalogue was not an approved
// change — and callers render it as "no approved update yet" rather than
// inventing a source.
export const technologyProvenanceIndex = async (): Promise<
  Map<string, TechnologyProvenance>
> => {
  await ensureTechnologyKnowledgeSeeded()

  const rows = await prisma.technologyUpdateHistory.findMany({
    orderBy: [{ appliedAt: "desc" }],
    select: {
      profileCode: true,
      proposalId: true,
      sourceCodes: true,
      appliedAt: true,
    },
  })

  const index = new Map<string, TechnologyProvenance>()

  for (const row of rows) {
    // Newest first, so the first entry seen for a profile is its current one.
    if (index.has(row.profileCode)) continue

    index.set(row.profileCode, {
      // A history entry exists only where a human approved a change, so the
      // origin it reports is never in doubt.
      origin: "curator",
      sourceCodes: codeList(row.sourceCodes),
      proposalId: row.proposalId,
      appliedAt: row.appliedAt.toISOString(),
    })
  }

  return index
}

// --- Row mapping -----------------------------------------------------------

const toProposal = (row: ProposalRow): TechnologyUpdateProposal =>
  technologyUpdateProposalSchema.parse({
    id: row.id,
    changeKind: row.changeKind,
    profileCode: row.profileCode,
    categoryCode: row.categoryCode,
    proposedProfile: row.proposedProfile ?? null,
    rationale: row.rationale,
    assumptions: row.assumptions,
    gaps: row.gaps,
    sourceCodes: row.sourceCodes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByName: actorName(row.createdBy),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByUserId: row.decidedByUserId,
    decidedByName: actorName(row.decidedBy),
    decisionNote: row.decisionNote,
    appliedAt: row.appliedAt?.toISOString() ?? null,
  })

const toHistoryEntry = (row: HistoryRow): TechnologyUpdateHistoryEntry =>
  technologyUpdateHistoryEntrySchema.parse({
    id: row.id,
    proposalId: row.proposalId,
    profileCode: row.profileCode,
    categoryCode: row.categoryCode,
    changeKind: row.changeKind,
    sourceCodes: row.sourceCodes,
    appliedProfile: row.appliedProfile,
    approvedByUserId: row.approvedByUserId,
    approvedByName: actorName(row.approvedBy),
    appliedAt: row.appliedAt.toISOString(),
  })

// Who curated or decided, for the reader: the display name if there is one,
// otherwise the address they are known by.
const actorName = (
  actor: { displayName: string | null; email: string } | null,
): string | null => actor && (actor.displayName ?? actor.email)

// A Json list column holds validated strings, but a row is still data from the
// database: anything that is not a string is dropped rather than carried into a
// provenance record as "[object Object]".
const codeList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
