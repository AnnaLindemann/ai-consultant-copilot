import { createSha256Hash } from "../lib/create-sha256-hash.js"

const template = `You assemble an Implementation Roadmap for an AI consulting engagement.

Rules:
- Use only the accepted Recommendations supplied in the prompt.
- Every accepted Recommendation must have exactly one recommendation disposition:
  - "included" when it appears in one or more roadmap phases.
  - "deferred" when it is deliberately excluded from this roadmap; include a rationale.
- Cite only Implementation Pattern codes supplied in the prompt.
- Do not invent costs, budgets, dates, durations, staffing, ROI, or numeric estimates.
- Use qualitative effort only when grounded in the supplied Recommendations.
- Keep unknown prerequisites, risks, assumptions, and gaps explicit.
- Do not introduce technologies that are not already in the accepted Recommendations.
- Do not modify Recommendations, Opportunities, Discovery, Assessment, or knowledge.
- Return strict JSON only.

Return this shape:
{
  "summary": "short roadmap summary",
  "phases": [
    {
      "temporaryPhaseKey": "phase-key-stable-within-this-json",
      "sequenceOrder": 1,
      "title": "phase title",
      "objective": "what this phase achieves",
      "scope": ["included work"],
      "expectedOutcome": "observable outcome",
      "linkedRecommendationIds": ["rec-id"],
      "dependencyPhaseKeys": ["earlier-phase-temporary-key"],
      "explicitPrerequisites": ["known prerequisite or gap"],
      "readinessConsiderations": ["readiness consideration"],
      "risks": ["risk"],
      "assumptions": ["assumption"],
      "effort": { "level": "low|medium|high", "rationale": "qualitative rationale" },
      "sequencingRationale": "why this phase belongs here",
      "implementationPatternGrounding": [
        { "code": "pattern-code", "rationale": "why this pattern applies here" }
      ]
    }
  ],
  "recommendationDispositions": [
    { "recommendationId": "included-rec-id", "disposition": "included" },
    {
      "recommendationId": "deferred-rec-id",
      "disposition": "deferred",
      "rationale": "why this accepted Recommendation is deliberately excluded from the current roadmap"
    }
  ],
  "assumptions": ["roadmap-level assumption"],
  "gaps": ["missing information"]
}

Important:
- temporaryPhaseKey values must be unique within the JSON.
- dependencyPhaseKeys must reference temporaryPhaseKey values from earlier phases only.
- Do not output permanent phase ids. The server validates the temporary dependency graph, mints trusted permanent IDs, translates dependencies, and persists only permanent IDs.`

export const IMPLEMENTATION_ROADMAP_PROMPT_V1 = {
  version: "implementation-roadmap.v1",
  template,
  fingerprint: createSha256Hash(template),
} as const
