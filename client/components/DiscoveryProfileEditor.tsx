"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import DiscoveryBaselineEditor from "./DiscoveryBaselineEditor"
import DiscoveryReviewControl from "./DiscoveryReviewControl"
import {
  BooleanField,
  DiscoverySection,
  ListField,
  NumberField,
  SelectField,
  TextArea,
  TextField,
  addButtonStyle,
  errorStyle,
  eyebrowStyle,
  fieldStyle,
  inputStyle,
  introStyle,
  removeButtonStyle,
  saveButtonStyle,
  successStyle,
} from "./DiscoveryFields"
import { t, translateServerMessage } from "../i18n"

import type {
  DiscoveryGap,
  DiscoveryGapCategory,
  DiscoveryProfile,
  ValueMeasurementBaseline,
} from "../../shared/discovery-profile.schema"
import type {
  DiscoveryActor,
  DiscoveryWorkflowState,
} from "../../shared/discovery-workflow.schema"

type DiscoveryProfileEditorProps = {
  engagementId: string
  initialProfile: DiscoveryProfile
  workflow: DiscoveryWorkflowState
  pathPrefix?: string
  lockContributor?: DiscoveryActor
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

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

const levelOptions = ["low", "medium", "high"] as const

const LEVEL_LABELS = {
  low: t("discovery.severity.low"),
  medium: t("discovery.severity.medium"),
  high: t("discovery.severity.high"),
} as const

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

const CONTRIBUTORS: readonly DiscoveryActor[] = ["consultant", "client"]

export default function DiscoveryProfileEditor({
  engagementId,
  initialProfile,
  workflow,
  pathPrefix = "/engagements",
  lockContributor,
}: DiscoveryProfileEditorProps) {
  const router = useRouter()
  const [profile, setProfile] = useState(initialProfile)
  // Who is entering this content. It is declared, not authenticated in the
  // consultant workspace; the portal locks it to the client identity.
  const [contributor, setContributor] = useState<DiscoveryActor>(
    lockContributor ?? "consultant",
  )
  const [gapCategory, setGapCategory] =
    useState<DiscoveryGapCategory>("situation")
  const [gapDescription, setGapDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  function setField<K extends keyof DiscoveryProfile>(
    field: K,
    value: DiscoveryProfile[K],
  ) {
    setProfile((current) => ({ ...current, [field]: value }))
    setMessage("")
  }

  function addGap() {
    const description = gapDescription.trim()
    if (!description) return

    setField("missingInformation", [
      ...profile.missingInformation,
      { category: gapCategory, description },
    ])
    setGapDescription("")
  }

  function removeGap(index: number) {
    setField(
      "missingInformation",
      profile.missingInformation.filter((_, itemIndex) => itemIndex !== index),
    )
  }

  async function saveProfile() {
    setIsSaving(true)
    setError("")
    setMessage("")

    try {
      const response = await fetch(
        `${API_BASE_URL}${pathPrefix}/${engagementId}/discovery`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ contributor, profile }),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        // The server names the refusal; the wording is the frontend's.
        throw new Error(
          translateServerMessage(
            result.message,
            result.data?.messageParams,
            "discovery.editor.save_failed",
          ),
        )
      }

      setMessage(translateServerMessage(result.message))
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("common.error.unexpected"),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section style={editorStyle}>
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>{t("discovery.editor.eyebrow")}</p>
          <h2 style={headingStyle}>{t("discovery.editor.title")}</h2>
          <p style={introStyle}>{t("discovery.editor.intro")}</p>
        </div>
        <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
          {lockContributor ? (
            <div style={{ ...introStyle, margin: 0 }}>
              {t(`discovery.actor.${lockContributor}`)}
            </div>
          ) : (
            <SelectField
              label={t("discovery.editor.contributor.label")}
              value={contributor}
              options={CONTRIBUTORS}
              optionLabels={{
                consultant: t("discovery.actor.consultant"),
                client: t("discovery.actor.client"),
              }}
              includeUnknown={false}
              onChange={(value) => setContributor(value as DiscoveryActor)}
            />
          )}
          <button
            type="button"
            onClick={saveProfile}
            disabled={isSaving}
            style={{ ...saveButtonStyle, opacity: isSaving ? 0.6 : 1 }}
          >
            {isSaving ? t("discovery.editor.saving") : t("discovery.editor.save")}
          </button>
        </div>
      </div>

      {message && <p style={successStyle}>{message}</p>}
      {error && <p style={errorStyle}>{error}</p>}

      <DiscoveryReviewControl
        engagementId={engagementId}
        actor={contributor}
        workflow={workflow}
        pathPrefix={pathPrefix}
      />

      <DiscoverySection title={t("discovery.section.situation")}>
        <TextField label={t("discovery.profile.department")} value={profile.department} onChange={(value) => setField("department", value)} placeholder={t("discovery.profile.department_placeholder")} />
        <ListField label={t("discovery.profile.affected_users")} value={profile.affectedUsers} onChange={(value) => setField("affectedUsers", value)} placeholder={t("discovery.profile.affected_users_placeholder")} />
        <TextArea label={t("discovery.profile.notes")} value={profile.notes} onChange={(value) => setField("notes", value)} placeholder={t("discovery.profile.notes_placeholder")} />
      </DiscoverySection>

      <DiscoverySection title={t("discovery.section.problems")}>
        <TextArea label={t("discovery.profile.stated_problem")} value={profile.statedProblem} onChange={(value) => setField("statedProblem", value)} placeholder={t("discovery.profile.stated_problem_placeholder")} />
        <ListField label={t("discovery.profile.pain_points")} value={profile.painPoints} onChange={(value) => setField("painPoints", value)} placeholder={t("discovery.profile.pain_points_placeholder")} />
        <TextArea label={t("discovery.profile.business_impact")} value={profile.businessImpact} onChange={(value) => setField("businessImpact", value)} placeholder={t("discovery.profile.business_impact_placeholder")} />
        <SelectField label={t("discovery.profile.urgency")} value={profile.urgency} options={levelOptions} optionLabels={LEVEL_LABELS} onChange={(value) => setField("urgency", value as DiscoveryProfile["urgency"])} />
      </DiscoverySection>

      <DiscoverySection title={t("discovery.section.current_process")}>
        <TextArea label={t("discovery.profile.current_process")} value={profile.currentProcess} onChange={(value) => setField("currentProcess", value)} placeholder={t("discovery.profile.current_process_placeholder")} />
        <ListField label={t("discovery.profile.process_steps")} value={profile.processSteps} onChange={(value) => setField("processSteps", value)} placeholder={t("discovery.profile.process_steps_placeholder")} />
        <SelectField label={t("discovery.profile.frequency")} value={profile.processFrequency} options={PROCESS_FREQUENCY_OPTIONS} optionLabels={PROCESS_FREQUENCY_LABELS} onChange={(value) => setField("processFrequency", value as DiscoveryProfile["processFrequency"])} />
        <SelectField label={t("discovery.profile.manual_work_level")} value={profile.manualWorkLevel} options={levelOptions} optionLabels={LEVEL_LABELS} onChange={(value) => setField("manualWorkLevel", value as DiscoveryProfile["manualWorkLevel"])} />
        <ListField label={t("discovery.profile.bottlenecks")} value={profile.bottlenecks} onChange={(value) => setField("bottlenecks", value)} placeholder={t("discovery.profile.bottlenecks_placeholder")} />
      </DiscoverySection>

      <DiscoverySection title={t("discovery.section.tools")}>
        <ListField label={t("discovery.profile.current_tools")} value={profile.currentTools} onChange={(value) => setField("currentTools", value)} placeholder={t("discovery.profile.current_tools_placeholder")} />
        <ListField label={t("discovery.profile.communication_channels")} value={profile.communicationChannels} onChange={(value) => setField("communicationChannels", value)} placeholder={t("discovery.profile.communication_channels_placeholder")} />
        <ListField label={t("discovery.profile.integration_needs")} value={profile.integrationNeeds} onChange={(value) => setField("integrationNeeds", value)} placeholder={t("discovery.profile.integration_needs_placeholder")} />
      </DiscoverySection>

      <DiscoverySection title={t("discovery.section.data")}>
        <ListField label={t("discovery.profile.data_types")} value={profile.dataTypes} onChange={(value) => setField("dataTypes", value)} placeholder={t("discovery.profile.data_types_placeholder")} />
        <ListField label={t("discovery.profile.data_locations")} value={profile.dataLocation} onChange={(value) => setField("dataLocation", value)} placeholder={t("discovery.profile.data_locations_placeholder")} />
        <SelectField label={t("discovery.profile.data_availability")} value={profile.dataAvailability} options={["none", "unknown", "restricted", "available"]} optionLabels={DATA_AVAILABILITY_LABELS} onChange={(value) => setField("dataAvailability", value as DiscoveryProfile["dataAvailability"])} />
        <SelectField label={t("discovery.profile.data_quality")} value={profile.dataQuality} options={["poor", "mixed", "good", "unknown"]} optionLabels={DATA_QUALITY_LABELS} onChange={(value) => setField("dataQuality", value as DiscoveryProfile["dataQuality"])} />
        <BooleanField label={t("discovery.profile.sensitive_data")} value={profile.sensitiveData} onChange={(value) => setField("sensitiveData", value)} />
        <ListField label={t("discovery.profile.sensitive_data_types")} value={profile.sensitiveDataTypes} onChange={(value) => setField("sensitiveDataTypes", value)} placeholder={t("discovery.profile.sensitive_data_types_placeholder")} />
      </DiscoverySection>

      <DiscoverySection title={t("discovery.section.constraints")}>
        <BooleanField label={t("discovery.profile.gdpr_concerns")} value={profile.gdprConcerns} onChange={(value) => setField("gdprConcerns", value)} />
        <NumberField label={t("discovery.profile.budget_amount")} value={profile.budgetAmount} onChange={(value) => setField("budgetAmount", value)} />
        <SelectField label={t("discovery.profile.budget_currency")} value={profile.budgetCurrency} options={["EUR", "USD", "GBP", "OTHER"]} optionLabels={CURRENCY_LABELS} onChange={(value) => setField("budgetCurrency", value as DiscoveryProfile["budgetCurrency"])} />
        <TextArea label={t("discovery.profile.budget_notes")} value={profile.budgetNotes} onChange={(value) => setField("budgetNotes", value)} placeholder={t("discovery.profile.budget_notes_placeholder")} />
        <SelectField label={t("discovery.profile.timeline")} value={profile.timeline} options={["asap", "this_quarter", "this_year", "unknown"]} optionLabels={TIMELINE_LABELS} onChange={(value) => setField("timeline", value as DiscoveryProfile["timeline"])} />
        <BooleanField label={t("discovery.profile.human_approval_required")} value={profile.humanApprovalRequired} onChange={(value) => setField("humanApprovalRequired", value)} />
        <ListField label={t("discovery.profile.technical_constraints")} value={profile.technicalConstraints} onChange={(value) => setField("technicalConstraints", value)} placeholder={t("discovery.profile.technical_constraints_placeholder")} />
      </DiscoverySection>

      <DiscoverySection title={t("discovery.section.goals")}>
        <TextArea label={t("discovery.profile.desired_outcome")} value={profile.desiredOutcome} onChange={(value) => setField("desiredOutcome", value)} placeholder={t("discovery.profile.desired_outcome_placeholder")} />
        <ListField label={t("discovery.profile.success_metrics")} value={profile.successMetrics} onChange={(value) => setField("successMetrics", value)} placeholder={t("discovery.profile.success_metrics_placeholder")} />
        <TextArea label={t("discovery.profile.mvp_scope")} value={profile.mvpScope} onChange={(value) => setField("mvpScope", value)} placeholder={t("discovery.profile.mvp_scope_placeholder")} />
      </DiscoverySection>

      <DiscoveryBaselineEditor
        baseline={profile.valueMeasurementBaseline}
        onChange={(baseline: ValueMeasurementBaseline) =>
          setField("valueMeasurementBaseline", baseline)
        }
      />

      <section style={gapsStyle}>
        <div>
          <p style={eyebrowStyle}>{t("discovery.profile.gaps.eyebrow")}</p>
          <h3 style={{ margin: "5px 0 8px", fontSize: 22 }}>{t("discovery.profile.gaps.title")}</h3>
          <p style={introStyle}>{t("discovery.profile.gaps.intro")}</p>
        </div>

        {profile.missingInformation.length === 0 ? (
          <p style={emptyGapStyle}>{t("discovery.profile.gaps.empty")}</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {profile.missingInformation.map((gap: DiscoveryGap, index) => (
              <div key={`${gap.category}-${index}`} style={gapItemStyle}>
                <div>
                  <strong>{GAP_CATEGORY_LABELS[gap.category]}</strong>
                  <p style={{ margin: "4px 0 0", color: "#374151" }}>{gap.description}</p>
                </div>
                <button type="button" onClick={() => removeGap(index)} style={removeButtonStyle}>{t("common.action.remove")}</button>
              </div>
            ))}
          </div>
        )}

        <div style={gapInputStyle}>
          <SelectField label={t("discovery.profile.gaps.category")} value={gapCategory} options={Object.keys(GAP_CATEGORY_LABELS)} optionLabels={GAP_CATEGORY_LABELS} onChange={(value) => setGapCategory(value as DiscoveryGapCategory)} includeUnknown={false} />
          <label style={fieldStyle}>
            <span>{t("discovery.profile.gaps.description")}</span>
            <input value={gapDescription} onChange={(event) => setGapDescription(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGap() } }} placeholder={t("discovery.profile.gaps.description_placeholder")} style={inputStyle} />
          </label>
          <button type="button" onClick={addGap} disabled={!gapDescription.trim()} style={addButtonStyle}>{t("discovery.profile.gaps.add")}</button>
        </div>
      </section>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={saveProfile} disabled={isSaving} style={{ ...saveButtonStyle, opacity: isSaving ? 0.6 : 1 }}>
          {isSaving ? t("discovery.editor.saving") : t("discovery.editor.save")}
        </button>
      </div>
    </section>
  )
}
// Styles specific to this editor; the shared input primitives and their styling
// live in DiscoveryFields.
const editorStyle: React.CSSProperties = { maxWidth: 1120, margin: "24px auto 0", display: "grid", gap: 20, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 24, padding: 32, boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)" }
const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "start", flexWrap: "wrap" }
const headingStyle: React.CSSProperties = { margin: "6px 0 8px", fontSize: 30 }
const gapsStyle: React.CSSProperties = { display: "grid", gap: 16, border: "2px solid #c7d2fe", borderRadius: 18, padding: 20, background: "#f5f7ff" }
const emptyGapStyle: React.CSSProperties = { margin: 0, padding: 14, borderRadius: 12, background: "#fff", border: "1px dashed #a5b4fc", color: "#6b7280" }
const gapItemStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16, padding: 14, borderRadius: 12, background: "#fff", border: "1px solid #dbeafe" }
const gapInputStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px, .4fr) minmax(260px, 1fr) auto", gap: 12, alignItems: "end" }
