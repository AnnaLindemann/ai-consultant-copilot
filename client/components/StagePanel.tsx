"use client"

import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"

// The one surface every implemented stage of an engagement sits on.
//
// Each panel used to carry its own width, radius, padding and shadow, which is
// why the engagement page read as a column of unrelated cards of three
// different widths. There is now a single definition: the panels share a parent
// container, so they share an edge, and none of them sets a maximum width of
// its own — the engagement workspace is as wide as the shell gives it.

export const stageSurfaceStyle: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gap: uiSpace.md,
  padding: uiSpace.lg,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}

export const stageHeaderStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: `${uiSpace.sm} ${uiSpace.lg}`,
}

export const stageEyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textMuted,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
}

export const stageHeadingStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 22,
  lineHeight: 1.3,
  fontWeight: 650,
  color: uiColors.textPrimary,
}

export const stageIntroStyle: React.CSSProperties = {
  margin: "6px 0 0",
  maxWidth: 760,
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1.5,
}
