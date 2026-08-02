import { IMPLEMENTATION_ROADMAP_PROMPT } from "./implementation-roadmap-prompt.js"

import type { KnowledgePackage } from "../../../shared/consulting-knowledge.schema.js"
import type { RecommendationSet } from "../../../shared/recommendation.schema.js"

export type ImplementationRoadmapPromptInput = {
  organization: {
    name: string
    industry: string | null
    companySize: string | null
    geography: string | null
  }
  engagement: {
    title: string | null
    department: string | null
    businessImpact: string | null
    currentProcess: string | null
    desiredOutcome: string | null
    technicalConstraints: unknown
    missingInformation: unknown
  }
  recommendations: RecommendationSet
  implementationPatterns: KnowledgePackage
}

export function buildImplementationRoadmapPrompt(
  input: ImplementationRoadmapPromptInput,
): string {
  return `${IMPLEMENTATION_ROADMAP_PROMPT.template}

Engagement context:
${JSON.stringify(
  { organization: input.organization, engagement: input.engagement },
  null,
  2,
)}

Accepted Recommendations — these are the only Recommendations available to
sequence. Reference them by "id" exactly as shown. Every id must have exactly
one disposition, either included in phases or deferred with rationale:
${JSON.stringify(input.recommendations, null, 2)}

Implementation Pattern extract — cite entries by "code" exactly as shown:
${JSON.stringify(patternExtract(input.implementationPatterns), null, 2)}
`
}

const patternExtract = (knowledgePackage: KnowledgePackage) =>
  knowledgePackage.entries.map((entry) => ({
    code: entry.code,
    kind: entry.kind,
    title: entry.title,
    summary: entry.summary,
    details: entry.details,
  }))
