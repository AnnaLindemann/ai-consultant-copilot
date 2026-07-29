"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import type {
  DiscoveryGap,
  DiscoveryGapCategory,
  DiscoveryProfile,
} from "../../shared/discovery-profile.schema"

type DiscoveryProfileEditorProps = {
  engagementId: string
  initialProfile: DiscoveryProfile
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

const GAP_CATEGORY_LABELS: Record<DiscoveryGapCategory, string> = {
  situation: "Client situation",
  operations: "Operations",
  problems: "Problems",
  current_process: "Current process",
  tools: "Tools & channels",
  data: "Data",
  constraints: "Constraints",
  goals: "Goals & success",
}

const levelOptions = ["low", "medium", "high"] as const

export default function DiscoveryProfileEditor({
  engagementId,
  initialProfile,
}: DiscoveryProfileEditorProps) {
  const router = useRouter()
  const [profile, setProfile] = useState(initialProfile)
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
        `${API_BASE_URL}/engagements/${engagementId}/discovery`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message ?? "Failed to save Discovery Profile")
      }

      setMessage("Discovery Profile saved")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section style={editorStyle}>
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Phase 2 · Client Discovery</p>
          <h2 style={headingStyle}>Discovery Profile</h2>
          <p style={introStyle}>
            Capture what is known about Customer Operations and list every
            unresolved gap explicitly. Return and revise this profile whenever
            the client provides better information.
          </p>
        </div>
        <button
          type="button"
          onClick={saveProfile}
          disabled={isSaving}
          style={{ ...saveButtonStyle, opacity: isSaving ? 0.6 : 1 }}
        >
          {isSaving ? "Saving…" : "Save Discovery Profile"}
        </button>
      </div>

      {message && <p style={successStyle}>{message}</p>}
      {error && <p style={errorStyle}>{error}</p>}

      <DiscoverySection title="Client situation & operations">
        <TextField label="Department / function" value={profile.department} onChange={(value) => setField("department", value)} placeholder="Example: Customer Support" />
        <ListField label="Affected users or teams" value={profile.affectedUsers} onChange={(value) => setField("affectedUsers", value)} placeholder="Support agents, team leads, customers" />
        <TextArea label="Additional situation notes" value={profile.notes} onChange={(value) => setField("notes", value)} placeholder="Relevant operating context, stakeholders, or scope" />
      </DiscoverySection>

      <DiscoverySection title="Problems & impact">
        <TextArea label="Stated problem" value={profile.statedProblem} onChange={(value) => setField("statedProblem", value)} placeholder="What problem did the client describe?" />
        <ListField label="Pain points" value={profile.painPoints} onChange={(value) => setField("painPoints", value)} placeholder="Slow response times, duplicate work" />
        <TextArea label="Business impact" value={profile.businessImpact} onChange={(value) => setField("businessImpact", value)} placeholder="Cost, customer, revenue, quality, or risk impact" />
        <SelectField label="Urgency" value={profile.urgency} options={levelOptions} onChange={(value) => setField("urgency", value as DiscoveryProfile["urgency"])} />
      </DiscoverySection>

      <DiscoverySection title="Current process">
        <TextArea label="Process overview" value={profile.currentProcess} onChange={(value) => setField("currentProcess", value)} placeholder="How does the work flow today?" />
        <ListField label="Process steps" value={profile.processSteps} onChange={(value) => setField("processSteps", value)} placeholder="Receive request, triage, respond, close" />
        <SelectField label="Frequency" value={profile.processFrequency} options={["rarely", "monthly", "weekly", "daily", "many_times_per_day"]} onChange={(value) => setField("processFrequency", value as DiscoveryProfile["processFrequency"])} />
        <SelectField label="Manual work level" value={profile.manualWorkLevel} options={levelOptions} onChange={(value) => setField("manualWorkLevel", value as DiscoveryProfile["manualWorkLevel"])} />
        <ListField label="Bottlenecks" value={profile.bottlenecks} onChange={(value) => setField("bottlenecks", value)} placeholder="Manual triage, handoff delays" />
      </DiscoverySection>

      <DiscoverySection title="Tools, channels & integrations">
        <ListField label="Current tools" value={profile.currentTools} onChange={(value) => setField("currentTools", value)} placeholder="Zendesk, Salesforce, spreadsheets" />
        <ListField label="Communication channels" value={profile.communicationChannels} onChange={(value) => setField("communicationChannels", value)} placeholder="Email, phone, live chat, help desk" />
        <ListField label="Integration needs" value={profile.integrationNeeds} onChange={(value) => setField("integrationNeeds", value)} placeholder="CRM, ticketing, booking system" />
      </DiscoverySection>

      <DiscoverySection title="Data">
        <ListField label="Data types" value={profile.dataTypes} onChange={(value) => setField("dataTypes", value)} placeholder="Tickets, calls, customer records" />
        <ListField label="Data locations" value={profile.dataLocation} onChange={(value) => setField("dataLocation", value)} placeholder="CRM, data warehouse, shared drive" />
        <SelectField label="Availability" value={profile.dataAvailability} options={["none", "unknown", "restricted", "available"]} onChange={(value) => setField("dataAvailability", value as DiscoveryProfile["dataAvailability"])} />
        <SelectField label="Quality" value={profile.dataQuality} options={["poor", "mixed", "good", "unknown"]} onChange={(value) => setField("dataQuality", value as DiscoveryProfile["dataQuality"])} />
        <BooleanField label="Sensitive data involved" value={profile.sensitiveData} onChange={(value) => setField("sensitiveData", value)} />
        <ListField label="Sensitive data types" value={profile.sensitiveDataTypes} onChange={(value) => setField("sensitiveDataTypes", value)} placeholder="Personal data, payment details" />
      </DiscoverySection>

      <DiscoverySection title="Constraints">
        <BooleanField label="GDPR concerns" value={profile.gdprConcerns} onChange={(value) => setField("gdprConcerns", value)} />
        <NumberField label="Budget amount" value={profile.budgetAmount} onChange={(value) => setField("budgetAmount", value)} />
        <SelectField label="Budget currency" value={profile.budgetCurrency} options={["EUR", "USD", "GBP", "OTHER"]} onChange={(value) => setField("budgetCurrency", value as DiscoveryProfile["budgetCurrency"])} />
        <TextArea label="Budget notes" value={profile.budgetNotes} onChange={(value) => setField("budgetNotes", value)} placeholder="Budget range, approval status, or limits" />
        <SelectField label="Timeline" value={profile.timeline} options={["asap", "this_quarter", "this_year", "unknown"]} onChange={(value) => setField("timeline", value as DiscoveryProfile["timeline"])} />
        <BooleanField label="Human approval required" value={profile.humanApprovalRequired} onChange={(value) => setField("humanApprovalRequired", value)} />
        <ListField label="Technical constraints" value={profile.technicalConstraints} onChange={(value) => setField("technicalConstraints", value)} placeholder="No cloud access, legacy API, data residency" />
      </DiscoverySection>

      <DiscoverySection title="Goals & success">
        <TextArea label="Desired outcome" value={profile.desiredOutcome} onChange={(value) => setField("desiredOutcome", value)} placeholder="What should improve?" />
        <ListField label="Success metrics" value={profile.successMetrics} onChange={(value) => setField("successMetrics", value)} placeholder="First response time, resolution rate, CSAT" />
        <TextArea label="MVP scope" value={profile.mvpScope} onChange={(value) => setField("mvpScope", value)} placeholder="Smallest useful validation scope" />
      </DiscoverySection>

      <section style={gapsStyle}>
        <div>
          <p style={eyebrowStyle}>Explicit gaps</p>
          <h3 style={{ margin: "5px 0 8px", fontSize: 22 }}>Missing information</h3>
          <p style={introStyle}>Record facts that still need confirmation. Empty fields are not silently treated as known.</p>
        </div>

        {profile.missingInformation.length === 0 ? (
          <p style={emptyGapStyle}>No gaps recorded. Confirm that discovery is complete before moving on.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {profile.missingInformation.map((gap: DiscoveryGap, index) => (
              <div key={`${gap.category}-${index}`} style={gapItemStyle}>
                <div>
                  <strong>{GAP_CATEGORY_LABELS[gap.category]}</strong>
                  <p style={{ margin: "4px 0 0", color: "#374151" }}>{gap.description}</p>
                </div>
                <button type="button" onClick={() => removeGap(index)} style={removeButtonStyle}>Remove</button>
              </div>
            ))}
          </div>
        )}

        <div style={gapInputStyle}>
          <SelectField label="Category" value={gapCategory} options={Object.keys(GAP_CATEGORY_LABELS)} onChange={(value) => setGapCategory(value as DiscoveryGapCategory)} includeUnknown={false} />
          <label style={fieldStyle}>
            <span>Description</span>
            <input value={gapDescription} onChange={(event) => setGapDescription(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGap() } }} placeholder="What still needs to be learned or confirmed?" style={inputStyle} />
          </label>
          <button type="button" onClick={addGap} disabled={!gapDescription.trim()} style={addButtonStyle}>Add gap</button>
        </div>
      </section>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={saveProfile} disabled={isSaving} style={{ ...saveButtonStyle, opacity: isSaving ? 0.6 : 1 }}>
          {isSaving ? "Saving…" : "Save Discovery Profile"}
        </button>
      </div>
    </section>
  )
}

function DiscoverySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset style={sectionStyle}><legend style={legendStyle}>{title}</legend><div style={fieldsGridStyle}>{children}</div></fieldset>
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string | null; onChange: (value: string | null) => void; placeholder: string }) {
  return <label style={fieldStyle}><span>{label}</span><input value={value ?? ""} onChange={(event) => onChange(toNullableText(event.target.value))} placeholder={placeholder} style={inputStyle} /></label>
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string | null; onChange: (value: string | null) => void; placeholder: string }) {
  return <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}><span>{label}</span><textarea value={value ?? ""} onChange={(event) => onChange(toNullableText(event.target.value))} placeholder={placeholder} style={textareaStyle} /></label>
}

function ListField({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  return <label style={fieldStyle}><span>{label}</span><input value={value.join(", ")} onChange={(event) => onChange(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} placeholder={placeholder} style={inputStyle} /><small style={hintStyle}>Separate items with commas.</small></label>
}

function SelectField({ label, value, options, onChange, includeUnknown = true }: { label: string; value: string | null; options: readonly string[]; onChange: (value: string | null) => void; includeUnknown?: boolean }) {
  return <label style={fieldStyle}><span>{label}</span><select value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} style={inputStyle}>{includeUnknown && <option value="">Not captured</option>}{options.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}</select></label>
}

function BooleanField({ label, value, onChange }: { label: string; value: boolean | null; onChange: (value: boolean | null) => void }) {
  return <label style={fieldStyle}><span>{label}</span><select value={value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")} style={inputStyle}><option value="">Not captured</option><option value="true">Yes</option><option value="false">No</option></select></label>
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return <label style={fieldStyle}><span>{label}</span><input type="number" min="0.01" step="0.01" value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} style={inputStyle} /></label>
}

function toNullableText(value: string): string | null { return value.trim() ? value : null }
function formatOption(value: string): string { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) }

