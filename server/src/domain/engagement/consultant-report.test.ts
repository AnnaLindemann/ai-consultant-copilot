import assert from "node:assert/strict"
import { test } from "node:test"

import {
  canEditReportVersionInPlace,
  canReplaceReportVersion,
  isReportVersionStale,
  renderReportPdf,
  reportSourceSnapshot,
  resolveGeneratedReport,
  resolveReportSubmission,
  type CitableFollowUpTemplate,
  type ReportSourceBundle,
} from "./consultant-report.js"

import type {
  ConsultantReportSubmission,
  GeneratedConsultantReportDraft,
  ReportSourceSnapshot,
} from "../../../../shared/consultant-report.schema.js"

const templates: CitableFollowUpTemplate = new Map([
  [
    "follow-up-missing-volume",
    {
      kind: "follow_up_template",
      title: "Missing volume",
      summary: "Ask for missing operating volume.",
      revision: 3,
      fingerprint: "template_fp_3",
    },
  ],
  [
    "risk-register",
    {
      kind: "risk_model",
      title: "Risk register",
      summary: "Not a follow-up template.",
    },
  ],
])

const sources = (): ReportSourceBundle =>
  ({
    discovery: {
      missingInformation: [
        {
          category: "process",
          description: "Confirm monthly ticket volume",
        },
      ],
      valueMeasurementBaseline: {
        measurementGaps: [
          {
            subject: "Median first response",
            description: "Confirm current first-response baseline",
          },
        ],
      },
    },
    assessment: {
      summary: "Assessment summary",
      dimensions: {},
      gaps: [
        {
          description: "Confirm escalation ownership",
        },
      ],
    },
    assessmentRevision: 2,
    opportunities: {
      id: "oppv_1",
      versionNumber: 1,
      prioritization: {
        summary: "Opportunity summary",
        opportunities: [
          {
            id: "opp_1",
            title: "Slow triage",
            problem: "Tickets wait for manual routing.",
            improvement: "Automate first-pass routing.",
            value: "high",
            effort: "medium",
            impact: "high",
            confidence: "medium",
            aiReadiness: {
              qualification: "ready",
              rationale: "Ticket categories are available.",
              blockers: [],
            },
            assumptions: [],
            priorityRank: 1,
            priorityRationale: "It is the largest delay.",
            sourceFindings: [
              {
                findingId: "finding_1",
                dimension: "process",
                findingTitle: "Manual routing",
              },
            ],
            successCriteria: [
              {
                metric: "First response time",
                measurementMethod: "Helpdesk report",
                dataSource: "Helpdesk",
                assumptions: [],
                baseline: { status: "unknown", validationNote: "Confirm baseline" },
                target: { status: "unknown", validationNote: "Confirm target" },
                timeframe: { status: "unknown", validationNote: "Confirm timeframe" },
              },
            ],
          },
        ],
        gaps: ["Confirm target SLA"],
      },
    },
    recommendations: {
      id: "recv_1",
      versionNumber: 1,
      recommendationSet: {
        summary: "Recommendation summary",
        recommendations: [
          {
            id: "rec_1",
            title: "Triage assistant",
            approach: "Classify tickets before routing.",
            rationale: "Matches the prioritized problem.",
            expectedValue: {
              summary: "Faster first response.",
              drivers: ["Lower waiting time"],
            },
            effort: { level: "medium", rationale: "Requires helpdesk integration." },
            assumptions: [],
            confidence: "medium",
            opportunity: {
              opportunityId: "opp_1",
              opportunityTitle: "Slow triage",
              priorityRank: 1,
              discoveryTrace: [],
            },
            knowledgeGrounding: [
              {
                code: "kb_1",
                kind: "ai_use_case",
                title: "Ticket triage",
                rationale: "Supports classification.",
              },
            ],
            technologyGrounding: [],
          },
        ],
        gaps: ["Confirm helpdesk integration access"],
      },
    },
    roadmap: {
      id: "roadv_1",
      versionNumber: 1,
      roadmap: {
        summary: "Roadmap summary",
        phases: [
          {
            id: "phase_1",
            sequenceOrder: 1,
            title: "Pilot",
            objective: "Validate routing quality.",
            scope: ["Support routing"],
            expectedOutcome: "Known routing precision.",
            linkedRecommendationIds: ["rec_1"],
            dependencyPhaseIds: [],
            explicitPrerequisites: [],
            readinessConsiderations: [],
            risks: [],
            assumptions: [],
            effort: { level: "medium", rationale: "Small pilot." },
            sequencingRationale: "Start with the narrowest path.",
            implementationPatternGrounding: [],
          },
        ],
        recommendationDispositions: [
          { recommendationId: "rec_1", disposition: "included" },
        ],
        assumptions: [],
        gaps: ["Confirm pilot owner"],
      },
    },
  }) as unknown as ReportSourceBundle

