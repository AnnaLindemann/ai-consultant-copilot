import type { MessageKey } from "../i18n/de"
import type { DiscoveryGapCategory } from "../../shared/discovery-profile.schema"

// The help a Discovery field carries, as data rather than as markup.
//
// Every difficult field can offer three levels of help — a short explanation, a
// set of suggested answers, and concrete examples — plus, where the question
// genuinely may not have an answer yet, an explicit "not known yet". Holding
// that as a table has two effects worth the indirection: the same field is
// explained identically wherever it is asked, and the explanations are
// checkable by a test instead of being scattered through JSX.
//
// Only message *keys* live here. The German wording lives in the catalogue like
// every other user-facing string (coding-standards.md §12A), and the field
// identifiers are the Discovery Profile's own English field names.

export type DiscoveryAudience = "consultant" | "client"

export type DiscoveryFieldId =
  | "department"
  | "affectedUsers"
  | "notes"
  | "statedProblem"
  | "painPoints"
  | "businessImpact"
  | "currentProcess"
  | "processSteps"
  | "bottlenecks"
  | "currentTools"
  | "communicationChannels"
  | "integrationNeeds"
  | "dataTypes"
  | "dataLocation"
  | "sensitiveDataTypes"
  | "technicalConstraints"
  | "budgetNotes"
  | "desiredOutcome"
  | "successMetrics"
  | "mvpScope"

// One suggested answer. `insertKey` is the editable sentence a text field
// receives when the suggestion is chosen — a suggestion inserts a phrase the
// user can then rewrite, never an opaque code and never a locked-in value.
// `descriptionKey` explains a suggestion that is not self-explanatory, which is
// what keeps a metric list from becoming a row of unexplained abbreviations.
export type DiscoverySuggestion = {
  id: string
  labelKey: MessageKey
  insertKey?: MessageKey
  descriptionKey?: MessageKey
}

export type DiscoveryFieldGuidance = {
  /** The field's own label, reused when its state is reported elsewhere. */
  labelKey: MessageKey
  /** Plain-language explanation. Both audiences see it. */
  hintKey: MessageKey
  /** Consulting context: how the answer is used later. Consultant only. */
  consultantHintKey?: MessageKey
  suggestionsKey?: MessageKey
  suggestions?: readonly DiscoverySuggestion[]
  exampleKeys?: readonly MessageKey[]
  /**
   * Where an explicit "not known yet" is recorded. The Discovery Profile has no
   * per-field unknown flag, so it is carried as the missing-information gap the
   * contract already defines — an unanswered question is a finding, not an
   * empty field (domain-model.md §2).
   */
  unknownGapCategory?: DiscoveryGapCategory
}

const outcomeSuggestion = (
  id: string,
  labelKey: MessageKey,
  insertKey: MessageKey,
): DiscoverySuggestion => ({ id, labelKey, insertKey })

const describedSuggestion = (
  id: string,
  labelKey: MessageKey,
  descriptionKey: MessageKey,
): DiscoverySuggestion => ({ id, labelKey, descriptionKey })

const plainSuggestion = (id: string, labelKey: MessageKey): DiscoverySuggestion => ({
  id,
  labelKey,
})

// --- Ziele & Erfolg ---------------------------------------------------------
// The desired result is a sentence, so each suggestion carries the editable
// sentence it inserts rather than a bare noun.
const OUTCOME_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  outcomeSuggestion(
    "shorten_processing_time",
    "discovery.suggestion.outcome.shorten_processing_time",
    "discovery.suggestion.outcome.shorten_processing_time.insert",
  ),
  outcomeSuggestion(
    "shorten_response_time",
    "discovery.suggestion.outcome.shorten_response_time",
    "discovery.suggestion.outcome.shorten_response_time.insert",
  ),
  outcomeSuggestion(
    "reduce_error_rate",
    "discovery.suggestion.outcome.reduce_error_rate",
    "discovery.suggestion.outcome.reduce_error_rate.insert",
  ),
  outcomeSuggestion(
    "relieve_staff",
    "discovery.suggestion.outcome.relieve_staff",
    "discovery.suggestion.outcome.relieve_staff.insert",
  ),
  outcomeSuggestion(
    "raise_customer_satisfaction",
    "discovery.suggestion.outcome.raise_customer_satisfaction",
    "discovery.suggestion.outcome.raise_customer_satisfaction.insert",
  ),
  outcomeSuggestion(
    "reduce_cost",
    "discovery.suggestion.outcome.reduce_cost",
    "discovery.suggestion.outcome.reduce_cost.insert",
  ),
  outcomeSuggestion(
    "improve_transparency",
    "discovery.suggestion.outcome.improve_transparency",
    "discovery.suggestion.outcome.improve_transparency.insert",
  ),
  outcomeSuggestion(
    "reduce_manual_work",
    "discovery.suggestion.outcome.reduce_manual_work",
    "discovery.suggestion.outcome.reduce_manual_work.insert",
  ),
  outcomeSuggestion(
    "raise_revenue",
    "discovery.suggestion.outcome.raise_revenue",
    "discovery.suggestion.outcome.raise_revenue.insert",
  ),
  outcomeSuggestion(
    "improve_compliance",
    "discovery.suggestion.outcome.improve_compliance",
    "discovery.suggestion.outcome.improve_compliance.insert",
  ),
]

