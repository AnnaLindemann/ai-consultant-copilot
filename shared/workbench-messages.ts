// The user-facing outcomes of the Organization, Engagement, Assessment and
// Analysis endpoints, as **stable English identifiers** rather than prose
// (architecture.md §7.1; coding-standards.md §12A: "the server returns
// identifiers and parameters, not prose").
//
// These endpoints predate the localization seam and reported their outcomes as
// English sentences, which the workbench then displayed verbatim. The wording
// now lives in the catalogue and only the identifier travels; as everywhere
// else, the identifier is part of the API contract, is never translated, and
// renaming one is a contract change.

export const workbenchMessageIds = [
  // Organizations.
  "organization.message.list_loaded",
  "organization.message.loaded",
  "organization.message.created",
  "organization.error.invalid_input",
  "organization.error.internal",

  // Engagements.
  "engagement.message.list_loaded",
  "engagement.message.loaded",
  "engagement.message.created",
  "engagement.message.saved",
  "engagement.error.invalid_input",
  "engagement.error.organization_not_found",
  "engagement.error.internal",

  // The Assessment stage. Each refusal is a distinct thing for the consultant
  // to act on, so each is named rather than collapsed into one error — and the
  // provider's own diagnostic text stays in the log where it belongs.
  "assessment.message.draft_generated",
  "assessment.message.saved",
  "assessment.error.invalid_input",
  "assessment.error.discovery_not_ready",
  "assessment.error.consultant_edits_protected",
  "assessment.error.ai_step_failed",
  "assessment.error.ai_output_invalid",
  "assessment.error.internal",

  // The Phase 0 analysis run and its audit trail.
  "analysis.message.completed",
  "analysis.error.output_invalid",
  "analysis.error.failed",
  "analysis.error.runs_not_loaded",
] as const

export type WorkbenchMessageId = (typeof workbenchMessageIds)[number]

export const isWorkbenchMessageId = (
  value: string,
): value is WorkbenchMessageId =>
  (workbenchMessageIds as readonly string[]).includes(value)
