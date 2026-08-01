import type { CSSProperties, ReactNode } from "react"

import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"

// The shared control vocabulary.
//
// Every page used to carry its own palette and its own control geometry: an
// indigo button here, a teal one there, a near-black one on a third screen,
// with four different corner radii and five different heights. The result was
// one product that looked like five.
//
// There is now one definition of each control, derived from the approved design
// tokens (UI-KIT §4, §9). A page picks a variant; it does not invent a colour, a
// height, or a radius. Nothing in this module is user-facing text — the labels
// stay with the surfaces that own them, looked up by key.
//
// Deliberately *not* marked `"use client"`: nothing here holds state or an
// event handler, and a client boundary would stop a server-rendered page from
// calling `buttonStyle(…)` at all. It compiles into whichever environment
// imports it.

// --- geometry ------------------------------------------------------------
// One control height across the product, so a button, an input and a select
// standing next to each other line up (UI-KIT §9). 40px on desktop; the 44px
// minimum touch target applies to the navigation and the accordion headers,
// which are the surfaces a finger actually aims at.

export const CONTROL_HEIGHT = 40

// --- buttons -------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost"

const buttonBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: uiSpace.xs,
  minHeight: CONTROL_HEIGHT,
  padding: `0 ${uiSpace.md}`,
  borderRadius: uiRadius.control,
  border: `1px solid transparent`,
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.2,
  textDecoration: "none",
  whiteSpace: "nowrap",
  cursor: "pointer",
}

const primaryButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  borderColor: uiColors.primary,
  background: uiColors.primary,
  color: uiColors.textInverse,
}

const secondaryButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  borderColor: uiColors.borderStrong,
  background: uiColors.surface,
  color: uiColors.textPrimary,
}

const dangerButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  borderColor: uiColors.danger,
  background: uiColors.danger,
  color: uiColors.textInverse,
}

const ghostButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  padding: `0 ${uiSpace.sm}`,
  borderColor: "transparent",
  background: "transparent",
  color: uiColors.textSecondary,
}

const BUTTON_VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: primaryButtonStyle,
  secondary: secondaryButtonStyle,
  danger: dangerButtonStyle,
  ghost: ghostButtonStyle,
}

const disabledButtonStyle: CSSProperties = {
  opacity: 0.55,
  cursor: "not-allowed",
}

// The style for a button or a link that acts as one. `disabled` only dims it —
// the control's own `disabled` attribute is what actually refuses the click.
export const buttonStyle = (
  variant: ButtonVariant = "primary",
  disabled = false,
): CSSProperties =>
  disabled
    ? { ...BUTTON_VARIANTS[variant], ...disabledButtonStyle }
    : BUTTON_VARIANTS[variant]

// A compact button for a row of repeated controls (reorder, remove), where a
// full-height control would dominate the row it sits in.
const smallButtonStyle: CSSProperties = {
  minHeight: 32,
  padding: `0 ${uiSpace.sm}`,
  fontSize: 13,
}

export const compactButtonStyle = (
  variant: ButtonVariant = "secondary",
  disabled = false,
): CSSProperties => ({ ...buttonStyle(variant, disabled), ...smallButtonStyle })

// Removing an item is destructive but repeated, so it reads as a quiet link in
// danger colour rather than as a filled red button in every row.
export const removeButtonStyle: CSSProperties = {
  ...ghostButtonStyle,
  ...smallButtonStyle,
  marginLeft: "auto",
  color: uiColors.danger,
}

// --- form controls -------------------------------------------------------

