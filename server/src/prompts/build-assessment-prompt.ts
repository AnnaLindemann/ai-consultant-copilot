import { ASSESSMENT_PROMPT } from "./assessment-prompt.js"

import type { DiscoveryProfile } from "../../../shared/discovery-profile.schema.js"

// The Assessment reasons over supplied inputs only. Phase 3 supplies the
// engagement's own facts — the persisted Discovery Profile plus the company
// context held on the Organization; the curated Consulting Knowledge Base
// frameworks that will also shape it arrive with Phase 5.
export type AssessmentPromptInput = {
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
  discoveryProfile: DiscoveryProfile
}

export function buildAssessmentPrompt(input: AssessmentPromptInput): string {
  // Phase 3's accepted scope is unchanged by the Phase 2 Extension: whether the
  // Assessment reads the engagement's value & measurement baseline is a
  // separate, future decision (roadmap Phase 2, "Sequencing of the Revision 1.2
  // extension"). Until that decision is taken the baseline is kept out of what
  // the model is given, so this stage's inputs — and its prompt — stay exactly
  // what they were.
  const { valueMeasurementBaseline, ...assessableDiscovery } =
    input.discoveryProfile

  return `${ASSESSMENT_PROMPT.template}

Engagement context:
${JSON.stringify(
  { organization: input.organization, engagement: input.engagement },
  null,
  2,
)}

Discovery Profile — the only client facts available to you. "missingInformation"
lists gaps the consultant already recorded as unknown:
${JSON.stringify(assessableDiscovery, null, 2)}
`
}