const draft = (): GeneratedConsultantReportDraft => ({
  title: "Consultant Report",
  executiveSummary: "Focus on support response time.",
  engagementContext: {
    organizationName: "Example GmbH",
    engagementTitle: "Support automation",
    department: "Operations",
    statedProblem: "Slow replies",
    desiredOutcome: "Faster support",
    businessImpact: "Churn risk",
  },
  assessmentSummary: "The team is ready for a bounded pilot.",
  prioritizedProblems: [
    {
      opportunityId: "opp_1",
      title: "Slow triage",
      problem: "Tickets wait for manual routing.",
      priorityRank: 1,
      rationale: "It is the largest delay.",
    },
  ],
  recommendations: [
    {
      recommendationId: "rec_1",
      title: "Triage assistant",
      approach: "Classify tickets before routing.",
      rationale: "Matches the prioritized problem.",
      expectedValue: "Faster first response.",
      effort: { level: "medium", rationale: "Requires helpdesk integration." },
      confidence: "medium",
    },
  ],
  deferredRecommendations: [],
  roadmapSummary: "Pilot before expanding.",
  roadmapPhases: [
    {
      phaseId: "phase_1",
      sequenceOrder: 1,
      title: "Pilot",
      objective: "Validate routing quality.",
      expectedOutcome: "Known routing precision.",
    },
  ],
  assumptions: ["Helpdesk export is available."],
  risks: ["Routing errors need review."],
  nextSteps: ["Confirm pilot owner."],
  followUpQuestions: [
    {
      question: "How many tickets arrive per month?",
      sourceType: "discovery_gap",
      sourceDescription: "Confirm monthly ticket volume",
      templateCode: "follow-up-missing-volume",
      rationale: "Volume sizes the pilot.",
      status: "draft",
    },
  ],
})

test("generated reports get trusted identities, template titles and source snapshots", () => {
  const resolution = resolveGeneratedReport(
    draft(),
    sources(),
    templates,
    () => "question_1",
  )

  assert.equal(resolution.resolved, true)
  if (!resolution.resolved || !resolution.report) return

  assert.equal(resolution.report.followUpQuestions[0].id, "question_1")
  assert.equal(
    resolution.report.followUpQuestions[0].templateTitle,
    "Missing volume",
  )
  assert.equal(resolution.report.followUpQuestions[0].templateVersion, 3)
  assert.equal(
    resolution.report.followUpQuestions[0].templateFingerprint,
    "template_fp_3",
  )
  assert.deepEqual(
    resolution.report.sourceSnapshot,
    reportSourceSnapshot(sources(), templates),
  )
})

test("follow-up template revision changes make report source snapshots stale", () => {
  const firstTemplates: CitableFollowUpTemplate = new Map([
    [
      "follow-up-missing-volume",
      {
        kind: "follow_up_template",
        title: "Missing volume",
        summary: "Ask for missing operating volume.",
        revision: 1,
        fingerprint: "template_fp_1",
      },
    ],
  ])
  const secondTemplates: CitableFollowUpTemplate = new Map([
    [
      "follow-up-missing-volume",
      {
        kind: "follow_up_template",
        title: "Missing volume",
        summary: "Ask for missing operating volume.",
        revision: 2,
        fingerprint: "template_fp_2",
      },
    ],
  ])

  const first = reportSourceSnapshot(sources(), firstTemplates)
  const second = reportSourceSnapshot(sources(), secondTemplates)

  assert.equal(first.followUpTemplates[0].version, 1)
  assert.equal(second.followUpTemplates[0].version, 2)
  assert.notEqual(first.fingerprint, second.fingerprint)
  assert.equal(isReportVersionStale(first, second), true)
})

