import {
  applyProposal,
  canDecideProposal,
  findProposalCoherenceFailure,
  proposalDiff,
  type ProposalCoherenceFailure,
} from "../domain/technology/technology-curator.js"
import {
  findCategoryViolation,
  unknownSourceCodes,
} from "../domain/technology/technology-knowledge.js"
import {
  applyApprovedProposal,
  createTechnologyProposal,
  getTechnologyProposalById,
  listTechnologyProposals,
  listTechnologyUpdateHistory,
  rejectTechnologyProposal,
} from "../repositories/technology-curator.repository.js"
import {
  getTechnologyProfileByCode,
  listTechnologyCategories,
  listTechnologySources,
} from "../repositories/technology-knowledge.repository.js"

import type { ActingUser } from "../domain/access/access.js"
import type { TechnologyKnowledgeMessageId } from "../../../shared/technology-knowledge-messages.js"
import type {
  TechnologyHistoryFilter,
  TechnologyProposalFilter,
  TechnologyProposalReview,
  TechnologyUpdateHistoryEntry,
  TechnologyUpdateProposal,
  TechnologyUpdateProposalDraft,
} from "../../../shared/technology-knowledge.schema.js"

// The Technology Curator (roadmap Phase 5A §4.3; architecture.md §9.3).
//
// Detect → propose → **explicit human approval** → apply → append history.
// Phase 5A implements the last four: detection is manual, and no automated
// vendor watch, fetch, or crawl exists (roadmap Phase 5A "Initial detection may
// be assisted or manual"; architecture.md §1.6).
//
// Nothing here records an **Analysis Run**. Curation is a cross-engagement
// activity and an Analysis Run always belongs to an engagement; the governance
// records are the Technology Update Proposal and, for approved changes, the
// append-only Technology Update History (roadmap Cross-cutting Capabilities;
// coding-standards.md §8).

// Why a proposal could not be drafted or decided. Each is a domain-meaningful
// outcome reported as an identifier the frontend localizes — never as prose
// (coding-standards.md §12A).
export type ProposeFailure =
  | ProposalCoherenceFailure
  | "unknown_category"
  | "unknown_source"

export type DecideFailure = "not_found" | "already_decided" | "apply_failed"

const PROPOSE_MESSAGE: Record<ProposeFailure, TechnologyKnowledgeMessageId> = {
  proposal_content_required: "technology.error.proposal_content_required",
  proposal_content_not_allowed: "technology.error.proposal_content_not_allowed",
  proposal_code_mismatch: "technology.error.proposal_code_mismatch",
  proposal_category_mismatch: "technology.error.proposal_category_mismatch",
  profile_exists: "technology.error.profile_exists",
  profile_missing: "technology.error.profile_missing",
  unknown_category: "technology.error.unknown_category",
  unknown_source: "technology.error.unknown_source",
}

const DECIDE_MESSAGE: Record<DecideFailure, TechnologyKnowledgeMessageId> = {
  not_found: "technology.error.not_found",
  already_decided: "technology.error.already_decided",
  apply_failed: "technology.error.apply_failed",
}

export type ProposeResult =
  | { success: true; proposal: TechnologyUpdateProposal }
  | {
      success: false
      failure: ProposeFailure
      messageId: TechnologyKnowledgeMessageId
      unknownCodes?: string[]
    }

export type DecideResult =
  | {
      success: true
      proposal: TechnologyUpdateProposal
      // Present on an approval only: a rejection changes nothing and therefore
      // appends no history entry.
      historyEntry: TechnologyUpdateHistoryEntry | null
    }
  | {
      success: false
      failure: DecideFailure
      messageId: TechnologyKnowledgeMessageId
    }