// Each metric is explained, so nobody has to guess what it counts.
const METRIC_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  describedSuggestion(
    "processing_time",
    "discovery.suggestion.metric.processing_time",
    "discovery.suggestion.metric.processing_time.description",
  ),
  describedSuggestion(
    "first_response_time",
    "discovery.suggestion.metric.first_response_time",
    "discovery.suggestion.metric.first_response_time.description",
  ),
  describedSuggestion(
    "resolution_rate",
    "discovery.suggestion.metric.resolution_rate",
    "discovery.suggestion.metric.resolution_rate.description",
  ),
  describedSuggestion(
    "error_rate",
    "discovery.suggestion.metric.error_rate",
    "discovery.suggestion.metric.error_rate.description",
  ),
  describedSuggestion(
    "manual_steps",
    "discovery.suggestion.metric.manual_steps",
    "discovery.suggestion.metric.manual_steps.description",
  ),
  describedSuggestion(
    "cost_per_case",
    "discovery.suggestion.metric.cost_per_case",
    "discovery.suggestion.metric.cost_per_case.description",
  ),
  describedSuggestion(
    "customer_satisfaction",
    "discovery.suggestion.metric.customer_satisfaction",
    "discovery.suggestion.metric.customer_satisfaction.description",
  ),
  describedSuggestion(
    "staff_effort",
    "discovery.suggestion.metric.staff_effort",
    "discovery.suggestion.metric.staff_effort.description",
  ),
  describedSuggestion(
    "escalations",
    "discovery.suggestion.metric.escalations",
    "discovery.suggestion.metric.escalations.description",
  ),
  describedSuggestion(
    "revenue",
    "discovery.suggestion.metric.revenue",
    "discovery.suggestion.metric.revenue.description",
  ),
  describedSuggestion(
    "conversion_rate",
    "discovery.suggestion.metric.conversion_rate",
    "discovery.suggestion.metric.conversion_rate.description",
  ),
]

const PROBLEM_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  plainSuggestion("manual_effort", "discovery.suggestion.problem.manual_effort"),
  plainSuggestion("processing_time", "discovery.suggestion.problem.processing_time"),
  plainSuggestion("frequent_errors", "discovery.suggestion.problem.frequent_errors"),
  plainSuggestion("duplicate_entry", "discovery.suggestion.problem.duplicate_entry"),
  plainSuggestion("no_transparency", "discovery.suggestion.problem.no_transparency"),
  plainSuggestion("delayed_response", "discovery.suggestion.problem.delayed_response"),
  plainSuggestion("hard_prioritization", "discovery.suggestion.problem.hard_prioritization"),
  plainSuggestion("key_person_risk", "discovery.suggestion.problem.key_person_risk"),
]

