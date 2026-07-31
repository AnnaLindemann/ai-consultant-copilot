import type { DiscoveryMessageId } from "../../shared/discovery-messages"

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

const uiMessages = {
  // --- generic -----------------------------------------------------------
  "common.error.unexpected": "Unerwarteter Fehler. Bitte erneut versuchen.",
  "common.field.not_captured": "Nicht erfasst",
  "common.field.comma_hint": "Einträge mit Komma trennen.",
  "common.field.yes": "Ja",
  "common.field.no": "Nein",
  "common.action.remove": "Entfernen",
  "common.currency.eur": "Euro",
  "common.currency.usd": "US-Dollar",
  "common.currency.gbp": "Britisches Pfund",
  "common.currency.other": "Andere Währung",

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
  "discovery.editor.intro":
    "Halten Sie fest, was über den Kundenbetrieb bekannt ist, beziffern Sie, was das Problem heute kostet und wie Erfolg aussehen würde, und führen Sie jede offene Lücke ausdrücklich auf. Kehren Sie zu diesem Profil zurück, sobald die Kundenseite bessere Informationen liefert.",
  "discovery.editor.eyebrow": "Phase 2 · Client Discovery",
  "discovery.editor.title": "Discovery-Profil",
  "discovery.editor.contributor.label": "Erfasst von",
  "discovery.editor.save": "Discovery-Profil speichern",
  "discovery.editor.saving": "Speichere …",
  "discovery.editor.save_failed": "Das Discovery-Profil konnte nicht gespeichert werden.",

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
} as const

export const de = { ...serverMessages, ...uiMessages }

export type MessageKey = keyof typeof de
