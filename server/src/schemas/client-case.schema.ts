import { z } from "zod"

const companySizeSchema = z.enum([
  "solo",
  "micro",
  "small",
  "medium",
  "large",
  "enterprise",
])

const levelSchema = z.enum(["low", "medium", "high"])

const processFrequencySchema = z.enum([
  "rarely",
  "monthly",
  "weekly",
  "daily",
  "many_times_per_day",
])

const dataAvailabilitySchema = z.enum([
  "none",
  "unknown",
  "restricted",
  "available",
])

const dataQualitySchema = z.enum(["poor", "mixed", "good", "unknown"])

const timelineSchema = z.enum([
  "asap",
  "this_quarter",
  "this_year",
  "unknown",
])

const currencySchema = z.enum(["EUR", "USD", "GBP", "OTHER"])

const nonEmptyString = z.string().trim().min(1)

const optionalStringArray = z.array(nonEmptyString).optional()

export const createClientCaseSchema = z.object({
  companyName: nonEmptyString,
  industry: nonEmptyString,
  companySize: companySizeSchema.optional(),
  geography: z.string().trim().optional(),
  department: z.string().trim().optional(),

  statedProblem: nonEmptyString,
  painPoints: optionalStringArray,
  affectedUsers: optionalStringArray,
  businessImpact: z.string().trim().optional(),
  urgency: levelSchema.optional(),

  currentProcess: nonEmptyString,
  processSteps: optionalStringArray,
  processFrequency: processFrequencySchema.optional(),
  manualWorkLevel: levelSchema.optional(),
  bottlenecks: optionalStringArray,

  currentTools: optionalStringArray,
  communicationChannels: optionalStringArray,
  integrationNeeds: optionalStringArray,

  dataTypes: optionalStringArray,
  dataLocation: optionalStringArray,
  dataAvailability: dataAvailabilitySchema.optional(),
  dataQuality: dataQualitySchema.optional(),
  sensitiveData: z.boolean(),
  sensitiveDataTypes: optionalStringArray,

  gdprConcerns: z.boolean(),
  budgetAmount: z.number().positive().optional(),
  budgetCurrency: currencySchema.optional(),
  budgetNotes: z.string().trim().optional(),
  timeline: timelineSchema.optional(),
  humanApprovalRequired: z.boolean().optional(),
  technicalConstraints: optionalStringArray,

  desiredOutcome: nonEmptyString,
  successMetrics: optionalStringArray,
  mvpScope: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

export type CreateClientCaseInput = z.infer<typeof createClientCaseSchema>