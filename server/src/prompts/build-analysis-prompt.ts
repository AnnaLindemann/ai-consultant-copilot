import type { ClientCase } from "@prisma/client"

import { ANALYSIS_PROMPT } from "./analysis-prompt.js"

export function buildAnalysisPrompt(input: ClientCase): string {
  return `${ANALYSIS_PROMPT.template}

Client case:
${JSON.stringify(input, null, 2)}
`
}