import { assessmentDraftSchema } from "../../../shared/assessment.schema.js"

// AI output is validated against the *draft* contract: the model writes
// findings, not identities. The server mints a stable id for each finding when
// it is first persisted (shared/assessment.schema.ts).
export function validateAssessment(parsed: unknown) {
  return assessmentDraftSchema.parse(parsed)
}
