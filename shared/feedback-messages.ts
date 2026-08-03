// Every identifier here is emitted by a real route. Adding one "for later"
// would leave a translated string no user can ever see (coding-standards.md §3).
export const feedbackMessageIds = [
  "feedback.message.submitted",
  "feedback.message.loaded",
  "feedback.message.classified",
  "feedback.message.closed_no_action",
  "feedback.message.reentry_opened",
  "feedback.message.reentry_completed",
  "feedback.error.invalid_input",
  "feedback.error.invalid_idempotent_submission",
  "feedback.error.publication_not_found",
  "feedback.error.feedback_not_found",
  "feedback.error.feedback_not_classified",
  "feedback.error.invalid_feedback_transition",
  "feedback.error.reentry_not_found",
  "feedback.error.reentry_already_open",
  "feedback.error.reentry_sources_unavailable",
  "feedback.error.no_impacted_stages",
  "feedback.error.stale_update",
  "feedback.error.incomplete_reentry_outcome",
  "feedback.error.invalid_result_artifact",
  "feedback.error.missing_rationale",
  "feedback.error.internal",
] as const

export type FeedbackMessageId = (typeof feedbackMessageIds)[number]
