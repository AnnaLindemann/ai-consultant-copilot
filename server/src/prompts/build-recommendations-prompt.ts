import { RECOMMENDATIONS_PROMPT } from "./recommendations-prompt.js"

import type { KnowledgePackage } from "../../../shared/consulting-knowledge.schema.js"
import type { OpportunityPrioritization } from "../../../shared/opportunity.schema.js"
import type { TechnologyPackage } from "../../../shared/technology-knowledge.schema.js"

// Solution matching reasons over supplied inputs only, and the grounding is
// *retrieved deterministically and passed into the prompt* rather than searched
// for by the model — which is what makes traceability structural rather than
// best-effort (architecture.md §5; agent-rules.md §3, §4).
//
// Four inputs, and each is there for a reason:
//
//  - the prioritized **Opportunities**, which are what a recommendation
//    addresses, carrying the discovery facts behind each one so the proposal is
//    grounded in what the engagement established rather than in a restatement;
//  - the **Consulting Knowledge** extract (AI Use Cases, Solution Patterns),
//    which is what justifies an approach;
//  - the **Technology Knowledge** extract (Technology Profiles), which is the
//    only place an implementation technology or AI model may come from;
//  - the company context held on the Organization.
//
// The Discovery Profile is deliberately not supplied whole, and neither is the
// Assessment: the Opportunities already carry the findings they were derived
// from and those findings' supporting discovery facts, and re-supplying the
// earlier stages would let a recommendation be grounded in something the
// engagement never prioritized.
export type RecommendationsPromptInput = {
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
  opportunities: OpportunityPrioritization
  // What each Opportunity's cited Assessment findings rest on, resolved by the
  // server from persisted state and keyed by opportunity id.
  discoveryTrace: Record<
    string,
    { findingTitle: string; supportingFacts: string[] }[]
  >
  knowledgePackage: KnowledgePackage
  technologyPackage: TechnologyPackage
}

export function buildRecommendationsPrompt(
  input: RecommendationsPromptInput,
): string {
  return `${RECOMMENDATIONS_PROMPT.template}

Engagement context:
${JSON.stringify(
  { organization: input.organization, engagement: input.engagement },
  null,
  2,
)}

Prioritized Opportunities — the only opportunities available to you. Address
them by their "id" exactly as it appears here:
${JSON.stringify(input.opportunities, null, 2)}

Discovery facts behind each Opportunity, keyed by opportunity id. These are what
the engagement established about the client; treat them as the factual ground
for your proposals and do not restate them as new findings:
${JSON.stringify(input.discoveryTrace, null, 2)}

Consulting Knowledge extract — the curated consulting knowledge retrieved for
this engagement. Cite entries by their "code" exactly as it appears here; at
least one citation per recommendation must be of kind "ai_use_case" or
"solution_pattern":
${JSON.stringify(knowledgeExtract(input.knowledgePackage), null, 2)}

Technology Knowledge extract — the curated Technology Profiles retrieved for
this engagement. This is the ONLY place an implementation technology or AI model
may come from. Cite profiles by their "code" exactly as it appears here:
${JSON.stringify(technologyExtract(input.technologyPackage), null, 2)}
`
}

// What the model is shown of a retrieved package: the curated content, and
// nothing about how retrieval ranked it. Scores and match reasons are the
// consultant's explanation of *why this knowledge was offered*; feeding them to
// the model would invite it to treat a ranking as evidence about the client.
const knowledgeExtract = (knowledgePackage: KnowledgePackage) =>
  knowledgePackage.entries.map((entry) => ({
    code: entry.code,
    kind: entry.kind,
    title: entry.title,
    summary: entry.summary,
    details: entry.details,
  }))

const technologyExtract = (technologyPackage: TechnologyPackage) =>
  technologyPackage.profiles.map((profile) => ({
    code: profile.code,
    categoryCode: profile.categoryCode,
    title: profile.title,
    summary: profile.summary,
    details: profile.details,
  }))
