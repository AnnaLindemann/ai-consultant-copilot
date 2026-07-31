// The user-facing outcomes of the Opportunity prioritization endpoints, as
// **stable English identifiers** rather than prose (architecture.md §7.1;
// coding-standards.md §12A: "the server returns identifiers and parameters, not
// prose").
//
// The server names an outcome; the client renders it in the user's language.
// These identifiers are part of the API contract — they are never translated,
// and renaming one is a contract change.

export const opportunityMessageIds = [
  "opportunity.message.prioritized",
  "opportunity.message.saved",
  "opportunity.message.accepted",
  "opportunity.error.invalid_input",
  "opportunity.error.assessment_not_ready",
  "opportunity.error.ai_step_failed",
  "opportunity.error.ai_output_invalid",
  "opportunity.error.ai_output_ungrounded",
  "opportunity.error.consultant_edits_protected",
  "opportunity.error.success_criteria_placeholder",
  // The versioning outcomes (roadmap Phase 4). A save that lost a race, a save
  // aimed at a preserved version, a version that is not in the caller's reach,
  // two regenerations racing each other, and a generation that could not be
  // stored — each is a distinct thing for the consultant to do something about,
  // so each is named rather than collapsed into one error.
  "opportunity.error.stale_update",
  "opportunity.error.historical_version_readonly",
  "opportunity.error.version_not_found",
  "opportunity.error.version_conflict",
  "opportunity.error.persistence_failed",
  "opportunity.error.internal",
] as const

export type OpportunityMessageId = (typeof opportunityMessageIds)[number]

// Structured values a message is rendered with. Parameter values are either
// plain text or themselves identifiers, which the presentation layer localizes
// in turn — so no displayed text is ever built on the server.
export type OpportunityMessageParams = Record<string, string>
