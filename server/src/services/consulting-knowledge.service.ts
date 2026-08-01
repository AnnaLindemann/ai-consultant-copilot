import {
  buildKnowledgePackage,
  findRelationshipViolations,
  searchConsultingKnowledge,
  type EngagementKnowledgeContext,
  type KnowledgeRelationshipViolation,
} from "../domain/knowledge/consulting-knowledge.js"
import {
  createConsultingKnowledgeEntry,
  getConsultingKnowledgeEntryByCode,
  listConsultingKnowledgeEntries,
  updateConsultingKnowledgeEntry,
} from "../repositories/consulting-knowledge.repository.js"
import type {
  ConsultingKnowledgeEntry,
  ConsultingKnowledgeEntryDraft,
  ConsultingKnowledgeFilter,
  ConsultingKnowledgeKind,
  ConsultingKnowledgeSearchResult,
  KnowledgePackage,
  KnowledgeRetrievalStage,
} from "../../../shared/consulting-knowledge.schema.js"
import type { ActingUser } from "../domain/access/access.js"
import type { EngagementWithOrganization } from "../repositories/engagement.repository.js"
import type { Assessment } from "../../../shared/assessment.schema.js"

// The **only** boundary through which an engagement stage reaches curated
// knowledge (roadmap Phase 5; architecture.md §9.4). Two things live here and
// they are deliberately kept apart:
//
//  - `retrieveKnowledgePackage` — the read path a stage uses. It returns a
//    small, ranked package and nothing else; there is no operation on it that
//    writes.
//  - the curation functions — the write path an administrator uses. They are
//    not reachable from any engagement stage.
//
// Phase 5 curates one business domain. The scoping *field* is what lets a
// second domain be added later as curated data; the multi-domain abstraction is
// deliberately not built ahead of it (architecture.md §1.6, §9.1).
const DOMAIN_CODE = "customer-operations"

// --- The retrieval boundary ------------------------------------------------

// Retrieve the curated knowledge package for one engagement at one consulting
// stage. Deterministic by construction: the same engagement against an
// unchanged knowledge base always yields the same entries in the same order,
// because every step after anchor resolution works on codes, curated
// relationships, and integer weights (domain module).
export const retrieveKnowledgePackage = async (
  engagement: EngagementWithOrganization,
  stage: KnowledgeRetrievalStage,
  assessment: Assessment | null = null,
): Promise<KnowledgePackage> => {
  const entries = await listConsultingKnowledgeEntries({ domainCode: DOMAIN_CODE })

  return buildKnowledgePackage(
    entries,
    stage,
    engagementKnowledgeContext(engagement, assessment),
  )
}

// The engagement facts retrieval is allowed to see, and no more. Client- and
// consultant-entered prose is passed only so the curated `matchTerms` can
// resolve it into taxonomy and process *codes* — it is never matched against
// entry text, and it never reaches the ranking. Everything after this point
// works on codes.
const engagementKnowledgeContext = (
  engagement: EngagementWithOrganization,
  assessment: Assessment | null,
): EngagementKnowledgeContext => ({
  domainCode: DOMAIN_CODE,
  situationText: [
    engagement.title,
    engagement.department,
    engagement.organization.industry,
    engagement.statedProblem,
    engagement.currentProcess,
    engagement.desiredOutcome,
    engagement.businessImpact,
    ...textList(engagement.painPoints),
    ...textList(engagement.bottlenecks),
    ...textList(engagement.processSteps),
    ...textList(engagement.currentTools),
    ...textList(engagement.communicationChannels),
    ...textList(engagement.integrationNeeds),
    // What the Assessment already established narrows retrieval the same way
    // discovery does — through the same curated vocabulary, never by matching
    // finding text against entry text.
    ...assessmentText(assessment),
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  ),
})

