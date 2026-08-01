// The user-facing outcomes of the Recommendation endpoints, as **stable English
// identifiers** rather than prose (architecture.md §7.1; coding-standards.md
// §12A: "the server returns identifiers and parameters, not prose").
//
// The server names an outcome; the client renders it in the user's language.
// These identifiers are part of the API contract — they are never translated,
// and renaming one is a contract change.

export const recommendationMessageIds = [
  "recommendation.message.matched",
  "recommendation.message.saved",
  "recommendation.message.accepted",
  "recommendation.message.versions_loaded",
  "recommendation.message.version_loaded",
  "recommendation.error.invalid_input",
  // The stage cannot run without prioritized Opportunities to match, and it
  // cannot ground itself without curated knowledge to match them against. Each
  // is a distinct thing for the consultant to do something about, so each is
  // named rather than collapsed into one error.
  "recommendation.error.opportunities_not_ready",
  "recommendation.error.knowledge_unavailable",
  "recommendation.error.consultant_edits_protected",
  "recommendation.error.ai_step_failed",
  "recommendation.error.ai_output_invalid",
  // Grounding that names an Opportunity, a curated entry, or a Technology
  // Profile that does not exist — fabricated grounding, refused outright
  // (agent-rules.md §3, §12).
  "recommendation.error.ai_output_ungrounded",
  // The versioning outcomes, as the Opportunity stage names them: a save that
  // lost a race, a save aimed at a preserved version, a version outside the
  // caller's reach, two generations racing each other, and a generation that
  // could not be stored.
  "recommendation.error.stale_update",
  "recommendation.error.historical_version_readonly",
  "recommendation.error.version_not_found",
  "recommendation.error.version_conflict",
  "recommendation.error.persistence_failed",
  "recommendation.error.internal",
] as const

export type RecommendationMessageId = (typeof recommendationMessageIds)[number]
