// Human-readable labels for the methodology stage an engagement stands at
// (domain-model.md §3). The keys match the backend `EngagementStage` enum.
export const STAGE_LABELS = {
  discovery: "Discovery",
  assessment: "Assessment",
  prioritization: "Prioritization",
  solution_matching: "Solution Matching",
  roadmap: "Roadmap",
  report: "Report",
} as const

export type EngagementStage = keyof typeof STAGE_LABELS

// The ordered list of stages, used to render the stage control.
export const STAGE_ORDER: EngagementStage[] = [
  "discovery",
  "assessment",
  "prioritization",
  "solution_matching",
  "roadmap",
  "report",
]
