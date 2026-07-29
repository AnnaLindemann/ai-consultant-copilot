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

const nonEmptyText = z.string().trim().min(1)
const nullableText = nonEmptyText.nullable()
const stringList = z.array(nonEmptyText)

// ---------------------------------------------------------------------------
// Value & measurement baseline (Phase 2 Extension)
//
// The quantitative half of the Discovery Profile: what the problem costs today
// and what success would measurably look like (domain-model.md §2 "Discovery
// Profile"; roadmap Phase 2). Two rules shape every type below:
//   - an estimate is never presented as a measurement, so how a figure was
//     obtained travels with the figure and can never be dropped;
//   - an absent baseline is a finding, not an empty field, so what the client
//     cannot answer is recorded as an explicit gap with its reason.
// ---------------------------------------------------------------------------

// How a figure was obtained. The distinction is domain data, not a display
// flag: an estimate must never be read as the client's measured baseline
// (domain-model.md §2; agent-rules.md §2A.5).
export const measurementBasisSchema = z.enum(["measured", "estimated"])

// Where a figure came from, so its reliability is visible (roadmap Phase 2
// "Data Sources"). `estimate` names a figure nobody measured — a consultant's
// or client's judgement — and is why the basis below cannot then be `measured`.
export const dataSourceKindSchema = z.enum([
  "system",
  "report",
  "interview",
  "estimate",
  "other",
])

export const dataSourceSchema = z.object({
  kind: dataSourceKindSchema,
  detail: nullableText,
})

// One number as the client stated it, with the provenance that makes it
// trustworthy. The value stays the client's own wording (the product records
// stated figures; it does not measure the client's systems — domain-model.md
// §6), and both refinements below are the "never present an estimate as a
// measurement" rule expressed structurally.
export const discoveryFigureSchema = z
  .object({
    value: nonEmptyText,
    basis: measurementBasisSchema,
    // How the figure is, or would be, measured — so it can be trusted and
    // re-measured later. Required for a measured figure: a number nobody can
    // say how to reproduce is not a measurement.
    measurementMethod: nullableText,
    dataSource: dataSourceSchema,
  })
  .refine(
    (figure) => figure.basis !== "measured" || figure.measurementMethod !== null,
    {
      message:
        "A measured figure must state how it is measured, so it can be trusted and re-measured",
      path: ["measurementMethod"],
    },
  )
  .refine(
    (figure) =>
      figure.dataSource.kind !== "estimate" || figure.basis === "estimated",
    {
      message: "A figure sourced from an estimate cannot be recorded as measured",
      path: ["basis"],
    },
  )

// What the problem costs the business in operational terms (roadmap Phase 2
// "Business Impact"). The description always carries the consultant's words;
// the figure is attached only where the client can put a number on it.
export const businessImpactCategorySchema = z.enum([
  "lost_time",
  "lost_revenue",
  "rework",
  "customer_dissatisfaction",
  "staff_load",
  "other",
])

export const businessImpactSchema = z.object({
  category: businessImpactCategorySchema,
  description: nonEmptyText,
  figure: discoveryFigureSchema.nullable(),
})

// How often things go wrong, how bad each occurrence is, and what one costs.
export const errorSeveritySchema = z.object({
  level: z.enum(["low", "medium", "high"]).nullable(),
  description: nullableText,
})

export const errorProfileSchema = z.object({
  frequency: discoveryFigureSchema.nullable(),
  severity: errorSeveritySchema,
  costPerOccurrence: discoveryFigureSchema.nullable(),
})

// An indicator the client already tracks for the affected operations. Its
// current and target values live in the metric lists below, so one KPI is not
// duplicated across three places.
export const existingKpiSchema = z.object({
  name: nonEmptyText,
  description: nullableText,
})

// Where an indicator stands today.
export const baselineMetricSchema = z.object({
  name: nonEmptyText,
  current: discoveryFigureSchema,
  notes: nullableText,
})

// What the client would consider success, expressed in the same terms as the
// baseline. A target's basis records how the target number was arrived at.
export const targetSuccessMetricSchema = z.object({
  name: nonEmptyText,
  target: discoveryFigureSchema,
  notes: nullableText,
})

// The parts of the baseline a gap can be recorded against — the documented
// baseline items, with error frequency/severity/cost separable because clients
// often know one and not the others.
export const measurementGapSubjectSchema = z.enum([
  "business_impact",
  "error_frequency",
  "error_severity",
  "error_cost",
  "existing_kpis",
  "baseline_metrics",
  "target_success_metrics",
  "measurement_method",
  "data_sources",
])

// Why the figure is missing. "The client does not measure this today" is a
// finding that must survive into assessment and follow-up questions, so the
// reason is recorded rather than left as an empty field (roadmap Phase 2).
export const measurementGapReasonSchema = z.enum([
  "not_measured",
  "not_available",
  "not_shared",
  "unknown",
  "other",
])

export const measurementGapSchema = z.object({
  subject: measurementGapSubjectSchema,
  reason: measurementGapReasonSchema,
  description: nullableText,
})

export const valueMeasurementBaselineSchema = z.object({
  businessImpacts: z.array(businessImpactSchema),
  errorProfile: errorProfileSchema,
  existingKpis: z.array(existingKpiSchema),
  baselineMetrics: z.array(baselineMetricSchema),
  targetSuccessMetrics: z.array(targetSuccessMetricSchema),
  measurementGaps: z.array(measurementGapSchema),
})

// The baseline of an engagement where nothing quantitative has been captured
// yet. Used when resuming an engagement saved before this extension existed, so
// an older engagement resumes as "nothing captured", never as invalid state.
export const emptyValueMeasurementBaseline = (): ValueMeasurementBaseline => ({
  businessImpacts: [],
  errorProfile: {
    frequency: null,
    severity: { level: null, description: null },
    costPerOccurrence: null,
  },
  existingKpis: [],
  baselineMetrics: [],
  targetSuccessMetrics: [],
  measurementGaps: [],
})

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

  // What the situation costs today and what success would measurably look like
  // (Phase 2 Extension).
  valueMeasurementBaseline: valueMeasurementBaselineSchema,

  missingInformation: z.array(discoveryGapSchema),
})

export type DiscoveryProfile = z.infer<typeof discoveryProfileSchema>
export type DiscoveryGap = z.infer<typeof discoveryGapSchema>
export type DiscoveryGapCategory = z.infer<typeof discoveryGapCategorySchema>
export type ValueMeasurementBaseline = z.infer<
  typeof valueMeasurementBaselineSchema
>
export type DiscoveryFigure = z.infer<typeof discoveryFigureSchema>
export type MeasurementBasis = z.infer<typeof measurementBasisSchema>
export type DataSource = z.infer<typeof dataSourceSchema>
export type DataSourceKind = z.infer<typeof dataSourceKindSchema>
export type BusinessImpact = z.infer<typeof businessImpactSchema>
export type BusinessImpactCategory = z.infer<typeof businessImpactCategorySchema>
export type ErrorProfile = z.infer<typeof errorProfileSchema>
export type ExistingKpi = z.infer<typeof existingKpiSchema>
export type BaselineMetric = z.infer<typeof baselineMetricSchema>
export type TargetSuccessMetric = z.infer<typeof targetSuccessMetricSchema>
export type MeasurementGap = z.infer<typeof measurementGapSchema>
export type MeasurementGapSubject = z.infer<typeof measurementGapSubjectSchema>
export type MeasurementGapReason = z.infer<typeof measurementGapReasonSchema>
