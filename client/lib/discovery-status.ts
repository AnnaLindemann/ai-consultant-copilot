import type { WorkflowSectionStatus } from "./workflow-status"

import type {
  DiscoveryGapCategory,
  DiscoveryProfile,
} from "../../shared/discovery-profile.schema"
import type { DiscoveryWorkflowState } from "../../shared/discovery-workflow.schema"

// How complete a Discovery section is.
//
// The rule is deterministic and identical for the consultant and the client, so
// the two never disagree about where a Discovery stands. Three things it will
// not do:
//   - it never marks an untouched section as needing action: a section with
//     nothing in it is "not started", which is a neutral fact, not a fault;
//   - it never reads submission as completeness: submitting is a checkpoint in
//     the workflow, and says nothing about whether the answers are all there;
//   - it never treats a recorded gap as an answer — a gap is what makes an
//     otherwise-full section ask for attention.

export type DiscoverySectionKey =
  | "situation"
  | "problems"
  | "current_process"
  | "tools"
  | "data"
  | "constraints"
  | "goals"
  | "value_measurement"
  | "gaps"

export function getDiscoverySectionStatus(
  section: DiscoverySectionKey,
  profile: DiscoveryProfile,
  workflow: DiscoveryWorkflowState,
): WorkflowSectionStatus {
  const hasSectionGap = hasDiscoveryGap(section, profile)

  // A returned Discovery asks for correction only where something is actually
  // open. An untouched section is never marked red.
  if (workflow.status === "returned" && hasSectionGap) {
    return "action_required"
  }

  switch (section) {
    case "situation":
      return determineStatus(
        [profile.department, profile.affectedUsers.join(", "), profile.notes],
        hasSectionGap,
      )
    case "problems":
      return determineStatus(
        [profile.statedProblem, profile.businessImpact, profile.urgency],
        hasSectionGap,
      )
    case "current_process":
      return determineStatus(
        [
          profile.currentProcess,
          profile.processSteps.join(", "),
          profile.processFrequency,
          profile.manualWorkLevel,
          profile.bottlenecks.join(", "),
        ],
        hasSectionGap,
      )
    case "tools":
      return determineStatus(
        [
          profile.currentTools.join(", "),
          profile.communicationChannels.join(", "),
          profile.integrationNeeds.join(", "),
        ],
        hasSectionGap,
      )
    case "data":
      return determineStatus(
        [
          profile.dataTypes.join(", "),
          profile.dataLocation.join(", "),
          profile.dataAvailability,
          profile.dataQuality,
          profile.sensitiveData,
          profile.sensitiveDataTypes.join(", "),
        ],
        hasSectionGap,
      )
    case "constraints":
      return determineStatus(
        [
          profile.gdprConcerns,
          profile.budgetAmount,
          profile.budgetCurrency,
          profile.budgetNotes,
          profile.timeline,
          profile.humanApprovalRequired,
          profile.technicalConstraints.join(", "),
        ],
        hasSectionGap,
      )
    case "goals":
      return determineStatus(
        [
          profile.desiredOutcome,
          profile.successMetrics.join(", "),
          profile.mvpScope,
        ],
        hasSectionGap,
      )
    case "value_measurement":
      return determineStatus(
        [
          profile.valueMeasurementBaseline.businessImpacts.length,
          Boolean(profile.valueMeasurementBaseline.errorProfile.frequency),
          profile.valueMeasurementBaseline.errorProfile.severity.level,
          profile.valueMeasurementBaseline.errorProfile.severity.description,
          Boolean(
            profile.valueMeasurementBaseline.errorProfile.costPerOccurrence,
          ),
          profile.valueMeasurementBaseline.existingKpis.length,
          profile.valueMeasurementBaseline.baselineMetrics.length,
          profile.valueMeasurementBaseline.targetSuccessMetrics.length,
        ],
        hasSectionGap,
      )
    case "gaps":
      return profile.missingInformation.length === 0 ? "not_started" : "complete"
  }
}

function determineStatus(
  values: readonly (string | number | boolean | null | undefined)[],
  hasSectionGap: boolean,
): WorkflowSectionStatus {
  const meaningfulValues = values.filter((value) => {
    if (typeof value === "string") return value.trim().length > 0
    return value !== null && value !== undefined
  })

  if (meaningfulValues.length === 0) return "not_started"
  if (meaningfulValues.length < values.length) return "in_progress"
  return hasSectionGap ? "action_required" : "complete"
}

function hasDiscoveryGap(
  section: DiscoverySectionKey,
  profile: DiscoveryProfile,
): boolean {
  if (section === "value_measurement") {
    return profile.valueMeasurementBaseline.measurementGaps.length > 0
  }

  const categories: Record<
    Exclude<DiscoverySectionKey, "gaps" | "value_measurement">,
    readonly DiscoveryGapCategory[]
  > = {
    situation: ["situation", "operations"],
    problems: ["problems"],
    current_process: ["current_process"],
    tools: ["tools"],
    data: ["data"],
    constraints: ["constraints"],
    goals: ["goals"],
  }

  if (section === "gaps") return profile.missingInformation.length > 0

  return profile.missingInformation.some((gap) =>
    categories[section].includes(gap.category),
  )
}
