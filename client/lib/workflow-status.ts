import { t } from "../i18n"
import { uiColors } from "./design-tokens"

export type WorkflowSectionStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "action_required"

export const WORKFLOW_SECTION_STATUSES: readonly WorkflowSectionStatus[] = [
  "not_started",
  "in_progress",
  "complete",
  "action_required",
] as const

export const workflowSectionStatusLabel = (
  status: WorkflowSectionStatus,
): string => t(`workflow.status.${status}`)

export const workflowSectionStatusSummary = (
  status: WorkflowSectionStatus,
): string => t(`workflow.status.summary.${status}`)

// The same status, named for its context: something still to supply reads as
// "Angaben erforderlich", while a Discovery the consultant sent back reads as
// "Korrektur erforderlich". The identifier is unchanged either way.
export const sectionStatusLabelInContext = (
  status: WorkflowSectionStatus,
  wasReturned: boolean,
): string =>
  status === "action_required" && wasReturned
    ? t("workflow.status.action_required.returned")
    : workflowSectionStatusLabel(status)

export const workflowSectionStatusTone = (
  status: WorkflowSectionStatus,
): "neutral" | "warning" | "success" | "danger" => {
  switch (status) {
    case "not_started":
      return "neutral"
    case "in_progress":
      return "warning"
    case "complete":
      return "success"
    case "action_required":
      return "danger"
  }
}

export const workflowSectionStatusIcon = (
  status: WorkflowSectionStatus,
): string => {
  switch (status) {
    case "not_started":
      return "○"
    case "in_progress":
      return "◔"
    case "complete":
      return "✓"
    case "action_required":
      return "!"
  }
}

export const hasText = (value: string | null | undefined): boolean =>
  value !== null && value !== undefined && value.trim().length > 0

export const hasAnyText = (values: readonly (string | null | undefined)[]): boolean =>
  values.some((value) => hasText(value))

export const hasAllText = (values: readonly (string | null | undefined)[]): boolean =>
  values.every((value) => hasText(value))

export const hasAnyItem = <T>(values: readonly T[] | null | undefined): boolean =>
  values !== null && values !== undefined && values.length > 0

export const hasAnyTruthy = (
  values: readonly (boolean | number | string | null | undefined)[],
): boolean => values.some((value) => Boolean(value))

export const isSectionOpenByDefault = (
  status: WorkflowSectionStatus,
  isCurrent: boolean,
): boolean => status !== "complete" || isCurrent

// A section's status, in the approved semantic tints — the same four the badges
// and alerts use. Nothing here is a feature colour: a tone means "complete",
// "still open", "not started" or "needs attention" and nothing else.
export const sectionStatusTone = (
  status: WorkflowSectionStatus,
): Record<string, string> => {
  switch (status) {
    case "not_started":
      return {
        background: uiColors.subtle,
        border: uiColors.borderStrong,
        text: uiColors.textSecondary,
      }
    case "in_progress":
      return {
        background: uiColors.warningTint,
        border: uiColors.border,
        text: uiColors.warning,
      }
    case "complete":
      return {
        background: uiColors.successTint,
        border: uiColors.border,
        text: uiColors.success,
      }
    case "action_required":
      return {
        background: uiColors.dangerTint,
        border: uiColors.border,
        text: uiColors.danger,
      }
  }
}

