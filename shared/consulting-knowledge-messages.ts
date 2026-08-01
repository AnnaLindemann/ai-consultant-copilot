// The identifiers the knowledge surfaces report. The server returns an
// identifier and structured parameters, never prose; the frontend localizes it
// (architecture.md §7.1; coding-standards.md §12A).
export const consultingKnowledgeMessageIds = [
  "knowledge.message.loaded",
  "knowledge.message.saved",
  "knowledge.message.updated",
  "knowledge.error.invalid_input",
  "knowledge.error.invalid_relationship",
  "knowledge.error.duplicate_code",
  "knowledge.error.not_found",
  "knowledge.error.conflict",
  "knowledge.error.access_denied",
  "knowledge.error.internal",
] as const

export type ConsultingKnowledgeMessageId =
  (typeof consultingKnowledgeMessageIds)[number]

export const isConsultingKnowledgeMessageId = (
  value: string,
): value is ConsultingKnowledgeMessageId =>
  (consultingKnowledgeMessageIds as readonly string[]).includes(value)
