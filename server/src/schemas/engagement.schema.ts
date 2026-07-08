import { z } from "zod"

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

const engagementStageSchema = z.enum([
  "discovery",
  "assessment",
  "prioritization",
  "solution_matching",
  "roadmap",
  "report",
])

const nonEmptyString = z.string().trim().min(1)

const optionalStringArray = z.array(nonEmptyString).optional()

// The discovery/problem/process content an engagement can carry. In Phase 1 all
// of it is optional: an empty engagement is a valid, working state (roadmap
// Phase 1 DoD). Company identity/context lives on the Organization, not here.
const engagementContentShape = {
  title: z.string().trim().optional(),
  department: z.string().trim().optional(),

  statedProblem: z.string().trim().optional(),
  painPoints: optionalStringArray,
  affectedUsers: optionalStringArray,
  businessImpact: z.string().trim().optional(),
  urgency: levelSchema.optional(),

  currentProcess: z.string().trim().optional(),
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
  sensitiveData: z.boolean().optional(),
  sensitiveDataTypes: optionalStringArray,

  gdprConcerns: z.boolean().optional(),
  budgetAmount: z.number().positive().optional(),
  budgetCurrency: currencySchema.optional(),
  budgetNotes: z.string().trim().optional(),
  timeline: timelineSchema.optional(),
  humanApprovalRequired: z.boolean().optional(),
  technicalConstraints: optionalStringArray,

  desiredOutcome: z.string().trim().optional(),
  successMetrics: optionalStringArray,
  mvpScope: z.string().trim().optional(),
  notes: z.string().trim().optional(),
} as const

// Create an engagement under an existing Organization. Only the owning
// organization is required; the engagement may otherwise be empty.
export const createEngagementSchema = z.object({
  organizationId: nonEmptyString,
  ...engagementContentShape,
})

// Save (update) an engagement: any subset of its content plus the methodology
// `stage` marker. At least one field must be provided so a save is meaningful.
export const updateEngagementSchema = z
  .object({
    stage: engagementStageSchema.optional(),
    ...engagementContentShape,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })

export type CreateEngagementInput = z.infer<typeof createEngagementSchema>
export type UpdateEngagementInput = z.infer<typeof updateEngagementSchema>
