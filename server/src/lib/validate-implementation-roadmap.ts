import { generatedRoadmapDraftSchema } from "../../../shared/implementation-roadmap.schema.js"

import type { GeneratedRoadmapDraft } from "../../../shared/implementation-roadmap.schema.js"

export function validateImplementationRoadmap(
  value: unknown,
): GeneratedRoadmapDraft {
  return generatedRoadmapDraftSchema.parse(value)
}
