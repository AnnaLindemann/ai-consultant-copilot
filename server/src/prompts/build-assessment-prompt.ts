import { ASSESSMENT_PROMPT } from "./assessment-prompt.js"

import type { DiscoveryProfile } from "../../../shared/discovery-profile.schema.js"
import type { KnowledgePackage } from "../../../shared/consulting-knowledge.schema.js"

// The Assessment reasons over supplied inputs only: the engagement's own facts
// — the persisted Discovery Profile plus the company context held on the
// Organization — and, from Phase 5, the curated knowledge package the
// deterministic retrieval selected.
//
// The package is the *whole* of the knowledge the model sees. It never searches
// the Consulting Knowledge Base, and it may not cite an entry that is not in
// the package (agent-rules.md §4 "the AI uses only knowledge that was supplied
// to it").
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
  knowledgePackage: KnowledgePackage
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

Curated Consulting Knowledge — the ${input.knowledgePackage.entries.length} entries
retrieved for this engagement, and the only consulting knowledge available to
you. Ground your framing in these and cite them by "code"; do not invent an
entry, a framework, or a criterion that is not listed here:
${JSON.stringify(input.knowledgePackage.entries, null, 2)}
`
}
