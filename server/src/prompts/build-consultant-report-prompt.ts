import { CONSULTANT_REPORT_PROMPT } from "./consultant-report-prompt.js"
import { sourceGaps, type ReportSourceBundle } from "../domain/engagement/consultant-report.js"

import type { KnowledgePackage } from "../../../shared/consulting-knowledge.schema.js"

export type ConsultantReportPromptInput = {
  sources: ReportSourceBundle
  followUpTemplates: KnowledgePackage
}

export function buildConsultantReportPrompt(
  input: ConsultantReportPromptInput,
): string {
  return `${CONSULTANT_REPORT_PROMPT.template}

Accepted source material:
${JSON.stringify(
  {
    discovery: input.sources.discovery,
    assessment: input.sources.assessment,
    opportunities: input.sources.opportunities.prioritization,
    recommendations: input.sources.recommendations.recommendationSet,
    roadmap: input.sources.roadmap.roadmap,
  },
  null,
  2,
)}

Persisted unresolved gaps. Follow-up questions must cite one sourceDescription
exactly as shown:
${JSON.stringify(gapExtract(input.sources), null, 2)}

Follow-up templates. Cite by "code" only when the template applies:
${JSON.stringify(templateExtract(input.followUpTemplates), null, 2)}
`
}

const gapExtract = (sources: ReportSourceBundle) =>
  sourceGaps(sources).map((sourceDescription) => ({ sourceDescription }))

const templateExtract = (knowledgePackage: KnowledgePackage) =>
  knowledgePackage.entries
    .filter((entry) => entry.kind === "follow_up_template")
    .map((entry) => ({
      code: entry.code,
      kind: entry.kind,
      title: entry.title,
      summary: entry.summary,
      questions: entry.details.questions,
    }))
