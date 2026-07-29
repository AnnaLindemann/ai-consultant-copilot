import {
  DISCOVERY_SECTIONS,
  type DiscoveryActor,
  type DiscoveryContentProvenance,
  type DiscoverySection,
  type DiscoveryStatus,
  type DiscoveryTransition,
} from "../../../../shared/discovery-workflow.schema.js"

import type {
  DiscoveryProfile,
  MeasurementGapSubject,
  ValueMeasurementBaseline,
} from "../../../../shared/discovery-profile.schema.js"

// Business rules of the Discovery stage's review workflow, content provenance,
// and value & measurement baseline (Phase 2 Extension). Pure and
// framework-free: no HTTP, no persistence, no prompts, no provider calls
// (architecture.md §4; coding-standards.md §6).

// Which Discovery Profile fields belong to which section. Provenance is
// recorded per section because that is how discovery is contributed — a client
// answers the data questions, the consultant captures the constraints.
// `missingInformation` is deliberately absent: a gap already carries its own
// category and states what nobody has answered, so it attributes nothing.
export const DISCOVERY_SECTION_FIELDS: Record<
  DiscoverySection,
  readonly (keyof DiscoveryProfile)[]
> = {
  situation: ["department", "affectedUsers", "notes"],
  problems: ["statedProblem", "painPoints", "businessImpact", "urgency"],
  current_process: [
    "currentProcess",
    "processSteps",
    "processFrequency",
    "manualWorkLevel",
    "bottlenecks",
  ],
  tools: ["currentTools", "communicationChannels", "integrationNeeds"],
  data: [
    "dataTypes",
    "dataLocation",
    "dataAvailability",
    "dataQuality",
    "sensitiveData",
    "sensitiveDataTypes",
  ],
  constraints: [
    "gdprConcerns",
    "budgetAmount",
    "budgetCurrency",
    "budgetNotes",
    "timeline",
    "humanApprovalRequired",
    "technicalConstraints",
  ],
  goals: ["desiredOutcome", "successMetrics", "mvpScope"],
  value_measurement: ["valueMeasurementBaseline"],
}

// Re-attribute only the sections whose content actually changed, to whoever
// contributed the change. Content the client provided keeps its attribution
// through every later consultant edit of *other* sections and through every
// workflow transition, so the engagement never silently reattributes a client's
// statement to the consultant (domain-model.md §3A.3; agent-rules.md §2A.3).
export const applyContentProvenance = (
  previousProfile: DiscoveryProfile,
  nextProfile: DiscoveryProfile,
  currentProvenance: DiscoveryContentProvenance,
  contributor: DiscoveryActor,
): DiscoveryContentProvenance => {
  const contributedProvenance =
    contributor === "client" ? "client_provided" : "consultant_captured"

  const provenance = { ...currentProvenance }

  for (const section of DISCOVERY_SECTIONS) {
    const changed = DISCOVERY_SECTION_FIELDS[section].some(
      (field) => !isDeepEqual(previousProfile[field], nextProfile[field]),
    )

    if (changed) provenance[section] = contributedProvenance
  }

  return provenance
}

// Where saving content leaves the review workflow. Discovery is re-entrant, so
// a save is never refused; what a save may not do is leave content the
// consultant has not reviewed standing as submitted or accepted. Client
// contributions therefore always return discovery to draft — client-provided
// content becomes accepted fact by the consultant's review, never by being
// written (domain-model.md §3A.3).
export const nextStatusAfterContentSave = (
  currentStatus: DiscoveryStatus,
  contributor: DiscoveryActor,
): DiscoveryStatus => {
  if (contributor === "client") return "draft"

  // The consultant answering a return resumes work on it.
  return currentStatus === "returned" ? "draft" : currentStatus
}

// Which actor may perform which transition, and from where. Reviewing —
// accepting, returning, reopening — is the consultant's authority; the client
// contributes and submits, and cannot accept their own submission
// (domain-model.md §3A.3; architecture.md §7A.6).
const DISCOVERY_TRANSITION_RULES: Record<
  DiscoveryTransition,
  {
    actors: readonly DiscoveryActor[]
    from: readonly DiscoveryStatus[]
    to: DiscoveryStatus
  }
