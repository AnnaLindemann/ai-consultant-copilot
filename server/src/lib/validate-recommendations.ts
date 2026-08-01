import { recommendationSetDraftSchema } from "../../../shared/recommendation.schema.js"

// AI output is validated against the *draft* contract: the model cites an
// opportunity id and curated codes, and the server resolves those citations into
// the grounding a stored version carries (shared/recommendation.schema.ts).
export function validateRecommendations(parsed: unknown) {
  return recommendationSetDraftSchema.parse(parsed)
}