// Draft a Technology Update Proposal.
//
// Drafting changes nothing in the knowledge base — that is the point of the
// gate. What it does do is refuse a proposal that could not be applied
// coherently later: an unknown category, a source the trusted registry does not
// contain, a `create` for a profile that already exists, a `revise` for one
// that does not.
//
// The source check is a grounding rule, not a formality: a proposal must derive
// from origins that actually exist in the registry, because inventing a
// provenance is a form of fabricated grounding (agent-rules.md §4.1, §12).
export const proposeTechnologyUpdate = async (
  actor: ActingUser,
  draft: TechnologyUpdateProposalDraft,
): Promise<ProposeResult> => {
  const [categories, sources, currentProfile] = await Promise.all([
    listTechnologyCategories(true),
    listTechnologySources(true),
    getTechnologyProfileByCode(draft.profileCode),
  ])

  const categoryViolation = findCategoryViolation(draft.categoryCode, categories)
  if (categoryViolation !== null) {
    return refuseProposal("unknown_category", [categoryViolation.code])
  }

  const unknownSources = unknownSourceCodes(draft.sourceCodes, sources)
  if (unknownSources.length > 0) {
    return refuseProposal("unknown_source", unknownSources)
  }

  const coherenceFailure = findProposalCoherenceFailure(draft, currentProfile)
  if (coherenceFailure !== null) return refuseProposal(coherenceFailure)

  return {
    success: true,
    proposal: await createTechnologyProposal(draft, actor.id),
  }
}

// Approve a proposal and apply it, or reject it.
//
// **Approval is the only route into the Technology Knowledge Base.** The
// coherence rules are re-checked here rather than trusted from drafting time,
// because the knowledge base can move between a proposal being written and
// being decided — a profile may have been created, retired, or revised in the
// meantime, and applying a stale proposal would overwrite work nobody reviewed.
export const decideTechnologyProposal = async (
  actor: ActingUser,
  proposalId: string,
  decision: "approve" | "reject",
  note: string | null,
): Promise<DecideResult> => {
  const proposal = await getTechnologyProposalById(proposalId)
  if (proposal === null) return refuseDecision("not_found")

  if (!canDecideProposal(proposal)) return refuseDecision("already_decided")

  if (decision === "reject") {
    const rejected = await rejectTechnologyProposal(proposalId, actor.id, note)

    // Null means it was decided between our read and our write.
    if (rejected === null) return refuseDecision("already_decided")

    return { success: true, proposal: rejected, historyEntry: null }
  }

  const currentProfile = await getTechnologyProfileByCode(proposal.profileCode)

  // Re-checked against the knowledge base as it stands *now*, not as it stood
  // when the proposal was drafted.
  const coherenceFailure = findProposalCoherenceFailure(proposal, currentProfile)
  if (coherenceFailure !== null) return refuseDecision("apply_failed")

  const appliedProfile = applyProposal(proposal, currentProfile)

  const result = await applyApprovedProposal(
    proposalId,
    appliedProfile,
    proposal.sourceCodes,
    actor.id,
  )

  if (!result.applied) return refuseDecision("already_decided")

  return {
    success: true,
    proposal: result.proposal,
    historyEntry: result.historyEntry,
  }
}

// One proposal assembled for review: the proposal, the profile as it stands
// today, the computed diff, and the full Technology Sources it cites (UI Kit
// A11). The diff is computed here rather than stored, so a reviewer always
// approves against the profile as it actually is.
export const getProposalReview = async (
  proposalId: string,
): Promise<TechnologyProposalReview | null> => {
  const proposal = await getTechnologyProposalById(proposalId)
  if (proposal === null) return null

  const [currentProfile, allSources] = await Promise.all([
    getTechnologyProfileByCode(proposal.profileCode),
    listTechnologySources(true),
  ])

  const cited = new Set(proposal.sourceCodes)

  return {
    proposal,
    currentProfile,
    diff: proposalDiff(proposal, currentProfile),
    sources: allSources.filter((source) => cited.has(source.code)),
  }
}

export const getTechnologyProposals = (
  filter: TechnologyProposalFilter,
): Promise<TechnologyUpdateProposal[]> => listTechnologyProposals(filter)

export const getTechnologyUpdateHistory = (
  filter: TechnologyHistoryFilter,
): Promise<TechnologyUpdateHistoryEntry[]> => listTechnologyUpdateHistory(filter)

const refuseProposal = (
  failure: ProposeFailure,
  unknownCodes?: string[],
): ProposeResult => ({
  success: false,
  failure,
  messageId: PROPOSE_MESSAGE[failure],
  ...(unknownCodes === undefined ? {} : { unknownCodes }),
})

const refuseDecision = (failure: DecideFailure): DecideResult => ({
  success: false,
  failure,
  messageId: DECIDE_MESSAGE[failure],
})