> = {
  submit: {
    actors: ["consultant", "client"],
    from: ["draft", "returned"],
    to: "submitted",
  },
  return: { actors: ["consultant"], from: ["submitted"], to: "returned" },
  accept: { actors: ["consultant"], from: ["submitted"], to: "accepted" },
  // Acceptance never ends the ability to revise discovery later.
  reopen: {
    actors: ["consultant"],
    from: ["submitted", "returned", "accepted"],
    to: "draft",
  },
}

export type DiscoveryTransitionRefusal =
  | "actor_not_permitted"
  | "illegal_transition"

export type DiscoveryTransitionCheck =
  | { allowed: true; nextStatus: DiscoveryStatus }
  | { allowed: false; refusal: DiscoveryTransitionRefusal }

export const checkDiscoveryTransition = (
  transition: DiscoveryTransition,
  currentStatus: DiscoveryStatus,
  actor: DiscoveryActor,
): DiscoveryTransitionCheck => {
  const rule = DISCOVERY_TRANSITION_RULES[transition]

  // Authority is asked about before the state machine, so a client attempting
  // a consultant's review action is refused as an actor, not as bad timing.
  if (!rule.actors.includes(actor)) {
    return { allowed: false, refusal: "actor_not_permitted" }
  }

  if (!rule.from.includes(currentStatus)) {
    return { allowed: false, refusal: "illegal_transition" }
  }

  return { allowed: true, nextStatus: rule.to }
}

// The baseline subjects that can be answered by content, in the order the
// roadmap lists them. `measurement_method` and `data_sources` are not here:
// every recorded figure carries them by construction, so they can be the
// subject of a gap the consultant records but never of an unanswered field.
const BASELINE_CONTENT_SUBJECTS: readonly {
  subject: MeasurementGapSubject
  hasContent: (baseline: ValueMeasurementBaseline) => boolean
}[] = [
  {
    subject: "business_impact",
    hasContent: (baseline) => baseline.businessImpacts.length > 0,
  },
  {
    subject: "error_frequency",
    hasContent: (baseline) => baseline.errorProfile.frequency !== null,
  },
  {
    subject: "error_severity",
    hasContent: (baseline) =>
      baseline.errorProfile.severity.level !== null ||
      baseline.errorProfile.severity.description !== null,
  },
  {
    subject: "error_cost",
    hasContent: (baseline) => baseline.errorProfile.costPerOccurrence !== null,
  },
  {
    subject: "existing_kpis",
    hasContent: (baseline) => baseline.existingKpis.length > 0,
  },
  {
    subject: "baseline_metrics",
    hasContent: (baseline) => baseline.baselineMetrics.length > 0,
  },
  {
    subject: "target_success_metrics",
    hasContent: (baseline) => baseline.targetSuccessMetrics.length > 0,
  },
]

// The baseline subjects that are neither answered nor explained — silently
// empty fields. "The client does not measure this today" is a finding the
// assessment and the follow-up questions must carry forward, so it has to be
// recorded as a gap with its reason rather than left blank (roadmap Phase 2;
// coding-standards.md §6).
export const unexplainedBaselineSubjects = (
  baseline: ValueMeasurementBaseline,
): MeasurementGapSubject[] =>
  BASELINE_CONTENT_SUBJECTS.filter(
    ({ subject, hasContent }) =>
      !hasContent(baseline) &&
      !baseline.measurementGaps.some((gap) => gap.subject === subject),
  ).map(({ subject }) => subject)

// Structural comparison of two validated profile values. Profile content is
// plain JSON data (text, numbers, booleans, lists, and the baseline object), so
// comparing structure is enough to tell an edit from a re-save of the same
// facts — and comparing rather than trusting the caller is what keeps
// provenance honest.
const isDeepEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) return true

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false

    return left.every((item, index) => isDeepEqual(item, right[index]))
  }

  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  ) {
    return false
  }

  const leftEntries = Object.entries(left as Record<string, unknown>)
  const rightRecord = right as Record<string, unknown>

  if (leftEntries.length !== Object.keys(rightRecord).length) return false

  return leftEntries.every(
    ([key, value]) =>
      key in rightRecord && isDeepEqual(value, rightRecord[key]),
  )
}
