import type {
  TechnologyProfile,
  TechnologyProfileDraft,
  TechnologyProposalFieldDiff,
  TechnologyUpdateProposal,
  TechnologyUpdateProposalDraft,
} from "../../../../shared/technology-knowledge.schema.js"

// The Technology Curator's rules (roadmap Phase 5A §4.3; architecture.md §9.3).
//
// The curator is the **only** write path into the Technology Knowledge Base:
// detect → propose → explicit human approval → apply → append history. This
// module owns the part of that which is a business rule rather than a query:
// what makes a proposal coherent, which decisions are legal, and what applying
// an approved proposal produces.
//
// It is pure. No I/O, no persistence, no provider calls — which is what makes
// the approval gate reviewable and testable without a database.
//
// Two things deliberately do **not** live here: how a proposal is stored, and
// how it is authorized. The first is persistence; the second is the shared
// AccessPolicy, which this phase asks rather than re-implements.

// Why a proposal cannot be recorded as drafted. Each is a domain-meaningful
// outcome the curator can act on, not an exception (architecture.md §13).
export type ProposalCoherenceFailure =
  | "proposal_content_required"
  | "proposal_content_not_allowed"
  | "proposal_code_mismatch"
  | "proposal_category_mismatch"
  | "profile_exists"
  | "profile_missing"

// Whether the proposal describes a change that makes sense against the
// knowledge base as it currently stands.
//
// A `create` must not target a profile that already exists, and a `revise` or
// `deprecate` must target one that does — otherwise approving it later would
// either overwrite a profile nobody reviewed or apply a change to nothing. The
// check is repeated at apply time, because the knowledge base can move between
// drafting and approval.
export const findProposalCoherenceFailure = (
  draft: TechnologyUpdateProposalDraft,
  currentProfile: TechnologyProfile | null,
): ProposalCoherenceFailure | null => {
  if (draft.changeKind === "deprecate") {
    // A deprecation retires a profile; restating its content would invite the
    // reviewer to approve a rewrite disguised as a retirement.
    if (draft.proposedProfile !== null) return "proposal_content_not_allowed"
    if (currentProfile === null) return "profile_missing"

    return null
  }

  if (draft.proposedProfile === null) return "proposal_content_required"

  // The proposal's target and its content must name the same profile in the
  // same category, so what a reviewer reads is what would be applied.
  if (draft.proposedProfile.code !== draft.profileCode) {
    return "proposal_code_mismatch"
  }
  if (draft.proposedProfile.categoryCode !== draft.categoryCode) {
    return "proposal_category_mismatch"
  }

  if (draft.changeKind === "create" && currentProfile !== null) {
    return "profile_exists"
  }
  if (draft.changeKind === "revise" && currentProfile === null) {
    return "profile_missing"
  }

  return null
}

// Only a pending proposal can be decided. Both decisions are terminal: an
// approved proposal has already changed the knowledge base and a rejected one
// never will, so re-deciding either would either double-apply a change or
// rewrite a governance record that is supposed to stand.
export const canDecideProposal = (
  proposal: Pick<TechnologyUpdateProposal, "status">,
): boolean => proposal.status === "pending"

// What the knowledge base should hold once an approved proposal is applied.
//
// The revision is bumped by the caller's persistence, not decided here; this
// function answers only "what does the profile say now?". A deprecation keeps
// every word of the profile and changes its status alone — the history has to
// keep showing what was retired, not an emptied record of it.
export const applyProposal = (
  proposal: Pick<
    TechnologyUpdateProposal,
    "changeKind" | "profileCode" | "proposedProfile"
  >,
  currentProfile: TechnologyProfile | null,
): TechnologyProfileDraft => {
  if (proposal.changeKind === "deprecate") {
    if (currentProfile === null) {
      // Guarded by the coherence check before approval and again before apply.
      throw new Error("A deprecation must target an existing Technology Profile")
    }

    // Revision, origin, and the seed's source declaration are all decided by
    // the path a change arrives through, not by its content — so a deprecation
    // hands back content alone and lets the apply step own the rest.
    const {
      revision: _revision,
      origin: _origin,
      originSourceCodes: _originSourceCodes,
      ...content
    } = currentProfile

    return { ...content, status: "deprecated" }
  }

  if (proposal.proposedProfile === null) {
    throw new Error("A create or revise proposal must carry its proposed profile")
  }

  return proposal.proposedProfile
}

// --- The review diff -------------------------------------------------------

// The fields a reviewer compares, in a fixed order so two reviews of the same
// change read the same way.
const DIFF_FIELDS = [
  "title",
  "summary",
  "categoryCode",
  "status",
  "role",
  "strengths",
  "limitations",
  "suitability",
  "matchTerms",
  "tags",
] as const

// The side-by-side an administrator approves or rejects against (UI Kit A11).
//
// It is computed rather than stored: a persisted diff would go stale the moment
// the profile moved beneath it, and a reviewer would then be approving against
// a picture that is no longer true.
//
// Values are rendered as string lists so a scalar and a list compare the same
// way, and the reviewer sees an added or removed line rather than two blobs.
export const proposalDiff = (
  proposal: Pick<
    TechnologyUpdateProposal,
    "changeKind" | "categoryCode" | "proposedProfile"
  >,
  currentProfile: TechnologyProfile | null,
): TechnologyProposalFieldDiff[] => {
  const after =
    proposal.changeKind === "deprecate"
      ? currentProfile === null
        ? null
        : { ...currentProfile, status: "deprecated" as const }
      : proposal.proposedProfile

  return DIFF_FIELDS.map((field) => {
    const before = fieldValues(currentProfile, field)
    const next = fieldValues(after, field)

    return {
      field,
      before,
      after: next,
      changed: !sameValues(before, next),
    }
  })
}

type DiffField = (typeof DIFF_FIELDS)[number]

const fieldValues = (
  profile:
    | (TechnologyProfileDraft & { revision?: number })
    | TechnologyProfile
    | null,
  field: DiffField,
): string[] => {
  if (profile === null) return []

  switch (field) {
    case "title":
      return [profile.title]
    case "summary":
      return [profile.summary]
    case "categoryCode":
      return [profile.categoryCode]
    case "status":
      return [profile.status]
    case "role":
      return [profile.details.role]
    case "strengths":
      return [...profile.details.strengths]
    case "limitations":
      return [...profile.details.limitations]
    case "suitability":
      return [...profile.details.suitability]
    case "matchTerms":
      return [...profile.matchTerms]
    case "tags":
      return [...profile.tags]
  }
}

const sameValues = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])
