import type { ClientCase } from "@prisma/client"

export function buildAnalysisPrompt(input: ClientCase): string {
  return `
You are an AI Consultant.

Analyze the client case and return ONLY valid JSON.
Do not use markdown.
Do not wrap the response in \`\`\`json.
Do not add explanations before or after the JSON.

The JSON must match this exact structure:

{
  "clientSummary": "string",
  "detectedProblems": [
    {
      "statedProblem": "string",
      "hiddenProblemHypothesis": "string",
      "confidence": "low | medium | high"
    }
  ],
  "aiOpportunities": [
    {
      "title": "string",
      "description": "string",
      "businessValue": "string",
      "complexity": "low | medium | high",
      "impact": "low | medium | high",
      "recommendedApproach": "No AI | Automation | LLM | RAG | Agentic Workflow | Vector Search"
    }
  ],
  "recommendedSolution": {
    "mainUseCase": "string",
    "approach": "No AI | Automation | LLM | RAG | Agentic Workflow | Vector Search"
    "reason": "string",
    "suggestedTools": ["string"],
    "architectureSummary": "string"
  },
  "risks": [
    {
      "title": "string",
      "severity": "low | medium | high",
      "mitigation": "string"
    }
  ],
  "validationPlan": [
    {
      "hypothesis": "string",
      "whatToCheck": ["string"],
      "requiredData": ["string"],
      "dataSource": ["string"],
      "method": "excel-analysis | sql-query | crm-report | ticket-analysis | email-analysis | log-analysis | analytics-dashboard | process-mapping | stakeholder-interviews | user-observation | manual-sampling | document-review | api-data-export",
      "description": "string",
      "successCriteria": "string",
      "priority": "low | medium | high"
    }
  ],
  "followUpQuestions": ["string"],
  "mvpPlan": [
    {
      "step": "string",
      "goal": "string",
      "estimatedEffort": "string"
    }
  ]
}
For enum fields, use exactly one of the listed values.
Do not invent new enum values.

Client case:
${JSON.stringify(input, null, 2)}
`
}