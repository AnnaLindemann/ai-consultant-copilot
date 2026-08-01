"use client"

import DiscoveryBaselineEditor from "./DiscoveryBaselineEditor"
import { GuidedListField, GuidedTextField } from "./FieldGuidance"
import type { WorkflowSectionItem } from "./WorkflowPrimitives"
import {
  BooleanField,
  DiscoverySection,
  NumberField,
  SelectField,
  addButtonStyle,
  eyebrowStyle,
  fieldStyle,
  inputStyle,
  introStyle,
  removeButtonStyle,
} from "./DiscoveryFields"
import { t } from "../i18n"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"
import {
  DISCOVERY_FIELD_GUIDANCE,
  type DiscoveryAudience,
  type DiscoveryFieldId,
} from "../lib/discovery-guidance"
import {
  clearFieldUnknown,
  isFieldUnknown,
  markFieldUnknown,
  unknownGapField,
} from "../lib/discovery-unknown"
import {
  getDiscoverySectionStatus,
  type DiscoverySectionKey,
} from "../lib/discovery-status"
import type { WorkflowSectionStatus } from "../lib/workflow-status"

import type {
  DiscoveryGap,
  DiscoveryGapCategory,
  DiscoveryProfile,
  ValueMeasurementBaseline,
} from "../../shared/discovery-profile.schema"
import type { DiscoveryWorkflowState } from "../../shared/discovery-workflow.schema"

// The sections a Discovery Profile is asked in, how complete each one is, and
// the help each question carries. One definition, used by both surfaces that
// capture Discovery — the consultant's workspace and the Client Portal — so the
// two can never drift into asking different questions, judging completeness
// differently, or explaining the same field two ways. Only the consulting
// context differs, and that difference is the `audience`.

export type DiscoveryFieldSetter = <K extends keyof DiscoveryProfile>(
  field: K,
  value: DiscoveryProfile[K],
) => void

export type DiscoverySectionConfig = {
  profile: DiscoveryProfile
  workflow: DiscoveryWorkflowState
  audience: DiscoveryAudience
  gapCategory: DiscoveryGapCategory
  gapDescription: string
  setField: DiscoveryFieldSetter
  setGapCategory: (value: DiscoveryGapCategory) => void
  setGapDescription: (value: string) => void
  addGap: () => void
  removeGap: (index: number) => void
  /** Used by the goals section to send the reader to the baseline section. */
  onOpenSection: (sectionId: string) => void
}

const levelOptions = ["low", "medium", "high"] as const

const LEVEL_LABELS = {
  low: t("discovery.severity.low"),
  medium: t("discovery.severity.medium"),
  high: t("discovery.severity.high"),
} as const

const GAP_CATEGORY_LABELS: Record<DiscoveryGapCategory, string> = {
  situation: t("discovery.gap_category.situation"),
  operations: t("discovery.gap_category.operations"),
  problems: t("discovery.gap_category.problems"),
  current_process: t("discovery.gap_category.current_process"),
  tools: t("discovery.gap_category.tools"),
  data: t("discovery.gap_category.data"),
  constraints: t("discovery.gap_category.constraints"),
  goals: t("discovery.gap_category.goals"),
}

const PROCESS_FREQUENCY_OPTIONS = [
  "rarely",
  "monthly",
  "weekly",
  "daily",
  "many_times_per_day",
] as const

const PROCESS_FREQUENCY_LABELS = {
  rarely: t("discovery.frequency.rarely"),
  monthly: t("discovery.frequency.monthly"),
  weekly: t("discovery.frequency.weekly"),
  daily: t("discovery.frequency.daily"),
  many_times_per_day: t("discovery.frequency.many_times_per_day"),
} as const

const DATA_AVAILABILITY_LABELS = {
  none: t("discovery.data_availability.none"),
  unknown: t("discovery.data_availability.unknown"),
  restricted: t("discovery.data_availability.restricted"),
  available: t("discovery.data_availability.available"),
} as const

const DATA_QUALITY_LABELS = {
  poor: t("discovery.data_quality.poor"),
  mixed: t("discovery.data_quality.mixed"),
  good: t("discovery.data_quality.good"),
  unknown: t("discovery.data_quality.unknown"),
} as const

const CURRENCY_LABELS = {
  EUR: t("common.currency.eur"),
  USD: t("common.currency.usd"),
  GBP: t("common.currency.gbp"),
  OTHER: t("common.currency.other"),
} as const

