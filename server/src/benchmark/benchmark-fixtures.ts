import { emptyValueMeasurementBaseline } from "../../../shared/discovery-profile.schema.js"

import type { Assessment } from "../../../shared/assessment.schema.js"
import type { DiscoveryProfile } from "../../../shared/discovery-profile.schema.js"
import type { OpportunityPrioritization } from "../../../shared/opportunity.schema.js"
import type { RecommendationSet } from "../../../shared/recommendation.schema.js"
import type { Roadmap } from "../../../shared/implementation-roadmap.schema.js"

// The synthetic engagement the benchmark runs against.
//
// **There is no real personal data here, and there is no real client here.**
// "Nordwind Kundenservice GmbH" does not exist; every name, figure, and process
// description below was written for this file. That is not a formality: the
// benchmark sends these payloads to an external AI provider, and a fixture
// carrying a real contact, a real customer number, or a real client's process
// description would be a disclosure to a processor nobody consented to
// (roadmap Phase 10; agent-rules.md §14).
//
// It is deliberately *representative* rather than minimal. A benchmark run
// against a two-line discovery profile measures nothing useful about a stage
// whose real prompts carry a full Discovery Profile, an Assessment across six
// dimensions, and a curated knowledge package: the token counts would be wrong,
// the latency would be wrong, and the model would never be asked to hold enough
// context to fail the way it fails in practice.
//
// It is also entirely in German, because German output quality is one of the
// things the benchmark is for.
//
// **One wording constraint, and it is worth knowing why.** The fixture avoids
// German compounds beginning "Auftrags…" — "Auftragsklärung",
// "Auftragsverarbeitung". The built-in contract-identifier rule in
// `domain/compliance/pii.ts` matches `Auftrag(s)` followed by an alphanumeric
// run, case-insensitively, so those ordinary words are read as a customer
// reference and redacted. That is a known limitation of shape-based redaction
// rather than a defect here, and the benchmark bypasses the compliance gate
// anyway — but a fixture that tripped it would make the "no personal data
// leaves for the provider" check in the tests unreadable, and the check is
// worth more than the word.

export const BENCHMARK_ORGANIZATION = {
  name: "Nordwind Kundenservice GmbH",
  industry: "Handel",
  companySize: "medium",
  geography: "DE",
} as const

export const BENCHMARK_ENGAGEMENT = {
  title: "Entlastung der Anfragenklärung im Kundenservice",
  department: "Kundenservice",
} as const

