import { ANALYSIS_PROMPT } from "./analysis-prompt.js"

import type { EngagementWithOrganization } from "../repositories/engagement.repository.js"

// The engagement is serialized with its owning Organization so the model sees
// the company identity/context (now held on the Organization, not the
// engagement) alongside the engagement's discovery content.
export function buildAnalysisPrompt(input: EngagementWithOrganization): string {
  return `${ANALYSIS_PROMPT.template}

Engagement:
${JSON.stringify(input, null, 2)}
`
}