test("follow-up questions must cite persisted gaps and valid follow-up templates", () => {
  const invalid = draft()
  invalid.followUpQuestions = [
    {
      ...invalid.followUpQuestions[0],
      sourceDescription: "Invented gap",
      templateCode: "risk-register",
    },
  ]

  const resolution = resolveGeneratedReport(
    invalid,
    sources(),
    templates,
    () => "question_1",
  )

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return

  assert.deepEqual(resolution.ungroundedQuestions, [
    "How many tickets arrive per month?",
  ])
  assert.deepEqual(resolution.nonTemplateCodes, ["risk-register"])
})

test("follow-up questions reject unknown follow-up templates", () => {
  const invalid = draft()
  invalid.followUpQuestions = [
    {
      ...invalid.followUpQuestions[0],
      templateCode: "follow-up-invented",
    },
  ]

  const resolution = resolveGeneratedReport(
    invalid,
    sources(),
    templates,
    () => "question_1",
  )

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.unknownTemplateCodes, ["follow-up-invented"])
})

test("report validation rejects invented recommendation identities", () => {
  const invalid = draft()
  invalid.recommendations = [
    {
      ...invalid.recommendations[0],
      recommendationId: "rec_invented",
    },
  ]

  const resolution = resolveGeneratedReport(
    invalid,
    sources(),
    templates,
    () => "question_1",
  )

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.invalidSourceReferences, ["recommendation:rec_invented"])
})

test("report validation rejects invented technology identities in client-facing text", () => {
  const invalid = draft()
  invalid.recommendations = [
    {
      ...invalid.recommendations[0],
      approach: "Adopt technology tech_invented for routing.",
    },
  ]

  const resolution = resolveGeneratedReport(
    invalid,
    sources(),
    templates,
    () => "question_1",
  )

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.invalidSourceReferences, [
    "unsupported_claim:recommendations.0.approach",
  ])
})

test("report validation rejects invented ROI, budget, date, staffing and metric claims", () => {
  const invalid = draft()
  invalid.executiveSummary = "The pilot delivers 42% ROI."
  invalid.assessmentSummary = "The available budget is EUR 50,000."
  invalid.roadmapSummary = "Launch in Q3 2027."
  invalid.recommendations = [
    {
      ...invalid.recommendations[0],
      expectedValue: "Save 120 tickets per month.",
    },
  ]
  invalid.roadmapPhases = [
    {
      ...invalid.roadmapPhases[0],
      objective: "Run with 3 FTE.",
    },
  ]

  const resolution = resolveGeneratedReport(
    invalid,
    sources(),
    templates,
    () => "question_1",
  )

  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.invalidSourceReferences, [
    "unsupported_claim:executiveSummary",
    "unsupported_claim:assessmentSummary",
    "unsupported_claim:roadmapSummary",
    "unsupported_claim:recommendations.0.expectedValue",
    "unsupported_claim:roadmapPhases.0.objective",
  ])
})

test("report validation allows quantitative expected value only from the same accepted Recommendation", () => {
  const groundedSources = sources()
  groundedSources.recommendations.recommendationSet.recommendations[0].expectedValue = {
    summary: "Reduziert 42 % der manuellen Rückfragen und spart 50.000 € pro Jahr.",
    drivers: ["120 Tickets pro Monat werden automatisiert vorbereitet."],
  }

  const valid = draft()
  valid.recommendations[0].expectedValue =
    "Reduziert 42 % der manuellen Rückfragen und spart 50.000 € pro Jahr."
  let resolution = resolveGeneratedReport(
    valid,
    groundedSources,
    templates,
    () => "question_1",
  )
  assert.equal(resolution.resolved, true)

  const altered = draft()
  altered.recommendations[0].expectedValue = "Reduziert 43 % der manuellen Rückfragen."
  resolution = resolveGeneratedReport(
    altered,
    groundedSources,
    templates,
    () => "question_1",
  )
  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.invalidSourceReferences, [
    "unsupported_claim:recommendations.0.expectedValue",
  ])

  const unrelatedSource = sources()
  unrelatedSource.recommendations.recommendationSet.recommendations.push({
    ...groundedSources.recommendations.recommendationSet.recommendations[0],
    id: "rec_2",
    expectedValue: {
      summary: "Reduziert 42 % der manuellen Rückfragen.",
      drivers: [],
    },
  })
  const unrelated = draft()
  unrelated.recommendations[0].expectedValue = "Reduziert 42 % der manuellen Rückfragen."
  resolution = resolveGeneratedReport(
    unrelated,
    unrelatedSource,
    templates,
    () => "question_1",
  )
  assert.equal(resolution.resolved, false)
  if (resolution.resolved) return
  assert.deepEqual(resolution.invalidSourceReferences, [
    "unsupported_claim:recommendations.0.expectedValue",
  ])
})

