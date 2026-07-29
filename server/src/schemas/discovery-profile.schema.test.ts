import assert from "node:assert/strict"
import { test } from "node:test"

import {
  discoveryProfileSchema,
  emptyValueMeasurementBaseline,
  type DiscoveryFigure,
} from "../../../shared/discovery-profile.schema.js"

const measuredFigure: DiscoveryFigure = {
  value: "12 minutes average handling time",
  basis: "measured",
  measurementMethod: "Help desk report, monthly average",
  dataSource: { kind: "system", detail: "Zendesk" },
}

const completeEmptyProfile = {
  department: null,
  statedProblem: null,
  painPoints: [],
  affectedUsers: [],
  businessImpact: null,
  urgency: null,
  currentProcess: null,
  processSteps: [],
  processFrequency: null,
  manualWorkLevel: null,
  bottlenecks: [],
  currentTools: [],
  communicationChannels: [],
  integrationNeeds: [],
  dataTypes: [],
  dataLocation: [],
  dataAvailability: null,
  dataQuality: null,
  sensitiveData: null,
  sensitiveDataTypes: [],
  gdprConcerns: null,
  budgetAmount: null,
  budgetCurrency: null,
  budgetNotes: null,
  timeline: null,
  humanApprovalRequired: null,
  technicalConstraints: [],
  desiredOutcome: null,
  successMetrics: [],
  mvpScope: null,
  notes: null,
  valueMeasurementBaseline: emptyValueMeasurementBaseline(),
  missingInformation: [],
}

const withBaseline = (
  baseline: Partial<ReturnType<typeof emptyValueMeasurementBaseline>>,
) => ({
  ...completeEmptyProfile,
  valueMeasurementBaseline: {
    ...emptyValueMeasurementBaseline(),
    ...baseline,
  },
})

test("Discovery Profile accepts known facts and explicit gaps", () => {
  const result = discoveryProfileSchema.safeParse({
    ...completeEmptyProfile,
    department: "Customer Support",
    communicationChannels: ["Email", "Live chat"],
    statedProblem: "Response times are inconsistent.",
    missingInformation: [
      { category: "data", description: "Confirm ticket export access." },
    ],
  })

  assert.equal(result.success, true)
})

test("Discovery Profile accepts a cleared profile for re-entry", () => {
  assert.equal(discoveryProfileSchema.safeParse(completeEmptyProfile).success, true)
})

test("Discovery Profile rejects blank gap descriptions", () => {
  const result = discoveryProfileSchema.safeParse({
    ...completeEmptyProfile,
    missingInformation: [{ category: "goals", description: "   " }],
  })

  assert.equal(result.success, false)
})

test("Discovery Profile rejects unknown gap categories", () => {
  const result = discoveryProfileSchema.safeParse({
    ...completeEmptyProfile,
    missingInformation: [{ category: "assessment", description: "Unknown" }],
  })

  assert.equal(result.success, false)
})

test("the value & measurement baseline accepts measured and estimated figures", () => {
  const result = discoveryProfileSchema.safeParse(
    withBaseline({
      businessImpacts: [
        {
          category: "lost_time",
          description: "Agents re-key every booking change by hand.",
          figure: {
            value: "Roughly 6 hours per week",
            basis: "estimated",
            measurementMethod: null,
            dataSource: { kind: "interview", detail: "Team lead" },
          },
        },
      ],
      baselineMetrics: [
        { name: "First response time", current: measuredFigure, notes: null },
      ],
      targetSuccessMetrics: [
        {
          name: "First response time",
          target: {
            value: "Under 4 minutes",
            basis: "estimated",
            measurementMethod: "Same help desk report as the baseline",
            dataSource: { kind: "estimate", detail: null },
          },
          notes: null,
        },
      ],
    }),
  )

  assert.equal(result.success, true)
})

test("a measured figure must say how it is measured", () => {
  const result = discoveryProfileSchema.safeParse(
    withBaseline({
      baselineMetrics: [
        {
          name: "First response time",
          current: { ...measuredFigure, measurementMethod: null },
          notes: null,
        },
      ],
    }),
  )

  assert.equal(result.success, false)
})

test("a figure sourced from an estimate is never recorded as measured", () => {
  const result = discoveryProfileSchema.safeParse(
    withBaseline({
      baselineMetrics: [
        {
          name: "Tickets per week",
          current: {
            value: "About 900",
            basis: "measured",
            measurementMethod: "The operations lead's recollection",
            dataSource: { kind: "estimate", detail: null },
          },
          notes: null,
        },
      ],
    }),
  )

  assert.equal(result.success, false)
})

test("missing measurement information is recorded as a gap with its reason", () => {
  const result = discoveryProfileSchema.safeParse(
    withBaseline({
      measurementGaps: [
        {
          subject: "existing_kpis",
          reason: "not_measured",
          description: "The client tracks no KPI for this queue today.",
        },
        { subject: "error_cost", reason: "unknown", description: null },
      ],
    }),
  )

  assert.equal(result.success, true)
})

test("a measurement gap must state a known reason", () => {
  const result = discoveryProfileSchema.safeParse(
    withBaseline({
      measurementGaps: [
        {
          subject: "existing_kpis",
          reason: "did_not_ask",
          description: null,
        },
      ] as never,
    }),
  )

  assert.equal(result.success, false)
})

test("an engagement with nothing quantitative captured is still a valid profile", () => {
  assert.equal(
    discoveryProfileSchema.safeParse(withBaseline({})).success,
    true,
  )
})
