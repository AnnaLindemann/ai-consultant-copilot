import { canonicalStageContent } from "./canonical-content.js"
import { opportunitiesById } from "./opportunities.js"

import type {
  Assessment,
  AssessmentFinding,
  AssessmentFindingId,
} from "../../../../shared/assessment.schema.js"
import type { ConsultingKnowledgeKind } from "../../../../shared/consulting-knowledge.schema.js"
import type {
  Opportunity,
  OpportunityId,
  OpportunityPrioritization,
} from "../../../../shared/opportunity.schema.js"
import type {
  KnowledgeGrounding,
  RecommendationDiscoveryTrace,
  RecommendationOpportunityCitation,
  RecommendationReviewState,
  RecommendationSet,
  RecommendationSetSubmission,
  ResolvedRecommendation,
  ResolvedRecommendationSet,
  TechnologyGrounding,
} from "../../../../shared/recommendation.schema.js"

// Business rules of the Solution Matching & Grounded Recommendations stage
// (roadmap Phase 6). Pure and framework-free: no HTTP, no persistence, no
// prompts, no provider calls (architecture.md §4; coding-standards.md §6).

// The kinds of curated consulting knowledge that can *ground* a recommendation.
//
// The documentation is specific about what justifies an approach: a
// recommendation is grounded in Consulting Knowledge Base knowledge "typically
// an AI Use Case and its Solution Pattern" (agent-rules.md §3, §7), and Phase 6
// matches Opportunities against exactly those two kinds. Citing only, say, a
// risk model would be citing something that qualifies an approach rather than
// something that justifies one, so at least one citation must be of these kinds.
export const GROUNDING_KINDS: readonly ConsultingKnowledgeKind[] = [
  "ai_use_case",
  "solution_pattern",
]

// Solution matching connects *prioritized* Opportunities to reusable knowledge
// (roadmap Phase 6). With no Opportunities there is nothing to match, and
// generating anyway would force the AI to invent what the client should pursue
// (agent-rules.md §3, §12).
export const hasOpportunitiesToMatch = (
  prioritization: OpportunityPrioritization | null,
): boolean =>
  prioritization !== null && prioritization.opportunities.length > 0

// Grounding is retrieved and supplied to the model, never searched by it
// (architecture.md §5). With nothing retrieved there is nothing to ground a
// recommendation in, and "a recommendation that is not traceable to Consulting
// Knowledge Base knowledge is not valid output" — so the stage refuses rather
// than producing an ungroundable draft (agent-rules.md §3, §4).
export const hasKnowledgeToGroundWith = (
  knowledgeCodes: readonly string[],
): boolean => knowledgeCodes.length > 0

// Re-running over consultant-edited work needs explicit confirmation. The server
// refuses the overwrite unless the consultant has chosen to replace their own
// edits (architecture.md §5; agent-rules.md §10).
export const canReplaceRecommendationVersion = (
  currentReviewState: RecommendationReviewState | null,
  replaceConsultantEdits: boolean,
): boolean =>
  currentReviewState === null ||
  currentReviewState === "ai_draft" ||
  replaceConsultantEdits

// Whether the Opportunities have moved on since this version was matched against
// them. Content-based rather than time-based, so a save that changed nothing
// does not make the recommendations look stale, and any real edit does.
// Staleness is only ever a *recommendation* to regenerate — the product never
// rewrites an earlier conclusion behind the consultant's back (agent-rules.md
// §15).
export const isRecommendationVersionStale = (
  versionOpportunityFingerprint: string | null,
  currentOpportunityFingerprint: string | null,
): boolean =>
  versionOpportunityFingerprint !== null &&
  currentOpportunityFingerprint !== null &&
  versionOpportunityFingerprint !== currentOpportunityFingerprint

// --- Grounding resolution ---------------------------------------------------

// What a curated entry looks like to this module: its identity and the snapshot
// a resolved citation carries. Supplied by the caller rather than looked up
// here, so the rule stays pure and so the caller decides *which* entries are
// citable — the retrieved package for the model, the curated base for the
// consultant (see the note on `resolveRecommendationGrounding`).
export type CitableKnowledge = ReadonlyMap<
  string,
  { kind: ConsultingKnowledgeKind; title: string }
