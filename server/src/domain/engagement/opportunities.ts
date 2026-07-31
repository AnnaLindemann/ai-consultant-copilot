import { assessmentFindingsById } from "./assessment.js"

import type {
  Assessment,
  AssessmentFindingId,
} from "../../../../shared/assessment.schema.js"
import type {
  AssessmentFindingCitation,
  Opportunity,
  OpportunityPrioritization,
  OpportunityPrioritizationSubmission,
  OpportunityReviewState,
} from "../../../../shared/opportunity.schema.js"

// Business rules of the Problem Prioritization & Opportunities stage. Pure and
// framework-free: no HTTP, no persistence, no prompts, no provider calls
// (architecture.md §4; coding-standards.md §6).

// Opportunities are carried forward from the Assessment's problems and
// bottlenecks (roadmap Phase 4), so an engagement with no assessed findings has
// nothing to carry forward — and prioritizing anyway would force the AI to
// invent the client's problems (agent-rules.md §3, §12). An Assessment whose
// dimensions are all empty states exactly that: nothing was found to assess.
export const hasAssessmentToPrioritize = (
  assessment: Assessment | null,
): boolean =>
  assessment !== null &&
  Object.values(assessment.dimensions).some(
    (dimension) => dimension.findings.length > 0,
  )

export type CitationResolution =
  | { resolved: true; prioritization: OpportunityPrioritization }
  | { resolved: false; unknownFindingIds: AssessmentFindingId[] }

// Resolve cited finding ids into the citations a version stores.
//
// The citation is what makes an Opportunity traceable backward to the
// Assessment, so a cited id the Assessment does not contain is fabricated
// grounding and is refused outright rather than tolerated as a near miss
// (agent-rules.md §3, §12). The rule is the same whoever cited it: a model
// citing a finding it invented and a consultant citing a finding that has since
// been deleted are the same defect in the record.
//
// The dimension and title on the resulting citation are read *from the
// Assessment*, never taken from the caller — they are a snapshot of how the
// finding read at this moment, kept so a preserved version still shows what it
// cited after the Assessment has moved on.
export const resolveCitations = (
  submission: OpportunityPrioritizationSubmission,
  assessment: Assessment,
): CitationResolution => {
  const findings = assessmentFindingsById(assessment)

  const unknownFindingIds = submission.opportunities
    .flatMap((opportunity) => opportunity.sourceFindingIds)
    .filter((findingId) => !findings.has(findingId))

  if (unknownFindingIds.length > 0) {
    return {
      resolved: false,
      unknownFindingIds: [...new Set(unknownFindingIds)],
    }
  }

  return {
    resolved: true,
    prioritization: {
      ...submission,
      opportunities: submission.opportunities.map(
        ({ sourceFindingIds, ...content }): Opportunity => ({
          ...content,
          sourceFindings: sourceFindingIds.map((findingId) =>
            citationOf(findingId, findings),
          ),
        }),
      ),
    },
  }
}

// The prioritization in priority order. Rank is the prioritization; the stored
// order follows it, so every reader — the consultant's screen, a later stage,
// an export — sees the same sequence without re-deriving it.
export const inPriorityOrder = (
  prioritization: OpportunityPrioritization,
): OpportunityPrioritization => ({
  ...prioritization,
  opportunities: [...prioritization.opportunities].sort(
    (one, other) => one.priorityRank - other.priorityRank,
  ),
})

// Whether the Assessment has moved on since this version was generated.
//
// It is content-based rather than time-based: a save that changed nothing
// leaves the fingerprint alone, and any real edit to a finding, a summary, or a
// gap changes it. Staleness is only ever a *recommendation* to regenerate — the
// product never rewrites an earlier conclusion behind the consultant's back
// (agent-rules.md §15).
export const isOpportunityVersionStale = (
  versionAssessmentFingerprint: string | null,
  currentAssessmentFingerprint: string | null,
): boolean =>
  versionAssessmentFingerprint !== null &&
  currentAssessmentFingerprint !== null &&
  versionAssessmentFingerprint !== currentAssessmentFingerprint

// Re-running over consultant-edited work needs explicit confirmation. The
// server refuses the overwrite unless the consultant has chosen to replace
// their own edits.
export const canReplaceOpportunityVersion = (
  currentReviewState: OpportunityReviewState | null,
  replaceConsultantEdits: boolean,
): boolean =>
  currentReviewState === null ||
  currentReviewState === "ai_draft" ||
  replaceConsultantEdits

// Which version number a regeneration produces. Versions are numbered from 1
// and never reused, so the number a consultant refers to always means the same
// snapshot (architecture.md §4.3 on append-only versions).
export const nextVersionNumber = (highestVersionNumber: number | null): number =>
  (highestVersionNumber ?? 0) + 1

// Only the active version is editable. A superseded version is the record of
// what was prioritized at the time; letting a save reach it would destroy the
// very thing keeping it is for.
export const isEditableVersion = (status: string): boolean => status === "active"

const citationOf = (
  findingId: AssessmentFindingId,
  findings: ReturnType<typeof assessmentFindingsById>,
): AssessmentFindingCitation => {
  // Guarded by the unknown-id check above: every id reaching here is present.
  const finding = findings.get(findingId)!

  return {
    findingId,
    dimension: finding.dimension,
    findingTitle: finding.title,
  }
}
