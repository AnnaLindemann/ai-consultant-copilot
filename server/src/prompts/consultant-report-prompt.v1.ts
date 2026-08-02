import { createSha256Hash } from "../lib/create-sha256-hash.js"

const template = `You assemble a client-ready Consultant Report for an AI consulting engagement.

Rules:
- Write the report draft in German.
- Use only the accepted source material supplied in this prompt.
- Do not introduce new findings, facts, recommendations, technologies, dates, costs, ROI numbers, citations, or client claims.
- Preserve assumptions, risks, confidence, gaps, and measurement uncertainty.
- Turn unresolved persisted gaps into follow-up questions.
- A follow-up question must cite the exact sourceDescription of one supplied gap.
- If using a template, cite only one supplied follow_up_template code.
- Do not invent identities, report versions, approval, publication, authorization, or client visibility.
- Return strict JSON only.

Return this shape:
{
  "title": "report title",
  "executiveSummary": "short client-ready summary",
  "engagementContext": {
    "organizationName": "client organization name",
    "engagementTitle": "engagement title or null",
    "department": "department or null",
    "statedProblem": "stated problem or null",
    "desiredOutcome": "desired outcome or null",
    "businessImpact": "business impact or null"
  },
  "assessmentSummary": "summary of accepted assessment",
  "prioritizedProblems": [
    {
      "opportunityId": "accepted opportunity id",
      "title": "problem title",
      "problem": "problem statement",
      "priorityRank": 1,
      "rationale": "why this priority matters"
    }
  ],
  "recommendations": [
    {
      "recommendationId": "accepted recommendation id",
      "title": "recommendation title",
      "approach": "recommended approach",
      "rationale": "why it fits",
      "expectedValue": "qualitative expected value",
      "effort": { "level": "low|medium|high", "rationale": "qualitative effort rationale" },
      "confidence": "low|medium|high"
    }
  ],
  "deferredRecommendations": [
    {
      "recommendationId": "deferred accepted recommendation id",
      "title": "deferred recommendation title",
      "rationale": "accepted roadmap deferral rationale"
    }
  ],
  "roadmapSummary": "accepted roadmap summary",
  "roadmapPhases": [
    {
      "phaseId": "accepted roadmap phase id",
      "sequenceOrder": 1,
      "title": "phase title",
      "objective": "phase objective",
      "expectedOutcome": "phase outcome"
    }
  ],
  "assumptions": ["visible assumption"],
  "risks": ["visible risk"],
  "nextSteps": ["client-ready next step"],
  "followUpQuestions": [
    {
      "question": "client-facing question",
      "sourceType": "discovery_gap|measurement_gap|assessment_gap|opportunity_gap|recommendation_gap|roadmap_gap",
      "sourceDescription": "exact supplied gap sourceDescription",
      "templateCode": "template-code or null",
      "rationale": "why this question is needed",
      "status": "draft|approved|removed"
    }
  ]
}`

export const CONSULTANT_REPORT_PROMPT_V1 = {
  version: "consultant-report.v1",
  template,
  fingerprint: createSha256Hash(template),
} as const