>

export type CitableTechnology = ReadonlyMap<
  string,
  { categoryCode: string; title: string }
>

export type RecommendationGroundingResolution =
  | { resolved: true; recommendationSet: ResolvedRecommendationSet }
  | {
      resolved: false
      // Each failure is named separately, so the consultant sees *what* was
      // fabricated rather than only that something was.
      unknownOpportunityIds: OpportunityId[]
      unknownKnowledgeCodes: string[]
      unknownTechnologyCodes: string[]
      // Recommendations whose citations all resolve but none of which justifies
      // an approach — grounded in nothing that explains *why it fits*.
      ungroundedRecommendationTitles: string[]
    }

// Resolve a recommendation set's citations into the grounding a stored version
// carries.
//
// This is where the grounding invariant is enforced rather than hoped for
// (architecture.md §4.3): a recommendation is valid only if it is traceable
// backward to Discovery facts and outward to the Consulting Knowledge Base
// entries that justify its approach, with any technologies or models it names
// additionally referencing Technology Knowledge Base entries. A citation that
// names something the caller may not cite is **fabricated grounding** and is
// refused outright rather than tolerated as a near miss (agent-rules.md §3, §12).
//
// The rule is the same whoever cited it; what differs is the citable set the
// caller supplies. The model may cite only what was *retrieved for it* — "it
// must not invent entries in either knowledge base, cite knowledge that was not
// retrieved…" (agent-rules.md §4). The consultant may cite any active curated
// entry: they are the expert, they may ground a proposal in knowledge the
// deterministic retrieval did not surface, and agent-rules constrains the AI,
// not the person reviewing it.
//
// The snapshots — the opportunity's title and rank, the discovery trace, the
// knowledge kind and title, the technology category and title — are read from
// persisted state and from the citable sets, **never** taken from the caller, so
// a preserved version still shows what it was grounded in after the
// Opportunities and the knowledge bases have moved on.
export const resolveRecommendationGrounding = (
  submission: RecommendationSetSubmission,
  sources: {
    opportunities: OpportunityPrioritization
    assessment: Assessment | null
    knowledge: CitableKnowledge
    technology: CitableTechnology
  },
): RecommendationGroundingResolution => {
  const opportunities = opportunitiesById(sources.opportunities)
  const findings = assessmentFindingsById(sources.assessment)

  const unknownOpportunityIds = unique(
    submission.recommendations
      .map((recommendation) => recommendation.opportunityId)
      .filter((opportunityId) => !opportunities.has(opportunityId)),
  )

  const unknownKnowledgeCodes = unique(
    submission.recommendations
      .flatMap((recommendation) => recommendation.knowledgeGrounding)
      .map((grounding) => grounding.code)
      .filter((code) => !sources.knowledge.has(code)),
  )

  const unknownTechnologyCodes = unique(
    submission.recommendations
      .flatMap((recommendation) => recommendation.technologyGrounding)
      .map((grounding) => grounding.code)
      .filter((code) => !sources.technology.has(code)),
  )

  // Checked only where every code resolved: a recommendation whose citations are
  // unknown is already refused, and reporting it as ungrounded as well would
  // name the same defect twice.
  const ungroundedRecommendationTitles =
    unknownKnowledgeCodes.length === 0
      ? submission.recommendations
          .filter(
            (recommendation) =>
              !recommendation.knowledgeGrounding.some((grounding) =>
                GROUNDING_KINDS.includes(
                  sources.knowledge.get(grounding.code)!.kind,
                ),
              ),
          )
          .map((recommendation) => recommendation.title)
      : []

  if (
    unknownOpportunityIds.length > 0 ||
    unknownKnowledgeCodes.length > 0 ||
    unknownTechnologyCodes.length > 0 ||
    ungroundedRecommendationTitles.length > 0
  ) {
    return {
      resolved: false,
      unknownOpportunityIds,
      unknownKnowledgeCodes,
      unknownTechnologyCodes,
      ungroundedRecommendationTitles,
    }
  }

  return {
    resolved: true,
    recommendationSet: {
      ...submission,
      recommendations: submission.recommendations.map(
        ({ opportunityId, ...content }): ResolvedRecommendation => ({
          ...content,
          // Guarded above: every id reaching here is present.
          opportunity: citationOf(opportunities.get(opportunityId)!, findings),
          knowledgeGrounding: content.knowledgeGrounding.map(
            (grounding): KnowledgeGrounding => ({
              ...grounding,
              ...sources.knowledge.get(grounding.code)!,
            }),
          ),
          technologyGrounding: content.technologyGrounding.map(
            (grounding): TechnologyGrounding => ({
              ...grounding,
              ...sources.technology.get(grounding.code)!,
            }),
          ),
        }),
      ),
    },
  }
}