export const benchmarkDiscoveryProfile = (): DiscoveryProfile => ({
  department: "Kundenservice",

  statedProblem:
    "Anfragen zu Lieferterminen und Reklamationen erreichen den Kundenservice über vier Kanäle und werden vollständig manuell vorsortiert. Die Sortierung bindet nach Einschätzung der Teamleitung täglich mehrere Stunden.",
  painPoints: [
    "Die morgendliche Sichtung verzögert den Beginn der Fachbearbeitung",
    "Rückfragen an das Lager werden telefonisch geklärt und nur als Freitext vermerkt",
  ],
  affectedUsers: ["Kundenservice-Team", "Teamleitung Kundenservice"],
  businessImpact:
    "Verzögerte Erstreaktion führt zu Nachfassanfragen, die den Kanal zusätzlich belasten.",
  urgency: "medium",

  currentProcess:
    "Eingehende Nachrichten werden morgens gesichtet, per Hand einer von neun Kategorien zugeordnet und anschließend an die zuständige Gruppe weitergeleitet. Rückfragen an das Lager erfolgen telefonisch und werden im Ticket als Freitext vermerkt.",
  processSteps: [
    "Nachrichten sichten",
    "Kategorie von Hand zuordnen",
    "An die zuständige Gruppe weiterleiten",
    "Bei Unklarheit im Lager telefonisch nachfragen",
  ],
  processFrequency: "many_times_per_day",
  manualWorkLevel: "high",
  bottlenecks: [
    "Die Zuordnung erfolgt gebündelt am Morgen und staut sich bei hohem Aufkommen",
  ],

  currentTools: ["Ticketsystem", "Gemeinsames Postfach", "Warenwirtschaft"],
  communicationChannels: ["E-Mail", "Kontaktformular", "Telefon", "Chat"],
  integrationNeeds: ["Ticketsystem", "Warenwirtschaft (Lieferstatus)"],

  dataTypes: [
    "Freitext der Kundenanfrage",
    "Kategorie",
    "Zeitstempel",
    "Bestellbezug",
  ],
  dataLocation: ["Ticketsystem", "Warenwirtschaft"],
  dataAvailability: "restricted",
  dataQuality: "unknown",
  sensitiveData: true,
  sensitiveDataTypes: ["Kundenname", "Lieferanschrift", "Bestellnummer"],

  gdprConcerns: true,
  budgetAmount: null,
  budgetCurrency: null,
  budgetNotes: "Budget noch nicht freigegeben; Entscheidung nach dem Piloten.",
  timeline: "this_year",
  humanApprovalRequired: true,
  technicalConstraints: [
    "Das Ticketsystem stellt eine dokumentierte REST-Schnittstelle bereit",
    "Ein Export historischer Tickets ist grundsätzlich möglich, Umfang bisher ungeklärt",
    "Personenbezogene Kundendaten dürfen den EU-Raum nicht verlassen",
  ],

  desiredOutcome:
    "Die Vorsortierung soll weitgehend automatisch erfolgen, damit das Team die gewonnene Zeit für komplexe Reklamationen einsetzen kann. Eine fachliche Prüfung soll erhalten bleiben.",
  successMetrics: [
    "Anteil der Anfragen mit korrekt vorgeschlagener Kategorie",
    "Zeit bis zur Erstreaktion",
  ],
  mvpScope:
    "Eine Gruppe, ein Kanal, Vorschlagskategorie mit verpflichtender Bestätigung.",
  notes:
    "Der Betriebsrat ist informiert und noch nicht formal beteiligt.",

  missingInformation: [
    {
      category: "data",
      description: "Tatsächliches Ticketvolumen je Kanal und Monat",
    },
    {
      category: "problems",
      description:
        "Anteil der Anfragen, der bereits heute eindeutig kategorisierbar ist",
    },
    {
      category: "data",
      description:
        "Qualität der historischen Kategorisierung als Bewertungsgrundlage",
    },
  ],

  valueMeasurementBaseline: emptyValueMeasurementBaseline(),
})