const assessmentText = (assessment: Assessment | null): string[] => {
  if (assessment === null) return []

  const findings = Object.values(assessment.dimensions).flatMap((dimension) =>
    dimension.findings.flatMap((finding) => [finding.title, finding.detail]),
  )

  return [
    assessment.summary,
    ...findings,
    ...assessment.gaps.map((gap) => gap.description),
  ]
}

// The Json list columns hold validated string lists, but a row is still data
// from the database: anything that is not a string is dropped rather than
// stringified into the haystack as "[object Object]".
const textList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []

// --- The curation boundary -------------------------------------------------

// The curation browser. An administrator may search by text here; a stage never
// can — that freedom must not leak into what is sent to a model.
export const browseKnowledge = async (
  filter: ConsultingKnowledgeFilter,
): Promise<ConsultingKnowledgeSearchResult[]> => {
  const entries = await listConsultingKnowledgeEntries({
    domainCode: filter.domainCode ?? DOMAIN_CODE,
    kind: filter.kind,
    includeInactive: filter.includeInactive,
  })

  return searchConsultingKnowledge(entries, {
    ...filter,
    domainCode: filter.domainCode ?? DOMAIN_CODE,
  })
}

export const getKnowledgeEntry = (
  code: string,
): Promise<ConsultingKnowledgeEntry | null> =>
  getConsultingKnowledgeEntryByCode(code)

export type KnowledgeCurateResult =
  | { success: true; entry: ConsultingKnowledgeEntry }
  | { success: false; failure: "not_found" }
  | { success: false; failure: "duplicate_code" }
  | { success: false; failure: "conflict"; currentRevision: number }
  | {
      success: false
      failure: "invalid_relationship"
      violations: KnowledgeRelationshipViolation[]
    }

export const createKnowledgeEntry = async (
  actor: ActingUser,
  draft: ConsultingKnowledgeEntryDraft,
): Promise<KnowledgeCurateResult> => {
  const entry: ConsultingKnowledgeEntry = { ...draft, revision: 0 }

  const existing = await getConsultingKnowledgeEntryByCode(entry.code)
  if (existing !== null) return { success: false, failure: "duplicate_code" }

  const violations = await relationshipViolationsOf(entry)
  if (violations.length > 0) {
    return { success: false, failure: "invalid_relationship", violations }
  }

  return {
    success: true,
    entry: await createConsultingKnowledgeEntry(entry, actor.id),
  }
}

// Editing and deactivating are the same operation: `active: false` retires an
// entry from every retrieval without deleting the curated work or breaking the
// codes an earlier Analysis Run recorded.
export const updateKnowledgeEntry = async (
  actor: ActingUser,
  code: string,
  expectedRevision: number,
  draft: ConsultingKnowledgeEntryDraft,
): Promise<KnowledgeCurateResult> => {
  const entry: ConsultingKnowledgeEntry = {
    ...draft,
    code,
    revision: expectedRevision,
  }

  const violations = await relationshipViolationsOf(entry)
  if (violations.length > 0) {
    return { success: false, failure: "invalid_relationship", violations }
  }

  const result = await updateConsultingKnowledgeEntry(
    code,
    expectedRevision,
    entry,
    actor.id,
  )

  switch (result.status) {
    case "updated":
      return { success: true, entry: result.entry }
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

// A curated relationship that points at nothing, or at the wrong kind of thing,
// degrades retrieval silently rather than failing — so it is refused at
// curation time. Inactive entries still count as existing targets: deactivating
// a taxonomy node must not invalidate every entry curated against it.
const relationshipViolationsOf = async (
  entry: ConsultingKnowledgeEntry,
): Promise<KnowledgeRelationshipViolation[]> => {
  const known = new Map<string, ConsultingKnowledgeKind>(
    (
      await listConsultingKnowledgeEntries({
        domainCode: entry.domainCode,
        includeInactive: true,
      })
    ).map((existing) => [existing.code, existing.kind]),
  )

  return findRelationshipViolations(entry, known)
}