const IMPACT_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  outcomeSuggestion(
    "extra_cost",
    "discovery.suggestion.impact.extra_cost",
    "discovery.suggestion.impact.extra_cost.insert",
  ),
  outcomeSuggestion(
    "customer_dissatisfaction",
    "discovery.suggestion.impact.customer_dissatisfaction",
    "discovery.suggestion.impact.customer_dissatisfaction.insert",
  ),
  outcomeSuggestion(
    "staff_overload",
    "discovery.suggestion.impact.staff_overload",
    "discovery.suggestion.impact.staff_overload.insert",
  ),
  outcomeSuggestion(
    "lost_revenue",
    "discovery.suggestion.impact.lost_revenue",
    "discovery.suggestion.impact.lost_revenue.insert",
  ),
  outcomeSuggestion(
    "compliance_risk",
    "discovery.suggestion.impact.compliance_risk",
    "discovery.suggestion.impact.compliance_risk.insert",
  ),
  outcomeSuggestion(
    "poor_data_quality",
    "discovery.suggestion.impact.poor_data_quality",
    "discovery.suggestion.impact.poor_data_quality.insert",
  ),
  outcomeSuggestion(
    "delayed_decisions",
    "discovery.suggestion.impact.delayed_decisions",
    "discovery.suggestion.impact.delayed_decisions.insert",
  ),
]

const ROLE_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  plainSuggestion("service_team", "discovery.suggestion.role.service_team"),
  plainSuggestion("sales", "discovery.suggestion.role.sales"),
  plainSuggestion("back_office", "discovery.suggestion.role.back_office"),
  plainSuggestion("team_lead", "discovery.suggestion.role.team_lead"),
  plainSuggestion("it", "discovery.suggestion.role.it"),
  plainSuggestion("management", "discovery.suggestion.role.management"),
  plainSuggestion("customers", "discovery.suggestion.role.customers"),
]

const PROCESS_STEP_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  plainSuggestion("intake", "discovery.suggestion.process_step.intake"),
  plainSuggestion("triage", "discovery.suggestion.process_step.triage"),
  plainSuggestion("research", "discovery.suggestion.process_step.research"),
  plainSuggestion("decision", "discovery.suggestion.process_step.decision"),
  plainSuggestion("handover", "discovery.suggestion.process_step.handover"),
  plainSuggestion("approval", "discovery.suggestion.process_step.approval"),
  plainSuggestion("documentation", "discovery.suggestion.process_step.documentation"),
  plainSuggestion("closing", "discovery.suggestion.process_step.closing"),
]

const BOTTLENECK_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  plainSuggestion("waiting_for_approval", "discovery.suggestion.bottleneck.waiting_for_approval"),
  plainSuggestion("media_break", "discovery.suggestion.bottleneck.media_break"),
  plainSuggestion("manual_research", "discovery.suggestion.bottleneck.manual_research"),
  plainSuggestion("unclear_ownership", "discovery.suggestion.bottleneck.unclear_ownership"),
  plainSuggestion("peak_load", "discovery.suggestion.bottleneck.peak_load"),
  plainSuggestion("missing_information", "discovery.suggestion.bottleneck.missing_information"),
]

// Categories, deliberately not brand names: a product is named only if the
// client's own answer names it (UI-KIT: no invented client context).
const TOOL_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  plainSuggestion("crm", "discovery.suggestion.tool.crm"),
  plainSuggestion("erp", "discovery.suggestion.tool.erp"),
  plainSuggestion("ticket_system", "discovery.suggestion.tool.ticket_system"),
  plainSuggestion("spreadsheets", "discovery.suggestion.tool.spreadsheets"),
  plainSuggestion("shared_drive", "discovery.suggestion.tool.shared_drive"),
  plainSuggestion("paper", "discovery.suggestion.tool.paper"),
]

const CHANNEL_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  plainSuggestion("email", "discovery.suggestion.channel.email"),
  plainSuggestion("telephone", "discovery.suggestion.channel.telephone"),
  plainSuggestion("chat", "discovery.suggestion.channel.chat"),
  plainSuggestion("web_form", "discovery.suggestion.channel.web_form"),
  plainSuggestion("portal", "discovery.suggestion.channel.portal"),
  plainSuggestion("in_person", "discovery.suggestion.channel.in_person"),
]

const DATA_TYPE_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  plainSuggestion("customer_records", "discovery.suggestion.data_type.customer_records"),
  plainSuggestion("tickets", "discovery.suggestion.data_type.tickets"),
  plainSuggestion("emails", "discovery.suggestion.data_type.emails"),
  plainSuggestion("documents", "discovery.suggestion.data_type.documents"),
  plainSuggestion("orders", "discovery.suggestion.data_type.orders"),
  plainSuggestion("call_notes", "discovery.suggestion.data_type.call_notes"),
]