test("consultant submissions preserve supplied follow-up identities", () => {
  const submission: ConsultantReportSubmission = {
    ...draft(),
    followUpQuestions: [
      {
        id: "question_existing",
        ...draft().followUpQuestions[0],
      },
    ],
  }

  const resolution = resolveReportSubmission(
    submission,
    sources(),
    templates,
    () => "question_new",
  )

  assert.equal(resolution.resolved, true)
  if (!resolution.resolved || !resolution.report) return
  assert.equal(resolution.report.followUpQuestions[0].id, "question_existing")
})

test("approved versions are immutable and source snapshots detect staleness", () => {
  assert.equal(canEditReportVersionInPlace("approved"), false)
  assert.equal(canReplaceReportVersion("manager_review", false), false)
  assert.equal(canReplaceReportVersion("manager_review", true), true)

  const previous: ReportSourceSnapshot = reportSourceSnapshot(sources())
  const changed = sources()
  changed.roadmap.versionNumber = 2

  assert.equal(isReportVersionStale(previous, reportSourceSnapshot(changed)), true)
})

test("pdf rendering is bound to the exact report content", () => {
  const resolution = resolveGeneratedReport(
    draft(),
    sources(),
    templates,
    () => "question_1",
  )
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved || !resolution.report) return

  const pdf = renderReportPdf(resolution.report)

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-")
  assert.ok(pdf.toString("latin1").includes("Consultant Report"))
})

test("pdf rendering preserves German characters in the PDF text stream", () => {
  const generated = draft()
  generated.title = "Report für Rückfragen"
  generated.executiveSummary =
    "Prüfung für größere Rückfragen mit Maßnahme: ä ö ü Ä Ö Ü ß € „ “ ‚ ‘ – — …"
  const resolution = resolveGeneratedReport(
    generated,
    sources(),
    templates,
    () => "question_1",
  )
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved || !resolution.report) return

  const pdf = renderReportPdf(resolution.report)
  const text = pdf.toString("latin1")

  assert.ok(text.includes("Report für Rückfragen"))
  assert.ok(text.includes("größere Rückfragen"))
  for (const byte of [128, 130, 132, 133, 145, 147, 150, 151]) {
    assert.ok(pdf.includes(Buffer.from([byte])), `missing WinAnsi byte ${byte}`)
  }
  assert.equal(text.includes("€"), false)
  assert.equal(text.includes("CreationDate"), false)
})

test("pdf rendering emits German client-facing headings with WinAnsi characters", () => {
  const resolution = resolveGeneratedReport(
    draft(),
    sources(),
    templates,
    () => "question_1",
  )
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved || !resolution.report) return

  const text = renderReportPdf(resolution.report).toString("latin1")

  assert.ok(text.includes("Nächste Schritte"))
  assert.ok(text.includes("Zurückgestellte Empfehlungen"))
  assert.ok(text.includes("Geschäftliche Wirkung"))
  assert.ok(text.includes("Begründung"))
  assert.equal(text.includes("Naechste Schritte"), false)
  assert.equal(text.includes("Zurueckgestellte Empfehlungen"), false)
  assert.equal(text.includes("Geschaeftliche Wirkung"), false)
  assert.equal(text.includes("Begruendung"), false)
})

test("pdf rendering wraps long content across deterministic pages", () => {
  const resolution = resolveGeneratedReport(
    draft(),
    sources(),
    templates,
    () => "question_1",
  )
  assert.equal(resolution.resolved, true)
  if (!resolution.resolved || !resolution.report) return

  const finalLine = "Final deterministic client step"
  resolution.report.nextSteps = [
    ...Array.from({ length: 120 }, (_value, index) =>
      `Long client-facing next step ${index + 1} with enough words to require deterministic wrapping in the PDF renderer.`,
    ),
    finalLine,
  ]
  const pdf = renderReportPdf(resolution.report).toString("latin1")

  assert.ok((pdf.match(/\/Type \/Page /g) ?? []).length > 1)
  assert.ok(pdf.includes(finalLine))
  assert.equal(pdf.includes("CreationDate"), false)
})