export const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: CONTROL_HEIGHT,
  padding: `0 ${uiSpace.sm}`,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.borderStrong}`,
  background: uiColors.surface,
  color: uiColors.textPrimary,
  fontSize: 14,
}

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 84,
  padding: `${uiSpace.xs} ${uiSpace.sm}`,
  lineHeight: 1.5,
  resize: "vertical",
}

// A read-only value looks like information, not like a disabled control
// (UI-KIT §9.2).
export const readOnlyValueStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  lineHeight: 1.5,
}

// The label/control/hint stack. Labels are `Body strong` — 14/600 — not the
// heavy 700–800 weights the pages used to reach for individually.
export const fieldStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.xxs,
  alignContent: "start",
  minWidth: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  fontWeight: 600,
}

export const hintStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1.45,
}

// Field columns wrap rather than shrink, and never exceed the readable form
// measure the UI kit sets (UI-KIT §4.5).
export const fieldsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: uiSpace.md,
}

export const checkboxFieldStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: uiSpace.sm,
  minHeight: CONTROL_HEIGHT,
  padding: `0 ${uiSpace.sm}`,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
}

// --- surfaces ------------------------------------------------------------

// A grouped block inside a page: a border, never a shadow (UI-KIT §4.4).
export const cardStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  padding: uiSpace.lg,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}

// A block nested inside a card. It is tinted rather than bordered-and-shadowed,
// so a card inside a card still reads as one surface.
export const nestedBlockStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.sm,
  padding: uiSpace.md,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.subtle,
}

export const fieldsetStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  margin: 0,
  padding: uiSpace.md,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}

export const legendStyle: CSSProperties = {
  padding: `0 ${uiSpace.xs}`,
  color: uiColors.textPrimary,
  fontSize: 15,
  fontWeight: 650,
}

// --- typography ----------------------------------------------------------

export const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 18,
  lineHeight: 1.35,
  fontWeight: 600,
}

export const subSectionTitleStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 15,
  lineHeight: 1.4,
  fontWeight: 650,
}

export const bodyTextStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  lineHeight: 1.55,
}

export const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1.55,
}

export const metaTextStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
}

export const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textMuted,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
}

// --- status ---------------------------------------------------------------

// Semantic tone, and only semantic tone: a colour here means a status, never a
// feature (UI-KIT §4.1). There is no per-page accent.
export type Tone = "neutral" | "info" | "success" | "warning" | "danger"

type ToneColors = { background: string; border: string; text: string }

const TONES: Record<Tone, ToneColors> = {
  neutral: {
    background: uiColors.subtle,
    border: uiColors.border,
    text: uiColors.textSecondary,
  },
  info: {
    background: uiColors.infoTint,
    border: uiColors.border,
    text: uiColors.info,
  },
  success: {
    background: uiColors.successTint,
    border: uiColors.border,
    text: uiColors.success,
  },
  warning: {
    background: uiColors.warningTint,
    border: uiColors.border,
    text: uiColors.warning,
  },
  danger: {
    background: uiColors.dangerTint,
    border: uiColors.border,
    text: uiColors.danger,
  },
}

export const toneColors = (tone: Tone): ToneColors => TONES[tone]

const badgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: uiSpace.xxs,
  padding: `2px ${uiSpace.xs}`,
  borderRadius: uiRadius.pill,
  border: `1px solid transparent`,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.5,
  whiteSpace: "nowrap",
}

export const badgeStyle = (tone: Tone = "neutral"): CSSProperties => {
  const colors = TONES[tone]
  return {
    ...badgeBaseStyle,
    background: colors.background,
    borderColor: colors.border,
    color: colors.text,
  }
}

// A badge always carries a glyph as well as its wording, so status is never
// conveyed by colour alone (UI-KIT §3.8, §16).
const TONE_ICONS: Record<Tone, string> = {
  neutral: "○",
  info: "i",
  success: "✓",
  warning: "!",
  danger: "!",
}

export function Badge({
  tone = "neutral",
  label,
}: {
  tone?: Tone
  label: string
}) {
  return (
    <span style={badgeStyle(tone)}>
      <span aria-hidden="true" style={badgeIconStyle}>
        {TONE_ICONS[tone]}
      </span>
      <span>{label}</span>
    </span>
  )
}

const badgeIconStyle: CSSProperties = {
  display: "inline-flex",
  width: 12,
  justifyContent: "center",
  fontSize: 11,
  lineHeight: 1,
}

// --- feedback -------------------------------------------------------------

const alertBaseStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: uiSpace.sm,
  margin: 0,
  padding: `${uiSpace.sm} ${uiSpace.md}`,
  borderRadius: uiRadius.control,
  border: `1px solid transparent`,
  fontSize: 14,
  lineHeight: 1.5,
}

export const alertStyle = (tone: Tone = "info"): CSSProperties => {
  const colors = TONES[tone]
  return {
    ...alertBaseStyle,
    background: colors.background,
    borderColor: colors.border,
    color: colors.text,
  }
}

// A persistent state or problem, announced to assistive technology according to
// whether it is a failure or a confirmation (UI-KIT §9.8).
export function InlineAlert({
  tone = "info",
  children,
}: {
  tone?: Tone
  children: ReactNode
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={alertStyle(tone)}
    >
      {children}
    </div>
  )
}

// First use, no results, and a step that is not available yet all look the
// same: a quiet bounded area that says what would appear here.
export const emptyStateStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  margin: 0,
  padding: uiSpace.md,
  borderRadius: uiRadius.control,
  border: `1px dashed ${uiColors.borderStrong}`,
  background: uiColors.subtle,
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1.5,
}

export function EmptyState({
  title,
  children,
}: {
  title?: string
  children?: ReactNode
}) {
  return (
    <div style={emptyStateStyle}>
      {title && <p style={emptyStateTitleStyle}>{title}</p>}
      {children}
    </div>
  )
}

const emptyStateTitleStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  fontWeight: 600,
}

// --- layout ---------------------------------------------------------------

// The vertical rhythm of a page's sections. One gap, applied once, instead of
// each block carrying its own margin.
export const pageStackStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  alignContent: "start",
  minWidth: 0,
}

export const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: uiSpace.sm,
}

export const actionRowStyle: CSSProperties = {
  ...rowStyle,
  justifyContent: "flex-end",
}

// A comparison table. It scrolls inside its own container rather than pushing
// the page sideways (UI-KIT §5).
export const tableScrollStyle: CSSProperties = {
  width: "100%",
  overflowX: "auto",
}

export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
}

export const tableHeadCellStyle: CSSProperties = {
  padding: `${uiSpace.xs} ${uiSpace.sm}`,
  borderBottom: `1px solid ${uiColors.border}`,
  color: uiColors.textSecondary,
  fontSize: 12,
  fontWeight: 600,
  textAlign: "left",
  whiteSpace: "nowrap",
}

export const tableCellStyle: CSSProperties = {
  padding: `${uiSpace.sm} ${uiSpace.sm}`,
  borderBottom: `1px solid ${uiColors.border}`,
  color: uiColors.textPrimary,
  verticalAlign: "top",
}
