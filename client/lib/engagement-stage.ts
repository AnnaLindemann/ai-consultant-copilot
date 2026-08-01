import { t } from "../i18n"

// The methodology stage an engagement stands at (domain-model.md §3). The
// identifiers are the backend's own `EngagementStage` enum and stay English on
// the wire and in storage; only their rendering is looked up.
export const STAGE_ORDER = [
  "discovery",
  "assessment",
  "prioritization",
  "solution_matching",
  "roadmap",
  "report",
] as const

export type EngagementStage = (typeof STAGE_ORDER)[number]

export const stageLabel = (stage: EngagementStage): string =>
  t(`engagement.stage.${stage}`)