// Give every recommendation an identity, keeping the ones it already has. The
// Implementation Roadmap sequences accepted Recommendations, so identity must
// not be derived from a recommendation's own text: neither the model nor the
// browser mints one (coding-standards.md §6; mirrors the Assessment's and the
// Opportunities' identity rules).
export const identifyRecommendations = (
  resolved: ResolvedRecommendationSet,
  mintId: () => string,
): RecommendationSet => ({
  ...resolved,
  recommendations: resolved.recommendations.map((recommendation) => ({
    ...recommendation,
    id: recommendation.id ?? mintId(),
  })),
})

// The set in the order the consultant prioritized the Opportunities it
// addresses. The prioritization is the engagement's decision about where effort
// belongs, so the recommendations that serve it are read in the same order
// rather than in whatever order they were generated. Recommendations addressing
// the same Opportunity keep their relative order, which keeps the stored set
// reproducible.
export const inOpportunityOrder = (
  recommendationSet: RecommendationSet,
): RecommendationSet => ({
  ...recommendationSet,
  recommendations: [...recommendationSet.recommendations].sort(
    (one, other) =>
      one.opportunity.priorityRank - other.opportunity.priorityRank,
  ),
})

// The recommendation set's content in a stable, order-independent form, for the
// same reason the earlier stages have one.
export const canonicalRecommendationContent = (
  recommendationSet: RecommendationSet,
): string => canonicalStageContent(recommendationSet)

// --- Internals --------------------------------------------------------------

// The Opportunity citation a stored recommendation carries, together with the
// backward trace to the Discovery Profile facts behind it.
//
// The trace is resolved from persisted state — the Opportunity's own Assessment
// citations, and those findings' supporting discovery facts — so what the record
// shows is what the engagement actually established, never something the model
// restated. A finding the Assessment no longer holds contributes an honest empty
// list of facts rather than an invented one.
const citationOf = (
  opportunity: Opportunity,
  findings: ReadonlyMap<AssessmentFindingId, AssessmentFinding>,
): RecommendationOpportunityCitation => ({
  opportunityId: opportunity.id,
  opportunityTitle: opportunity.title,
  priorityRank: opportunity.priorityRank,
  discoveryTrace: opportunity.sourceFindings.map(
    (citation): RecommendationDiscoveryTrace => ({
      findingId: citation.findingId,
      dimension: citation.dimension,
      findingTitle: citation.findingTitle,
      supportingFacts: findings.get(citation.findingId)?.supportingFacts ?? [],
    }),
  ),
})

// Every finding the Assessment holds, in full — this stage needs the supporting
// discovery facts, not only the dimension and title the Opportunity stage's own
// index carries.
const assessmentFindingsById = (
  assessment: Assessment | null,
): ReadonlyMap<AssessmentFindingId, AssessmentFinding> =>
  new Map(
    assessment === null
      ? []
      : Object.values(assessment.dimensions).flatMap((dimension) =>
          dimension.findings.map(
            (finding) => [finding.id, finding] as const,
          ),
        ),
  )

const unique = <TValue>(values: TValue[]): TValue[] => [...new Set(values)]
