import { canonicalStageContent } from "./canonical-content.js"
import { canonicalRecommendationContent } from "./recommendations.js"

import type { ConsultingKnowledgeKind } from "../../../../shared/consulting-knowledge.schema.js"
import type {
  GeneratedRoadmapDraft,
  ImplementationPatternGrounding,
  Roadmap,
  RoadmapPhaseId,
  RoadmapRecommendationDisposition,
  RoadmapReviewState,
  RoadmapSubmission,
  ResolvedRoadmap,
} from "../../../../shared/implementation-roadmap.schema.js"
import type {
  RecommendationId,
  RecommendationSet,
} from "../../../../shared/recommendation.schema.js"

export type CitableImplementationPattern = ReadonlyMap<
  string,
  { kind: ConsultingKnowledgeKind; title: string; summary: string }
>

export type RoadmapResolution =
  | { resolved: true; roadmap: ResolvedRoadmap }
  | {
      resolved: false
      unknownRecommendationIds: RecommendationId[]
      missingRecommendationIds: RecommendationId[]
      unknownImplementationPatternCodes: string[]
      nonImplementationPatternCodes: string[]
      dependencyErrors: string[]
      dispositionErrors: string[]
    }

export const canReplaceRoadmapVersion = (
  currentReviewState: RoadmapReviewState | null,
  replaceConsultantEdits: boolean,
): boolean =>
  currentReviewState === null ||
  currentReviewState === "ai_draft" ||
  replaceConsultantEdits

export const canEditRoadmapVersionInPlace = (
  currentReviewState: RoadmapReviewState,
): boolean => currentReviewState !== "accepted"

export const isRoadmapVersionStale = (
  versionRecommendationFingerprint: string | null,
  currentRecommendationFingerprint: string | null,
): boolean =>
  versionRecommendationFingerprint !== null &&
  currentRecommendationFingerprint !== null &&
  versionRecommendationFingerprint !== currentRecommendationFingerprint

export const resolveRoadmap = (
  submission: RoadmapSubmission,
  sources: {
    recommendations: RecommendationSet
    implementationPatterns: CitableImplementationPattern
  },
): RoadmapResolution => {
  const eligibleRecommendationIds = new Set(
    sources.recommendations.recommendations.map(
      (recommendation) => recommendation.id,
    ),
  )
  const citedRecommendationIds = new Set(
    submission.phases.flatMap((phase) => phase.linkedRecommendationIds),
  )
  const dispositionResult = validateRecommendationDispositions(
    submission,
    eligibleRecommendationIds,
    citedRecommendationIds,
  )

  const unknownRecommendationIds = sorted(
    [
      ...citedRecommendationIds,
      ...submission.recommendationDispositions.map(
        (disposition) => disposition.recommendationId,
      ),
    ].filter((id) => !eligibleRecommendationIds.has(id)),
  )
  const missingRecommendationIds = dispositionResult.missingRecommendationIds

  const citedPatternCodes = submission.phases.flatMap((phase) =>
    phase.implementationPatternGrounding.map((grounding) => grounding.code),
  )
  const unknownImplementationPatternCodes = sorted(
    citedPatternCodes.filter((code) => !sources.implementationPatterns.has(code)),
  )
  const nonImplementationPatternCodes = sorted(
    citedPatternCodes.filter((code) => {
      const pattern = sources.implementationPatterns.get(code)
      return pattern !== undefined && pattern.kind !== "implementation_pattern"
    }),
  )

  const dependencyErrors = validateDependencies(submission)

  if (
    unknownRecommendationIds.length > 0 ||
    missingRecommendationIds.length > 0 ||
    unknownImplementationPatternCodes.length > 0 ||
    nonImplementationPatternCodes.length > 0 ||
    dependencyErrors.length > 0 ||
    dispositionResult.dispositionErrors.length > 0
  ) {
    return {
      resolved: false,
      unknownRecommendationIds,
      missingRecommendationIds,
      unknownImplementationPatternCodes,
      nonImplementationPatternCodes,
      dependencyErrors,
      dispositionErrors: dispositionResult.dispositionErrors,
    }
  }

  return {
    resolved: true,
    roadmap: {
      ...submission,
      phases: submission.phases.map((phase) => ({
        ...phase,
        implementationPatternGrounding:
          phase.implementationPatternGrounding.map(
            (grounding): ImplementationPatternGrounding => ({
              ...grounding,
              title: sources.implementationPatterns.get(grounding.code)!.title,
              summary: sources.implementationPatterns.get(grounding.code)!
                .summary,
            }),
          ),
      })),
    },
  }
}

