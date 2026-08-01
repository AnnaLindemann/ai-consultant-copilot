import type {
  TechnologyChangeKind,
  TechnologyProfileOrigin,
  TechnologyProfileStatus,
  TechnologyProposalStatus,
} from "../../shared/technology-knowledge.schema"

// The technology identifiers the curation surface offers, listed literally.
//
// Every client import from `shared/` is **type-only**: the shared modules sit
// outside the frontend's build root, so a value imported from one does not
// resolve at build time. The identifiers are therefore repeated here and held
// to the shared contract by `i18n/catalogue.test.ts`, which asserts these lists
// are exactly the schema's own options — so a value added to the domain fails a
// test rather than quietly disappearing from the curator's dropdown.
//
// The types above are what keep the entries honest: a value that is not a
// `TechnologyChangeKind` is a compile error.

export const TECHNOLOGY_CHANGE_KINDS: readonly TechnologyChangeKind[] = [
  "create",
  "revise",
  "deprecate",
]

export const TECHNOLOGY_PROFILE_STATUSES: readonly TechnologyProfileStatus[] = [
  "active",
  "deprecated",
]

export const TECHNOLOGY_PROPOSAL_STATUSES: readonly TechnologyProposalStatus[] = [
  "pending",
  "approved",
  "rejected",
]

export const TECHNOLOGY_PROFILE_ORIGINS: readonly TechnologyProfileOrigin[] = [
  "product_seed",
  "curator",
]
