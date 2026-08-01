import { canonicalStageContent } from "./canonical-content.js"

import type { DiscoveryProfile } from "../../../../shared/discovery-profile.schema.js"
import type {
  Assessment,
  AssessmentDimensionKey,
  AssessmentFindingId,
  AssessmentReviewState,
  AssessmentSubmission,
} from "../../../../shared/assessment.schema.js"

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

// Give every finding an identity, keeping the ones it already has.
//
// A finding's identity is what later stages cite, so it must not be derived
// from the finding's own text: re-wording a title has to leave every citation
// pointing at the same finding. Neither the model nor the browser mints one —
// the model writes findings, the consultant edits them, and identity is added
// here, on the server, at the moment the finding is first persisted.
//
// `mintId` is a parameter rather than a call to a random source so this rule
// stays pure and deterministically testable (coding-standards.md §6, §9).
export const identifyAssessmentFindings = (
  submitted: AssessmentSubmission,
  mintId: () => string,
): Assessment => ({
  ...submitted,
  dimensions: Object.fromEntries(
    Object.entries(submitted.dimensions).map(([dimension, content]) => [
      dimension,
      {
        ...content,
        findings: content.findings.map((finding) => ({
          ...finding,
          id: finding.id ?? mintId(),
        })),
      },
    ]),
  ) as Assessment["dimensions"],
})

// Every finding the Assessment holds, by identity — the set a citation is
// checked against, and the source of the dimension/title snapshot a citation
// carries for later reading.
export const assessmentFindingsById = (
  assessment: Assessment,
): Map<AssessmentFindingId, { dimension: AssessmentDimensionKey; title: string }> =>
  new Map(
    Object.entries(assessment.dimensions).flatMap(([dimension, content]) =>
      content.findings.map(
        (finding) =>
          [
            finding.id,
            { dimension: dimension as AssessmentDimensionKey, title: finding.title },
          ] as const,
      ),
    ),
  )

// The Assessment's content in a stable, order-independent form. Downstream
// stages record the hash of this to detect that the Assessment they were derived
// from has since moved on (agent-rules.md §15). The rendering itself is shared
// with the other stages that do the same (`canonical-content.ts`), so two stages
// can never disagree about what "unchanged content" means.
export const canonicalAssessmentContent = (assessment: Assessment): string =>
  canonicalStageContent(assessment)
