import assert from "node:assert/strict"
import { test } from "node:test"

import type { AnalysisReport } from "../../../shared/analysis-report.schema.js"
import { parseAnalysisReport } from "./parse-analysis-report.js"

const validReport: AnalysisReport = {
  clientSummary: "Der Support verliert Zeit durch manuelle Triage.",
  detectedProblems: [
    {
      statedProblem: "Antworten dauern zu lange.",
      hiddenProblemHypothesis: "Eingänge werden nicht priorisiert.",
      confidence: "medium",
    },
  ],
  aiOpportunities: [
    {
      title: "Triage automatisieren",
      description: "Anfragen klassifizieren und weiterleiten.",
      businessValue: "Kürzere Reaktionszeiten.",
      complexity: "medium",
      impact: "high",
      recommendedApproach: "Automation",
    },
  ],
  recommendedSolution: {
    mainUseCase: "Support-Triage",
    approach: "LLM",
    reason: "Die Anfragen sind textlastig.",
    suggestedTools: ["Ticket-System"],
    architectureSummary: "Eingang lesen, Kategorie vorschlagen, Übergabe protokollieren.",
  },
  risks: [
    {
      title: "Fehlklassifizierung",
      severity: "medium",
      mitigation: "Menschliche Prüfung im Pilot.",
    },
  ],
  validationPlan: [
    {
      hypothesis: "Triage reduziert Wartezeit.",
      whatToCheck: ["Antwortzeit"],
      requiredData: ["Tickets"],
      dataSource: ["Ticket-System"],
      method: "ticket-analysis",
      description: "Vorher-nachher mit Stichprobe prüfen.",
      successCriteria: "Messbare Reduktion.",
      priority: "high",
    },
  ],
  followUpQuestions: ["Wie viele Tickets kommen monatlich an?"],
  mvpPlan: [
    {
      step: "Pilot",
      goal: "Kategorien validieren",
      estimatedEffort: "2 Wochen",
    },
  ],
}

test("parseAnalysisReport accepts the legacy Analyze payload", () => {
  const result = parseAnalysisReport(JSON.stringify(validReport))

  assert.equal(result.success, true)
  assert.ok(result.success && result.report.clientSummary === validReport.clientSummary)
})

test("parseAnalysisReport rejects a Phase 8 consultant report payload", () => {
  const result = parseAnalysisReport(
    JSON.stringify({
      title: "Consultant Report",
      executiveSummary: "Summary",
      followUpQuestions: [],
    }),
  )

  assert.equal(result.success, false)
  assert.equal(result.jsonParseSuccess, true)
  assert.equal(result.schemaValid, false)
})
