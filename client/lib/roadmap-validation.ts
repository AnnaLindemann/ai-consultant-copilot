import { t } from "../i18n/index.ts"
import type { MessageKey } from "../i18n/de.ts"

export type RoadmapValidationDetail = {
  unknownRecommendationIds?: string[]
  missingRecommendationIds?: string[]
  unknownImplementationPatternCodes?: string[]
  nonImplementationPatternCodes?: string[]
  dependencyErrors?: string[]
  dispositionErrors?: string[]
}

const DISPOSITION_ERROR_KEYS = new Map<string, MessageKey>([
  [
    "duplicate_recommendation_disposition",
    "roadmap.validation.disposition.duplicate",
  ],
  [
    "included_recommendation_not_linked",
    "roadmap.validation.disposition.included_not_linked",
  ],
  [
    "recommendation_included_and_deferred",
    "roadmap.validation.disposition.deferred_linked",
  ],
  [
    "deferred_recommendation_missing_rationale",
    "roadmap.validation.disposition.deferred_missing_rationale",
  ],
  [
    "linked_recommendation_without_disposition",
    "roadmap.validation.disposition.linked_without_disposition",
  ],
])

export const roadmapValidationMessages = (
  detail: RoadmapValidationDetail | undefined,
): string[] => {
  if (!detail) return []

  const messages: string[] = []

  if ((detail.missingRecommendationIds?.length ?? 0) > 0) {
    messages.push(t("roadmap.validation.disposition.missing"))
  }
  if ((detail.unknownRecommendationIds?.length ?? 0) > 0) {
    messages.push(t("roadmap.validation.disposition.unknown"))
  }

  for (const error of detail.dispositionErrors ?? []) {
    messages.push(t(DISPOSITION_ERROR_KEYS.get(error) ?? "roadmap.validation.disposition.generic"))
  }

  if ((detail.unknownImplementationPatternCodes?.length ?? 0) > 0) {
    messages.push(t("roadmap.validation.grounding.unknown_pattern"))
  }
  if ((detail.nonImplementationPatternCodes?.length ?? 0) > 0) {
    messages.push(t("roadmap.validation.grounding.wrong_pattern_kind"))
  }

  for (const error of detail.dependencyErrors ?? []) {
    messages.push(
      t(
        DEPENDENCY_ERROR_KEYS.get(error) ??
          "roadmap.validation.dependency.generic",
      ),
    )
  }

  return [...new Set(messages)]
}

const DEPENDENCY_ERROR_KEYS = new Map<string, MessageKey>([
  ["duplicate_phase_id", "roadmap.validation.dependency.duplicate_phase"],
  ["duplicate_phase_key", "roadmap.validation.dependency.duplicate_phase"],
  ["duplicate_sequence_order", "roadmap.validation.dependency.duplicate_sequence"],
  ["duplicate_dependency", "roadmap.validation.dependency.duplicate"],
  ["unknown_dependency", "roadmap.validation.dependency.unknown"],
  ["self_dependency", "roadmap.validation.dependency.self"],
  ["dependency_not_earlier", "roadmap.validation.dependency.not_earlier"],
  ["dependency_cycle", "roadmap.validation.dependency.cycle"],
])
