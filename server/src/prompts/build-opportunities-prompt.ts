import { OPPORTUNITIES_PROMPT } from "./opportunities-prompt.js"

import type { Assessment } from "../../../shared/assessment.schema.js"

// Prioritization reasons over supplied inputs only. Phase 4 supplies the
// engagement's persisted Assessment — the stage Opportunities are derived from
// (roadmap Phase 4) — plus the company context held on the Organization.
//
// The Discovery Profile is deliberately not supplied: the Assessment already
// carries the discovery facts behind each finding in its `supportingFacts`, and
// re-supplying discovery would let an opportunity be grounded in something the
// Assessment never found. The curated Consulting Knowledge Base that will also
// shape prioritization arrives with Phase 5.
export type OpportunitiesPromptInput = {
  organization: {
    name: string
    industry: string | null
    companySize: string | null
    geography: string | null
  }
  engagement: {
    title: string | null
    department: string | null
  }
  assessment: Assessment
}

export function buildOpportunitiesPrompt(
  input: OpportunitiesPromptInput,
): string {
  return `${OPPORTUNITIES_PROMPT.template}

Engagement context:
${JSON.stringify(
  { organization: input.organization, engagement: input.engagement },
  null,
  2,
)}

Assessment — the only findings available to you. Cite findings by their "id"
exactly as it appears here, and qualify each opportunity against the
"aiReadiness" dimension. "gaps" lists what the Assessment itself could not
determine:
${JSON.stringify(input.assessment, null, 2)}
`
}