export const benchmarkAssessment = (): Assessment => ({
  summary:
    "Die Vorsortierung eingehender Anfragen ist klar abgegrenzt und technisch anbindbar; belastbar wird eine Bewertung erst, wenn die Qualität der historischen Kategorisierung geprüft ist.",
  dimensions: {
    businessProcess: {
      summary:
        "Die Vorsortierung ist ein klar abgegrenzter, wiederkehrender Schritt mit dokumentiertem Kategorienschema.",
      findings: [
        {
          id: "finding_bp_1",
          title: "Manuelle Vorsortierung als Engpass",
          detail:
            "Alle eingehenden Anfragen durchlaufen eine manuelle Zuordnung zu neun Kategorien, bevor die Fachbearbeitung beginnt.",
          basis: "discovery_fact",
          assumptions: [],
          confidence: "high",
          supportingFacts: [
            "Eingehende Nachrichten werden morgens gesichtet und per Hand einer von neun Kategorien zugeordnet",
          ],
        },
      ],
    },
    data: {
      summary:
        "Historische Tickets liegen vor; ihre Eignung als Bewertungsgrundlage ist ungeprüft.",
      findings: [
        {
          id: "finding_data_1",
          title: "Historische Kategorisierung ungeprüft",
          detail:
            "Ein Export ist möglich, die Qualität der bestehenden Kategorien wurde jedoch nie bewertet.",
          basis: "assumption",
          assumptions: [
            "Der Export bildet den vollständigen Zeitraum ab",
          ],
          confidence: "low",
          supportingFacts: [
            "Ein Export historischer Tickets ist grundsätzlich möglich, Umfang bisher ungeklärt",
          ],
        },
      ],
    },
    technology: {
      summary: "Das Ticketsystem bietet eine dokumentierte Schnittstelle.",
      findings: [
        {
          id: "finding_tech_1",
          title: "Anbindung technisch vorbereitet",
          detail:
            "Eine dokumentierte REST-Schnittstelle erlaubt das Lesen und Schreiben von Tickets ohne Systemwechsel.",
          basis: "discovery_fact",
          assumptions: [],
          confidence: "high",
          supportingFacts: [
            "Das Ticketsystem stellt eine dokumentierte REST-Schnittstelle bereit",
          ],
        },
      ],
    },
    aiReadiness: {
      summary:
        "Fachliche Voraussetzungen sind gegeben; Datengrundlage und Beteiligung des Betriebsrats stehen aus.",
      findings: [
        {
          id: "finding_ready_1",
          title: "Datengrundlage noch nicht belastbar",
          detail:
            "Ohne geprüfte historische Kategorisierung lässt sich die erreichbare Trefferquote nicht abschätzen.",
          basis: "assumption",
          assumptions: [
            "Die neun Kategorien wurden über den Zeitraum konsistent verwendet",
          ],
          confidence: "medium",
          supportingFacts: [
            "Qualität der historischen Kategorisierung als Trainings- oder Bewertungsgrundlage",
          ],
        },
      ],
    },
    risks: {
      summary: "Datenschutz und Mitbestimmung sind vor einem Piloten zu klären.",
      findings: [
        {
          id: "finding_risk_1",
          title: "Personenbezug in Freitextfeldern",
          detail:
            "Freitextfelder enthalten Kundenangaben; die Verarbeitung ist auf den EU-Raum beschränkt.",
          basis: "discovery_fact",
          assumptions: [],
          confidence: "high",
          supportingFacts: [
            "Personenbezogene Kundendaten dürfen den EU-Raum nicht verlassen",
          ],
        },
      ],
    },
    opportunities: {
      summary: "Die Vorsortierung ist der naheliegende erste Ansatzpunkt.",
      findings: [
        {
          id: "finding_opp_1",
          title: "Automatisierte Vorsortierung mit fachlicher Prüfung",
          detail:
            "Eine Vorschlagskategorie je Anfrage, die das Team bestätigt oder korrigiert, erhält die fachliche Kontrolle.",
          basis: "discovery_fact",
          assumptions: [],
          confidence: "medium",
          supportingFacts: [
            "Die Vorsortierung soll weitgehend automatisch erfolgen, eine fachliche Prüfung soll erhalten bleiben",
          ],
        },
      ],
    },
  },
  gaps: [
    {
      dimension: "data",
      description:
        "Ticketvolumen je Kanal und Monat ist nicht bekannt und wurde als offene Information erfasst.",
    },
  ],
})

export const benchmarkOpportunities = (): OpportunityPrioritization => ({
  summary:
    "Eine Opportunity, priorisiert: die vorschlagsbasierte Kategorisierung eingehender Anfragen.",
  opportunities: [
    {
      id: "opp_benchmark_1",
      priorityRank: 1,
      priorityRationale:
        "Der Schritt ist der einzige, der jede eingehende Anfrage betrifft, und er ist ohne Systemwechsel adressierbar.",
      title: "Vorschlagsbasierte Kategorisierung eingehender Anfragen",
      problem:
        "Die manuelle Vorsortierung bindet täglich mehrere Stunden vor Beginn der Fachbearbeitung.",
      improvement:
        "Jede eingehende Anfrage erhält eine vorgeschlagene Kategorie, die das Team bestätigt oder korrigiert.",
      value: "high",
      effort: "medium",
      impact: "high",
      confidence: "medium",
      aiReadiness: {
        qualification: "conditional",
        rationale:
          "Fachlich und technisch vorbereitet, aber ohne geprüfte Datengrundlage nicht bewertbar.",
        blockers: [
          "Die Qualität der historischen Kategorisierung ist ungeprüft, sodass die erreichbare Trefferquote unbekannt bleibt",
        ],
      },
      assumptions: [
        "Die neun Kategorien bleiben fachlich unverändert",
      ],
      sourceFindings: [
        {
          findingId: "finding_bp_1",
          dimension: "businessProcess",
          findingTitle: "Manuelle Vorsortierung als Engpass",
        },
        {
          findingId: "finding_opp_1",
          dimension: "opportunities",
          findingTitle: "Automatisierte Vorsortierung mit fachlicher Prüfung",
        },
      ],
      successCriteria: [
        {
          metric: "Anteil der Anfragen mit bestätigter Vorschlagskategorie",
          measurementMethod:
            "Auswertung der Bestätigungen und Korrekturen im Ticketsystem über einen definierten Zeitraum",
          dataSource: "Ticketsystem",
          assumptions: [
            "Bestätigung und Korrektur werden als unterscheidbare Ereignisse erfasst",
          ],
          // Figures are the client's, never the AI's. The benchmark fixture
          // keeps them explicitly unknown, exactly as a generated draft must.
          baseline: {
            status: "unknown",
            validationNote: "Es liegt keine Messung der heutigen Zuordnungsqualität vor.",
          },
          target: {
            status: "unknown",
            validationNote: "Wird nach Prüfung der Datengrundlage mit dem Kunden festgelegt.",
          },
          timeframe: {
            status: "unknown",
            validationNote: "Abhängig vom Start des begleiteten Piloten.",
          },
        },
      ],
    },
  ],
  gaps: [
    "Ticketvolumen je Kanal und Monat ist nicht bekannt.",
  ],
})