export const resolveGeneratedRoadmap = (
  generated: GeneratedRoadmapDraft,
  sources: {
    recommendations: RecommendationSet
    implementationPatterns: CitableImplementationPattern
  },
  mintId: () => string,
): RoadmapResolution => {
  const generatedDependencyErrors = validateDependencies(
    generatedToTemporarySubmission(generated),
  ).map((error) =>
    error === "duplicate_phase_id" ? "duplicate_phase_key" : error,
  )

  if (generatedDependencyErrors.length > 0) {
    return {
      resolved: false,
      unknownRecommendationIds: [],
      missingRecommendationIds: [],
      unknownImplementationPatternCodes: [],
      nonImplementationPatternCodes: [],
      dependencyErrors: sorted(generatedDependencyErrors),
      dispositionErrors: [],
    }
  }

  const permanentIds = new Map(
    generated.phases.map((phase) => [phase.temporaryPhaseKey, mintId()]),
  )
  const submission: RoadmapSubmission = {
    summary: generated.summary,
    recommendationDispositions: generated.recommendationDispositions,
    assumptions: generated.assumptions,
    gaps: generated.gaps,
    phases: generated.phases.map((phase) => ({
      sequenceOrder: phase.sequenceOrder,
      title: phase.title,
      objective: phase.objective,
      scope: phase.scope,
      expectedOutcome: phase.expectedOutcome,
      linkedRecommendationIds: phase.linkedRecommendationIds,
      dependencyPhaseIds: phase.dependencyPhaseKeys.map(
        (key) => permanentIds.get(key)!,
      ),
      explicitPrerequisites: phase.explicitPrerequisites,
      readinessConsiderations: phase.readinessConsiderations,
      risks: phase.risks,
      assumptions: phase.assumptions,
      effort: phase.effort,
      sequencingRationale: phase.sequencingRationale,
      implementationPatternGrounding: phase.implementationPatternGrounding,
      id: permanentIds.get(phase.temporaryPhaseKey),
    })),
  }

  return resolveRoadmap(submission, sources)
}

export const identifyRoadmapPhases = (
  resolved: ResolvedRoadmap,
  mintId: () => string,
): Roadmap => ({
  ...resolved,
  phases: resolved.phases.map((phase) => ({
    ...phase,
    id: phase.id ?? mintId(),
  })),
})

export const inRoadmapOrder = <
  TRoadmap extends { phases: { sequenceOrder: number }[] },
>(
  roadmap: TRoadmap,
): TRoadmap => ({
  ...roadmap,
  phases: [...roadmap.phases].sort(
    (one, other) => one.sequenceOrder - other.sequenceOrder,
  ) as TRoadmap["phases"],
})

export const canonicalRoadmapContent = (roadmap: Roadmap): string =>
  canonicalStageContent(roadmap)

export const canonicalRoadmapSourceContent = (input: {
  recommendationVersionId: string
  recommendationVersionNumber: number
  recommendations: RecommendationSet
  recommendationDispositions: RoadmapRecommendationDisposition[]
}): string =>
  canonicalStageContent({
    recommendationVersionId: input.recommendationVersionId,
    recommendationVersionNumber: input.recommendationVersionNumber,
    recommendations: JSON.parse(
      canonicalRecommendationContent(input.recommendations),
    ),
    recommendationDispositions: input.recommendationDispositions,
  })

const validateDependencies = (submission: RoadmapSubmission): string[] => {
  const errors: string[] = []
  const ids = submission.phases.map((phase) => phase.id).filter(isPresent)
  const idSet = new Set(ids)

  if (ids.length !== idSet.size) errors.push("duplicate_phase_id")

  const sequenceOrders = submission.phases.map((phase) => phase.sequenceOrder)
  if (sequenceOrders.length !== new Set(sequenceOrders).size) {
    errors.push("duplicate_sequence_order")
  }

  const byId = new Map(
    submission.phases
      .filter((phase) => phase.id !== undefined)
      .map((phase) => [phase.id!, phase]),
  )

  for (const phase of submission.phases) {
    const uniqueDependencies = new Set(phase.dependencyPhaseIds)
    if (uniqueDependencies.size !== phase.dependencyPhaseIds.length) {
      errors.push("duplicate_dependency")
    }

    for (const dependencyId of uniqueDependencies) {
      if (!idSet.has(dependencyId)) errors.push("unknown_dependency")
      if (phase.id !== undefined && dependencyId === phase.id) {
        errors.push("self_dependency")
      }

      const dependency = byId.get(dependencyId)
      if (
        dependency !== undefined &&
        dependency.sequenceOrder >= phase.sequenceOrder
      ) {
        errors.push("dependency_not_earlier")
      }
    }
  }

  if (hasDependencyCycle(byId)) errors.push("dependency_cycle")

  return sorted(errors)
}