const editorStyle: React.CSSProperties = { maxWidth: 1120, margin: "24px auto 0", display: "grid", gap: 20, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 24, padding: 32, boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)" }
const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "start", flexWrap: "wrap" }
const eyebrowStyle: React.CSSProperties = { margin: 0, color: "#4f46e5", fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 }
const headingStyle: React.CSSProperties = { margin: "6px 0 8px", fontSize: 30 }
const introStyle: React.CSSProperties = { margin: 0, color: "#6b7280", lineHeight: 1.55, maxWidth: 720 }
const sectionStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 18, padding: 20, margin: 0 }
const legendStyle: React.CSSProperties = { padding: "0 8px", fontWeight: 800, fontSize: 18 }
const fieldsGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }
const fieldStyle: React.CSSProperties = { display: "grid", gap: 7, alignContent: "start", fontWeight: 700, fontSize: 14 }
const inputStyle: React.CSSProperties = { width: "100%", borderRadius: 12, border: "1px solid #d1d5db", padding: "11px 12px", fontSize: 15, background: "#fff", color: "#111827" }
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 88, resize: "vertical" }
const hintStyle: React.CSSProperties = { color: "#6b7280", fontWeight: 400 }
const saveButtonStyle: React.CSSProperties = { border: 0, borderRadius: 12, padding: "12px 17px", background: "#4f46e5", color: "#fff", fontWeight: 800, cursor: "pointer" }
const successStyle: React.CSSProperties = { margin: 0, padding: 12, borderRadius: 12, background: "#ecfdf5", color: "#065f46", border: "1px solid #bbf7d0" }
const errorStyle: React.CSSProperties = { margin: 0, padding: 12, borderRadius: 12, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }
const gapsStyle: React.CSSProperties = { display: "grid", gap: 16, border: "2px solid #c7d2fe", borderRadius: 18, padding: 20, background: "#f5f7ff" }
const emptyGapStyle: React.CSSProperties = { margin: 0, padding: 14, borderRadius: 12, background: "#fff", border: "1px dashed #a5b4fc", color: "#6b7280" }
const gapItemStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16, padding: 14, borderRadius: 12, background: "#fff", border: "1px solid #dbeafe" }
const removeButtonStyle: React.CSSProperties = { border: 0, background: "transparent", color: "#b91c1c", fontWeight: 700, cursor: "pointer" }
const gapInputStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px, .4fr) minmax(260px, 1fr) auto", gap: 12, alignItems: "end" }
const addButtonStyle: React.CSSProperties = { ...saveButtonStyle, background: "#111827" }