const DATA_LOCATION_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  plainSuggestion("crm", "discovery.suggestion.data_location.crm"),
  plainSuggestion("erp", "discovery.suggestion.data_location.erp"),
  plainSuggestion("mailbox", "discovery.suggestion.data_location.mailbox"),
  plainSuggestion("file_share", "discovery.suggestion.data_location.file_share"),
  plainSuggestion("spreadsheets", "discovery.suggestion.data_location.spreadsheets"),
  plainSuggestion("paper_archive", "discovery.suggestion.data_location.paper_archive"),
]

const CONSTRAINT_SUGGESTIONS: readonly DiscoverySuggestion[] = [
  plainSuggestion("data_protection", "discovery.suggestion.constraint.data_protection"),
  plainSuggestion("it_security", "discovery.suggestion.constraint.it_security"),
  plainSuggestion("legal", "discovery.suggestion.constraint.legal"),
  plainSuggestion("internal_capacity", "discovery.suggestion.constraint.internal_capacity"),
  plainSuggestion("integrations", "discovery.suggestion.constraint.integrations"),
  plainSuggestion("change_management", "discovery.suggestion.constraint.change_management"),
]

export const DISCOVERY_FIELD_GUIDANCE: Record<
  DiscoveryFieldId,
  DiscoveryFieldGuidance
