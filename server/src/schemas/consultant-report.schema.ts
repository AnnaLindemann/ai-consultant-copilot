import { z } from "zod"

const confidenceSchema = z.enum(["low", "medium", "high"])

const recommendedApproachSchema = z.enum([
  "No AI",
  "Automation",
  "LLM",
  "RAG",
  "Agentic Workflow",
  "Vector Search",
])

const validationMethodSchema = z.enum([
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
])

const nonEmptyString = z.string().trim().min(1)

export const consultantReportSchema = z.object({
  clientSummary: nonEmptyString,

  detectedProblems: z.array(
    z.object({
      statedProblem: nonEmptyString,
      hiddenProblemHypothesis: nonEmptyString,
      confidence: confidenceSchema,
    }),
  ),

  aiOpportunities: z.array(
    z.object({
      title: nonEmptyString,
      description: nonEmptyString,
      businessValue: nonEmptyString,
      complexity: confidenceSchema,
      impact: confidenceSchema,
      recommendedApproach: recommendedApproachSchema,
    }),
  ),

  recommendedSolution: z.object({
    mainUseCase: nonEmptyString,
    approach: recommendedApproachSchema,
    reason: nonEmptyString,
    suggestedTools: z.array(nonEmptyString),
    architectureSummary: nonEmptyString,
  }),

  risks: z.array(
    z.object({
      title: nonEmptyString,
      severity: confidenceSchema,
      mitigation: nonEmptyString,
    }),
  ),

  validationPlan: z.array(
    z.object({
      hypothesis: nonEmptyString,
      whatToCheck: z.array(nonEmptyString),
      requiredData: z.array(nonEmptyString),
      dataSource: z.array(nonEmptyString),
      method: validationMethodSchema,
      description: nonEmptyString,
      successCriteria: nonEmptyString,
      priority: confidenceSchema,
    }),
  ),

  followUpQuestions: z.array(nonEmptyString),

  mvpPlan: z.array(
    z.object({
      step: nonEmptyString,
      goal: nonEmptyString,
      estimatedEffort: nonEmptyString,
    }),
  ),
})

export type ConsultantReport = z.infer<typeof consultantReportSchema>