import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DISCOVERY_SECTION_FIELDS,
  applyContentProvenance,
  checkDiscoveryTransition,
  nextStatusAfterContentSave,
  unexplainedBaselineSubjects,
} from "./discovery.js"

import {
  emptyValueMeasurementBaseline,
  type DiscoveryFigure,
  type DiscoveryProfile,
} from "../../../../shared/discovery-profile.schema.js"
import {
  DISCOVERY_SECTIONS,
  emptyDiscoveryContentProvenance,
} from "../../../../shared/discovery-workflow.schema.js"

const emptyProfile: DiscoveryProfile = {
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

const measuredFigure: DiscoveryFigure = {
  value: "12 minutes average handling time",
  basis: "measured",
  measurementMethod: "Help desk report, monthly average",
  dataSource: { kind: "system", detail: "Zendesk" },
}

// --- content provenance ----------------------------------------------------

test("every Discovery Profile field belongs to exactly one section", () => {
  const mappedFields = DISCOVERY_SECTIONS.flatMap(
    (section) => DISCOVERY_SECTION_FIELDS[section],
  )

  assert.equal(
    new Set(mappedFields).size,
    mappedFields.length,
    "a field is attributed by two sections",
  )

  // Gaps carry their own category and state what nobody answered, so they are
  // deliberately unattributed.
  const contentFields = Object.keys(emptyProfile).filter(
    (field) => field !== "missingInformation",
  )

  assert.deepEqual(
    contentFields.filter((field) => !mappedFields.includes(field as never)),
    [],
    "a field would change without its section being attributed",
  )
})

test("content the client provided is attributed to the client", () => {
  const clientProfile: DiscoveryProfile = {
    ...emptyProfile,
    dataTypes: ["Tickets", "Call recordings"],
  }

  const provenance = applyContentProvenance(
    emptyProfile,
    clientProfile,
    emptyDiscoveryContentProvenance(),
    "client",
  )

  assert.equal(provenance.data, "client_provided")
  assert.equal(provenance.problems, null)
})

test("a consultant edit elsewhere never reattributes the client's content", () => {
  const clientProfile: DiscoveryProfile = {
    ...emptyProfile,
    dataTypes: ["Tickets"],
  }
  const afterClient = applyContentProvenance(
    emptyProfile,
    clientProfile,
    emptyDiscoveryContentProvenance(),
    "client",
  )

  const consultantProfile: DiscoveryProfile = {
    ...clientProfile,
    gdprConcerns: true,
  }
  const afterConsultant = applyContentProvenance(
    clientProfile,
    consultantProfile,
    afterClient,
    "consultant",
  )

  assert.equal(afterConsultant.data, "client_provided")
  assert.equal(afterConsultant.constraints, "consultant_captured")
})

test("re-saving the same facts changes no attribution", () => {
  const clientProfile: DiscoveryProfile = {
    ...emptyProfile,
    dataTypes: ["Tickets"],
  }
  const afterClient = applyContentProvenance(
    emptyProfile,
    clientProfile,
    emptyDiscoveryContentProvenance(),
    "client",
  )

  const afterConsultantResave = applyContentProvenance(
    clientProfile,
    { ...clientProfile, dataTypes: ["Tickets"] },
    afterClient,
    "consultant",
  )

  assert.equal(afterConsultantResave.data, "client_provided")
})

test("a change to the value & measurement baseline is attributed", () => {
  const withBaseline: DiscoveryProfile = {
    ...emptyProfile,
    valueMeasurementBaseline: {
      ...emptyValueMeasurementBaseline(),
      baselineMetrics: [
        { name: "First response time", current: measuredFigure, notes: null },
      ],
    },
  }

  const provenance = applyContentProvenance(
    emptyProfile,
    withBaseline,
    emptyDiscoveryContentProvenance(),
    "client",
  )

  assert.equal(provenance.value_measurement, "client_provided")
})

// --- where a content save leaves the workflow -------------------------------

test("client-provided content always returns discovery to draft for review", () => {
  assert.equal(nextStatusAfterContentSave("accepted", "client"), "draft")
  assert.equal(nextStatusAfterContentSave("submitted", "client"), "draft")
})

test("the consultant answering a return resumes work on a draft", () => {
  assert.equal(nextStatusAfterContentSave("returned", "consultant"), "draft")
})

test("a consultant edit does not move discovery out of review by itself", () => {
  assert.equal(nextStatusAfterContentSave("submitted", "consultant"), "submitted")
  assert.equal(nextStatusAfterContentSave("accepted", "consultant"), "accepted")
})

// --- review transitions -----------------------------------------------------

test("a client cannot accept their own submission", () => {
  assert.deepEqual(checkDiscoveryTransition("accept", "submitted", "client"), {
    allowed: false,
    refusal: "actor_not_permitted",
  })
})

test("returning and reopening are the consultant's authority", () => {
  assert.deepEqual(checkDiscoveryTransition("return", "submitted", "client"), {
    allowed: false,
    refusal: "actor_not_permitted",
  })
  assert.deepEqual(checkDiscoveryTransition("reopen", "accepted", "client"), {
    allowed: false,
    refusal: "actor_not_permitted",
  })
})

test("either contributor can submit a draft or a returned discovery", () => {
  assert.deepEqual(checkDiscoveryTransition("submit", "draft", "client"), {
    allowed: true,
    nextStatus: "submitted",
  })
  assert.deepEqual(
    checkDiscoveryTransition("submit", "returned", "consultant"),
    { allowed: true, nextStatus: "submitted" },
  )
})

test("discovery already under review cannot be submitted again", () => {
  assert.deepEqual(checkDiscoveryTransition("submit", "submitted", "client"), {
    allowed: false,
    refusal: "illegal_transition",
  })
})

test("only a submission can be accepted or returned", () => {
  assert.deepEqual(checkDiscoveryTransition("accept", "draft", "consultant"), {
    allowed: false,
    refusal: "illegal_transition",
  })
  assert.deepEqual(checkDiscoveryTransition("return", "accepted", "consultant"), {
    allowed: false,
    refusal: "illegal_transition",
  })
})

test("acceptance never ends the ability to revise discovery", () => {
  assert.deepEqual(
    checkDiscoveryTransition("reopen", "accepted", "consultant"),
    { allowed: true, nextStatus: "draft" },
  )
})

// --- the baseline's explicit gaps -------------------------------------------

test("an untouched baseline leaves every documented subject unexplained", () => {
  assert.deepEqual(unexplainedBaselineSubjects(emptyValueMeasurementBaseline()), [
    "business_impact",
    "error_frequency",
    "error_severity",
    "error_cost",
    "existing_kpis",
    "baseline_metrics",
    "target_success_metrics",
  ])
})

test("a recorded gap explains a baseline the client cannot answer", () => {
  const baseline = {
    ...emptyValueMeasurementBaseline(),
    measurementGaps: [
      {
        subject: "baseline_metrics" as const,
        reason: "not_measured" as const,
        description: "First response time is not tracked today.",
      },
    ],
  }

  assert.equal(
    unexplainedBaselineSubjects(baseline).includes("baseline_metrics"),
    false,
  )
})

test("a captured figure needs no gap to explain it", () => {
  const baseline = {
    ...emptyValueMeasurementBaseline(),
    baselineMetrics: [
      { name: "First response time", current: measuredFigure, notes: null },
    ],
  }

  assert.equal(
    unexplainedBaselineSubjects(baseline).includes("baseline_metrics"),
    false,
  )
})
