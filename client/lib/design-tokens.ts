import tokens from "./design-tokens.json"

// Canonical design values from the approved UI kit. Keeping them in one place
// prevents page-level components from hard-coding their own palette.

export const designTokens = tokens

export const uiColors = {
  canvas: designTokens.color.background.canvas.$value,
  surface: designTokens.color.background.surface.$value,
  subtle: designTokens.color.background.subtle.$value,
  inverse: designTokens.color.background.inverse.$value,
  textPrimary: designTokens.color.text.primary.$value,
  textSecondary: designTokens.color.text.secondary.$value,
  textMuted: designTokens.color.text.muted.$value,
  textInverse: designTokens.color.text.inverse.$value,
  border: designTokens.color.border.default.$value,
  borderStrong: designTokens.color.border.strong.$value,
  primary: designTokens.color.primary["600"].$value,
  primaryHover: designTokens.color.primary["700"].$value,
  primaryTint: designTokens.color.primary["050"].$value,
  success: designTokens.color.success["600"].$value,
  successTint: designTokens.color.success["050"].$value,
  warning: designTokens.color.warning["600"].$value,
  warningTint: designTokens.color.warning["050"].$value,
  danger: designTokens.color.danger["600"].$value,
  dangerTint: designTokens.color.danger["050"].$value,
  info: designTokens.color.info["600"].$value,
  infoTint: designTokens.color.info["050"].$value,
} as const

export const uiSpace = {
  xxs: designTokens.space["1"].$value,
  xs: designTokens.space["2"].$value,
  sm: designTokens.space["3"].$value,
  md: designTokens.space["4"].$value,
  lg: designTokens.space["6"].$value,
  xl: designTokens.space["8"].$value,
  xxl: designTokens.space["12"].$value,
} as const

export const uiRadius = {
  control: designTokens.radius.control.$value,
  card: designTokens.radius.card.$value,
  dialog: designTokens.radius.dialog.$value,
  pill: designTokens.radius.pill.$value,
} as const

export const uiLayout = {
  sidebarExpanded: designTokens.layout.sidebarExpanded.$value,
  sidebarCollapsed: designTokens.layout.sidebarCollapsed.$value,
  contextRail: designTokens.layout.contextRail.$value,
  contentMax: designTokens.layout.contentMax.$value,
  formMax: designTokens.layout.formMax.$value,
  clientPortalMax: designTokens.layout.clientPortalMax.$value,
} as const

export const uiTypography = {
  sans:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
} as const
