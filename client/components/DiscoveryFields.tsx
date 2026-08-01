"use client"

import { t } from "../i18n"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"

// The input primitives and styling shared by the Discovery Profile editor and
// the value & measurement baseline editor, so both surfaces of the same stage
// look and behave alike. Every visual value comes from the UI kit's tokens
// (coding-standards.md §12B).

// The fields of one section. The grouping stays a `fieldset` so assistive
// technology still hears the section name, but the name is not drawn a second
// time: the section it belongs to already carries it in its own header.
export function DiscoverySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <fieldset style={sectionStyle}>
      <legend className="visually-hidden">{title}</legend>
      <div style={fieldsGridStyle}>{children}</div>
    </fieldset>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  placeholder: string
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input
        value={value ?? ""}
        onChange={(event) => onChange(toNullableText(event.target.value))}
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  placeholder: string
}) {
  return (
    <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
      <span>{label}</span>
      <textarea
        value={value ?? ""}
        onChange={(event) => onChange(toNullableText(event.target.value))}
        placeholder={placeholder}
        style={textareaStyle}
      />
    </label>
  )
}

export function ListField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input
        value={value.join(", ")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        placeholder={placeholder}
        style={inputStyle}
      />
      <small style={hintStyle}>{t("common.field.comma_hint")}</small>
    </label>
  )
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  includeUnknown = true,
  optionLabels,
}: {
  label: string
  value: string | null
  options: readonly string[]
  onChange: (value: string | null) => void
  includeUnknown?: boolean
  // Localized labels for the option *identifiers*. Where they are supplied the
  // option's identifier is mapped to its translation; nothing keys off the
  // displayed text (coding-standards.md §12A).
  optionLabels?: Record<string, string>
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        style={inputStyle}
      >
        {includeUnknown && (
          <option value="">{t("common.field.not_captured")}</option>
        )}
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? formatOption(option)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function BooleanField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <select
        value={value === null ? "" : String(value)}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? null : event.target.value === "true",
          )
        }
        style={inputStyle}
      >
        <option value="">{t("common.field.not_captured")}</option>
        <option value="true">{t("common.field.yes")}</option>
        <option value="false">{t("common.field.no")}</option>
      </select>
    </label>
  )
}

export function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : null)
        }
        style={inputStyle}
      />
    </label>
  )
}

export function toNullableText(value: string): string | null {
  return value.trim() ? value : null
}

export function formatOption(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
}

export const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textMuted,
  fontWeight: 700,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
}
export const introStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1.5,
  maxWidth: 760,
}
export const sectionStyle: React.CSSProperties = {
  border: 0,
  padding: 0,
  margin: 0,
  minWidth: 0,
}
export const fieldsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: uiSpace.md,
}
export const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xxs,
  alignContent: "start",
  fontWeight: 600,
  fontSize: 13,
  color: uiColors.textPrimary,
}
export const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.borderStrong}`,
  padding: "9px 11px",
  fontSize: 14,
  fontWeight: 400,
  background: uiColors.surface,
  color: uiColors.textPrimary,
}
export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  lineHeight: 1.5,
  resize: "vertical",
}
export const hintStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontWeight: 400,
  fontSize: 12,
}
export const saveButtonStyle: React.CSSProperties = {
  border: `1px solid ${uiColors.primary}`,
  borderRadius: uiRadius.control,
  minHeight: 40,
  padding: `0 ${uiSpace.md}`,
  background: uiColors.primary,
  color: uiColors.textInverse,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
}
export const addButtonStyle: React.CSSProperties = {
  ...saveButtonStyle,
  border: `1px solid ${uiColors.borderStrong}`,
  background: uiColors.surface,
  color: uiColors.textPrimary,
}
export const removeButtonStyle: React.CSSProperties = {
  border: 0,
  background: "transparent",
  color: uiColors.danger,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}
export const successStyle: React.CSSProperties = {
  margin: 0,
  padding: `${uiSpace.sm} ${uiSpace.md}`,
  borderRadius: uiRadius.control,
  background: uiColors.successTint,
  color: uiColors.success,
  border: `1px solid ${uiColors.success}33`,
  fontSize: 14,
}
export const errorStyle: React.CSSProperties = {
  margin: 0,
  padding: `${uiSpace.sm} ${uiSpace.md}`,
  borderRadius: uiRadius.control,
  background: uiColors.dangerTint,
  color: uiColors.danger,
  border: `1px solid ${uiColors.danger}33`,
  fontSize: 14,
}
export const cardRowStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.sm,
  padding: uiSpace.sm,
  borderRadius: uiRadius.control,
  background: uiColors.surface,
  border: `1px solid ${uiColors.border}`,
}
