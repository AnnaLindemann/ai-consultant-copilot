"use client"

import { useId, useState } from "react"

import { hintStyle, inputStyle, textareaStyle } from "./DiscoveryFields"
import { t } from "../i18n"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"
import {
  addSuggestionItem,
  appendSuggestionPhrase,
  removeSuggestionItem,
} from "../lib/discovery-suggestions"
import {
  DISCOVERY_FIELD_GUIDANCE,
  guidanceHintKeys,
  type DiscoveryAudience,
  type DiscoveryFieldId,
  type DiscoverySuggestion,
} from "../lib/discovery-guidance"

// The three levels of help a difficult Discovery question can offer — a short
// explanation, suggested answers, and examples — plus an explicit "not known
// yet". All of them are disclosures rather than hover tooltips or modals: they
// open on click or keyboard, they stay in the document flow, and closing one
// leaves focus on the control that opened it (UI-KIT §16).
//
// What each field says comes from `lib/discovery-guidance`, so the same
// question is explained the same way in the consultant's workspace and in the
// Client Portal, with only the consulting context differing.

type GuidedFieldProps = {
  field: DiscoveryFieldId
  audience: DiscoveryAudience
  isUnknown: boolean
  onUnknownChange: (unknown: boolean) => void
}

export function GuidedTextField({
  field,
  audience,
  value,
  onChange,
  placeholder,
  multiline = false,
  isUnknown,
  onUnknownChange,
}: GuidedFieldProps & {
  value: string | null
  onChange: (value: string | null) => void
  placeholder: string
  multiline?: boolean
}) {
  const controlId = useId()

  // A suggestion adds a sentence the user can rewrite. Existing text is kept:
  // choosing a second suggestion extends the answer instead of replacing it.
  function insertSuggestion(suggestion: DiscoverySuggestion) {
    if (!suggestion.insertKey) return

    onChange(appendSuggestionPhrase(value, t(suggestion.insertKey)))
    onUnknownChange(false)
  }

  return (
    <div style={fieldBlockStyle}>
      <FieldHeader
        field={field}
        audience={audience}
        controlId={controlId}
        onSuggestion={insertSuggestion}
      />

      {multiline ? (
        <textarea
          id={controlId}
          value={value ?? ""}
          onChange={(event) => onChange(toNullable(event.target.value))}
          placeholder={placeholder}
          style={textareaStyle}
        />
      ) : (
        <input
          id={controlId}
          value={value ?? ""}
          onChange={(event) => onChange(toNullable(event.target.value))}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}

      <UnknownControl
        field={field}
        audience={audience}
        isUnknown={isUnknown}
        onUnknownChange={onUnknownChange}
      />
    </div>
  )
}

export function GuidedListField({
  field,
  audience,
  value,
  onChange,
  placeholder,
  isUnknown,
  onUnknownChange,
}: GuidedFieldProps & {
  value: readonly string[]
  onChange: (value: string[]) => void
  placeholder: string
}) {
  const controlId = useId()
  const [draft, setDraft] = useState("")

  function addItem(item: string) {
    const next = addSuggestionItem(value, item)
    if (next.length === value.length) return

    onChange(next)
    onUnknownChange(false)
  }

  function removeItem(item: string) {
    onChange(removeSuggestionItem(value, item))
  }

  return (
    <div style={fieldBlockStyle}>
      <FieldHeader
        field={field}
        audience={audience}
        controlId={controlId}
        onSuggestion={(suggestion) => addItem(t(suggestion.labelKey))}
      />

      {value.length > 0 ? (
        <ul style={chipListStyle} aria-label={t("discovery.guidance.suggestions.selected")}>
          {value.map((item) => (
            <li key={item} style={chipStyle}>
              <span>{item}</span>
              <button
                type="button"
                onClick={() => removeItem(item)}
                aria-label={t("discovery.guidance.suggestions.remove", { item })}
                style={chipRemoveStyle}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={emptySelectionStyle}>
          {t("discovery.guidance.suggestions.empty")}
        </p>
      )}

      {/* Free text is always available, so a suggestion list can never become
          a closed set of allowed answers. */}
      <div style={customRowStyle}>
        <input
          id={controlId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addItem(draft)
              setDraft("")
            }
          }}
          placeholder={placeholder}
          aria-label={t("discovery.guidance.suggestions.custom_label")}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => {
            addItem(draft)
            setDraft("")
          }}
          disabled={!draft.trim()}
          style={{ ...smallButtonStyle, opacity: draft.trim() ? 1 : 0.6 }}
        >
          {t("discovery.guidance.suggestions.custom_add")}
        </button>
      </div>

      <UnknownControl
        field={field}
        audience={audience}
        isUnknown={isUnknown}
        onUnknownChange={onUnknownChange}
      />
    </div>
  )
}

// The label, the explanation toggle, and the suggestion toggle: one row above
// every guided control, so help is where the question is.
function FieldHeader({
  field,
  audience,
  controlId,
  onSuggestion,
}: {
  field: DiscoveryFieldId
  audience: DiscoveryAudience
  controlId: string
  onSuggestion: (suggestion: DiscoverySuggestion) => void
}) {
  const guidance = DISCOVERY_FIELD_GUIDANCE[field]
  const [helpOpen, setHelpOpen] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const helpId = useId()
  const suggestionsId = useId()

  const label = t(guidance.labelKey)

  return (
    <div style={headerStyle}>
      <div style={labelRowStyle}>
        <label htmlFor={controlId} style={labelStyle}>
          {label}
        </label>

        <button
          type="button"
          onClick={() => setHelpOpen((open) => !open)}
          aria-expanded={helpOpen}
          aria-controls={helpId}
          aria-label={`${t("discovery.guidance.explain")}: ${label}`}
          style={infoButtonStyle}
        >
          <span aria-hidden="true">i</span>
        </button>

        {guidance.suggestions && (
          <button
            type="button"
            onClick={() => setSuggestionsOpen((open) => !open)}
            aria-expanded={suggestionsOpen}
            aria-controls={suggestionsId}
            style={smallButtonStyle}
          >
            {t(suggestionOpenKey(field))}
          </button>
        )}
      </div>

      <div
        id={helpId}
        style={{ ...helpPanelStyle, display: helpOpen ? "grid" : "none" }}
      >
        {guidanceHintKeys(field, audience).map((hintKey, index) => (
          <p
            key={hintKey}
            style={index === 0 ? helpTextStyle : consultantHintStyle}
          >
            {index === 0 ? t(hintKey) : `${t("discovery.guidance.consultant_context")}: ${t(hintKey)}`}
          </p>
        ))}
        {guidance.exampleKeys && <Examples exampleKeys={guidance.exampleKeys} />}
      </div>

      {guidance.suggestions && (
        <div
          id={suggestionsId}
          style={{
            ...suggestionPanelStyle,
            display: suggestionsOpen ? "grid" : "none",
          }}
        >
          {guidance.suggestionsKey && (
            <p style={suggestionGroupStyle}>{t(guidance.suggestionsKey)}</p>
          )}
          <ul style={suggestionListStyle}>
            {guidance.suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  onClick={() => onSuggestion(suggestion)}
                  style={suggestionButtonStyle}
                >
                  <span style={suggestionLabelStyle}>{t(suggestion.labelKey)}</span>
                  {suggestion.descriptionKey && (
                    <span style={suggestionDescriptionStyle}>
                      {t(suggestion.descriptionKey)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p style={suggestionFootnoteStyle}>
            {t("discovery.guidance.suggestions.other")}
          </p>
        </div>
      )}
    </div>
  )
}

function Examples({ exampleKeys }: { exampleKeys: readonly MessageKeyLike[] }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        style={linkButtonStyle}
      >
        {t("discovery.guidance.examples.show")}
      </button>
      <ul
        id={panelId}
        style={{ ...exampleListStyle, display: open ? "grid" : "none" }}
      >
        {exampleKeys.map((exampleKey) => (
          <li key={exampleKey} style={exampleItemStyle}>
            {t(exampleKey)}
          </li>
        ))}
      </ul>
    </div>
  )
}

// An explicit "not known yet" is not an empty field: it is recorded as a gap
// the consultant follows up on. What it means is said differently to each
// audience, but it records the same thing.
function UnknownControl({
  field,
  audience,
  isUnknown,
  onUnknownChange,
}: {
  field: DiscoveryFieldId
  audience: DiscoveryAudience
  isUnknown: boolean
  onUnknownChange: (unknown: boolean) => void
}) {
  if (!DISCOVERY_FIELD_GUIDANCE[field].unknownGapCategory) return null

  return (
    <div style={unknownRowStyle}>
      <label style={unknownLabelStyle}>
        <input
          type="checkbox"
          checked={isUnknown}
          onChange={(event) => onUnknownChange(event.target.checked)}
        />
        <span>{t("discovery.guidance.unknown.toggle")}</span>
      </label>
      {isUnknown && (
        <p style={unknownNoteStyle}>
          {audience === "client"
            ? t("discovery.guidance.unknown.client")
            : t("discovery.guidance.unknown.consultant")}
        </p>
      )}
    </div>
  )
}

// `Beispiel auswählen` for a sentence, `Kennzahl auswählen` for a metric, and
// the neutral wording everywhere else.
function suggestionOpenKey(field: DiscoveryFieldId) {
  if (field === "successMetrics") {
    return "discovery.guidance.suggestions.metric_open" as const
  }
  if (field === "desiredOutcome" || field === "businessImpact") {
    return "discovery.guidance.suggestions.example_open" as const
  }
  return "discovery.guidance.suggestions.open" as const
}

type MessageKeyLike = Parameters<typeof t>[0]

function toNullable(value: string): string | null {
  return value.trim() ? value : null
}

const fieldBlockStyle: React.CSSProperties = {
  // A guided question owns its row: its explanation, suggestions and examples
  // need the width, and a full-width row keeps every question left-aligned to
  // the same edge however many of them a section has.
  gridColumn: "1 / -1",
  display: "grid",
  gap: uiSpace.xxs,
  alignContent: "start",
  minWidth: 0,
}

const headerStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xxs,
}

const labelRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: uiSpace.xs,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: uiColors.textPrimary,
}

const infoButtonStyle: React.CSSProperties = {
  display: "inline-grid",
  placeItems: "center",
  width: 20,
  height: 20,
  flexShrink: 0,
  borderRadius: uiRadius.pill,
  border: `1px solid ${uiColors.borderStrong}`,
  background: uiColors.surface,
  color: uiColors.textSecondary,
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  cursor: "pointer",
}

const smallButtonStyle: React.CSSProperties = {
  minHeight: 32,
  padding: `0 ${uiSpace.sm}`,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.borderStrong}`,
  background: uiColors.surface,
  color: uiColors.textPrimary,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
}

const linkButtonStyle: React.CSSProperties = {
  padding: 0,
  border: 0,
  background: "transparent",
  color: uiColors.primary,
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "underline",
  cursor: "pointer",
}

const helpPanelStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  padding: uiSpace.xs,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.subtle,
}

const helpTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  fontWeight: 400,
  color: uiColors.textPrimary,
}

const consultantHintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  fontWeight: 400,
  color: uiColors.textSecondary,
}

const exampleListStyle: React.CSSProperties = {
  margin: `${uiSpace.xxs} 0 0`,
  padding: `0 0 0 ${uiSpace.md}`,
  display: "grid",
  gap: 2,
}

const exampleItemStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  fontWeight: 400,
  color: uiColors.textSecondary,
}

const suggestionPanelStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  padding: uiSpace.xs,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}

const suggestionGroupStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: uiColors.textMuted,
}

const suggestionListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: uiSpace.xxs,
}

const suggestionButtonStyle: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gap: 1,
  minHeight: 44,
  padding: `${uiSpace.xs} ${uiSpace.sm}`,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
  textAlign: "left",
  cursor: "pointer",
}

const suggestionLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: uiColors.textPrimary,
}

const suggestionDescriptionStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 400,
  color: uiColors.textSecondary,
}

const suggestionFootnoteStyle: React.CSSProperties = {
  ...hintStyle,
  margin: 0,
}

const chipListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexWrap: "wrap",
  gap: uiSpace.xxs,
}

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: uiSpace.xxs,
  padding: `4px 4px 4px ${uiSpace.xs}`,
  borderRadius: uiRadius.pill,
  border: `1px solid ${uiColors.borderStrong}`,
  background: uiColors.subtle,
  fontSize: 13,
  fontWeight: 400,
  color: uiColors.textPrimary,
}

const chipRemoveStyle: React.CSSProperties = {
  display: "inline-grid",
  placeItems: "center",
  width: 20,
  height: 20,
  borderRadius: uiRadius.pill,
  border: 0,
  background: "transparent",
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1,
  cursor: "pointer",
}

const emptySelectionStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 400,
  color: uiColors.textMuted,
}

const customRowStyle: React.CSSProperties = {
  display: "flex",
  gap: uiSpace.xs,
  alignItems: "center",
}

const unknownRowStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
}

const unknownLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: uiSpace.xs,
  fontSize: 12,
  fontWeight: 400,
  color: uiColors.textSecondary,
  cursor: "pointer",
}

const unknownNoteStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 400,
  color: uiColors.warning,
}
