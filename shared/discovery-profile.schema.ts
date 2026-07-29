import { z } from "zod"

export const discoveryGapCategorySchema = z.enum([
  "situation",
  "operations",
  "problems",
  "current_process",
  "tools",
  "data",
  "constraints",
  "goals",
])

export const discoveryGapSchema = z.object({
  category: discoveryGapCategorySchema,
  description: z.string().trim().min(1),
})

const nullableText = z.string().trim().min(1).nullable()
const stringList = z.array(z.string().trim().min(1))

// The Phase 2 Discovery Profile boundary. It maps to fields owned by the
// Engagement aggregate; the profile is not persisted in a parallel store.
export const discoveryProfileSchema = z.object({
  department: nullableText,

  statedProblem: nullableText,
  painPoints: stringList,
  affectedUsers: stringList,
  businessImpact: nullableText,
  urgency: z.enum(["low", "medium", "high"]).nullable(),

  currentProcess: nullableText,
  processSteps: stringList,
  processFrequency: z
    .enum(["rarely", "monthly", "weekly", "daily", "many_times_per_day"])
    .nullable(),
  manualWorkLevel: z.enum(["low", "medium", "high"]).nullable(),
  bottlenecks: stringList,

  currentTools: stringList,
  communicationChannels: stringList,
  integrationNeeds: stringList,

  dataTypes: stringList,
  dataLocation: stringList,
  dataAvailability: z
    .enum(["none", "unknown", "restricted", "available"])
    .nullable(),
  dataQuality: z.enum(["poor", "mixed", "good", "unknown"]).nullable(),
  sensitiveData: z.boolean().nullable(),
  sensitiveDataTypes: stringList,

  gdprConcerns: z.boolean().nullable(),
  budgetAmount: z.number().positive().nullable(),
  budgetCurrency: z.enum(["EUR", "USD", "GBP", "OTHER"]).nullable(),
  budgetNotes: nullableText,
  timeline: z
    .enum(["asap", "this_quarter", "this_year", "unknown"])
    .nullable(),
  humanApprovalRequired: z.boolean().nullable(),
  technicalConstraints: stringList,

  desiredOutcome: nullableText,
  successMetrics: stringList,
  mvpScope: nullableText,
  notes: nullableText,

  missingInformation: z.array(discoveryGapSchema),
})

export type DiscoveryProfile = z.infer<typeof discoveryProfileSchema>
export type DiscoveryGap = z.infer<typeof discoveryGapSchema>
export type DiscoveryGapCategory = z.infer<typeof discoveryGapCategorySchema>