export const benchmarkDiscoveryTrace = (): Record<
  string,
  { findingTitle: string; supportingFacts: string[] }[]
> => ({
  opp_benchmark_1: [
    {
      findingTitle: "Manuelle Vorsortierung als Engpass",
      supportingFacts: [
        "Eingehende Nachrichten werden morgens gesichtet und per Hand einer von neun Kategorien zugeordnet",
      ],
    },
    {
      findingTitle: "Automatisierte Vorsortierung mit fachlicher Prüfung",
      supportingFacts: [
        "Die Vorsortierung soll weitgehend automatisch erfolgen, eine fachliche Prüfung soll erhalten bleiben",
      ],
    },
  ],
})

// A recommendation set for the roadmap and report stages. Its grounding codes
// are filled in by the runner from the *actually retrieved* packages, so the
// fixture never claims a citation the retrieval did not supply.
export const benchmarkRecommendations = (grounding: {
  knowledgeEntryCodes: readonly { code: string; kind: string; title: string }[]
  technologyProfileCodes: readonly {
    code: string
    categoryCode: string
    title: string
  }[]
}): RecommendationSet => ({
  summary:
    "Eine Empfehlung, gegründet auf den abgerufenen kuratierten Einträgen und Technologieprofilen.",
  recommendations: [
    {
      id: "rec_benchmark_1",
      opportunity: {
        opportunityId: "opp_benchmark_1",
        opportunityTitle:
          "Vorschlagsbasierte Kategorisierung eingehender Anfragen",
        priorityRank: 1,
        discoveryTrace: [
          {
            findingId: "finding_bp_1",
            dimension: "businessProcess",
            findingTitle: "Manuelle Vorsortierung als Engpass",
            supportingFacts: [
              "Eingehende Nachrichten werden morgens gesichtet und per Hand einer von neun Kategorien zugeordnet",
            ],
          },
        ],
      },
      title: "Vorschlagskategorie mit menschlicher Bestätigung einführen",
      approach:
        "Eingehende Anfragen werden über die bestehende Schnittstelle gelesen, erhalten eine vorgeschlagene Kategorie und werden dem Team zur Bestätigung angezeigt. Die Bestätigung bleibt verpflichtend.",
      rationale:
        "Der Schritt ist klar abgegrenzt, wiederkehrend und bereits heute nach einem festen Kategorienschema organisiert, sodass eine Vorschlagsfunktion die fachliche Entscheidung unterstützt, ohne sie zu ersetzen.",
      expectedValue: {
        summary:
          "Spürbare Entlastung der morgendlichen Sichtung bei unveränderter fachlicher Verantwortung.",
        drivers: [
          "Wegfall der vollständigen Handzuordnung für eindeutige Anfragen",
          "Frühere Weiterleitung an die zuständige Gruppe",
        ],
      },
      effort: {
        level: "medium",
        rationale:
          "Anbindung an eine dokumentierte Schnittstelle und eine Prüfoberfläche, ohne Systemwechsel.",
      },
      assumptions: [
        "Die historische Kategorisierung ist ausreichend konsistent, um als Bewertungsgrundlage zu dienen",
        "Der Betriebsrat wird vor einem Piloten beteiligt",
      ],
      confidence: "medium",
      // Filled in by the runner from the *actually retrieved* packages, so the
      // fixture never claims a citation the retrieval did not supply.
      knowledgeGrounding: grounding.knowledgeEntryCodes.map((entry) => ({
        code: entry.code,
        kind: entry.kind as never,
        title: entry.title,
        rationale:
          "Der Ansatz folgt dem in diesem Eintrag beschriebenen Vorgehen für unterstützte Entscheidungen mit menschlicher Freigabe.",
      })),
      technologyGrounding: grounding.technologyProfileCodes.map((profile) => ({
        code: profile.code,
        categoryCode: profile.categoryCode,
        title: profile.title,
        fitRationale:
          "Eignet sich für die Klassifikation freitextlicher Kundenanfragen bei verbleibender fachlicher Prüfung.",
      })),
    },
  ],
  gaps: [
    "Ohne geprüfte Datengrundlage lässt sich die erreichbare Trefferquote nicht beziffern.",
  ],
})

