import type { DiscoveryMessageId } from "../../shared/discovery-messages"
import type { OpportunityMessageId } from "../../shared/opportunity-messages"
import type { RecommendationMessageId } from "../../shared/recommendation-messages"
import type { WorkbenchMessageId } from "../../shared/workbench-messages"

// The German string catalogue — the MVP's single active locale
// (architecture.md §7.1). Keys are named after what a string *is* (its surface
// and role), never after its current wording, so re-wording never forces a key
// change. Internal identifiers — statuses, actors, transitions, sections, enum
// values, message identifiers — stay English and are *mapped* here; they are
// never translated in code, data, or contracts.
//
// A second language is added as a second catalogue of the same keys; nothing
// else changes.

// The outcomes the Discovery endpoints report. Typed against the shared
// contract, so the compiler refuses a catalogue that cannot render something
// the server can send.
const serverMessages: Record<DiscoveryMessageId, string> = {
  "discovery.message.profile_saved": "Discovery-Profil gespeichert",
  "discovery.message.submitted": "Discovery zur Prüfung eingereicht",
  "discovery.message.returned": "Discovery mit Anmerkungen zurückgegeben",
  "discovery.message.accepted": "Discovery angenommen",
  "discovery.message.reopened": "Discovery zur Überarbeitung wieder geöffnet",
  "discovery.error.invalid_profile":
    "Das Discovery-Profil ist unvollständig oder ungültig. Prüfen Sie, ob jede Kennzahl einen Wert und eine Datenquelle hat und ob gemessene Kennzahlen ihre Messmethode nennen.",
  "discovery.error.invalid_transition_input":
    "Die Angaben für diesen Schritt sind unvollständig. Eine Rückgabe benötigt Anmerkungen, und jeder Schritt benötigt die Angabe, wer ihn ausführt.",
  "discovery.error.engagement_not_found": "Dieses Engagement wurde nicht gefunden.",
  "discovery.error.actor_not_permitted":
    "Die Prüfung der Discovery liegt beim Consultant: „{actor}“ darf den Schritt „{transition}“ nicht ausführen.",
  "discovery.error.illegal_transition":
    "Der Schritt „{transition}“ ist im Status „{status}“ nicht möglich.",
  "discovery.error.baseline_not_explained":
    "Teile der Wert- und Messbasis sind weder beantwortet noch als Messlücke festgehalten ({subjectCount}). Halten Sie mit Begründung fest, was die Kundenseite heute nicht messen kann, bevor Sie einreichen.",
  "discovery.error.internal":
    "Unerwarteter Serverfehler. Die Discovery wurde nicht verändert. Bitte erneut versuchen.",
}

// The outcomes the Opportunity prioritization endpoints report (roadmap Phase
// 4). Typed against the shared contract for the same reason as above.
const opportunityServerMessages: Record<OpportunityMessageId, string> = {
  "opportunity.message.prioritized":
    "Entwurf der priorisierten Opportunities erstellt. Bitte prüfen, anpassen und speichern.",
  "opportunity.message.saved": "Opportunities gespeichert",
  "opportunity.message.accepted": "Opportunities angenommen",
  "opportunity.error.invalid_input":
    "Die Opportunities sind unvollständig oder ungültig. Jede Opportunity braucht mindestens ein zitiertes Assessment-Ergebnis, eine Begründung und einen eindeutigen Rang.",
  "opportunity.error.assessment_not_ready":
    "Es gibt noch kein Assessment mit Ergebnissen. Erstellen Sie zuerst das Assessment, bevor Sie Opportunities priorisieren.",
  "opportunity.error.consultant_edits_protected":
    "Diese Priorisierung enthält Ihre eigenen Änderungen. Ein erneuter Lauf würde sie ersetzen und braucht deshalb Ihre ausdrückliche Bestätigung.",
  "opportunity.error.success_criteria_placeholder":
    "Mindestens ein Erfolgskriterium enthält noch einen Platzhalter. Bitte tragen Sie die Kennzahl, die Messmethode, die Datenquelle und die noch offenen Werte vor dem Speichern ein.",
  "opportunity.error.ai_step_failed":
    "Der KI-Anbieter war nicht erreichbar. Es wurde nichts verändert – bitte erneut versuchen.",
  "opportunity.error.ai_output_invalid":
    "Die KI-Antwort war unbrauchbar. Es wurde kein Entwurf erstellt und nichts verändert.",
  "opportunity.error.ai_output_ungrounded":
    "Die KI hat sich auf Assessment-Ergebnisse berufen, die es nicht gibt. Der Entwurf wurde verworfen und nichts verändert.",
  "opportunity.error.stale_update":
    "Diese Fassung ist veraltet. Laden Sie die aktuelle Version erneut, bevor Sie weiter speichern.",
  "opportunity.error.historical_version_readonly":
    "Diese frühere Version ist nur lesbar. Öffnen Sie die aktive Fassung, um weiterzubearbeiten.",
  "opportunity.error.version_not_found":
    "Diese Version wurde nicht gefunden.",
  "opportunity.error.version_conflict":
    "Eine andere Neupriorisierung wurde gerade gespeichert. Laden Sie die aktuelle Fassung neu und versuchen Sie es erneut.",
  "opportunity.error.persistence_failed":
    "Die Opportunity-Version konnte nicht gespeichert werden. Bitte erneut versuchen.",
  "opportunity.error.internal":
    "Unerwarteter Serverfehler. Die Opportunities wurden nicht verändert. Bitte erneut versuchen.",
  "opportunity.message.versions_loaded": "Opportunity-Versionen geladen",
  "opportunity.message.version_loaded": "Opportunity-Version geladen",
}

// The outcomes the Recommendation endpoints report (roadmap Phase 6). Typed
// against the shared contract for the same reason as above: the compiler refuses
// a catalogue that cannot render something the server can send.
const recommendationServerMessages: Record<RecommendationMessageId, string> = {
  "recommendation.message.matched":
    "Entwurf der belegten Empfehlungen erstellt. Bitte prüfen, anpassen und speichern.",
  "recommendation.message.saved": "Empfehlungen gespeichert",
  "recommendation.message.accepted": "Empfehlungen angenommen",
  "recommendation.message.versions_loaded": "Empfehlungsfassungen geladen",
  "recommendation.message.version_loaded": "Empfehlungsfassung geladen",
  "recommendation.error.invalid_input":
    "Die Empfehlungen sind unvollständig oder ungültig. Jede Empfehlung braucht eine zugeordnete Opportunity, mindestens einen Wissensbeleg, eine Begründung und einen erwarteten Nutzen.",
  "recommendation.error.opportunities_not_ready":
    "Es sind noch keine Opportunities priorisiert. Priorisieren Sie zuerst, bevor Sie Empfehlungen erstellen.",
  "recommendation.error.knowledge_unavailable":
    "Für dieses Engagement liefert die Consulting Knowledge Base derzeit keinen passenden Eintrag. Ohne kuratierten Beleg wird kein Entwurf erstellt.",
  "recommendation.error.consultant_edits_protected":
    "Diese Empfehlungen enthalten Ihre eigenen Änderungen. Ein erneuter Lauf würde sie ersetzen und braucht deshalb Ihre ausdrückliche Bestätigung.",
  "recommendation.error.ai_step_failed":
    "Der KI-Anbieter war nicht erreichbar. Es wurde nichts verändert – bitte erneut versuchen.",
  "recommendation.error.ai_output_invalid":
    "Die KI-Antwort war unbrauchbar. Es wurde kein Entwurf erstellt und nichts verändert.",
  "recommendation.error.ai_output_ungrounded":
    "Die Empfehlungen berufen sich auf Opportunities oder Wissenseinträge, die es nicht gibt. Der Entwurf wurde verworfen und nichts verändert.",
  "recommendation.error.stale_update":
    "Diese Fassung ist veraltet. Laden Sie die aktuelle Version erneut, bevor Sie weiter speichern.",
  "recommendation.error.historical_version_readonly":
    "Diese frühere Fassung ist nur lesbar. Öffnen Sie die aktive Fassung, um weiterzubearbeiten.",
  "recommendation.error.version_not_found":
    "Diese Empfehlungsfassung wurde nicht gefunden.",
  "recommendation.error.version_conflict":
    "Ein anderer Lauf wurde gerade gespeichert. Laden Sie die aktuelle Fassung neu und versuchen Sie es erneut.",
  "recommendation.error.persistence_failed":
    "Die Empfehlungsfassung konnte nicht gespeichert werden. Bitte erneut versuchen.",
  "recommendation.error.internal":
    "Unerwarteter Serverfehler. Die Empfehlungen wurden nicht verändert. Bitte erneut versuchen.",
}

// The outcomes the Organization, Engagement, Assessment and Analysis endpoints
// report. These endpoints predate the localization seam and answered in English
// prose, which the workbench then displayed verbatim; the wording lives here
// now and only the identifier travels.
const workbenchServerMessages: Record<WorkbenchMessageId, string> = {
  "organization.message.list_loaded": "Organisationen geladen",
  "organization.message.loaded": "Organisation geladen",
  "organization.message.created": "Organisation angelegt",
  "organization.error.invalid_input":
    "Die Angaben zur Organisation sind unvollständig oder ungültig. Ein Name wird benötigt.",
  "organization.error.internal":
    "Unerwarteter Serverfehler. Die Organisation wurde nicht verändert. Bitte erneut versuchen.",

  "engagement.message.list_loaded": "Engagements geladen",
  "engagement.message.loaded": "Engagement geladen",
  "engagement.message.created": "Engagement eröffnet",
  "engagement.message.saved": "Engagement gespeichert",
  "engagement.error.invalid_input":
    "Die Angaben zum Engagement sind unvollständig oder ungültig.",
  "engagement.error.organization_not_found":
    "Diese Organisation wurde nicht gefunden. Legen Sie die Organisation an, bevor Sie ein Engagement dafür eröffnen.",
  "engagement.error.internal":
    "Unerwarteter Serverfehler. Das Engagement wurde nicht verändert. Bitte erneut versuchen.",

  "assessment.message.draft_generated":
    "KI-Entwurf erstellt. Bitte prüfen, anpassen und speichern, bevor Sie damit weiterarbeiten.",
  "assessment.message.saved": "Assessment gespeichert",
  "assessment.error.invalid_input":
    "Das Assessment ist unvollständig oder ungültig. Jedes Ergebnis braucht einen Titel, eine Erläuterung, eine Zuversicht und – je nach Grundlage – mindestens eine belegende Tatsache oder eine Annahme.",
  "assessment.error.discovery_not_ready":
    "Das Discovery-Profil ist leer. Halten Sie zuerst fest, was über die Kundenseite bekannt ist, bevor Sie ein Assessment erstellen.",
  "assessment.error.consultant_edits_protected":
    "Dieses Assessment enthält Ihre eigenen Änderungen. Ein erneuter Lauf würde sie ersetzen und braucht deshalb Ihre ausdrückliche Bestätigung.",
  "assessment.error.ai_step_failed":
    "Der KI-Anbieter war nicht erreichbar. Es wurde nichts verändert – bitte erneut versuchen.",
  "assessment.error.ai_output_invalid":
    "Die KI-Antwort war unbrauchbar. Es wurde kein Entwurf erstellt und nichts verändert.",
  "assessment.error.internal":
    "Unerwarteter Serverfehler. Das Assessment wurde nicht verändert. Bitte erneut versuchen.",

  "analysis.message.completed": "Analyse abgeschlossen",
  "analysis.error.output_invalid":
    "Die KI-Antwort hat die Prüfung nicht bestanden. Es wurde kein Bericht erstellt.",
  "analysis.error.failed":
    "Die Analyse ist fehlgeschlagen. Es wurde nichts verändert – bitte erneut versuchen.",
  "analysis.error.runs_not_loaded":
    "Der Verlauf der KI-Läufe konnte nicht geladen werden.",
}

