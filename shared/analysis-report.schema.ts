import { z } from "zod"

const nonEmptyText = z.string().trim().min(1)
const textList = z.array(nonEmptyText)
const confidenceSchema = z.enum(["low", "medium", "high"])
const approachSchema = z.enum([
  "No AI",
  "Automation",
  "LLM",
  "RAG",
  "Agentic Workflow",
  "Vector Search",
])

export const analysisReportSchema = z.object({
  clientSummary: nonEmptyText,
  detectedProblems: z.array(
    z.object({
      statedProblem: nonEmptyText,
      hiddenProblemHypothesis: nonEmptyText,
      confidence: confidenceSchema,
    }),
  ),
  aiOpportunities: z.array(
    z.object({
      title: nonEmptyText,
      description: nonEmptyText,
      businessValue: nonEmptyText,
      complexity: confidenceSchema,
      impact: confidenceSchema,
      recommendedApproach: approachSchema,
    }),
  ),
  recommendedSolution: z.object({
    mainUseCase: nonEmptyText,
    approach: approachSchema,
    reason: nonEmptyText,
    suggestedTools: textList,
    architectureSummary: nonEmptyText,
  }),
  risks: z.array(
    z.object({
      title: nonEmptyText,
      severity: confidenceSchema,
      mitigation: nonEmptyText,
    }),
  ),
  validationPlan: z.array(
    z.object({
      hypothesis: nonEmptyText,
      whatToCheck: textList,
      requiredData: textList,
      dataSource: textList,
      method: z.enum([
        "excel-analysis",
        "sql-query",
        "crm-report",
        "ticket-analysis",
        "email-analysis",
        "log-analysis",
        "analytics-dashboard",
        "process-mapping",
        "stakeholder-interviews",
        "user-observation",
        "manual-sampling",
        "document-review",
        "api-data-export",
      ]),
      description: nonEmptyText,
      successCriteria: nonEmptyText,
      priority: confidenceSchema,
    }),
  ),
  followUpQuestions: textList,
  mvpPlan: z.array(
    z.object({
      step: nonEmptyText,
      goal: nonEmptyText,
      estimatedEffort: nonEmptyText,
    }),
  ),
})

export type AnalysisReport = z.infer<typeof analysisReportSchema>
