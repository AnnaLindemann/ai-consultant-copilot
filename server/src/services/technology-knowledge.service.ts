import {
  buildTechnologyPackage,
  searchTechnologyProfiles,
} from "../domain/technology/technology-knowledge.js"
import {
  createTechnologyCategory,
  createTechnologySource,
  getTechnologyProfileByCode,
  listTechnologyCategories,
  listTechnologyProfiles,
  listTechnologySources,
  updateTechnologyCategory,
  updateTechnologySource,
  type RegistryWriteResult,
} from "../repositories/technology-knowledge.repository.js"
import { technologyProvenanceIndex } from "../repositories/technology-curator.repository.js"

import type { ActingUser } from "../domain/access/access.js"
import type {
  TechnologyCategory,
  TechnologyCategoryDraft,
  TechnologyPackage,
  TechnologyProfile,
  TechnologyProfileFilter,
  TechnologyRetrievalContext,
  TechnologySource,
  TechnologySourceDraft,
} from "../../../shared/technology-knowledge.schema.js"

// The **only** boundary through which anything reaches curated technology
// knowledge (roadmap Phase 5A; architecture.md §9.4). Three things live here
// and they are deliberately kept apart:
//
//  - `retrieveTechnologyPackage` — the read path a later stage uses. It returns
//    a small, ranked package and nothing else; there is no operation on it that
//    writes.
//  - the browse functions — the administrator's own lookup surface.
//  - the registry curation functions — categories and sources.
//
// **Technology Profiles are not written here.** Creating or changing one goes
// through `technology-curator.service`, behind an explicit human approval.

// --- The retrieval boundary ------------------------------------------------

// Retrieve the deterministic technology package for a retrieval context.
//
// Deterministic by construction: the same context against an unchanged
// knowledge base always yields the same profiles in the same order, because
// every step after text matching works on integer weights and byte-wise code
// comparison (domain module).
//
// Provenance travels with each selection, resolved from the profile's most
// recent applied Technology Update History entry rather than duplicated onto
// the profile — so the audit record stays the single source of truth and a
// later stage can show *where a recommended technology's information came
// from* (decision D5).
//
// This is the contract the Recommendation stage consumes (roadmap Phase 6). It
// deliberately knows nothing about opportunities, recommendations, or
// engagements: it takes categories and free text, and returns stable profile
// codes — the engagement side assembles the context and reads the answer.
export const retrieveTechnologyPackage = async (
  context: TechnologyRetrievalContext,
): Promise<TechnologyPackage> => {
  const [profiles, provenance] = await Promise.all([
    listTechnologyProfiles(),
    technologyProvenanceIndex(),
  ])

  return buildTechnologyPackage(profiles, provenance, context)
}

// Every Technology Profile a *consultant* may ground a recommendation's
// technology suggestion in, by code (roadmap Phase 6).
//
// Deprecated profiles are excluded, for the same reason retrieval never selects
// one: a recommendation must not be newly grounded in knowledge the curator has
// retired. A profile that a stored recommendation already cites stays readable
// there — the citation carries its own title snapshot.
//
// This is a **read**, exactly like retrieval, and it writes nothing: the only
// write path to a Technology Profile remains the Technology Curator applying an
// approved proposal (architecture.md §9.3).
export const listCitableTechnology = async (): Promise<
  Map<string, { categoryCode: string; title: string }>
> => {
  const profiles = await listTechnologyProfiles({ status: "active" })

  return new Map(
    profiles.map((profile) => [
      profile.code,
      { categoryCode: profile.categoryCode, title: profile.title },
    ]),
  )
}

// --- The browse boundary ---------------------------------------------------

export const browseTechnologyProfiles = async (
  filter: TechnologyProfileFilter,
): Promise<TechnologyProfile[]> => {
  const profiles = await listTechnologyProfiles()

  return searchTechnologyProfiles(profiles, filter)
}

export const getTechnologyProfile = (
  code: string,
): Promise<TechnologyProfile | null> => getTechnologyProfileByCode(code)

export const getTechnologyCategories = (): Promise<TechnologyCategory[]> =>
  listTechnologyCategories(true)

export const getTechnologySources = (): Promise<TechnologySource[]> =>
  listTechnologySources(true)

// --- Registry curation -----------------------------------------------------

export type RegistryCurateResult<TRecord> =
  | { success: true; record: TRecord }
  | { success: false; failure: "duplicate_code" }
  | { success: false; failure: "not_found" }
  | { success: false; failure: "conflict"; currentRevision: number }

export const curateCategory = async (
  actor: ActingUser,
  draft: TechnologyCategoryDraft,
  expectedRevision: number | null,
): Promise<RegistryCurateResult<TechnologyCategory>> => {
  const result =
    expectedRevision === null
      ? await createTechnologyCategory(draft, actor.id)
      : await updateTechnologyCategory(
          draft.code,
          expectedRevision,
          draft,
          actor.id,
        )

  return toCurateResult(result)
}

export const curateSource = async (
  actor: ActingUser,
  draft: TechnologySourceDraft,
  expectedRevision: number | null,
): Promise<RegistryCurateResult<TechnologySource>> => {
  const result =
    expectedRevision === null
      ? await createTechnologySource(draft, actor.id)
      : await updateTechnologySource(draft.code, expectedRevision, draft, actor.id)

  return toCurateResult(result)
}

const toCurateResult = <TRecord>(
  result: RegistryWriteResult<TRecord>,
): RegistryCurateResult<TRecord> => {
  switch (result.status) {
    case "saved":
      return { success: true, record: result.record }
    case "duplicate_code":
      return { success: false, failure: "duplicate_code" }
    case "not_found":
      return { success: false, failure: "not_found" }
    case "conflict":
      return {
        success: false,
        failure: "conflict",
        currentRevision: result.currentRevision,
      }
  }
}
