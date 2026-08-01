// The identifiers the Technology Knowledge Base surfaces report. The server
// returns an identifier and structured parameters, never prose; the frontend
// localizes it (architecture.md §7.1; coding-standards.md §12A).
export const technologyKnowledgeMessageIds = [
  "technology.message.loaded",
  "technology.message.category_saved",
  "technology.message.source_saved",
  "technology.message.proposal_created",
  "technology.message.proposal_approved",
  "technology.message.proposal_rejected",
  "technology.message.retrieval_previewed",
  "technology.error.invalid_input",
  "technology.error.not_found",
  "technology.error.duplicate_code",
  "technology.error.conflict",
  "technology.error.unknown_category",
  "technology.error.unknown_source",
  "technology.error.profile_exists",
  "technology.error.profile_missing",
  "technology.error.proposal_content_required",
  "technology.error.proposal_content_not_allowed",
  "technology.error.proposal_category_mismatch",
  "technology.error.proposal_code_mismatch",
  "technology.error.already_decided",
  "technology.error.apply_failed",
  "technology.error.internal",
] as const

export type TechnologyKnowledgeMessageId =
  (typeof technologyKnowledgeMessageIds)[number]

export const isTechnologyKnowledgeMessageId = (
  value: string,
): value is TechnologyKnowledgeMessageId =>
  (technologyKnowledgeMessageIds as readonly string[]).includes(value)