const uiMessages = {
  // --- generic -----------------------------------------------------------
  "common.error.unexpected": "Unerwarteter Fehler. Bitte erneut versuchen.",
  "common.field.not_captured": "Nicht erfasst",
  "common.field.comma_hint": "Einträge mit Komma trennen.",
  "common.field.yes": "Ja",
  "common.field.no": "Nein",
  "common.action.remove": "Entfernen",
  "common.error.label": "Fehler",
  "common.field.none": "Keine.",
  "common.field.pipe_hint": "Einträge mit senkrechtem Strich (|) trennen.",
  "common.state.working": "Bitte warten …",
  "common.state.saving": "Speichere …",
  "common.state.saved": "Gespeichert",
  "common.state.loading": "Wird geladen …",
  "common.action.cancel": "Abbrechen",
  "common.action.close": "Schließen",
  "common.value.valid": "gültig",
  "common.value.invalid": "ungültig",
  "common.currency.eur": "Euro",
  "common.currency.usd": "US-Dollar",
  "common.currency.gbp": "Britisches Pfund",
  "common.currency.other": "Andere Währung",

  // --- workflow section chrome ------------------------------------------
  "workflow.legend.title": "Status der Abschnitte",
  "workflow.legend.intro":
    "Die Abschnitte zeigen ihren Bearbeitungsstand mit Text und Symbol. Ein offener Abschnitt bleibt bearbeitbar, ein zurückgegebener Abschnitt fordert Handeln an.",
  "workflow.nav.eyebrow": "Abschnittsnavigation",
  "workflow.nav.discovery_title": "Discovery-Abschnitte",
  "workflow.nav.assessment_title": "Assessment-Abschnitte",
  "workflow.nav.opportunities_title": "Opportunity-Abschnitte",
  "workflow.nav.recommendations_title": "Empfehlungsabschnitte",
  "workflow.nav.knowledge_title": "Wissensabschnitte",
  "workflow.status.not_started": "Noch nicht begonnen",
  "workflow.status.in_progress": "Teilweise ausgefüllt",
  "workflow.status.complete": "Vollständig",
  "workflow.status.action_required": "Angaben erforderlich",
  "workflow.status.action_required.returned": "Korrektur erforderlich",
  "workflow.status.summary.not_started":
    "Es wurden noch keine relevanten Angaben erfasst.",
  "workflow.status.summary.in_progress":
    "Es sind bereits Angaben vorhanden, der Abschnitt ist aber noch nicht vollständig.",
  "workflow.status.summary.complete":
    "Alle für diesen Abschnitt relevanten Angaben sind vorhanden.",
  "workflow.status.summary.action_required":
    "Pflichtangaben fehlen, sind ungültig oder wurden mit Anmerkungen zurückgegeben.",

  // --- knowledge base ----------------------------------------------------
  "knowledge.kind.business_domain": "Geschäftsdomäne",
  "knowledge.kind.business_process": "Geschäftsprozess",
  "knowledge.kind.business_problem": "Geschäftsproblem",
  "knowledge.kind.customer_operations_taxonomy": "Customer-Operations-Taxonomie",
  "knowledge.kind.discovery_question": "Discovery-Frage",
  "knowledge.kind.assessment_framework": "Bewertungsrahmen",
  "knowledge.kind.ai_readiness_criterion": "KI-Reifekriterium",
  "knowledge.kind.ai_use_case": "KI-Use-Case",
  "knowledge.kind.solution_pattern": "Lösungsmuster",
  "knowledge.kind.implementation_pattern": "Implementierungsmuster",
  "knowledge.kind.roi_model": "ROI-Modell",
  "knowledge.kind.risk_model": "Risikomodell",
  "knowledge.kind.best_practice": "Best Practice",
  "knowledge.kind.follow_up_template": "Follow-up-Vorlage",

  "knowledge.stage.discovery": "Discovery",
  "knowledge.stage.assessment": "Assessment",
  "knowledge.stage.prioritization": "Priorisierung",
  "knowledge.stage.solution_matching": "Solution Matching",
  "knowledge.stage.roadmap": "Roadmap",
  "knowledge.stage.report": "Report",

  "knowledge.guidance.eyebrow": "Consulting Knowledge Base",
  "knowledge.guidance.title": "Kuratiertes Consulting-Wissen",
  "knowledge.guidance.intro":
    "Die Workbench blendet an dieser Stelle relevante Fragen, Bewertungsrahmen, Reifekriterien und bewährte Praktiken ein. Die Auswahl ist deterministisch und basiert auf dem aktuellen Engagement-Kontext.",
  "knowledge.guidance.empty":
    "Noch keine Wissensgrundlage verfügbar. Sobald der Kontext genügend Signale liefert, erscheinen hier kuratierte Einträge.",
  "knowledge.guidance.fallback":
    "Der Engagement-Kontext lieferte noch keinen Anker in der Taxonomie. Angezeigt wird die kuratierte Grundauswahl für diese Phase.",
  "knowledge.guidance.section.count": "{count} Einträge",
  "knowledge.guidance.section.empty": "Noch keine Einträge",

  "knowledge.browser.eyebrow": "Kuratierte Consulting Knowledge Base",
  "knowledge.browser.title": "Wissensbasis durchsuchen und kuratieren",
  "knowledge.browser.intro":
    "Durchsuchen Sie die kuratierten Einträge deterministisch oder pflegen Sie als Administrator neue Versionen mit sauberer Revisionierung.",
  "knowledge.browser.new_entry": "Neuen Eintrag",
  "knowledge.browser.filter.query": "Suche",
  "knowledge.browser.filter.query_placeholder": "Titel, Zusammenfassung oder Code",
  "knowledge.browser.filter.kind": "Typ",
  "knowledge.browser.filter.stage": "Phase",
  "knowledge.browser.filter.include_inactive": "Inaktive einbeziehen",
  "knowledge.browser.filters": "Suche und Filter",
  "knowledge.browser.search": "Suchen",
  "knowledge.browser.searching": "Suche …",
  "knowledge.browser.loading": "Lade Wissenseinträge …",
  "knowledge.browser.empty": "Keine Einträge gefunden.",
  "knowledge.browser.error": "Die Wissensbasis konnte nicht geladen werden.",
  "knowledge.browser.access_denied":
    "Für diese Wissensbasis ist keine Berechtigung vorhanden.",
  "knowledge.browser.validation":
    "Der Eintrag ist unvollständig oder ungültig. Prüfen Sie Code, Titel, Zusammenfassung und die strukturierten Listen.",
  "knowledge.browser.conflict":
    "Diese Fassung ist veraltet. Laden Sie die aktuelle Revision und versuchen Sie es erneut.",
  "knowledge.browser.saved": "Eintrag gespeichert",
  "knowledge.browser.save": "Speichern",
  "knowledge.browser.reset": "Zurücksetzen",
  "knowledge.browser.read_only":
    "Die Wissensbasis ist hier lesbar. Kuratieren ist der Administratorenrolle vorbehalten.",
  "knowledge.browser.saving": "Speichere …",
  "knowledge.browser.results": "Treffer",
  "knowledge.browser.editor.title": "Eintrag bearbeiten",
  "knowledge.browser.editor.code": "Code",
  "knowledge.browser.editor.kind": "Typ",
  "knowledge.browser.editor.title_field": "Titel",
  "knowledge.browser.editor.summary": "Zusammenfassung",
  "knowledge.browser.editor.tags": "Tags (schwaches Zusatzsignal)",
  "knowledge.browser.editor.match_terms": "Erkennungsbegriffe",
  "knowledge.browser.editor.taxonomy_codes": "Taxonomie-Codes",
  "knowledge.browser.editor.process_codes": "Prozess-Codes",
  "knowledge.browser.editor.problem_codes": "Problem-Codes",
  "knowledge.browser.editor.use_case_codes": "Use-Case-Codes",
  "knowledge.browser.editor.related_codes": "Weitere verknüpfte Codes",
  "knowledge.browser.editor.sort_order": "Sortierung",
  "knowledge.browser.editor.stage_scopes": "Phasen",
  "knowledge.browser.editor.revision": "Revision",
  "knowledge.browser.editor.objective": "Zweck",
  "knowledge.browser.editor.applicability": "Anwendbarkeit",
  "knowledge.browser.editor.questions": "Fragen",
  "knowledge.browser.editor.criteria": "Kriterien",
  "knowledge.browser.editor.signals": "Signale",
  "knowledge.browser.editor.steps": "Schritte",
  "knowledge.browser.editor.risks": "Risiken",
  "knowledge.browser.editor.mitigations": "Gegenmaßnahmen",
  "knowledge.browser.editor.roi_drivers": "ROI-Treiber",
  "knowledge.browser.editor.best_practices": "Best Practices",
  "knowledge.browser.editor.notes": "Notizen",
  "knowledge.browser.editor.active": "Aktiv",

  // Outcomes the server reports by identifier (coding-standards.md §12A).
  "knowledge.message.loaded": "Wissensbasis geladen",
  "knowledge.message.saved": "Eintrag angelegt",
  "knowledge.message.updated": "Eintrag aktualisiert",
  "knowledge.error.invalid_input":
    "Der Eintrag ist unvollständig oder ungültig. Prüfen Sie Code, Titel, Zusammenfassung und die strukturierten Listen.",
  "knowledge.error.invalid_relationship":
    "Mindestens eine Verknüpfung zeigt auf einen unbekannten Code oder auf die falsche Wissensart.",
  "knowledge.error.duplicate_code": "Dieser Code ist bereits vergeben.",
  "knowledge.error.not_found": "Der Eintrag wurde nicht gefunden.",
  "knowledge.error.conflict":
    "Diese Fassung ist veraltet. Laden Sie die aktuelle Revision und versuchen Sie es erneut.",
  "knowledge.error.access_denied":
    "Für diese Wissensbasis ist keine Berechtigung vorhanden.",
  "knowledge.error.internal": "Die Wissensbasis konnte nicht geladen werden.",

  // --- internal identifiers, rendered for reading -------------------------
  "discovery.actor.consultant": "Consultant",
  "discovery.actor.client": "Kundenseite",

  "discovery.transition.submit": "Einreichen",
  "discovery.transition.return": "Zurückgeben",
  "discovery.transition.accept": "Annehmen",
  "discovery.transition.reopen": "Wieder öffnen",

  "discovery.status.draft": "Entwurf – in Bearbeitung",
  "discovery.status.submitted": "Eingereicht – wartet auf die Prüfung",
  "discovery.status.returned": "Zurückgegeben – mit Anmerkungen",
  "discovery.status.accepted": "Angenommen – die faktische Grundlage",

  "discovery.status.short.draft": "Entwurf",
  "discovery.status.short.submitted": "Eingereicht",
  "discovery.status.short.returned": "Zurückgegeben",
  "discovery.status.short.accepted": "Angenommen",

  "discovery.section.situation": "Kundensituation & Betrieb",
  "discovery.section.problems": "Probleme & Auswirkungen",
  "discovery.section.current_process": "Aktueller Prozess",
  "discovery.section.tools": "Werkzeuge & Kanäle",
  "discovery.section.data": "Daten",
  "discovery.section.constraints": "Rahmenbedingungen",
  "discovery.section.goals": "Ziele & Erfolg",
  "discovery.section.value_measurement": "Wert- und Messbasis",
  "discovery.gap_category.situation": "Kundensituation",
  "discovery.gap_category.operations": "Betrieb & Abläufe",
  "discovery.gap_category.problems": "Probleme",
  "discovery.gap_category.current_process": "Aktueller Prozess",
  "discovery.gap_category.tools": "Werkzeuge & Kanäle",
  "discovery.gap_category.data": "Daten",
  "discovery.gap_category.constraints": "Rahmenbedingungen",
  "discovery.gap_category.goals": "Ziele & Erfolg",

  "discovery.provenance.consultant_captured": "Vom Consultant erfasst",
  "discovery.provenance.client_provided": "Von der Kundenseite bereitgestellt",
  "discovery.provenance.none": "Nichts erfasst",

  "discovery.basis.measured": "Gemessen",
  "discovery.basis.estimated": "Geschätzt",

  "discovery.frequency.rarely": "Selten",
  "discovery.frequency.monthly": "Monatlich",
  "discovery.frequency.weekly": "Wöchentlich",
  "discovery.frequency.daily": "Täglich",
  "discovery.frequency.many_times_per_day": "Mehrmals täglich",

  "discovery.data_availability.none": "Nicht vorhanden",
  "discovery.data_availability.unknown": "Unbekannt",
  "discovery.data_availability.restricted": "Eingeschränkt",
  "discovery.data_availability.available": "Verfügbar",

  "discovery.data_quality.poor": "Schlecht",
  "discovery.data_quality.mixed": "Gemischt",
  "discovery.data_quality.good": "Gut",
  "discovery.data_quality.unknown": "Unbekannt",

  "discovery.timeline.asap": "So schnell wie möglich",
  "discovery.timeline.this_quarter": "In diesem Quartal",
  "discovery.timeline.this_year": "In diesem Jahr",
  "discovery.timeline.unknown": "Unbekannt",

  "discovery.data_source.system": "System",
  "discovery.data_source.report": "Bericht",
  "discovery.data_source.interview": "Gespräch",
  "discovery.data_source.estimate": "Schätzung",
  "discovery.data_source.other": "Sonstiges",

  "discovery.impact_category.lost_time": "Zeitverlust",
  "discovery.impact_category.lost_revenue": "Umsatzverlust",
  "discovery.impact_category.rework": "Nacharbeit",
  "discovery.impact_category.customer_dissatisfaction":
    "Unzufriedenheit der Kundschaft",
  "discovery.impact_category.staff_load": "Belastung der Mitarbeitenden",
  "discovery.impact_category.other": "Sonstiges",

  "discovery.gap_subject.business_impact": "Geschäftliche Auswirkung",
  "discovery.gap_subject.error_frequency": "Fehlerhäufigkeit",
  "discovery.gap_subject.error_severity": "Fehlerschwere",
  "discovery.gap_subject.error_cost": "Fehlerkosten",
  "discovery.gap_subject.existing_kpis": "Vorhandene KPIs",
  "discovery.gap_subject.baseline_metrics": "Ausgangswerte",
  "discovery.gap_subject.target_success_metrics": "Zielwerte",
  "discovery.gap_subject.measurement_method": "Messmethode",
  "discovery.gap_subject.data_sources": "Datenquellen",

  "discovery.gap_reason.not_measured": "Wird heute nicht gemessen",
  "discovery.gap_reason.not_available": "Nicht verfügbar",
  "discovery.gap_reason.not_shared": "Nicht geteilt",
  "discovery.gap_reason.unknown": "Unbekannt",
  "discovery.gap_reason.other": "Sonstiges",

  "discovery.severity.low": "Niedrig",
  "discovery.severity.medium": "Mittel",
  "discovery.severity.high": "Hoch",

  // --- editor header (Phase 2 Extension) ----------------------------------
  "discovery.editor.contributor.label": "Erfasst von",
  "discovery.editor.saving": "Speichere …",
  "discovery.editor.save_failed": "Das Discovery-Profil konnte nicht gespeichert werden.",

  // --- the consultant's Discovery workspace -------------------------------
  "discovery.workspace.title": "Discovery – Kundendaten & Situation",
  "discovery.workspace.intro":
    "Erfassen Sie die relevanten Informationen über das Unternehmen, die aktuellen Prozesse, die Herausforderungen und die Ziele.",
  "discovery.workspace.action.save_draft": "Entwurf speichern",
  "discovery.workspace.contributor.field": "Erfasst von",
  "discovery.workspace.next_step.title": "Nächster empfohlener Schritt",
  "discovery.workspace.next_step.hint":
    "Vervollständigen Sie die offenen Angaben im Abschnitt „{section}“.",
  "discovery.workspace.next_step.action": "Abschnitt öffnen",
  "discovery.workspace.next_step.done":
    "Alle Abschnitte sind vollständig erfasst.",

  // --- field guidance: chrome ---------------------------------------------
  "discovery.guidance.explain": "Erklärung anzeigen",
  "discovery.guidance.explain_close": "Erklärung schließen",
  "discovery.guidance.consultant_context": "Verwendung im weiteren Verlauf",
  "discovery.guidance.examples.show": "Beispiele anzeigen",
  "discovery.guidance.examples.title": "Beispiele",
  "discovery.guidance.suggestions.open": "Vorschlag auswählen",
  "discovery.guidance.suggestions.close": "Vorschläge schließen",
  "discovery.guidance.suggestions.metric_open": "Kennzahl auswählen",
  "discovery.guidance.suggestions.example_open": "Beispiel auswählen",
  "discovery.guidance.suggestions.custom_label": "Eigene Angabe",
  "discovery.guidance.suggestions.custom_placeholder":
    "Eigene Angabe eingeben und hinzufügen",
  "discovery.guidance.suggestions.custom_add": "Hinzufügen",
  "discovery.guidance.suggestions.other": "Sonstiges – frei formulieren",
  "discovery.guidance.suggestions.selected": "Ausgewählt",
  "discovery.guidance.suggestions.remove": "„{item}“ entfernen",
  "discovery.guidance.suggestions.empty": "Noch nichts ausgewählt.",
  "discovery.guidance.unknown.toggle": "Ich weiß es noch nicht",
  "discovery.guidance.unknown.client":
    "Diese Angabe kann später gemeinsam mit Ihrer Ansprechperson geklärt werden.",
  "discovery.guidance.unknown.consultant": "Klärung mit dem Kunden erforderlich",
  "discovery.guidance.unknown.gap": "Noch offen: {field}",

  // --- field guidance: Kundensituation & Betrieb ---------------------------
  "discovery.help.department.client":
    "Nennen Sie den Bereich oder die Funktion, um die es geht. So ist klar, welcher Teil des Unternehmens betrachtet wird.",
  "discovery.help.department.example.1": "Kundensupport für Bestandskunden",
  "discovery.help.department.example.2": "Auftragsabwicklung im Innendienst",
  "discovery.help.affected_users.client":
    "Wer arbeitet heute in diesem Ablauf oder ist davon betroffen? Rollen genügen, Namen sind nicht nötig.",
  "discovery.help.affected_users.consultant":
    "Diese Angabe wird später für die Bewertung von Aufwand, Betroffenheit und Change-Bedarf verwendet.",
  "discovery.help.notes.client":
    "Alles, was zum Verständnis der Situation hilft und in keine andere Frage passt.",

  // --- field guidance: Probleme & Auswirkungen -----------------------------
  "discovery.help.stated_problem.client":
    "Beschreiben Sie in eigenen Worten, was heute nicht gut funktioniert. Eine ungefähre Beschreibung genügt.",
  "discovery.help.stated_problem.consultant":
    "Diese Angabe ist der Ausgangspunkt für Bewertung, Priorisierung und Empfehlungen.",
  "discovery.help.stated_problem.example.1":
    "Anfragen bleiben liegen, weil niemand eindeutig zuständig ist.",
  "discovery.help.stated_problem.example.2":
    "Dieselben Daten werden in zwei Systemen erfasst.",
  "discovery.help.pain_points.client":
    "Welche Schwierigkeiten treten dabei konkret auf? Wählen Sie passende Punkte aus oder ergänzen Sie eigene.",
  "discovery.help.business_impact.client":
    "Was kostet die Situation heute – an Zeit, Geld, Qualität oder Zufriedenheit? Eine grobe Einschätzung reicht.",
  "discovery.help.business_impact.consultant":
    "Diese Angabe wird später für Priorisierung und Nutzenabschätzung verwendet; Zahlen dazu gehören in die Wert- und Messbasis.",
  "discovery.help.business_impact.example.1":
    "Pro Woche entstehen etwa vier Stunden Nacharbeit im Team.",

  // --- field guidance: Aktueller Prozess -----------------------------------
  "discovery.help.current_process.client":
    "Beschreiben Sie den Ablauf von Anfang bis Ende: Wodurch wird er ausgelöst, wer macht was, wo wird entschieden, wann ist er fertig?",
  "discovery.help.current_process.consultant":
    "Der Ist-Ablauf ist die Grundlage für die Prozessbewertung und für die Frage, welche Schritte überhaupt automatisierbar sind.",
  "discovery.help.current_process.example.1":
    "Auslöser, Zuständigkeit, Schritte, Entscheidungspunkte, Übergaben, Ausnahmen, Ergebnis.",
  "discovery.help.current_process.example.2":
    "Eine Anfrage geht per E-Mail ein, wird manuell einem Team zugeordnet, dort geprüft und beantwortet.",
  "discovery.help.process_steps.client":
    "Die einzelnen Schritte in der Reihenfolge, in der sie tatsächlich passieren.",
  "discovery.help.bottlenecks.client":
    "An welchen Stellen bleibt die Arbeit liegen oder wird sie besonders aufwendig?",
  "discovery.help.bottlenecks.consultant":
    "Engpässe zeigen, wo eine Verbesserung den größten Hebel hätte; sie fließen in die Priorisierung ein.",

  // --- field guidance: Werkzeuge & Kanäle ----------------------------------
  "discovery.help.current_tools.client":
    "Welche Systeme werden in diesem Ablauf genutzt? Beschreiben Sie die Art des Systems oder nennen Sie das eingesetzte Produkt.",
  "discovery.help.current_tools.consultant":
    "Die Systemlandschaft bestimmt später, welche Lösungswege und Integrationen realistisch sind.",
  "discovery.help.communication_channels.client":
    "Über welche Wege kommen Anfragen herein oder werden Antworten verschickt?",
  "discovery.help.integration_needs.client":
    "Welche Systeme müssten zusammenarbeiten, damit eine Verbesserung wirklich hilft?",
  "discovery.help.integration_needs.consultant":
    "Integrationsbedarf beeinflusst Aufwand, Risiko und die technische Machbarkeit einer Empfehlung.",

  // --- field guidance: Daten -----------------------------------------------
  "discovery.help.data_types.client":
    "Welche Art von Informationen fällt in diesem Ablauf an?",
  "discovery.help.data_types.consultant":
    "Art, Qualität und Zugänglichkeit der Daten bestimmen die KI-Reife dieses Anwendungsfalls.",
  "discovery.help.data_locations.client":
    "Wo liegen diese Informationen heute?",
  "discovery.help.sensitive_data_types.client":
    "Welche besonders schützenswerten Angaben sind betroffen, zum Beispiel Personen-, Gesundheits- oder Zahlungsdaten?",
  "discovery.help.sensitive_data_types.consultant":
    "Diese Angabe wird für die Risikobetrachtung und für datenschutzrechtliche Voraussetzungen benötigt.",

  // --- field guidance: Rahmenbedingungen -----------------------------------
  "discovery.help.technical_constraints.client":
    "Was muss auf jeden Fall berücksichtigt werden – rechtlich, organisatorisch oder technisch?",
  "discovery.help.technical_constraints.consultant":
    "Rahmenbedingungen begrenzen den Lösungsraum und gehören zu den Voraussetzungen einer Empfehlung.",
  "discovery.help.budget_notes.client":
    "Alles zum finanziellen Rahmen, was hilfreich ist – auch wenn noch keine Summe feststeht.",

  // --- field guidance: Ziele & Erfolg --------------------------------------
  "discovery.help.desired_outcome.client":
    "Beschreiben Sie, was sich nach der Verbesserung konkret ändern soll.",
  "discovery.help.desired_outcome.consultant":
    "Der gewünschte Soll-Zustand wird später für Bewertung, Priorisierung und Empfehlungen verwendet.",
  "discovery.help.desired_outcome.example.1":
    "Die Bearbeitungszeit für Support-Anfragen soll verkürzt werden.",
  "discovery.help.desired_outcome.example.2":
    "Manuelle Arbeitsschritte sollen deutlich reduziert werden.",
  "discovery.help.desired_outcome.example.3":
    "Anfragen sollen schneller dem richtigen Team zugeordnet werden.",
  "discovery.help.success_metrics.client":
    "Woran erkennen Sie später, dass die Verbesserung erfolgreich war? Wählen Sie die Kennzahlen aus, die zu Ihrer Situation passen.",
  "discovery.help.success_metrics.consultant":
    "Hier wird nur benannt, was gemessen wird. Der heutige Wert und der Zielwert gehören in die Wert- und Messbasis und werden für die Erfolgskontrolle verwendet.",
  "discovery.help.mvp_scope.client":
    "Womit sollte sinnvollerweise begonnen werden, wenn nicht alles auf einmal geht?",
  "discovery.help.mvp_scope.consultant":
    "Ein klarer erster Schritt erleichtert später den Zuschnitt von Roadmap und Angebot.",

  // --- Ziele & Erfolg: the target value, shown here, edited in the baseline --
  "discovery.goals.target.title": "Welcher Zielwert wäre erfolgreich?",
  "discovery.goals.target.hint":
    "Der Zielwert gehört zur jeweiligen Kennzahl: Was müsste die Kennzahl erreichen, damit die Verbesserung gelungen ist?",
  "discovery.goals.target.consultant":
    "Zielwerte und heutige Ausgangswerte werden in der Wert- und Messbasis mit Messmethode und Datenquelle erfasst und später für die Erfolgskontrolle verwendet.",
  "discovery.goals.target.empty":
    "Wählen Sie zuerst eine Erfolgskennzahl aus.",
  "discovery.goals.target.none": "Noch kein Zielwert erfasst",
  "discovery.goals.target.value": "Zielwert: {value}",
  "discovery.goals.target.baseline": "Heute: {value}",
  "discovery.goals.target.action": "Zielwerte in der Wert- und Messbasis erfassen",

  // --- suggestion groups ---------------------------------------------------
  "discovery.suggestion.group.role": "Rollen und Teams",
  "discovery.suggestion.group.problem": "Häufige Schwierigkeiten",
  "discovery.suggestion.group.impact": "Häufige Auswirkungen",
  "discovery.suggestion.group.process_step": "Typische Prozessschritte",
  "discovery.suggestion.group.bottleneck": "Typische Engpässe",
  "discovery.suggestion.group.tool": "Systemarten",
  "discovery.suggestion.group.channel": "Kanäle",
  "discovery.suggestion.group.data_type": "Informationsarten",
  "discovery.suggestion.group.data_location": "Ablageorte",
  "discovery.suggestion.group.constraint": "Rahmenbedingungen",
  "discovery.suggestion.group.outcome": "Mögliche Ziele",
  "discovery.suggestion.group.metric": "Mögliche Kennzahlen",

  // --- suggestions: desired outcome ----------------------------------------
  "discovery.suggestion.outcome.shorten_processing_time":
    "Bearbeitungszeit verkürzen",
  "discovery.suggestion.outcome.shorten_processing_time.insert":
    "Die Bearbeitungszeit soll spürbar verkürzt werden.",
  "discovery.suggestion.outcome.shorten_response_time": "Reaktionszeit verkürzen",
  "discovery.suggestion.outcome.shorten_response_time.insert":
    "Auf Anfragen soll schneller reagiert werden.",
  "discovery.suggestion.outcome.reduce_error_rate": "Fehlerquote reduzieren",
  "discovery.suggestion.outcome.reduce_error_rate.insert":
    "Fehler in der Bearbeitung sollen seltener auftreten.",
  "discovery.suggestion.outcome.relieve_staff": "Mitarbeitende entlasten",
  "discovery.suggestion.outcome.relieve_staff.insert":
    "Das Team soll von wiederkehrender Routinearbeit entlastet werden.",
  "discovery.suggestion.outcome.raise_customer_satisfaction":
    "Kundenzufriedenheit erhöhen",
  "discovery.suggestion.outcome.raise_customer_satisfaction.insert":
    "Die Zufriedenheit der Kundschaft mit dem Ablauf soll steigen.",
  "discovery.suggestion.outcome.reduce_cost": "Kosten senken",
  "discovery.suggestion.outcome.reduce_cost.insert":
    "Die Kosten pro Vorgang sollen sinken.",
  "discovery.suggestion.outcome.improve_transparency": "Transparenz verbessern",
  "discovery.suggestion.outcome.improve_transparency.insert":
    "Der Stand eines Vorgangs soll jederzeit nachvollziehbar sein.",
  "discovery.suggestion.outcome.reduce_manual_work": "Manuelle Arbeit reduzieren",
  "discovery.suggestion.outcome.reduce_manual_work.insert":
    "Manuelle Arbeitsschritte sollen deutlich reduziert werden.",
  "discovery.suggestion.outcome.raise_revenue": "Umsatz oder Conversion erhöhen",
  "discovery.suggestion.outcome.raise_revenue.insert":
    "Mehr Anfragen sollen zu einem erfolgreichen Abschluss führen.",
  "discovery.suggestion.outcome.improve_compliance": "Compliance verbessern",
  "discovery.suggestion.outcome.improve_compliance.insert":
    "Vorgaben sollen zuverlässiger eingehalten und nachweisbar dokumentiert werden.",

  // --- suggestions: success metrics ----------------------------------------
  "discovery.suggestion.metric.processing_time": "Bearbeitungszeit",
  "discovery.suggestion.metric.processing_time.description":
    "Zeit vom Eingang eines Vorgangs bis zu seinem Abschluss.",
  "discovery.suggestion.metric.first_response_time": "Erstantwortzeit",
  "discovery.suggestion.metric.first_response_time.description":
    "Zeit zwischen Eingang einer Anfrage und der ersten Antwort.",
  "discovery.suggestion.metric.resolution_rate": "Lösungsquote",
  "discovery.suggestion.metric.resolution_rate.description":
    "Anteil der Fälle, die erfolgreich abgeschlossen werden.",
  "discovery.suggestion.metric.error_rate": "Fehlerquote",
  "discovery.suggestion.metric.error_rate.description":
    "Anteil der Vorgänge, bei denen ein Fehler auftritt oder nachgearbeitet werden muss.",
  "discovery.suggestion.metric.manual_steps": "Anzahl manueller Schritte",
  "discovery.suggestion.metric.manual_steps.description":
    "Wie viele Arbeitsschritte pro Vorgang von Hand erledigt werden.",
  "discovery.suggestion.metric.cost_per_case": "Kosten pro Vorgang",
  "discovery.suggestion.metric.cost_per_case.description":
    "Durchschnittliche Kosten für die Bearbeitung eines einzelnen Vorgangs.",
  "discovery.suggestion.metric.customer_satisfaction": "Kundenzufriedenheit",
  "discovery.suggestion.metric.customer_satisfaction.description":
    "Bewertung der Zufriedenheit nach einem Kontakt oder Vorgang.",
  "discovery.suggestion.metric.staff_effort": "Mitarbeiteraufwand",
  "discovery.suggestion.metric.staff_effort.description":
    "Arbeitszeit, die das Team für diesen Ablauf aufwendet.",
  "discovery.suggestion.metric.escalations": "Anzahl Eskalationen",
  "discovery.suggestion.metric.escalations.description":
    "Wie oft ein Vorgang an eine höhere Stelle abgegeben werden muss.",
  "discovery.suggestion.metric.revenue": "Umsatz",
  "discovery.suggestion.metric.revenue.description":
    "Erlös, der mit diesem Ablauf zusammenhängt.",
  "discovery.suggestion.metric.conversion_rate": "Abschlussquote",
  "discovery.suggestion.metric.conversion_rate.description":
    "Anteil der Anfragen, die zu einem Abschluss führen.",

  // --- suggestions: problems and impact ------------------------------------
  "discovery.suggestion.problem.manual_effort": "Hoher manueller Aufwand",
  "discovery.suggestion.problem.processing_time": "Lange Bearbeitungszeit",
  "discovery.suggestion.problem.frequent_errors": "Häufige Fehler",
  "discovery.suggestion.problem.duplicate_entry": "Doppelte Datenerfassung",
  "discovery.suggestion.problem.no_transparency": "Fehlende Transparenz",
  "discovery.suggestion.problem.delayed_response": "Verzögerte Rückmeldungen",
  "discovery.suggestion.problem.hard_prioritization": "Schwierige Priorisierung",
  "discovery.suggestion.problem.key_person_risk":
    "Wissen hängt an einzelnen Personen",
  "discovery.suggestion.impact.extra_cost": "Zusätzliche Kosten",
  "discovery.suggestion.impact.extra_cost.insert":
    "Durch die Situation entstehen zusätzliche Kosten.",
  "discovery.suggestion.impact.customer_dissatisfaction": "Unzufriedene Kundschaft",
  "discovery.suggestion.impact.customer_dissatisfaction.insert":
    "Die Kundschaft ist mit der aktuellen Bearbeitung unzufrieden.",
  "discovery.suggestion.impact.staff_overload": "Überlastung im Team",
  "discovery.suggestion.impact.staff_overload.insert":
    "Das Team ist durch die aktuelle Arbeitsweise überlastet.",
  "discovery.suggestion.impact.lost_revenue": "Entgangener Umsatz",
  "discovery.suggestion.impact.lost_revenue.insert":
    "Es geht Umsatz verloren, weil Vorgänge zu lange dauern oder liegen bleiben.",
  "discovery.suggestion.impact.compliance_risk": "Compliance-Risiko",
  "discovery.suggestion.impact.compliance_risk.insert":
    "Vorgaben lassen sich derzeit nicht zuverlässig einhalten oder nachweisen.",
  "discovery.suggestion.impact.poor_data_quality": "Schlechte Datenqualität",
  "discovery.suggestion.impact.poor_data_quality.insert":
    "Die erfassten Daten sind unvollständig oder widersprüchlich.",
  "discovery.suggestion.impact.delayed_decisions": "Verzögerte Entscheidungen",
  "discovery.suggestion.impact.delayed_decisions.insert":
    "Entscheidungen verzögern sich, weil Informationen fehlen.",

  // --- suggestions: roles, process, bottlenecks ----------------------------
  "discovery.suggestion.role.service_team": "Kundenservice",
  "discovery.suggestion.role.sales": "Vertrieb",
  "discovery.suggestion.role.back_office": "Innendienst / Backoffice",
  "discovery.suggestion.role.team_lead": "Teamleitung",
  "discovery.suggestion.role.it": "IT",
  "discovery.suggestion.role.management": "Geschäftsleitung",
  "discovery.suggestion.role.customers": "Kundschaft",
  "discovery.suggestion.process_step.intake": "Eingang der Anfrage",
  "discovery.suggestion.process_step.triage": "Zuordnung und Einstufung",
  "discovery.suggestion.process_step.research": "Recherche und Prüfung",
  "discovery.suggestion.process_step.decision": "Entscheidung",
  "discovery.suggestion.process_step.handover": "Übergabe an ein anderes Team",
  "discovery.suggestion.process_step.approval": "Freigabe",
  "discovery.suggestion.process_step.documentation": "Dokumentation",
  "discovery.suggestion.process_step.closing": "Abschluss und Rückmeldung",
  "discovery.suggestion.bottleneck.waiting_for_approval": "Warten auf Freigaben",
  "discovery.suggestion.bottleneck.media_break":
    "Wechsel zwischen Systemen und Medien",
  "discovery.suggestion.bottleneck.manual_research": "Manuelles Zusammensuchen",
  "discovery.suggestion.bottleneck.unclear_ownership": "Unklare Zuständigkeit",
  "discovery.suggestion.bottleneck.peak_load": "Belastungsspitzen",
  "discovery.suggestion.bottleneck.missing_information": "Fehlende Angaben",

  // --- suggestions: tools, channels, data, constraints ---------------------
  "discovery.suggestion.tool.crm": "CRM-System",
  "discovery.suggestion.tool.erp": "ERP-System",
  "discovery.suggestion.tool.ticket_system": "Ticketsystem",
  "discovery.suggestion.tool.spreadsheets": "Tabellen",
  "discovery.suggestion.tool.shared_drive": "Gemeinsames Laufwerk",
  "discovery.suggestion.tool.paper": "Papier und manuelle Unterlagen",
  "discovery.suggestion.channel.email": "E-Mail",
  "discovery.suggestion.channel.telephone": "Telefon",
  "discovery.suggestion.channel.chat": "Chat",
  "discovery.suggestion.channel.web_form": "Web-Formular",
  "discovery.suggestion.channel.portal": "Kundenportal",
  "discovery.suggestion.channel.in_person": "Persönlicher Kontakt",
  "discovery.suggestion.data_type.customer_records": "Kundendaten",
  "discovery.suggestion.data_type.tickets": "Tickets und Vorgänge",
  "discovery.suggestion.data_type.emails": "E-Mails",
  "discovery.suggestion.data_type.documents": "Dokumente",
  "discovery.suggestion.data_type.orders": "Aufträge und Bestellungen",
  "discovery.suggestion.data_type.call_notes": "Gesprächsnotizen",
  "discovery.suggestion.data_location.crm": "Im CRM-System",
  "discovery.suggestion.data_location.erp": "Im ERP-System",
  "discovery.suggestion.data_location.mailbox": "In Postfächern",
  "discovery.suggestion.data_location.file_share": "Auf einem Laufwerk",
  "discovery.suggestion.data_location.spreadsheets": "In Tabellen",
  "discovery.suggestion.data_location.paper_archive": "In Papierablagen",
  "discovery.suggestion.constraint.data_protection": "Datenschutz",
  "discovery.suggestion.constraint.it_security": "IT-Sicherheit",
  "discovery.suggestion.constraint.legal": "Rechtliche Vorgaben",
  "discovery.suggestion.constraint.internal_capacity": "Begrenzte interne Kapazität",
  "discovery.suggestion.constraint.integrations": "Notwendige Integrationen",
  "discovery.suggestion.constraint.change_management":
    "Begrenzte Veränderungsbereitschaft",

  "discovery.profile.department": "Abteilung / Funktion",
  "discovery.profile.department_placeholder": "Zum Beispiel: Kundensupport",
  "discovery.profile.affected_users": "Betroffene Personen oder Teams",
  "discovery.profile.affected_users_placeholder":
    "Support, Teamleitung, Kundschaft",
  "discovery.profile.notes": "Zusätzliche Hinweise zur Situation",
  "discovery.profile.notes_placeholder":
    "Relevanter Betriebsrahmen, Beteiligte oder Umfang",
  "discovery.profile.stated_problem": "Beschriebenes Problem",
  "discovery.profile.stated_problem_placeholder":
    "Welches Problem hat die Kundenseite beschrieben?",
  "discovery.profile.pain_points": "Schmerzpunkte",
  "discovery.profile.pain_points_placeholder":
    "Lange Antwortzeiten, doppelte Arbeit",
  "discovery.profile.business_impact": "Geschäftsauswirkung",
  "discovery.profile.business_impact_placeholder":
    "Kosten-, Kunden-, Umsatz-, Qualitäts- oder Risikowirkung",
  "discovery.profile.urgency": "Dringlichkeit",
  "discovery.profile.current_process": "Aktueller Prozess",
  "discovery.profile.current_process_placeholder": "Wie läuft die Arbeit heute ab?",
  "discovery.profile.process_steps": "Prozessschritte",
  "discovery.profile.process_steps_placeholder":
    "Anfrage erhalten, prüfen, antworten, abschließen",
  "discovery.profile.frequency": "Häufigkeit",
  "discovery.profile.manual_work_level": "Manueller Aufwand",
  "discovery.profile.bottlenecks": "Engpässe",
  "discovery.profile.bottlenecks_placeholder":
    "Manuelle Prüfung, Übergabeverzögerungen",
  "discovery.profile.current_tools": "Aktuelle Werkzeuge",
  "discovery.profile.current_tools_placeholder":
    "Zendesk, Salesforce, Tabellen",
  "discovery.profile.communication_channels": "Kommunikationskanäle",
  "discovery.profile.communication_channels_placeholder":
    "E-Mail, Telefon, Chat, Helpdesk",
  "discovery.profile.integration_needs": "Integrationsbedarf",
  "discovery.profile.integration_needs_placeholder":
    "CRM, Ticketsystem, Buchungssystem",
  "discovery.profile.data_types": "Datentypen",
  "discovery.profile.data_types_placeholder":
    "Tickets, Anrufe, Kundendaten",
  "discovery.profile.data_locations": "Datenorte",
  "discovery.profile.data_locations_placeholder":
    "CRM, Data Warehouse, freigegebener Ordner",
  "discovery.profile.data_availability": "Datenverfügbarkeit",
  "discovery.profile.data_quality": "Datenqualität",
  "discovery.profile.sensitive_data": "Sensible Daten betroffen",
  "discovery.profile.sensitive_data_types": "Arten sensibler Daten",
  "discovery.profile.sensitive_data_types_placeholder":
    "Personendaten, Zahlungsdaten",
  "discovery.profile.gdpr_concerns": "DSGVO-Bedenken",
  "discovery.profile.budget_amount": "Budgetbetrag",
  "discovery.profile.budget_currency": "Währung",
  "discovery.profile.budget_notes": "Budgethinweise",
  "discovery.profile.budget_notes_placeholder":
    "Budgetrahmen, Freigabestand oder Grenzen",
  "discovery.profile.timeline": "Zeitrahmen",
  "discovery.profile.human_approval_required": "Menschliche Freigabe erforderlich",
  "discovery.profile.technical_constraints": "Technische Einschränkungen",
  "discovery.profile.technical_constraints_placeholder":
    "Kein Cloud-Zugriff, Legacy-API, Datenresidenz",
  "discovery.profile.desired_outcome": "Gewünschtes Ergebnis",
  "discovery.profile.desired_outcome_placeholder": "Was soll sich verbessern?",
  "discovery.profile.success_metrics": "Erfolgskennzahlen",
  "discovery.profile.success_metrics_placeholder":
    "Erstantwortzeit, Lösungsrate, CSAT",
  "discovery.profile.mvp_scope": "MVP-Umfang",
  "discovery.profile.mvp_scope_placeholder":
    "Kleinster sinnvoller Prüfumfang",

  "discovery.profile.gaps.eyebrow": "Explizite Lücken",
  "discovery.profile.gaps.title": "Fehlende Informationen",
  "discovery.profile.gaps.intro":
    "Halten Sie Fakten fest, die noch bestätigt werden müssen. Leere Felder werden nicht stillschweigend als bekannt behandelt.",
  "discovery.profile.gaps.empty":
    "Es sind keine Lücken erfasst. Prüfen Sie vor dem Weitergehen, ob Discovery vollständig ist.",
  "discovery.profile.gaps.category": "Kategorie",
  "discovery.profile.gaps.description": "Beschreibung",
  "discovery.profile.gaps.description_placeholder":
    "Was muss noch gelernt oder bestätigt werden?",
  "discovery.profile.gaps.add": "Lücke hinzufügen",

  // --- review workflow ----------------------------------------------------
  "discovery.review.title": "Discovery-Prüfung",
  "discovery.review.intro":
    "Discovery wird als Entwurf bearbeitet, eingereicht, sobald sie aus Sicht der beitragenden Person vollständig ist, und anschließend vom Consultant geprüft, der sie annimmt oder zurückgibt. Das Einreichen ist ein Prüfpunkt, keine Sperre: Bei keinem Schritt gehen Inhalte verloren, und die Discovery bleibt danach überarbeitbar.",
  "discovery.review.submitted.label": "Eingereicht",
  "discovery.review.submitted.none": "Noch nicht eingereicht",
  "discovery.review.submitted.value": "{date} von {actor}",
  "discovery.review.reviewed.label": "Geprüft",
  "discovery.review.reviewed.none": "Noch nicht geprüft",
  "discovery.review.return_notes.title":
    "Anmerkungen des Consultants zur letzten Rückgabe",
  "discovery.review.provenance.title": "Wer hat was beigetragen",
  "discovery.review.provenance.hint":
    "Von der Kundenseite bereitgestellte Inhalte bleiben ihr auch nach späteren Änderungen und Prüfschritten zugeordnet; sie werden erst durch die Prüfung des Consultants zur akzeptierten Tatsache.",
  "discovery.review.action.submit": "Zur Prüfung einreichen",
  "discovery.review.action.accept": "Annehmen",
  "discovery.review.action.reopen": "Zur Überarbeitung öffnen",
  "discovery.review.action.return": "Mit Anmerkungen zurückgeben",
  "discovery.review.notes.label": "Anmerkungen für die Rückgabe",
  "discovery.review.notes.placeholder":
    "Was muss noch ergänzt oder korrigiert werden?",
  "discovery.review.open_subjects": "Offen: {subjects}",
  "discovery.review.transition_failed":
    "Der Schritt konnte nicht ausgeführt werden.",

  // --- value & measurement baseline ---------------------------------------
  "discovery.baseline.title": "Wert- und Messbasis",
  "discovery.baseline.intro":
    "Was das Problem heute kostet und wie messbarer Erfolg aussähe. Zu jeder Kennzahl gehört, wie sie zustande kam: Eine Schätzung wird nie als Messung erfasst, und eine gemessene Kennzahl muss nennen, wie sie gemessen wird. Was die Kundenseite nicht beantworten kann, gehört mit Begründung in die Messlücken – eine fehlende Basis ist ein Befund, kein leeres Feld.",

  "discovery.baseline.business_impact.title": "Geschäftliche Auswirkung",
  "discovery.baseline.business_impact.hint":
    "Was das Problem den Betrieb konkret kostet – Zeit, Umsatz, Nacharbeit, Unzufriedenheit, Belastung.",
  "discovery.baseline.business_impact.add": "Auswirkung hinzufügen",
  "discovery.baseline.business_impact.description": "Was es den Betrieb kostet",
  "discovery.baseline.business_impact.description_placeholder":
    "Buchungsänderungen werden von Hand erneut erfasst",
  "discovery.baseline.business_impact.figure": "Bezifferte Auswirkung",
  "discovery.baseline.business_impact.category": "Kategorie",

  "discovery.baseline.error_profile.title":
    "Fehlerhäufigkeit, -schwere & -kosten",
  "discovery.baseline.error_profile.hint":
    "Wie oft etwas schiefgeht, wie schwer ein einzelner Fall wiegt und was er kostet.",
  "discovery.baseline.error_profile.frequency": "Fehlerhäufigkeit",
  "discovery.baseline.error_profile.severity": "Schwere",
  "discovery.baseline.error_profile.severity_description":
    "Was ein einzelner Fall bedeutet",
  "discovery.baseline.error_profile.severity_placeholder":
    "Eine übersehene Buchungsänderung erreicht den Gast",
  "discovery.baseline.error_profile.cost": "Kosten pro Fall",

  "discovery.baseline.existing_kpis.title": "Vorhandene KPIs",
  "discovery.baseline.existing_kpis.hint":
    "Die Kennzahlen, die die Kundenseite für den betroffenen Betrieb bereits verfolgt.",
  "discovery.baseline.existing_kpis.add": "KPI hinzufügen",
  "discovery.baseline.existing_kpis.name": "KPI",
  "discovery.baseline.existing_kpis.name_placeholder": "Erstreaktionszeit",
  "discovery.baseline.existing_kpis.description":
    "Wie die Kundenseite sie definiert",
  "discovery.baseline.existing_kpis.description_placeholder":
    "Zeit von der Ticketerstellung bis zur ersten Antwort",

  "discovery.baseline.baseline_metrics.title": "Ausgangswerte",
  "discovery.baseline.baseline_metrics.hint":
    "Wo diese Kennzahlen heute stehen.",
  "discovery.baseline.baseline_metrics.add": "Ausgangswert hinzufügen",
  "discovery.baseline.baseline_metrics.figure": "Wert heute",

  "discovery.baseline.target_metrics.title": "Zielwerte für den Erfolg",
  "discovery.baseline.target_metrics.hint":
    "Was die Kundenseite als Erfolg ansähe – in denselben Größen wie die Ausgangswerte.",
  "discovery.baseline.target_metrics.add": "Zielwert hinzufügen",
  "discovery.baseline.target_metrics.figure": "Zielwert",

  "discovery.baseline.metric.name": "Kennzahl",
  "discovery.baseline.metric.name_placeholder": "Erstreaktionszeit",
  "discovery.baseline.metric.notes": "Anmerkungen",
  "discovery.baseline.metric.notes_placeholder":
    "Nur für den E-Mail-Kanal gemessen",

  "discovery.baseline.measurement_gaps.title": "Messlücken",
  "discovery.baseline.measurement_gaps.hint":
    "Was die Kundenseite nicht beantworten kann und warum – „wird heute nicht gemessen“ ist ein Befund, der in Assessment und Rückfragen einfließen muss.",
  "discovery.baseline.measurement_gaps.add": "Messlücke hinzufügen",
  "discovery.baseline.measurement_gaps.subject": "Was fehlt",
  "discovery.baseline.measurement_gaps.reason": "Warum",
  "discovery.baseline.measurement_gaps.detail": "Detail",
  "discovery.baseline.measurement_gaps.detail_placeholder":
    "Die Erstreaktionszeit wird heute nicht erfasst",

  "discovery.baseline.figure.value_placeholder":
    "12 Minuten durchschnittliche Bearbeitungszeit",
  "discovery.baseline.figure.basis": "Gemessen oder geschätzt",
  "discovery.baseline.figure.method": "Wie wird gemessen",
  "discovery.baseline.figure.method_placeholder":
    "Helpdesk-Bericht, Monatsmittel",
  "discovery.baseline.figure.source": "Datenquelle",
  "discovery.baseline.figure.source_detail": "Detail zur Quelle",
  "discovery.baseline.figure.source_detail_placeholder":
    "Monatsbericht aus Zendesk",
  "discovery.baseline.figure.record": "{label} erfassen",
  "discovery.baseline.figure.remove": "Kennzahl entfernen",
  "discovery.baseline.figure.hint":
    "Eine gemessene Kennzahl muss nennen, wie sie gemessen wird; eine Kennzahl aus einer Schätzung kann nicht als gemessen erfasst werden.",

  // --- access: sign-in, self-registration, invitation (Phase 3A) ----------
  "auth.page.eyebrow": "AI Consulting Workbench",
  "auth.page.title": "Anmelden oder Konto anlegen",
  "auth.page.subtitle":
    "Melden Sie sich mit Ihrem Zugang an. Kundinnen und Kunden legen ihr Konto selbst an; Consultants und Administratorinnen erhalten eine Einladung.",
  "auth.page.back_home": "Zur Startseite",

  "auth.tab.login": "Anmelden",
  "auth.tab.register": "Konto anlegen",
  "auth.tab.invitation": "Einladung",
  "auth.tab.bootstrap": "Erst-Administrator",

  "auth.form.login.title": "Anmeldung",
  "auth.form.login.submit": "Anmelden",
  "auth.form.register.title": "Eigenes Konto anlegen",
  "auth.form.register.hint":
    "Legen Sie Ihr Konto selbst an und bestätigen Sie Ihre E-Mail-Adresse. Ihr Consultant gibt Ihnen anschließend das Discovery-Formular frei.",
  "auth.form.register.submit": "Konto anlegen",
  "auth.form.invitation.title": "Einladung annehmen",
  "auth.form.invitation.hint":
    "Sie haben einen Einladungslink erhalten? Legen Sie hier Ihr eigenes Passwort fest.",
  "auth.form.invitation.submit": "Passwort festlegen",
  "auth.form.bootstrap.title": "Ersten Administrator anlegen",
  "auth.form.bootstrap.hint":
    "Einmalig, mit dem Bootstrap-Secret dieser Installation.",
  "auth.form.bootstrap.submit": "Bootstrap ausführen",
  "auth.form.submitting": "Bitte warten …",

  "auth.field.email": "E-Mail",
  "auth.field.password": "Passwort",
  "auth.field.password_hint": "Mindestens 12 Zeichen.",
  "auth.field.display_name": "Anzeigename",
  "auth.field.invitation_token": "Einladungs-Token",
  "auth.field.bootstrap_secret": "Bootstrap-Secret",
  "auth.field.workspace_name": "Workspace-Name",
  "auth.field.administrator_email": "E-Mail der Administratorin",
  "auth.field.administrator_name": "Name der Administratorin",

  "auth.message.login_successful": "Anmeldung erfolgreich.",
  "auth.message.logout_successful": "Abmeldung erfolgreich.",
  "auth.message.verification_sent":
    "Wenn diese Adresse verwendet werden kann, ist eine Bestätigungs-E-Mail unterwegs. Bitte bestätigen Sie die Adresse und melden Sie sich anschließend an.",
  "auth.message.invitation_accepted":
    "Einladung angenommen. Sie können sich jetzt anmelden.",
  "auth.message.bootstrap_complete":
    "Bootstrap abgeschlossen. Sie können sich jetzt anmelden.",
  "auth.message.invitation_issued": "Einladung verschickt.",
  "auth.message.discovery_access_granted": "Discovery-Zugang erteilt.",

  "auth.error.unauthenticated":
    "Bitte melden Sie sich an, um fortzufahren.",
  "auth.error.forbidden":
    "Für diese Aktion fehlt Ihnen die Berechtigung.",
  "auth.error.not_found": "Nicht gefunden.",
  "auth.error.invalid_input":
    "Die Angaben sind unvollständig oder ungültig. Das Passwort muss mindestens 12 Zeichen haben.",
  "auth.error.invalid_credentials":
    "E-Mail-Adresse oder Passwort stimmen nicht.",
  "auth.error.email_not_verified":
    "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.",
  "auth.error.email_already_registered":
    "Für diese Adresse besteht bereits ein Konto.",
  "auth.error.password_too_weak":
    "Das Passwort ist zu kurz. Bitte mindestens 12 Zeichen verwenden.",
  "auth.error.provider_unavailable":
    "Die Anmeldung ist zurzeit nicht möglich. Bitte später erneut versuchen.",
  "auth.error.bootstrap_unavailable":
    "Diese Installation ist bereits eingerichtet.",
  "auth.error.invitation_invalid": "Dieser Einladungslink ist ungültig.",
  "auth.error.invitation_unavailable":
    "Diese Einladung ist abgelaufen oder wurde zurückgezogen.",
  "auth.error.client_not_registered":
    "Für diese Adresse besteht noch kein Konto. Die Kundenseite legt ihr Konto selbst an, bevor Sie die Discovery freigeben können.",
  "auth.error.client_email_unverified":
    "Diese Adresse ist noch nicht bestätigt.",
  "auth.error.not_a_client":
    "Diese Adresse gehört zu keinem Kundenkonto dieses Workspace. Die Discovery kann nur für ein Kundenkonto freigegeben werden.",
  "auth.error.user_not_in_workspace":
    "Diese Person gehört nicht zu diesem Workspace.",
  "auth.error.not_a_manager":
    "Ein Engagement kann nur einer Managerin oder einer Administratorin gehören.",
  "auth.error.invitation_not_revocable":
    "Diese Einladung kann nicht mehr zurückgezogen werden.",
  "auth.error.notification_not_found": "Diese Benachrichtigung gibt es nicht.",
  "auth.error.discovery_access_not_found":
    "Dieser Discovery-Zugang wurde nicht gefunden.",

  // --- Client Discovery Portal (Phase 3A) ---------------------------------
  // The Client Portal's own frame. Its navigation names only the client
  // surfaces that exist; an entry for an unbuilt page would be a promise the
  // product cannot keep (UI-KIT §6.2, §7.1).
  "portal.shell.brand": "Kundenportal",
  "portal.shell.nav_aria_label": "Portalnavigation",
  "portal.shell.nav.discovery": "Discovery",

  "portal.eyebrow": "Client Discovery Portal",
  "portal.title": "Discovery-Profil",
  "portal.subtitle":
    "Sie sehen ausschließlich dieses Discovery-Formular. Nach dem Einreichen prüft der Consultant es und gibt es bei Bedarf mit Anmerkungen zurück.",
  "portal.unavailable.title": "Discovery nicht verfügbar",
  "portal.unavailable.hint":
    "Möglicherweise ist der Zugang abgelaufen oder wurde zurückgezogen, oder Sie sind nicht angemeldet.",
  "portal.unavailable.sign_in": "Zur Anmeldung",
  "portal.error.invalid_input":
    "Die Angaben sind unvollständig oder ungültig.",

  // --- Problem Prioritization & Opportunities (Phase 4) -------------------
  // Internal identifiers — the assessment dimensions, the three-step scale, the
  // AI-readiness qualification, the review state — stay English on the wire and
  // in storage; only their rendering is German.
  "assessment.dimension.businessProcess": "Geschäftsprozess",
  "assessment.dimension.data": "Daten",
  "assessment.dimension.technology": "Technologie",
  "assessment.dimension.aiReadiness": "KI-Reife",
  "assessment.dimension.risks": "Risiken",
  "assessment.dimension.opportunities": "Opportunities",

  "opportunity.level.low": "gering",
  "opportunity.level.medium": "mittel",
  "opportunity.level.high": "hoch",

  "opportunity.ai_readiness.ready": "KI-bereit",
  "opportunity.ai_readiness.conditional": "Bedingt – Voraussetzungen offen",
  "opportunity.ai_readiness.not_ready": "Noch nicht KI-bereit",

  "opportunity.review_state.ai_draft": "KI-Entwurf – noch nicht geprüft",
  "opportunity.review_state.consultant_edited": "Von Ihnen bearbeitet",
  "opportunity.review_state.accepted": "Von Ihnen angenommen",

  "opportunity.eyebrow": "Priorisierung",
  "opportunity.title": "Opportunities",
  "opportunity.intro":
    "Aus dem Assessment abgeleitete Verbesserungskandidaten, gewichtet nach Nutzen, Aufwand, Wirkung und Zuversicht, gegen die KI-Reife qualifiziert und gegeneinander priorisiert. Der Entwurf gehört Ihnen: bearbeiten, umsortieren, verwerfen oder annehmen.",
  "opportunity.empty":
    "Noch keine Priorisierung. Erstellen Sie einen Entwurf aus dem gespeicherten Assessment.",
  "opportunity.no_assessment":
    "Für dieses Engagement gibt es noch kein Assessment mit Ergebnissen. Die Priorisierung setzt darauf auf.",
  "opportunity.none_found":
    "Diese Priorisierung enthält keine Opportunity. Fügen Sie eine hinzu oder erstellen Sie den Entwurf erneut.",

  "opportunity.action.generate": "Opportunities priorisieren",
  "opportunity.action.regenerate": "Aus Assessment neu priorisieren",
  "opportunity.action.generating": "Wird erstellt …",
  "opportunity.action.save": "Opportunities speichern",
  "opportunity.action.saving": "Wird gespeichert …",
  "opportunity.action.accept": "Opportunities annehmen",
  "opportunity.action.add": "Opportunity hinzufügen",
  "opportunity.action.move_up": "Nach oben",
  "opportunity.action.move_down": "Nach unten",
  "opportunity.action.replace_edits":
    "Meine Änderungen ersetzen und neu priorisieren",
  "opportunity.warning.replace_edits":
    "Ein neuer Lauf ersetzt die von Ihnen bearbeitete Priorisierung. Die gespeicherte Fassung lässt sich danach nicht wiederherstellen.",
  "opportunity.warning.ungrounded":
    "Nicht belegte Zitate: {findings}",
  "opportunity.warning.stale":
    "Das Assessment hat sich seit dieser Priorisierung geändert. Eine Neupriorisierung wird empfohlen.",

  "opportunity.rank": "Rang {rank}",
  "opportunity.field.summary": "Gesamtbild der Priorisierung",
  "opportunity.field.title": "Opportunity",
  "opportunity.field.problem": "Problem aus dem Assessment",
  "opportunity.field.improvement": "Verbesserungsansatz",
  "opportunity.field.value": "Nutzen",
  "opportunity.field.effort": "Aufwand",
  "opportunity.field.impact": "Wirkung",
  "opportunity.field.confidence": "Zuversicht",
  "opportunity.confidence_badge": "Zuversicht: {level}",
  "opportunity.field.priority_rationale": "Begründung des Rangs",
  "opportunity.field.assumptions": "Annahmen",
  "opportunity.field.source_findings": "Belegende Assessment-Ergebnisse",
  "opportunity.field.ai_readiness": "Qualifizierung gegen die KI-Reife",
  "opportunity.field.ai_readiness_qualification": "Einstufung",
  "opportunity.field.ai_readiness_rationale": "Begründung",
  "opportunity.field.ai_readiness_blockers": "Voraussetzungen und Hindernisse",
  "opportunity.success_criteria.title": "Erfolgskriterien",
  "opportunity.success_criteria.intro":
    "Halten Sie fest, woran sich der Erfolg später messen lässt. Die KI liefert den Vorschlag, die Kundenseite liefert die Werte, und offene Punkte bleiben ausdrücklich als offen markiert.",
  "opportunity.success_criteria.item": "Kriterium {rank}",
  "opportunity.success_criteria.add": "Erfolgskriterium hinzufügen",
  "opportunity.success_criteria.metric": "Kennzahl",
  "opportunity.success_criteria.measurement_method": "Messmethode",
  "opportunity.success_criteria.data_source": "Datenquelle",
  "opportunity.success_criteria.assumptions": "Annahmen",
  "opportunity.success_criteria.baseline": "Ausgangswert",
  "opportunity.success_criteria.target": "Zielwert",
  "opportunity.success_criteria.timeframe": "Zeitrahmen",
  "opportunity.success_criteria.value_known": "Bekannt",
  "opportunity.success_criteria.value_unknown": "Unbekannt",
  "opportunity.success_criteria.value_placeholder": "Zu definieren",
  "opportunity.success_criteria.source_placeholder":
    "Aus Bericht, System oder Gespräch",
  "opportunity.success_criteria.validation_note_placeholder":
    "Was noch geklärt werden muss",

  "opportunity.source.add": "Ergebnis zitieren",
  "opportunity.source.none":
    "Noch kein Ergebnis zitiert. Jede Opportunity braucht mindestens eines.",
  "opportunity.source.unavailable":
    "Das Assessment enthält keine Ergebnisse, die zitiert werden könnten.",

  "opportunity.gaps.title": "Offene Fragen",
  "opportunity.gaps.intro":
    "Was die Priorisierung nicht klären konnte – festgehalten statt geraten.",
  "opportunity.gaps.empty": "Keine offenen Fragen festgehalten.",
  "opportunity.gaps.placeholder":
    "Was müsste bekannt sein, um die Reihenfolge sicher zu beurteilen?",
  "opportunity.gaps.add": "Offene Frage hinzufügen",

  // --- Solution Matching & Grounded Recommendations (roadmap Phase 6) ------

  "recommendation.confidence.low": "gering",
  "recommendation.confidence.medium": "mittel",
  "recommendation.confidence.high": "hoch",
  "recommendation.effort.low": "gering",
  "recommendation.effort.medium": "mittel",
  "recommendation.effort.high": "hoch",

  "recommendation.review_state.ai_draft": "KI-Entwurf – noch nicht geprüft",
  "recommendation.review_state.consultant_edited": "Von Ihnen bearbeitet",
  "recommendation.review_state.accepted": "Von Ihnen angenommen",

  "recommendation.eyebrow": "Lösungszuordnung",
  "recommendation.title": "Empfehlungen",
  "recommendation.intro":
    "Zu den priorisierten Opportunities passende Lösungsvorschläge, belegt durch die Consulting Knowledge Base und – wo Technologien oder Modelle genannt werden – durch die Technology Knowledge Base. Der Entwurf gehört Ihnen: bearbeiten, neu belegen, verwerfen oder annehmen.",
  "recommendation.empty":
    "Noch keine Empfehlungen. Erstellen Sie einen Entwurf aus den priorisierten Opportunities.",
  "recommendation.no_opportunities":
    "Für dieses Engagement sind noch keine Opportunities priorisiert. Die Lösungszuordnung setzt darauf auf.",
  "recommendation.none_found":
    "Diese Fassung enthält keine Empfehlung. Fügen Sie eine hinzu oder erstellen Sie den Entwurf erneut.",

  "recommendation.action.generate": "Empfehlungen erstellen",
  "recommendation.action.regenerate": "Aus Opportunities neu erstellen",
  "recommendation.action.generating": "Wird erstellt …",
  "recommendation.action.save": "Empfehlungen speichern",
  "recommendation.action.saving": "Wird gespeichert …",
  "recommendation.action.accept": "Empfehlungen annehmen",
  "recommendation.action.add": "Empfehlung hinzufügen",
  "recommendation.action.replace_edits":
    "Meine Änderungen ersetzen und neu erstellen",
  "recommendation.warning.replace_edits":
    "Ein neuer Lauf ersetzt die von Ihnen bearbeiteten Empfehlungen. Die gespeicherte Fassung lässt sich danach nicht wiederherstellen.",
  "recommendation.warning.stale":
    "Die Priorisierung hat sich seit diesen Empfehlungen geändert. Ein neuer Lauf wird empfohlen.",
  "recommendation.warning.ungrounded_opportunities":
    "Nicht vorhandene Opportunities zitiert: {items}",
  "recommendation.warning.ungrounded_knowledge":
    "Nicht vorhandene Einträge der Consulting Knowledge Base zitiert: {items}",
  "recommendation.warning.ungrounded_technology":
    "Nicht vorhandene Technologieprofile genannt: {items}",
  "recommendation.warning.ungrounded_approach":
    "Ohne belegenden AI Use Case oder Solution Pattern: {items}",
  "recommendation.error.incomplete":
    "Mindestens eine Empfehlung ist unvollständig. Titel, Ansatz, Begründung, erwarteter Nutzen mit mindestens einem Werttreiber, eine zugeordnete Opportunity und mindestens ein Wissensbeleg sind erforderlich.",

  "recommendation.field.summary": "Gesamtbild der Lösungszuordnung",
  "recommendation.field.title": "Empfehlung",
  "recommendation.field.approach": "Lösungsansatz",
  "recommendation.field.rationale": "Warum der Ansatz passt",
  "recommendation.field.confidence": "Zuversicht",
  "recommendation.field.effort_level": "Aufwand",
  "recommendation.field.effort_rationale": "Warum dieser Aufwand",
  "recommendation.confidence_badge": "Zuversicht: {level}",
  "recommendation.field.assumptions": "Annahmen",
  "recommendation.field.opportunity": "Adressierte Opportunity",
  "recommendation.field.expected_value": "Erwarteter Nutzen",
  "recommendation.field.expected_value_summary": "Nutzen in Worten",
  "recommendation.field.expected_value_drivers": "Werttreiber",
  "recommendation.hint.pipe": "Mehrere Einträge mit | trennen",
  "recommendation.hint.no_figures":
    "Ohne Zahlen: Ausgangs- und Zielwerte gehören zu den Erfolgskriterien der Opportunity und stammen von der Kundenseite.",
  "recommendation.hint.effort":
    "Qualitativ bleiben: keine Laufzeiten, Budgets, Phasen oder detaillierten Schätzungen.",
  "recommendation.hint.requirements":
    "Jede Empfehlung braucht eine zugeordnete Opportunity, einen qualitativen Aufwand mit Begründung und mindestens einen Beleg aus der Consulting Knowledge Base – darunter mindestens einen AI Use Case oder ein Solution Pattern. Technologien und Modelle dürfen nur aus der Technology Knowledge Base genannt werden.",

  "recommendation.opportunity.select": "Opportunity zuordnen",
  "recommendation.opportunity.none": "Noch keine Opportunity zugeordnet.",
  "recommendation.opportunity.unavailable":
    "Es sind keine Opportunities priorisiert, die zugeordnet werden könnten.",
  "recommendation.opportunity.rank": "Rang {rank}",

  "recommendation.trace.title": "Belege aus Assessment und Discovery",
  "recommendation.trace.empty":
    "Diese Opportunity nennt keine belegenden Discovery-Fakten.",

  "recommendation.knowledge.title": "Belege aus der Consulting Knowledge Base",
  "recommendation.knowledge.add": "Wissenseintrag belegen",
  "recommendation.knowledge.none":
    "Noch kein Eintrag belegt. Jede Empfehlung braucht mindestens einen.",
  "recommendation.knowledge.unavailable":
    "Für dieses Engagement wurde kein Wissenseintrag abgerufen.",
  "recommendation.knowledge.rationale": "Was der Eintrag begründet",
  "recommendation.knowledge.why_retrieved": "Warum abgerufen: {reasons}",

  "recommendation.technology.title": "Technologien und Modelle",
  "recommendation.technology.intro":
    "Nur kuratierte Technologieprofile – genannt mit Begründung, nie erfunden.",
  "recommendation.technology.add": "Technologie belegen",
  "recommendation.technology.none":
    "Keine Technologie genannt. Das ist zulässig: eine Empfehlung muss keine nennen.",
  "recommendation.technology.unavailable":
    "Für dieses Engagement wurde kein Technologieprofil abgerufen.",
  "recommendation.technology.fit_rationale": "Warum diese Technologie passt",

  "recommendation.gaps.title": "Offene Fragen",
  "recommendation.gaps.intro":
    "Was die Lösungszuordnung nicht klären konnte – festgehalten statt geraten.",
  "recommendation.gaps.empty": "Keine offenen Fragen festgehalten.",
  "recommendation.gaps.placeholder":
    "Was fehlt, um diese Opportunity belegbar zu lösen?",
  "recommendation.gaps.add": "Offene Frage hinzufügen",

  // --- the document itself ------------------------------------------------
  // The browser tab and the description a link preview shows are read like any
  // other string, so they are looked up like any other string.
  "app.title": "AI Consulting Workbench",
  "app.description":
    "Mehrbenutzer-Arbeitsbereich für Discovery und Engagements",

  // The address that does not exist. It says nothing about what does: which
  // engagement identifiers are real is not something an unknown URL reveals.
  "not_found.title": "Seite nicht gefunden",
  "not_found.hint":
    "Diese Adresse gibt es nicht – oder sie gehört zu einem Bereich, für den Sie nicht freigeschaltet sind.",
  "not_found.action": "Zur Startseite",

  "shell.brand.eyebrow": "AI Consulting Workbench",
  "shell.brand.title": "AI Consulting Workbench",
  "shell.nav.aria_label": "Primäre Navigation",
  "shell.group.work": "Arbeit",
  "shell.group.knowledge": "Wissen",
  "shell.nav.new_engagement": "Neues Engagement",
  "shell.nav.engagements": "Engagements",
  "shell.nav.knowledge_base": "Consulting Knowledge Base",
  "shell.nav.technology": "Technologien",
  "shell.nav.technology_updates": "Aktualisierungen",
  "shell.breadcrumbs.aria_label": "Navigationspfad",
  "shell.user.unknown": "Unbekannt",
  "shell.user.role.unknown": "Rolle unbekannt",
  "shell.user.role.manager": "Manager",
  "shell.user.role.admin": "Administrator",
  "shell.user.role.client": "Client",

  "workflow.progress.title": "Gesamtfortschritt",
  "workflow.progress.complete": "Vollständig",
  "workflow.progress.partial": "Teilweise ausgefüllt",
  "workflow.progress.not_started": "Nicht begonnen",
  "workflow.progress.action_required": "Angaben erforderlich",
  "workflow.progress.summary": "{completed} von {total} Abschnitten vollständig",

  // --- the methodology stage an engagement stands at ----------------------
  // The stage identifiers are the backend's own enum and stay English on the
  // wire and in storage; only their rendering is German.
  "engagement.stage.discovery": "Discovery",
  "engagement.stage.assessment": "Assessment",
  "engagement.stage.prioritization": "Priorisierung",
  "engagement.stage.solution_matching": "Solution Matching",
  "engagement.stage.roadmap": "Roadmap",
  "engagement.stage.report": "Report",

  "engagement.stage.label": "Aktuelle Phase",
  "engagement.stage.save_failed": "Die Phase konnte nicht gespeichert werden.",

  // --- opening an organization and an engagement (roadmap Phase 1) ---------
  "home.eyebrow": "AI Consulting Workbench",
  "home.title": "Ein Engagement für eine Kundenorganisation eröffnen",
  "home.intro":
    "Legen Sie eine Organisation an, eröffnen Sie ein Engagement dafür und nehmen Sie diese Arbeit jederzeit wieder auf. Discovery-Angaben sind hier optional und können später ergänzt werden.",
  "home.link.engagements": "Alle Engagements ansehen",

  // The three steps are one process, not three unrelated screens: each step
  // becomes available only once the one before it has produced its result.
  "home.step.marker": "Schritt {number} von {total}",
  "home.step.state.open": "Offen",
  "home.step.state.done": "Abgeschlossen",
  "home.step.state.locked": "Noch nicht verfügbar",
  "home.step.locked.needs_organization":
    "Verfügbar, sobald Schritt 1 eine Organisation angelegt hat.",
  "home.step.locked.needs_engagement":
    "Verfügbar, sobald Schritt 2 ein Engagement eröffnet hat.",

  "home.organization.title": "1. Organisation anlegen",
  "home.organization.intro":
    "Das Kundenunternehmen, unter dem seine Engagements zusammenlaufen.",
  "home.organization.name": "Name der Organisation",
  "home.organization.name_placeholder": "Zum Beispiel: Demo Hotel GmbH",
  "home.organization.industry": "Branche (optional)",
  "home.organization.industry_placeholder": "Zum Beispiel: Gastgewerbe",
  "home.organization.company_size": "Unternehmensgröße (optional)",
  "home.organization.submit": "Organisation anlegen",
  "home.organization.ready": "Organisation bereit: {name}",
  "home.organization.required":
    "Legen Sie zuerst eine Organisation an.",

  // The company-size identifiers are the backend's enum values; only their
  // presentation is German.
  "organization.company_size.solo": "Einzelperson",
  "organization.company_size.micro": "Kleinstunternehmen",
  "organization.company_size.small": "Kleinunternehmen",
  "organization.company_size.medium": "Mittelstand",
  "organization.company_size.large": "Großunternehmen",
  "organization.company_size.enterprise": "Konzern",

  "home.engagement.title": "2. Engagement eröffnen",
  "home.engagement.intro":
    "Ein vollständiges Beratungsvorhaben für {organization}. Alle Felder sind optional – ein leeres Engagement ist ein gültiger Ausgangspunkt.",
  "home.engagement.organization_fallback": "die Organisation",
  "home.engagement.title_field": "Titel des Engagements (optional)",
  "home.engagement.title_placeholder":
    "Zum Beispiel: Prüfung der Support-Automatisierung",
  "home.engagement.stated_problem": "Beschriebenes Problem (optional)",
  "home.engagement.stated_problem_placeholder":
    "Welches Problem hat die Kundenseite beschrieben?",
  "home.engagement.current_process": "Aktueller Prozess (optional)",
  "home.engagement.current_process_placeholder": "Wie läuft die Arbeit heute ab?",
  "home.engagement.desired_outcome": "Gewünschtes Ergebnis (optional)",
  "home.engagement.desired_outcome_placeholder":
    "Was soll sich durch die KI-Lösung verbessern?",
  "home.engagement.sensitive_data": "Sensible Daten betroffen",
  "home.engagement.gdpr_concerns": "DSGVO-Bedenken",
  "home.engagement.submit": "Engagement eröffnen",
  "home.engagement.opened": "Engagement eröffnet",
  "home.engagement.opened_stage": "Phase: {stage}",
  "home.engagement.open_workspace": "Arbeitsbereich des Engagements öffnen",
  "home.engagement.required": "Eröffnen Sie zuerst ein Engagement.",

  "home.analysis.title": "3. Analyse ausführen",
  "home.analysis.intro":
    "Dieses Engagement an die Analyse im Backend übergeben und den KI-Lauf festhalten.",
  "home.analysis.requires_engagement":
    "Eröffnen Sie ein Engagement, bevor Sie die Analyse ausführen.",

  // --- the engagement list (roadmap Phase 1) ------------------------------
  "engagements.eyebrow": "AI Consulting Workbench",
  "engagements.title": "Engagements",
  "engagements.intro":
    "Öffnen Sie ein bestehendes Engagement und machen Sie dort weiter, wo es steht.",
  "engagements.action.start_new": "Neues Engagement starten",
  "engagements.empty": "Noch keine Engagements erfasst.",
  "engagements.empty.title": "Noch kein Engagement",
  "engagements.action.create_first": "Erstes Engagement anlegen",
  "engagements.action.open": "Öffnen",
  "engagements.created": "Angelegt: {date}",
  "engagements.load_failed": "Die Engagements konnten nicht geladen werden.",
  "engagements.load_failed.title": "Engagements nicht verfügbar",
  "engagement.untitled": "Engagement ohne Titel",

  // The comparison table. Every column is data the list endpoint already
  // returns — no derived score, no invented metric (UI-KIT §3.8).
  "engagements.table.aria_label": "Engagements im Arbeitsbereich",
  "engagements.column.organization": "Organisation",
  "engagements.column.engagement": "Engagement",
  "engagements.column.stage": "Aktuelle Phase",
  "engagements.column.updated": "Zuletzt geändert",
  "engagements.column.created": "Angelegt",
  "engagements.column.action": "Aktion",
  "engagements.count": "{count} Engagements",
  "engagements.count.one": "1 Engagement",

  // --- one engagement's workspace (roadmap Phase 1) -----------------------
  "engagement.detail.overview": "Überblick",
  "engagement.detail.eyebrow": "AI Consulting Workbench · {stage}",
  "engagement.detail.load_failed_title": "Engagement nicht verfügbar",
  "engagement.detail.load_failed":
    "Dieses Engagement konnte nicht geladen werden.",
  "engagement.discovery.card.title": "Discovery",
  "engagement.discovery.card.hint":
    "Kundendaten, Situation, Wert- und Messbasis sowie offene Lücken erfassen und zur Prüfung geben.",
  "engagement.discovery.card.open": "Discovery öffnen",
  "engagement.info.stated_problem": "Beschriebenes Problem",
  "engagement.info.current_process": "Aktueller Prozess",
  "engagement.info.desired_outcome": "Gewünschtes Ergebnis",
  "engagement.info.sensitive_data": "Sensible Daten",
  "engagement.info.gdpr_concerns": "DSGVO-Bedenken",
  "engagement.info.created": "Angelegt",

  // --- the AI-assisted analysis and its audit trail -----------------------
  "analysis.panel.intro":
    "Jeder KI-gestützte Schritt dieses Engagements wird hier als Lauf festgehalten – mit Modell, Prompt-Version, Kosten und Gültigkeit der Antwort.",
  "analysis.panel.title": "Analyse-Workflow",
  "analysis.action.run": "Analyse ausführen",
  "analysis.action.running": "Analyse läuft …",
  "analysis.result.title": "Analyseergebnis",
  "analysis.result.missing": "Die Antwort enthielt keinen Bericht.",
  "analysis.runs.title": "Verlauf der Läufe",
  "analysis.runs.empty":
    "Für dieses Engagement wurde noch kein KI-gestützter Schritt ausgeführt.",
  "analysis.runs.badge.stage": "Phase: {stage}",
  "analysis.runs.badge.tokens": "{count} Tokens",
  "analysis.runs.badge.cost": "{amount} USD",
  "analysis.runs.badge.schema": "Schema: {validity}",

  // --- the consultant report the analysis produces ------------------------
  // The report's *content* is what the AI wrote; these are the headings the
  // workbench puts around it.
  "report.section.client_summary": "Zusammenfassung für die Kundenseite",
  "report.section.detected_problems": "Erkannte Probleme",
  "report.section.ai_opportunities": "KI-Opportunities",
  "report.section.recommended_solution": "Empfohlene Lösung",
  "report.section.risks": "Risiken",
  "report.section.validation_plan": "Validierungsplan",
  "report.section.follow_up_questions": "Rückfragen",
  "report.section.mvp_plan": "MVP-Plan",
  "report.field.stated_problem": "Beschriebenes Problem",
  "report.field.hidden_problem": "Hypothese zum verdeckten Problem",
  "report.field.business_value": "Geschäftlicher Nutzen",
  "report.field.reason": "Begründung",
  "report.field.architecture_summary": "Architektur im Überblick",
  "report.field.suggested_tools": "Vorgeschlagene Werkzeuge",
  "report.field.mitigation": "Gegenmaßnahme",
  "report.field.hypothesis": "Hypothese",
  "report.field.what_to_check": "Was zu prüfen ist",
  "report.field.required_data": "Benötigte Daten",
  "report.field.data_source": "Datenquelle",
  "report.field.success_criteria": "Erfolgskriterium",
  "report.badge.confidence": "Zuversicht: {level}",
  "report.badge.complexity": "Komplexität: {level}",
  "report.badge.impact": "Wirkung: {level}",
  "report.badge.severity": "Schwere: {level}",
  "report.badge.method": "Methode: {method}",
  "report.badge.priority": "Priorität: {priority}",
  "report.badge.effort": "Aufwand: {effort}",

  // --- Business & AI Readiness Assessment (Phase 3) -----------------------
  "assessment.eyebrow": "Geschäfts- & KI-Reife",
  "assessment.title": "Assessment",
  "assessment.intro":
    "Eine KI-gestützte Lesart des gespeicherten Discovery-Profils über alle sechs Dimensionen. Jedes Ergebnis zeigt, ob es durch Discovery belegt ist oder auf einer Annahme beruht, und wie sicher es ist. Der Entwurf gehört Ihnen: bearbeiten, überschreiben oder annehmen.",
  "assessment.empty":
    "Noch kein Assessment. Halten Sie zuerst das Discovery-Profil fest und erstellen Sie daraus einen Entwurf.",

  "assessment.review_state.ai_draft": "KI-Entwurf – noch nicht geprüft",
  "assessment.review_state.consultant_edited": "Von Ihnen bearbeitet",
  "assessment.review_state.accepted": "Von Ihnen angenommen",

  "assessment.basis.discovery_fact": "Durch Discovery belegt",
  "assessment.basis.assumption": "Beruht auf einer Annahme",

  "assessment.confidence.low": "gering",
  "assessment.confidence.medium": "mittel",
  "assessment.confidence.high": "hoch",

  "assessment.action.generate": "Assessment erstellen",
  "assessment.action.regenerate": "Aus Discovery neu erstellen",
  "assessment.action.generating": "Wird erstellt …",
  "assessment.action.save": "Assessment speichern",
  "assessment.action.accept": "Assessment annehmen",
  "assessment.action.add_finding": "Ergebnis hinzufügen",
  "assessment.action.add_gap": "Lücke hinzufügen",
  "assessment.action.replace_edits":
    "Meine Änderungen ersetzen und neu erstellen",
  "assessment.warning.replace_edits":
    "Ein neuer Lauf ersetzt das von Ihnen bearbeitete Assessment. Die gespeicherte Fassung lässt sich danach nicht wiederherstellen.",
  "assessment.confirm.accepted": "Assessment angenommen",

  "assessment.field.summary": "Gesamtbild",
  "assessment.field.dimension_summary": "Zusammenfassung der Dimension",
  "assessment.finding.empty":
    "Keine Ergebnisse für diese Dimension. Discovery hat keine belegt – ergänzen Sie eigene oder halten Sie das Fehlende als Lücke fest.",
  "assessment.finding.title": "Ergebnis",
  "assessment.finding.basis": "Grundlage",
  "assessment.finding.confidence": "Zuversicht",
  "assessment.finding.confidence_badge": "Zuversicht: {level}",
  "assessment.finding.detail": "Erläuterung",
  "assessment.finding.supporting_facts": "Belegende Discovery-Tatsachen",
  "assessment.finding.assumptions": "Annahmen",

  "assessment.gaps.eyebrow": "Offene Fragen",
  "assessment.gaps.title": "Was das Assessment nicht klären konnte",
  "assessment.gaps.intro":
    "Lücken bleiben sichtbar, statt durch Vermutungen gefüllt zu werden.",
  "assessment.gaps.empty": "Für dieses Assessment sind keine Lücken erfasst.",
  "assessment.gaps.dimension": "Dimension",
  "assessment.gaps.description": "Beschreibung",
  "assessment.gaps.description_placeholder":
    "Was muss noch bekannt sein, um das beurteilen zu können?",
  "assessment.hint.requirements":
    "Jedes Ergebnis braucht einen Titel, eine Erläuterung, eine Zuversicht und – je nach Grundlage – mindestens eine belegende Tatsache oder eine Annahme.",

  // --- Technology Knowledge Base (screens A10, A11, A12) ------------------
  //
  // The identifiers behind these labels — `create`, `revise`, `deprecate`,
  // `pending`, `approved`, `rejected`, `active`, `deprecated` — stay English
  // everywhere they are stored, queried, or contracted. Only what a curator
  // reads is German.

  // The outcomes the technology endpoints report. The server sends an
  // identifier and structured parameters, never prose (coding-standards.md
  // §12A), and every identifier it can send is rendered here.
  "technology.message.loaded": "Geladen",
  "technology.message.category_saved": "Kategorie gespeichert",
  "technology.message.source_saved": "Quelle gespeichert",
  "technology.message.proposal_created":
    "Vorschlag eingereicht. Die Wissensbasis ist bis zur Genehmigung unverändert.",
  "technology.message.proposal_approved":
    "Vorschlag genehmigt und angewendet. Die Änderung ist im Verlauf festgehalten.",
  "technology.message.proposal_rejected":
    "Vorschlag abgelehnt. Es wurde nichts geändert.",
  "technology.message.retrieval_previewed": "Vorschau erstellt",
  "technology.error.invalid_input":
    "Die Angaben sind unvollständig oder ungültig.",
  "technology.error.not_found": "Dieser Eintrag wurde nicht gefunden.",
  "technology.error.duplicate_code":
    "Diese Kennung ist bereits vergeben. Bestehende Einträge werden nicht überschrieben.",
  "technology.error.conflict":
    "Der Eintrag wurde zwischenzeitlich geändert. Bitte neu laden und erneut speichern.",
  "technology.error.unknown_category":
    "Diese Kategorie gibt es nicht oder sie ist zurückgezogen. Jedes Profil gehört zu genau einer gültigen Kategorie.",
  "technology.error.unknown_source":
    "Der Vorschlag zitiert eine Quelle, die nicht im Verzeichnis vertrauenswürdiger Herkünfte steht.",
  "technology.error.profile_exists":
    "Dieses Profil gibt es bereits. Schlagen Sie eine Überarbeitung statt einer Neuanlage vor.",
  "technology.error.profile_missing":
    "Dieses Profil gibt es nicht. Schlagen Sie eine Neuanlage statt einer Überarbeitung vor.",
  "technology.error.proposal_content_required":
    "Für eine Neuanlage oder Überarbeitung fehlt der vorgeschlagene Profilinhalt.",
  "technology.error.proposal_content_not_allowed":
    "Eine Abkündigung darf den Profilinhalt nicht zugleich neu fassen.",
  "technology.error.proposal_category_mismatch":
    "Der Profilinhalt nennt eine andere Kategorie als der Vorschlag.",
  "technology.error.proposal_code_mismatch":
    "Der Profilinhalt nennt eine andere Kennung als der Vorschlag.",
  "technology.error.already_decided":
    "Über diesen Vorschlag wurde bereits entschieden. Eine Entscheidung ist endgültig.",
  "technology.error.apply_failed":
    "Die Wissensbasis hat sich seit dem Vorschlag verändert, sodass er nicht mehr angewendet werden kann. Bitte neu vorschlagen.",
  "technology.error.internal":
    "Unerwarteter Serverfehler. Die Technology Knowledge Base wurde nicht verändert.",

  "technology.access_denied":
    "Die Technology Knowledge Base wird ausschließlich von Administratoren gepflegt. Ihre Rolle hat darauf keinen Zugriff.",

  "technology.library.title": "Technology Knowledge Base",
  "technology.library.intro":
    "Kuratierte Technologie- und Modellprofile, nach Kategorien geordnet. Sie begründen später die Technologien, die eine Empfehlung benennt.",
  "technology.library.error":
    "Die Technology Knowledge Base konnte nicht geladen werden.",
  "technology.library.filter.title": "Filter",
  "technology.library.filter.category": "Kategorie",
  "technology.library.filter.all_categories": "Alle Kategorien",
  "technology.library.filter.query": "Suche",
  "technology.library.filter.apply": "Anwenden",
  "technology.library.propose_new": "Neues Profil vorschlagen",
  "technology.library.propose_revision": "Überarbeitung vorschlagen",
  "technology.library.propose_deprecation": "Abkündigung vorschlagen",
  "technology.library.profiles.title": "Technologieprofile",
  "technology.library.profiles.hint":
    "Jedes Profil gehört zu genau einer Kategorie. Änderungen erreichen die Wissensbasis nur über einen genehmigten Vorschlag.",
  "technology.library.empty.title": "Keine Profile gefunden",
  "technology.library.empty.description":
    "Passen Sie den Filter an oder schlagen Sie ein neues Technologieprofil vor.",
  "technology.library.sources.title": "Offizielle Quellen",
  "technology.library.sources.hint":
    "Das Verzeichnis vertrauenswürdiger Herkünfte. Ein Vorschlag darf nur Quellen zitieren, die hier geführt sind.",

  "technology.status.active": "Aktiv",
  "technology.status.deprecated": "Abgekündigt",

  "technology.change_kind.create": "Neu",
  "technology.change_kind.revise": "Überarbeitung",
  "technology.change_kind.deprecate": "Abkündigung",

  "technology.proposal_status.pending": "Offen",
  "technology.proposal_status.approved": "Genehmigt",
  "technology.proposal_status.rejected": "Abgelehnt",

  "technology.profile.role": "Rolle",
  "technology.profile.strengths": "Stärken",
  "technology.profile.limitations": "Grenzen",
  "technology.profile.suitability": "Eignung",
  "technology.profile.revision": "Revision {revision}",

  // Origin metadata, deliberately worded so it can never be read as approval:
  // the seeded wording names the official source and says outright that no
  // approval has taken place.
  "technology.profile.origin.product_seed":
    "Erstbestand des Produkts, Quelle: {sources} — bisher ohne genehmigte Aktualisierung.",
  "technology.profile.origin.curator":
    "Durch eine genehmigte Aktualisierung gepflegt; die Herkunft steht im Änderungsverlauf.",
  "technology.origin.product_seed": "Erstbestand",
  "technology.origin.curator": "Kuratiert",

  "technology.field.title": "Titel",
  "technology.field.summary": "Zusammenfassung",
  "technology.field.categoryCode": "Kategorie",
  "technology.field.status": "Status",
  "technology.field.role": "Rolle",
  "technology.field.strengths": "Stärken",
  "technology.field.limitations": "Grenzen",
  "technology.field.suitability": "Eignung",
  "technology.field.matchTerms": "Suchbegriffe",
  "technology.field.tags": "Schlagworte",

  "technology.proposal.title": "Änderung vorschlagen",
  "technology.proposal.gate_hint":
    "Ein Vorschlag ändert noch nichts. Er wird von einer Administratorin oder einem Administrator geprüft und erst mit der Genehmigung wirksam.",
  "technology.proposal.change_kind": "Art der Änderung",
  "technology.proposal.profile_code": "Profilkennung",
  "technology.proposal.category": "Kategorie",
  "technology.proposal.profile_title": "Titel",
  "technology.proposal.summary": "Zusammenfassung",
  "technology.proposal.match_terms": "Suchbegriffe",
  "technology.proposal.tags": "Schlagworte",
  "technology.proposal.rationale": "Begründung",
  "technology.proposal.assumptions": "Annahmen",
  "technology.proposal.gaps": "Offene Punkte",
  "technology.proposal.sources": "Offizielle Quellen",
  "technology.proposal.sources_hint":
    "Mindestens eine Quelle ist erforderlich. Ohne belegte Herkunft ist eine Änderung nicht nachvollziehbar.",
  "technology.proposal.submit": "Vorschlag einreichen",
  "technology.proposal.submitted":
    "Der Vorschlag wurde eingereicht und wartet auf Genehmigung. Die Wissensbasis ist unverändert.",
  "technology.proposal.validation":
    "Profilkennung, Begründung und mindestens eine offizielle Quelle sind erforderlich.",

  "technology.proposals.title": "Technologie-Aktualisierungen",
  "technology.proposals.intro":
    "Vorgeschlagene Änderungen an der Technology Knowledge Base, mit ihrer Herkunft und ihren offenen Punkten.",
  "technology.proposals.hint":
    "Eine Änderung wird erst mit der ausdrücklichen Genehmigung wirksam. Eine Ablehnung verändert nichts und erzeugt keinen Verlaufseintrag.",
  "technology.proposals.error":
    "Die Vorschläge konnten nicht geladen werden.",
  "technology.proposals.filter.status": "Status",
  "technology.proposals.filter.all": "Alle",
  "technology.proposals.empty.title": "Keine Vorschläge",
  "technology.proposals.empty.description":
    "Es liegt derzeit kein Vorschlag mit diesem Status vor.",
  "technology.proposals.decided": "Die Entscheidung wurde festgehalten.",

  "technology.review.title": "Vorschlag prüfen",
  "technology.review.profile": "Profil",
  "technology.review.category": "Kategorie",
  "technology.review.change_kind": "Art der Änderung",
  "technology.review.created": "Eingereicht",
  "technology.review.rationale": "Begründung",
  "technology.review.assumptions": "Annahmen",
  "technology.review.gaps": "Offene Punkte",
  "technology.review.none_stated": "Keine angegeben.",
  "technology.review.sources": "Offizielle Quellen",
  "technology.review.diff": "Gegenüberstellung",
  "technology.review.diff.field": "Feld",
  "technology.review.diff.before": "Bisher",
  "technology.review.diff.after": "Vorgeschlagen",
  "technology.review.diff.empty": "—",
  "technology.review.note": "Anmerkung zur Entscheidung",
  "technology.review.gate_hint":
    "Mit der Genehmigung wird die Änderung angewendet und im Verlauf festgehalten. Beides geschieht gemeinsam oder gar nicht.",
  "technology.review.approve": "Genehmigen und anwenden",
  "technology.review.reject": "Ablehnen",
  "technology.review.already_decided":
    "Dieser Vorschlag wurde bereits entschieden: {status}.",

  "technology.history.title": "Änderungsverlauf",
  "technology.history.intro":
    "Der fortschreibende Nachweis genehmigter und angewendeter Änderungen an der Technology Knowledge Base.",
  "technology.history.hint":
    "Einträge werden ausschließlich angefügt. Sie werden nie überschrieben oder gelöscht, und abgelehnte Vorschläge erscheinen hier nicht.",
  "technology.history.error":
    "Der Änderungsverlauf konnte nicht geladen werden.",
  "technology.history.empty.title": "Noch keine genehmigten Änderungen",
  "technology.history.empty.description":
    "Sobald ein Vorschlag genehmigt und angewendet wurde, erscheint er hier.",
  "technology.history.column.applied_at": "Angewendet",
  "technology.history.column.profile": "Profil",
  "technology.history.column.change": "Änderung",
  "technology.history.column.sources": "Quellen",
  "technology.history.column.approver": "Genehmigt von",
  "technology.history.no_sources": "Keine",
  "technology.history.unknown_approver": "Unbekannt",

  "opportunity.hint.pipe": "Einträge mit senkrechtem Strich (|) trennen.",
  "opportunity.hint.requirements":
    "Jede Opportunity braucht ein Problem, einen Verbesserungsansatz, mindestens ein zitiertes Assessment-Ergebnis, mindestens ein Erfolgskriterium und eine Begründung ihres Rangs. Eine Einstufung unterhalb von „KI-bereit“ muss mindestens eine Voraussetzung nennen, und bei geringer Zuversicht ist mindestens eine Annahme zu nennen.",
} as const

export const de = {
  ...serverMessages,
  ...opportunityServerMessages,
  ...recommendationServerMessages,
  ...workbenchServerMessages,
  ...uiMessages,
}

export type MessageKey = keyof typeof de
