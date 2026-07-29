import { assessmentSchema } from "../../../shared/assessment.schema.js"

export function validateAssessment(parsed: unknown) {
  return assessmentSchema.parse(parsed)
}
