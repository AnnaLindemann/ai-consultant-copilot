import { opportunityPrioritizationDraftSchema } from "../../../shared/opportunity.schema.js"

// AI output is validated against the *draft* contract: the model supplies
// finding ids and success criteria without figures, and the server resolves the
// citations and stores the version (shared/opportunity.schema.ts).
export function validateOpportunities(parsed: unknown) {
  return opportunityPrioritizationDraftSchema.parse(parsed)
}
