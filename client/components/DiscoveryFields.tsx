"use client"

import { t } from "../i18n"

// The input primitives and styling shared by the Discovery Profile editor and
// the value & measurement baseline editor, so both surfaces of the same stage
// look and behave alike.

export function DiscoverySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <fieldset style={sectionStyle}>
      <legend style={legendStyle}>{title}</legend>
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
  color: "#4f46e5",
  fontWeight: 800,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.8,
}
export const introStyle: React.CSSProperties = {
  margin: 0,
  color: "#6b7280",
  lineHeight: 1.55,
  maxWidth: 720,
}
export const sectionStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 20,
  margin: 0,
}
export const legendStyle: React.CSSProperties = {
  padding: "0 8px",
  fontWeight: 800,
  fontSize: 18,
}
export const fieldsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 16,
}
export const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 7,
  alignContent: "start",
  fontWeight: 700,
  fontSize: 14,
}
export const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "11px 12px",
  fontSize: 15,
  background: "#fff",
  color: "#111827",
}
export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 88,
  resize: "vertical",
}
export const hintStyle: React.CSSProperties = { color: "#6b7280", fontWeight: 400 }
export const saveButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 12,
  padding: "12px 17px",
  background: "#4f46e5",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
}
export const addButtonStyle: React.CSSProperties = {
  ...saveButtonStyle,
  background: "#111827",
}
export const removeButtonStyle: React.CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#b91c1c",
  fontWeight: 700,
  cursor: "pointer",
}
export const successStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 12,
  background: "#ecfdf5",
  color: "#065f46",
  border: "1px solid #bbf7d0",
}
export const errorStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 12,
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
}
export const cardRowStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 12,
  background: "#fff",
  border: "1px solid #e5e7eb",
}