> = {
  department: {
    labelKey: "discovery.profile.department",
    hintKey: "discovery.help.department.client",
    exampleKeys: [
      "discovery.help.department.example.1",
      "discovery.help.department.example.2",
    ],
    unknownGapCategory: "situation",
  },
  affectedUsers: {
    labelKey: "discovery.profile.affected_users",
    hintKey: "discovery.help.affected_users.client",
    consultantHintKey: "discovery.help.affected_users.consultant",
    suggestionsKey: "discovery.suggestion.group.role",
    suggestions: ROLE_SUGGESTIONS,
    unknownGapCategory: "situation",
  },
  notes: {
    labelKey: "discovery.profile.notes",
    hintKey: "discovery.help.notes.client",
  },
  statedProblem: {
    labelKey: "discovery.profile.stated_problem",
    hintKey: "discovery.help.stated_problem.client",
    consultantHintKey: "discovery.help.stated_problem.consultant",
    exampleKeys: [
      "discovery.help.stated_problem.example.1",
      "discovery.help.stated_problem.example.2",
    ],
    unknownGapCategory: "problems",
  },
  painPoints: {
    labelKey: "discovery.profile.pain_points",
    hintKey: "discovery.help.pain_points.client",
    suggestionsKey: "discovery.suggestion.group.problem",
    suggestions: PROBLEM_SUGGESTIONS,
    unknownGapCategory: "problems",
  },
  businessImpact: {
    labelKey: "discovery.profile.business_impact",
    hintKey: "discovery.help.business_impact.client",
    consultantHintKey: "discovery.help.business_impact.consultant",
    suggestionsKey: "discovery.suggestion.group.impact",
    suggestions: IMPACT_SUGGESTIONS,
    exampleKeys: ["discovery.help.business_impact.example.1"],
    unknownGapCategory: "problems",
  },
  currentProcess: {
    labelKey: "discovery.profile.current_process",
    hintKey: "discovery.help.current_process.client",
    consultantHintKey: "discovery.help.current_process.consultant",
    exampleKeys: [
      "discovery.help.current_process.example.1",
      "discovery.help.current_process.example.2",
    ],
    unknownGapCategory: "current_process",
  },
  processSteps: {
    labelKey: "discovery.profile.process_steps",
    hintKey: "discovery.help.process_steps.client",
    suggestionsKey: "discovery.suggestion.group.process_step",
    suggestions: PROCESS_STEP_SUGGESTIONS,
    unknownGapCategory: "current_process",
  },
  bottlenecks: {
    labelKey: "discovery.profile.bottlenecks",
    hintKey: "discovery.help.bottlenecks.client",
    consultantHintKey: "discovery.help.bottlenecks.consultant",
    suggestionsKey: "discovery.suggestion.group.bottleneck",
    suggestions: BOTTLENECK_SUGGESTIONS,
    unknownGapCategory: "current_process",
  },
  currentTools: {
    labelKey: "discovery.profile.current_tools",
    hintKey: "discovery.help.current_tools.client",
    consultantHintKey: "discovery.help.current_tools.consultant",
    suggestionsKey: "discovery.suggestion.group.tool",
    suggestions: TOOL_SUGGESTIONS,
    unknownGapCategory: "tools",
  },
  communicationChannels: {
    labelKey: "discovery.profile.communication_channels",
    hintKey: "discovery.help.communication_channels.client",
    suggestionsKey: "discovery.suggestion.group.channel",
    suggestions: CHANNEL_SUGGESTIONS,
    unknownGapCategory: "tools",
  },
  integrationNeeds: {
    labelKey: "discovery.profile.integration_needs",
    hintKey: "discovery.help.integration_needs.client",
    consultantHintKey: "discovery.help.integration_needs.consultant",
    unknownGapCategory: "tools",
  },
  dataTypes: {
    labelKey: "discovery.profile.data_types",
    hintKey: "discovery.help.data_types.client",
    consultantHintKey: "discovery.help.data_types.consultant",
    suggestionsKey: "discovery.suggestion.group.data_type",
    suggestions: DATA_TYPE_SUGGESTIONS,
    unknownGapCategory: "data",
  },
  dataLocation: {
    labelKey: "discovery.profile.data_locations",
    hintKey: "discovery.help.data_locations.client",
    suggestionsKey: "discovery.suggestion.group.data_location",
    suggestions: DATA_LOCATION_SUGGESTIONS,
    unknownGapCategory: "data",
  },
  sensitiveDataTypes: {
    labelKey: "discovery.profile.sensitive_data_types",
    hintKey: "discovery.help.sensitive_data_types.client",
    consultantHintKey: "discovery.help.sensitive_data_types.consultant",
    unknownGapCategory: "data",
  },
  technicalConstraints: {
    labelKey: "discovery.profile.technical_constraints",
    hintKey: "discovery.help.technical_constraints.client",
    consultantHintKey: "discovery.help.technical_constraints.consultant",
    suggestionsKey: "discovery.suggestion.group.constraint",
    suggestions: CONSTRAINT_SUGGESTIONS,
    unknownGapCategory: "constraints",
  },
  budgetNotes: {
    labelKey: "discovery.profile.budget_notes",
    hintKey: "discovery.help.budget_notes.client",
    unknownGapCategory: "constraints",
  },
  desiredOutcome: {
    labelKey: "discovery.profile.desired_outcome",
    hintKey: "discovery.help.desired_outcome.client",
    consultantHintKey: "discovery.help.desired_outcome.consultant",
    suggestionsKey: "discovery.suggestion.group.outcome",
    suggestions: OUTCOME_SUGGESTIONS,
    exampleKeys: [
      "discovery.help.desired_outcome.example.1",
      "discovery.help.desired_outcome.example.2",
      "discovery.help.desired_outcome.example.3",
    ],
    unknownGapCategory: "goals",
  },
  successMetrics: {
    labelKey: "discovery.profile.success_metrics",
    hintKey: "discovery.help.success_metrics.client",
    consultantHintKey: "discovery.help.success_metrics.consultant",
    suggestionsKey: "discovery.suggestion.group.metric",
    suggestions: METRIC_SUGGESTIONS,
    unknownGapCategory: "goals",
  },
  mvpScope: {
    labelKey: "discovery.profile.mvp_scope",
    hintKey: "discovery.help.mvp_scope.client",
    consultantHintKey: "discovery.help.mvp_scope.consultant",
    unknownGapCategory: "goals",
  },
}

// The explanations one audience sees. The plain-language explanation is the
// same for everyone; the consultant additionally sees how the answer is used
// downstream. Neither ever exposes prompts, models, or internals.
export const guidanceHintKeys = (
  field: DiscoveryFieldId,
  audience: DiscoveryAudience,
): readonly MessageKey[] => {
  const guidance = DISCOVERY_FIELD_GUIDANCE[field]
  const consultantHint =
    audience === "consultant" ? guidance.consultantHintKey : undefined

  return consultantHint ? [guidance.hintKey, consultantHint] : [guidance.hintKey]
}

export const hasGuidance = (field: DiscoveryFieldId): boolean =>
  Object.hasOwn(DISCOVERY_FIELD_GUIDANCE, field)