export const benchmarkRoadmap = (): Roadmap => ({
  summary:
    "Zwei Phasen: zuerst die Datengrundlage belastbar machen, danach einen begleiteten Piloten in einer Gruppe.",
  phases: [
    {
      id: "phase_benchmark_1",
      sequenceOrder: 1,
      title: "Datengrundlage prüfen",
      objective:
        "Feststellen, wie konsistent die historische Kategorisierung ist und welches Volumen je Kanal anfällt.",
      scope: [
        "Export eines repräsentativen Zeitraums",
        "Stichprobenprüfung der bestehenden Kategorien",
      ],
      expectedOutcome:
        "Eine belastbare Aussage darüber, ob eine Vorschlagsfunktion sinnvoll bewertet werden kann.",
      linkedRecommendationIds: ["rec_benchmark_1"],
      dependencyPhaseIds: [],
      explicitPrerequisites: ["Freigabe des Exports durch die IT-Koordination"],
      readinessConsiderations: [
        "Ohne diese Phase bleibt die Trefferquote unbewertbar",
      ],
      risks: ["Der Export deckt einen unrepräsentativen Zeitraum ab"],
      assumptions: ["Der Export ist ohne Anpassung des Ticketsystems möglich"],
      effort: {
        level: "low",
        rationale: "Einmaliger Export und eine begrenzte Stichprobenprüfung.",
      },
      sequencingRationale:
        "Sie ist Voraussetzung dafür, dass der Pilot überhaupt bewertet werden kann.",
      implementationPatternGrounding: [],
    },
    {
      id: "phase_benchmark_2",
      sequenceOrder: 2,
      title: "Begleiteter Pilot in einer Gruppe",
      objective:
        "Die Vorschlagsfunktion in einer Gruppe einsetzen und die Trefferquote im Alltag messen.",
      scope: [
        "Eine Gruppe, ein Kanal",
        "Verpflichtende Bestätigung jeder Vorschlagskategorie",
      ],
      expectedOutcome:
        "Eine Entscheidungsgrundlage für die Ausweitung oder den Abbruch.",
      linkedRecommendationIds: ["rec_benchmark_1"],
      dependencyPhaseIds: ["phase_benchmark_1"],
      explicitPrerequisites: ["Beteiligung des Betriebsrats"],
      readinessConsiderations: [
        "Die fachliche Prüfung bleibt während des gesamten Piloten verpflichtend",
      ],
      risks: [
        "Das Team akzeptiert Vorschläge ungeprüft, wenn die Trefferquote hoch wirkt",
      ],
      assumptions: ["Eine Gruppe kann den Piloten neben dem Tagesgeschäft tragen"],
      effort: {
        level: "medium",
        rationale:
          "Anbindung, Prüfoberfläche und Begleitung über einen definierten Zeitraum.",
      },
      sequencingRationale:
        "Erst nach geprüfter Datengrundlage ist ein Pilotergebnis aussagekräftig.",
      implementationPatternGrounding: [],
    },
  ],
  recommendationDispositions: [
    { recommendationId: "rec_benchmark_1", disposition: "included" },
  ],
  assumptions: [
    "Die neun Kategorien bleiben während des Piloten unverändert",
  ],
  gaps: [
    "Der Zeitraum für die Messung im Alltag ist noch nicht festgelegt.",
  ],
})