const generatedToTemporarySubmission = (
  generated: GeneratedRoadmapDraft,
): RoadmapSubmission => ({
  summary: generated.summary,
  recommendationDispositions: generated.recommendationDispositions,
  assumptions: generated.assumptions,
  gaps: generated.gaps,
  phases: generated.phases.map((phase) => ({
    sequenceOrder: phase.sequenceOrder,
    title: phase.title,
    objective: phase.objective,
    scope: phase.scope,
    expectedOutcome: phase.expectedOutcome,
    linkedRecommendationIds: phase.linkedRecommendationIds,
    dependencyPhaseIds: phase.dependencyPhaseKeys,
    explicitPrerequisites: phase.explicitPrerequisites,
    readinessConsiderations: phase.readinessConsiderations,
    risks: phase.risks,
    assumptions: phase.assumptions,
    effort: phase.effort,
    sequencingRationale: phase.sequencingRationale,
    implementationPatternGrounding: phase.implementationPatternGrounding,
    id: phase.temporaryPhaseKey,
  })),
})

const validateRecommendationDispositions = (
  submission: RoadmapSubmission,
  eligibleRecommendationIds: ReadonlySet<RecommendationId>,
  citedRecommendationIds: ReadonlySet<RecommendationId>,
): {
  missingRecommendationIds: RecommendationId[]
  dispositionErrors: string[]
} => {
  const dispositionErrors: string[] = []
  const dispositionIds = submission.recommendationDispositions.map(
    (disposition) => disposition.recommendationId,
  )
  const dispositionsByRecommendation = new Map(
    submission.recommendationDispositions.map((disposition) => [
      disposition.recommendationId,
      disposition,
    ]),
  )

  if (dispositionIds.length !== new Set(dispositionIds).size) {
    dispositionErrors.push("duplicate_recommendation_disposition")
  }

  const missingRecommendationIds = sorted(
    [...eligibleRecommendationIds].filter(
      (id) => !dispositionsByRecommendation.has(id),
    ),
  )

  for (const recommendationId of eligibleRecommendationIds) {
    const disposition = dispositionsByRecommendation.get(recommendationId)
    const linked = citedRecommendationIds.has(recommendationId)

    if (disposition?.disposition === "included" && !linked) {
      dispositionErrors.push("included_recommendation_not_linked")
    }
    if (disposition?.disposition === "deferred" && linked) {
      dispositionErrors.push("recommendation_included_and_deferred")
    }
    if (
      disposition?.disposition === "deferred" &&
      disposition.rationale.trim().length === 0
    ) {
      dispositionErrors.push("deferred_recommendation_missing_rationale")
    }
    if (disposition === undefined && linked) {
      dispositionErrors.push("linked_recommendation_without_disposition")
    }
  }

  return {
    missingRecommendationIds,
    dispositionErrors: sorted(dispositionErrors),
  }
}

const hasDependencyCycle = (
  phases: ReadonlyMap<RoadmapPhaseId, RoadmapSubmission["phases"][number]>,
): boolean => {
  const visiting = new Set<RoadmapPhaseId>()
  const visited = new Set<RoadmapPhaseId>()

  const visit = (phaseId: RoadmapPhaseId): boolean => {
    if (visited.has(phaseId)) return false
    if (visiting.has(phaseId)) return true

    visiting.add(phaseId)
    const phase = phases.get(phaseId)
    for (const dependencyId of phase?.dependencyPhaseIds ?? []) {
      if (phases.has(dependencyId) && visit(dependencyId)) return true
    }
    visiting.delete(phaseId)
    visited.add(phaseId)
    return false
  }

  return [...phases.keys()].some(visit)
}

const sorted = <TValue extends string>(values: TValue[]): TValue[] =>
  [...new Set(values)].sort()

const isPresent = <TValue>(value: TValue | undefined): value is TValue =>
  value !== undefined