const TIMELINE_LABELS = {
  asap: t("discovery.timeline.asap"),
  this_quarter: t("discovery.timeline.this_quarter"),
  this_year: t("discovery.timeline.this_year"),
  unknown: t("discovery.timeline.unknown"),
} as const

// The label a gap carries on screen. A gap the interface recorded for an
// unanswered question names its field through the catalogue; a gap somebody
// wrote is shown as written.
export const discoveryGapLabel = (gap: DiscoveryGap): string => {
  const field = unknownGapField(gap.description)

  return field === null
    ? gap.description
    : t("discovery.guidance.unknown.gap", {
        field: t(DISCOVERY_FIELD_GUIDANCE[field].labelKey),
      })
}

export function buildDiscoverySections(
  config: DiscoverySectionConfig,
): WorkflowSectionItem[] {
  const {
    profile,
    workflow,
    audience,
    gapCategory,
    gapDescription,
    setField,
    setGapCategory,
    setGapDescription,
    addGap,
    removeGap,
    onOpenSection,
  } = config

  const statusFor = (section: DiscoverySectionKey): WorkflowSectionStatus =>
    getDiscoverySectionStatus(section, profile, workflow)

  // What every guided control needs: which field it is, who is reading, and
  // how "not known yet" is recorded for it.
  const guided = (field: DiscoveryFieldId) => ({
    field,
    audience,
    isUnknown: isFieldUnknown(profile.missingInformation, field),
    onUnknownChange: (unknown: boolean) => {
      const category = DISCOVERY_FIELD_GUIDANCE[field].unknownGapCategory
      if (!category) return

      setField(
        "missingInformation",
        unknown
          ? markFieldUnknown(profile.missingInformation, field, category)
          : clearFieldUnknown(profile.missingInformation, field),
      )
    },
  })

  return [
    {
      id: "situation",
      title: t("discovery.section.situation"),
      status: statusFor("situation"),
      content: (
        <DiscoverySection title={t("discovery.section.situation")}>
          <GuidedTextField
            {...guided("department")}
            value={profile.department}
            onChange={(value) => setField("department", value)}
            placeholder={t("discovery.profile.department_placeholder")}
          />
          <GuidedListField
            {...guided("affectedUsers")}
            value={profile.affectedUsers}
            onChange={(value) => setField("affectedUsers", value)}
            placeholder={t("discovery.profile.affected_users_placeholder")}
          />
          <GuidedTextField
            {...guided("notes")}
            multiline
            value={profile.notes}
            onChange={(value) => setField("notes", value)}
            placeholder={t("discovery.profile.notes_placeholder")}
          />
        </DiscoverySection>
      ),
    },
    {
      id: "problems",
      title: t("discovery.section.problems"),
      status: statusFor("problems"),
      content: (
        <DiscoverySection title={t("discovery.section.problems")}>
          <GuidedTextField
            {...guided("statedProblem")}
            multiline
            value={profile.statedProblem}
            onChange={(value) => setField("statedProblem", value)}
            placeholder={t("discovery.profile.stated_problem_placeholder")}
          />
          <GuidedListField
            {...guided("painPoints")}
            value={profile.painPoints}
            onChange={(value) => setField("painPoints", value)}
            placeholder={t("discovery.profile.pain_points_placeholder")}
          />
          <GuidedTextField
            {...guided("businessImpact")}
            multiline
            value={profile.businessImpact}
            onChange={(value) => setField("businessImpact", value)}
            placeholder={t("discovery.profile.business_impact_placeholder")}
          />
          <SelectField
            label={t("discovery.profile.urgency")}
            value={profile.urgency}
            options={levelOptions}
            optionLabels={LEVEL_LABELS}
            onChange={(value) =>
              setField("urgency", value as DiscoveryProfile["urgency"])
            }
          />
        </DiscoverySection>
      ),
    },
    {
      id: "current_process",
      title: t("discovery.section.current_process"),
      status: statusFor("current_process"),
      content: (
        <DiscoverySection title={t("discovery.section.current_process")}>
          <GuidedTextField
            {...guided("currentProcess")}
            multiline
            value={profile.currentProcess}
            onChange={(value) => setField("currentProcess", value)}
            placeholder={t("discovery.profile.current_process_placeholder")}
          />
          <GuidedListField
            {...guided("processSteps")}
            value={profile.processSteps}
            onChange={(value) => setField("processSteps", value)}
            placeholder={t("discovery.profile.process_steps_placeholder")}
          />
          <SelectField
            label={t("discovery.profile.frequency")}
            value={profile.processFrequency}
            options={PROCESS_FREQUENCY_OPTIONS}
            optionLabels={PROCESS_FREQUENCY_LABELS}
            onChange={(value) =>
              setField(
                "processFrequency",
                value as DiscoveryProfile["processFrequency"],
              )
            }
          />
          <SelectField
            label={t("discovery.profile.manual_work_level")}
            value={profile.manualWorkLevel}
            options={levelOptions}
            optionLabels={LEVEL_LABELS}
            onChange={(value) =>
              setField(
                "manualWorkLevel",
                value as DiscoveryProfile["manualWorkLevel"],
              )
            }
          />
          <GuidedListField
            {...guided("bottlenecks")}
            value={profile.bottlenecks}
            onChange={(value) => setField("bottlenecks", value)}
            placeholder={t("discovery.profile.bottlenecks_placeholder")}
          />
        </DiscoverySection>
      ),
    },
    {
      id: "tools",
      title: t("discovery.section.tools"),
      status: statusFor("tools"),
      content: (
        <DiscoverySection title={t("discovery.section.tools")}>
          <GuidedListField
            {...guided("currentTools")}
            value={profile.currentTools}
            onChange={(value) => setField("currentTools", value)}
            placeholder={t("discovery.profile.current_tools_placeholder")}
          />
          <GuidedListField
            {...guided("communicationChannels")}
            value={profile.communicationChannels}
            onChange={(value) => setField("communicationChannels", value)}
            placeholder={t("discovery.profile.communication_channels_placeholder")}
          />
          <GuidedListField
            {...guided("integrationNeeds")}
            value={profile.integrationNeeds}
            onChange={(value) => setField("integrationNeeds", value)}
            placeholder={t("discovery.profile.integration_needs_placeholder")}
          />
        </DiscoverySection>
      ),
    },
    {
      id: "data",
      title: t("discovery.section.data"),
      status: statusFor("data"),
      content: (
        <DiscoverySection title={t("discovery.section.data")}>
          <GuidedListField
            {...guided("dataTypes")}
            value={profile.dataTypes}
            onChange={(value) => setField("dataTypes", value)}
            placeholder={t("discovery.profile.data_types_placeholder")}
          />
          <GuidedListField
            {...guided("dataLocation")}
            value={profile.dataLocation}
            onChange={(value) => setField("dataLocation", value)}
            placeholder={t("discovery.profile.data_locations_placeholder")}
          />
          <SelectField
            label={t("discovery.profile.data_availability")}
            value={profile.dataAvailability}
            options={["none", "unknown", "restricted", "available"]}
            optionLabels={DATA_AVAILABILITY_LABELS}
            onChange={(value) =>
              setField(
                "dataAvailability",
                value as DiscoveryProfile["dataAvailability"],
              )
            }
          />
          <SelectField
            label={t("discovery.profile.data_quality")}
            value={profile.dataQuality}
            options={["poor", "mixed", "good", "unknown"]}
            optionLabels={DATA_QUALITY_LABELS}
            onChange={(value) =>
              setField("dataQuality", value as DiscoveryProfile["dataQuality"])
            }
          />
          <BooleanField
            label={t("discovery.profile.sensitive_data")}
            value={profile.sensitiveData}
            onChange={(value) => setField("sensitiveData", value)}
          />
          <GuidedListField
            {...guided("sensitiveDataTypes")}
            value={profile.sensitiveDataTypes}
            onChange={(value) => setField("sensitiveDataTypes", value)}
            placeholder={t("discovery.profile.sensitive_data_types_placeholder")}
          />
        </DiscoverySection>
      ),
    },
    {
      id: "constraints",
      title: t("discovery.section.constraints"),
      status: statusFor("constraints"),
      content: (
        <DiscoverySection title={t("discovery.section.constraints")}>
          <BooleanField
            label={t("discovery.profile.gdpr_concerns")}
            value={profile.gdprConcerns}
            onChange={(value) => setField("gdprConcerns", value)}
          />
          <NumberField
            label={t("discovery.profile.budget_amount")}
            value={profile.budgetAmount}
            onChange={(value) => setField("budgetAmount", value)}
          />
          <SelectField
            label={t("discovery.profile.budget_currency")}
            value={profile.budgetCurrency}
            options={["EUR", "USD", "GBP", "OTHER"]}
            optionLabels={CURRENCY_LABELS}
            onChange={(value) =>
              setField("budgetCurrency", value as DiscoveryProfile["budgetCurrency"])
            }
          />
          <SelectField
            label={t("discovery.profile.timeline")}
            value={profile.timeline}
            options={["asap", "this_quarter", "this_year", "unknown"]}
            optionLabels={TIMELINE_LABELS}
            onChange={(value) =>
              setField("timeline", value as DiscoveryProfile["timeline"])
            }
          />
          <BooleanField
            label={t("discovery.profile.human_approval_required")}
            value={profile.humanApprovalRequired}
            onChange={(value) => setField("humanApprovalRequired", value)}
          />
          <GuidedTextField
            {...guided("budgetNotes")}
            multiline
            value={profile.budgetNotes}
            onChange={(value) => setField("budgetNotes", value)}
            placeholder={t("discovery.profile.budget_notes_placeholder")}
          />
          <GuidedListField
            {...guided("technicalConstraints")}
            value={profile.technicalConstraints}
            onChange={(value) => setField("technicalConstraints", value)}
            placeholder={t("discovery.profile.technical_constraints_placeholder")}
          />
        </DiscoverySection>
      ),
    },
    {
      id: "goals",
      title: t("discovery.section.goals"),
      status: statusFor("goals"),
      content: (
        <DiscoverySection title={t("discovery.section.goals")}>
          <GuidedTextField
            {...guided("desiredOutcome")}
            multiline
            value={profile.desiredOutcome}
            onChange={(value) => setField("desiredOutcome", value)}
            placeholder={t("discovery.profile.desired_outcome_placeholder")}
          />
          <GuidedListField
            {...guided("successMetrics")}
            value={profile.successMetrics}
            onChange={(value) => setField("successMetrics", value)}
            placeholder={t("discovery.profile.success_metrics_placeholder")}
          />
          <TargetValues
            audience={audience}
            metricNames={profile.successMetrics}
            baseline={profile.valueMeasurementBaseline}
            onOpenBaseline={() => onOpenSection("value_measurement")}
          />
          <GuidedTextField
            {...guided("mvpScope")}
            multiline
            value={profile.mvpScope}
            onChange={(value) => setField("mvpScope", value)}
            placeholder={t("discovery.profile.mvp_scope_placeholder")}
          />
        </DiscoverySection>
      ),
    },
    {
      id: "value_measurement",
      title: t("discovery.section.value_measurement"),
      status: statusFor("value_measurement"),
      content: (
        <DiscoveryBaselineEditor
          baseline={profile.valueMeasurementBaseline}
          onChange={(baseline: ValueMeasurementBaseline) =>
            setField("valueMeasurementBaseline", baseline)
          }
        />
      ),
    },
    {
      id: "gaps",
      title: t("discovery.profile.gaps.title"),
      status: statusFor("gaps"),
      content: (
        <div style={gapsStyle}>
          <p style={introStyle}>{t("discovery.profile.gaps.intro")}</p>

          {profile.missingInformation.length === 0 ? (
            <p style={emptyGapStyle}>{t("discovery.profile.gaps.empty")}</p>
          ) : (
            <ul style={gapListStyle}>
              {profile.missingInformation.map((gap: DiscoveryGap, index) => (
                <li key={`${gap.category}-${index}`} style={gapItemStyle}>
                  <div style={gapCopyStyle}>
                    <p style={eyebrowStyle}>{GAP_CATEGORY_LABELS[gap.category]}</p>
                    <p style={gapDescriptionStyle}>{discoveryGapLabel(gap)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGap(index)}
                    style={removeButtonStyle}
                  >
                    {t("common.action.remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="discovery-gap-form">
            <SelectField
              label={t("discovery.profile.gaps.category")}
              value={gapCategory}
              options={Object.keys(GAP_CATEGORY_LABELS)}
              optionLabels={GAP_CATEGORY_LABELS}
              onChange={(value) => setGapCategory(value as DiscoveryGapCategory)}
              includeUnknown={false}
            />
            <label style={fieldStyle}>
              <span>{t("discovery.profile.gaps.description")}</span>
              <input
                value={gapDescription}
                onChange={(event) => setGapDescription(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    addGap()
                  }
                }}
                placeholder={t("discovery.profile.gaps.description_placeholder")}
                style={inputStyle}
              />
            </label>
            <button
              type="button"
              onClick={addGap}
              disabled={!gapDescription.trim()}
              style={{
                ...addButtonStyle,
                opacity: gapDescription.trim() ? 1 : 0.6,
              }}
            >
              {t("discovery.profile.gaps.add")}
            </button>
          </div>
        </div>
      ),
    },
  ]
}

// Desired result, success metric, and target value are three different things,
// and running them together is what makes this section hard to answer. The
// first two are asked here; the third is *shown* here and edited in the value &
// measurement baseline, which is the one place a figure may be recorded with
// the provenance the domain requires.
function TargetValues({
  audience,
  metricNames,
  baseline,
  onOpenBaseline,
}: {
  audience: DiscoveryAudience
  metricNames: readonly string[]
  baseline: ValueMeasurementBaseline
  onOpenBaseline: () => void
}) {
  const targetFor = (name: string) =>
    baseline.targetSuccessMetrics.find((metric) => metric.name === name)
  const currentFor = (name: string) =>
    baseline.baselineMetrics.find((metric) => metric.name === name)

  return (
    <section style={targetStyle}>
      <h3 style={targetTitleStyle}>{t("discovery.goals.target.title")}</h3>
      <p style={targetHintStyle}>{t("discovery.goals.target.hint")}</p>
      {audience === "consultant" && (
        <p style={targetConsultantHintStyle}>
          {t("discovery.goals.target.consultant")}
        </p>
      )}

      {metricNames.length === 0 ? (
        <p style={targetEmptyStyle}>{t("discovery.goals.target.empty")}</p>
      ) : (
        <ul style={targetListStyle}>
          {metricNames.map((name) => {
            const target = targetFor(name)
            const current = currentFor(name)

            return (
              <li key={name} style={targetItemStyle}>
                <span style={targetNameStyle}>{name}</span>
                <span style={targetValueStyle}>
                  {target
                    ? t("discovery.goals.target.value", { value: target.target.value })
                    : t("discovery.goals.target.none")}
                </span>
                {current && (
                  <span style={targetBaselineStyle}>
                    {t("discovery.goals.target.baseline", {
                      value: current.current.value,
                    })}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" onClick={onOpenBaseline} style={targetActionStyle}>
        {t("discovery.goals.target.action")}
      </button>
    </section>
  )
}

const gapsStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
}

const emptyGapStyle: React.CSSProperties = {
  margin: 0,
  padding: uiSpace.sm,
  borderRadius: uiRadius.control,
  border: `1px dashed ${uiColors.borderStrong}`,
  background: uiColors.subtle,
  color: uiColors.textSecondary,
  fontSize: 14,
}

const gapListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: uiSpace.xs,
}

const gapItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
  gap: uiSpace.md,
  padding: uiSpace.sm,
  borderRadius: uiRadius.control,
  background: uiColors.warningTint,
  border: `1px solid ${uiColors.border}`,
}

const gapCopyStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: uiSpace.xxs,
}

const gapDescriptionStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  lineHeight: 1.5,
}

const targetStyle: React.CSSProperties = {
  gridColumn: "1 / -1",
  display: "grid",
  gap: uiSpace.xs,
  padding: uiSpace.sm,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.subtle,
}

const targetTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 650,
  color: uiColors.textPrimary,
}

const targetHintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  color: uiColors.textSecondary,
}

const targetConsultantHintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: uiColors.textSecondary,
}

const targetEmptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: uiColors.textMuted,
}

const targetListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: uiSpace.xxs,
}

const targetItemStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  gap: `2px ${uiSpace.sm}`,
  padding: `${uiSpace.xxs} ${uiSpace.xs}`,
  borderRadius: uiRadius.control,
  background: uiColors.surface,
  border: `1px solid ${uiColors.border}`,
}

const targetNameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 120,
  fontSize: 13,
  fontWeight: 600,
  color: uiColors.textPrimary,
}

const targetValueStyle: React.CSSProperties = {
  fontSize: 12,
  color: uiColors.textSecondary,
}

const targetBaselineStyle: React.CSSProperties = {
  fontSize: 12,
  color: uiColors.textMuted,
}

const targetActionStyle: React.CSSProperties = {
  justifySelf: "start",
  minHeight: 36,
  padding: `0 ${uiSpace.sm}`,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.borderStrong}`,
  background: uiColors.surface,
  color: uiColors.textPrimary,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
}
