import type { DiscoveryProfile } from "../../../../shared/discovery-profile.schema.js"
import type { AssessmentReviewState } from "../../../../shared/assessment.schema.js"

// Business rules of the Assessment stage. Pure and framework-free: no HTTP, no
// persistence, no prompts, no provider calls (architecture.md §4; coding-
// standards.md §6).

// The Assessment interprets the persisted Discovery Profile. With nothing
// captured there is nothing to interpret, and generating anyway would force the
// AI to invent the client's situation (agent-rules.md §3, §12). Recorded gaps do
// not count as content: they state what is *unknown*.
//
// The value & measurement baseline is excluded for the same reason it is kept
// out of the assessment prompt: whether the Assessment reads the baseline is a
// separate, future decision and not part of Phase 3's accepted scope (roadmap
// Phase 2, "Sequencing of the Revision 1.2 extension"). A profile holding only
// a baseline is therefore not yet assessable — the AI would have nothing
// qualitative to reason over.
export const hasDiscoveryContentToAssess = (
  discoveryProfile: DiscoveryProfile,
): boolean => {
  const { missingInformation, valueMeasurementBaseline, ...knownFacts } =
    discoveryProfile

  return Object.values(knownFacts).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== null,
  )
}

// AI output is a draft, and re-running a stage must never silently discard the
// consultant's own work: once an Assessment has been edited or accepted, only
// the consultant's explicit intent may replace it (architecture.md §5;
// agent-rules.md §10).
export const canReplaceAssessment = (
  currentReviewState: AssessmentReviewState | null,
  replaceConsultantEdits: boolean,
): boolean =>
  currentReviewState === null ||
  currentReviewState === "ai_draft" ||
  replaceConsultantEdits
