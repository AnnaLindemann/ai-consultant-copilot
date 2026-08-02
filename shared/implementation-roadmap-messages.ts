export const roadmapMessageIds = [
  "roadmap.message.loaded",
  "roadmap.message.generated",
  "roadmap.message.saved",
  "roadmap.message.accepted",
  "roadmap.message.versions_loaded",
  "roadmap.error.invalid_input",
  "roadmap.error.recommendations_not_ready",
  "roadmap.error.knowledge_unavailable",
  "roadmap.error.consultant_edits_protected",
  "roadmap.error.ai_step_failed",
  "roadmap.error.ai_output_invalid",
  "roadmap.error.ai_output_ungrounded",
  "roadmap.error.version_conflict",
  "roadmap.error.persistence_failed",
  "roadmap.error.version_not_found",
  "roadmap.error.historical_version_readonly",
  "roadmap.error.stale_update",
  "roadmap.error.internal",
] as const

export type RoadmapMessageId = (typeof roadmapMessageIds)[number]
