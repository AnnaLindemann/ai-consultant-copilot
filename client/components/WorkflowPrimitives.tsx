"use client"

import type { ReactNode } from "react"

import {
  uiColors,
  uiRadius,
  uiSpace,
  uiTypography,
} from "../lib/design-tokens"
import type { WorkflowSectionStatus } from "../lib/workflow-status"
import {
  sectionStatusTone,
  workflowSectionStatusIcon,
  workflowSectionStatusLabel,
  workflowSectionStatusSummary,
} from "../lib/workflow-status"
import { t } from "../i18n"

export type WorkflowSectionItem = {
  id: string
  title: ReactNode
  status: WorkflowSectionStatus
  summary?: ReactNode
  meta?: ReactNode
  content: ReactNode
}

export function WorkflowProgressSummary({
  sections,
}: {
  sections: readonly { status: WorkflowSectionStatus }[]
}) {
  const counts = sections.reduce(
    (accumulator, section) => {
      accumulator[section.status] += 1
      return accumulator
    },
    {
      not_started: 0,
      in_progress: 0,
      complete: 0,
      action_required: 0,
    } as Record<WorkflowSectionStatus, number>,
  )

  const total = sections.length
  const complete = counts.complete
  const progress = total === 0 ? 0 : Math.round((complete / total) * 100)

  return (
    <section style={progressCardStyle} aria-label={t("workflow.progress.title")}>
      <div style={progressHeaderStyle}>
        <div>
          <h2 style={progressTitleStyle}>{t("workflow.progress.title")}</h2>
          <p style={progressSummaryStyle}>
            {t("workflow.progress.summary", {
              completed: complete,
              total,
            })}
          </p>
        </div>
        <div style={progressPercentStyle}>{progress}%</div>
      </div>

      <div aria-hidden="true" style={progressBarTrackStyle}>
        <div
          style={{
            ...progressBarFillStyle,
            width: `${progress}%`,
          }}
        />
      </div>

      <div style={progressCountsStyle}>
        <ProgressCount
          color={uiColors.success}
          label={t("workflow.progress.complete")}
          value={counts.complete}
        />
        <ProgressCount
          color={uiColors.warning}
          label={t("workflow.progress.partial")}
          value={counts.in_progress}
        />
        <ProgressCount
          color={uiColors.textSecondary}
          label={t("workflow.progress.not_started")}
          value={counts.not_started}
        />
        <ProgressCount
          color={uiColors.danger}
          label={t("workflow.progress.action_required")}
          value={counts.action_required}
        />
      </div>
    </section>
  )
}

type WorkflowAccordionProps = {
  items: readonly WorkflowSectionItem[]
  activeId: string
  onActiveIdChange: (id: string) => void
  onSectionFocus?: (id: string) => void
}

export function WorkflowAccordion({
  items,
  activeId,
  onActiveIdChange,
  onSectionFocus,
}: WorkflowAccordionProps) {
  return (
    <div style={accordionStackStyle}>
      {items.map((item) => {
        const isOpen = activeId === item.id

        return (
          <section
            key={item.id}
            id={item.id}
            style={{
              ...accordionItemStyle,
              borderColor: sectionStatusTone(item.status).border,
            }}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`${item.id}-panel`}
              onClick={() => {
                const nextId = isOpen ? "" : item.id
                onActiveIdChange(nextId)
                if (!isOpen) onSectionFocus?.(item.id)
              }}
              style={{
                ...accordionHeaderStyle,
                background: isOpen ? uiColors.primaryTint : uiColors.surface,
              }}
            >
              <div style={accordionHeaderContentStyle}>
                <div style={accordionTitleRowStyle}>
                  <span style={accordionTitleStyle}>{item.title}</span>
                  {item.meta && <span style={accordionMetaStyle}>{item.meta}</span>}
                </div>
                {item.summary && (
                  <div style={accordionSummaryStyle}>{item.summary}</div>
                )}
              </div>
              <SectionStatusBadge status={item.status} />
            </button>

            {isOpen && (
              <div id={`${item.id}-panel`} style={accordionPanelStyle}>
                {item.content}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

export function SectionStatusBadge({
  status,
}: {
  status: WorkflowSectionStatus
}) {
  const tone = sectionStatusTone(status)

  return (
    <span
      aria-label={workflowSectionStatusSummary(status)}
      title={workflowSectionStatusSummary(status)}
      style={{
        ...statusBadgeStyle,
        background: tone.background,
        color: tone.text,
        borderColor: tone.border,
      }}
    >
      <span aria-hidden="true" style={statusIconStyle}>
        {workflowSectionStatusIcon(status)}
      </span>
      <span>{workflowSectionStatusLabel(status)}</span>
    </span>
  )
}

export function SectionStatusLegend() {
  return (
    <section style={legendStyle} aria-labelledby="section-status-legend">
      <div style={legendHeaderStyle}>
        <h2 id="section-status-legend" style={legendTitleStyle}>
          {t("workflow.legend.title")}
        </h2>
        <p style={legendIntroStyle}>{t("workflow.legend.intro")}</p>
      </div>
      <div style={legendGridStyle}>
        {(["not_started", "in_progress", "complete", "action_required"] as const).map(
          (status) => (
            <div key={status} style={legendItemStyle}>
              <SectionStatusBadge status={status} />
              <p style={legendTextStyle}>{workflowSectionStatusSummary(status)}</p>
            </div>
          ),
        )}
      </div>
    </section>
  )
}

export function WorkflowSectionNav({
  title,
  sections,
  activeId,
  onSelect,
}: {
  title: string
  sections: readonly { id: string; title: ReactNode; status: WorkflowSectionStatus }[]
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <nav aria-label={title} style={navStyle}>
      <div style={navHeaderStyle}>
        <p style={navEyebrowStyle}>{t("workflow.nav.eyebrow")}</p>
        <h2 style={navTitleStyle}>{title}</h2>
      </div>
      <ul style={navListStyle}>
        {sections.map((section) => {
          const isActive = section.id === activeId

          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                aria-current={isActive ? "true" : undefined}
                style={{
                  ...navButtonStyle,
                  borderColor: isActive ? uiColors.primary : uiColors.border,
                  background: isActive ? uiColors.primaryTint : uiColors.surface,
                }}
              >
                <span style={navButtonContentStyle}>
                  <span style={navSectionTitleStyle}>{section.title}</span>
                  <SectionStatusBadge status={section.status} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const accordionStackStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
}

const accordionItemStyle: React.CSSProperties = {
  border: `1px solid ${uiColors.border}`,
  borderRadius: uiRadius.card,
  background: uiColors.surface,
  overflow: "clip",
}

const accordionHeaderStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: uiSpace.lg,
  padding: `${uiSpace.lg} ${uiSpace.lg}`,
  border: 0,
  borderBottom: `1px solid ${uiColors.border}`,
  fontFamily: uiTypography.sans,
  textAlign: "left",
  cursor: "pointer",
}

const accordionHeaderContentStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: uiSpace.xs,
}

const accordionTitleRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: uiSpace.sm,
}

const accordionTitleStyle: React.CSSProperties = {
  color: uiColors.textPrimary,
  fontSize: "1rem",
  fontWeight: 650,
}

const accordionMetaStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: "0.875rem",
}

const accordionSummaryStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: "0.875rem",
  lineHeight: 1.5,
}

const accordionPanelStyle: React.CSSProperties = {
  padding: uiSpace.lg,
}

const progressCardStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  padding: uiSpace.lg,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}

const progressHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: uiSpace.lg,
}

const progressTitleStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: "1rem",
  fontWeight: 650,
}

const progressSummaryStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: uiColors.textSecondary,
  fontSize: "0.875rem",
}

const progressPercentStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: "1.125rem",
  fontWeight: 650,
}

const progressBarTrackStyle: React.CSSProperties = {
  overflow: "hidden",
  width: "100%",
  height: 8,
  borderRadius: uiRadius.pill,
  background: uiColors.subtle,
}

const progressBarFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: uiRadius.pill,
  background: uiColors.primary,
}

const progressCountsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: uiSpace.sm,
}

function ProgressCount({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div style={progressCountStyle}>
      <span style={{ ...progressCountValueStyle, color }}>{value}</span>
      <span style={progressCountLabelStyle}>{label}</span>
    </div>
  )
}

const progressCountStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
}

const progressCountValueStyle: React.CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 650,
  lineHeight: 1.1,
}

const progressCountLabelStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: "0.75rem",
}

const statusBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: uiSpace.xs,
  borderRadius: uiRadius.pill,
  border: `1px solid ${uiColors.border}`,
  padding: `${uiSpace.xs} ${uiSpace.md}`,
  fontSize: "0.8125rem",
  fontWeight: 650,
  whiteSpace: "nowrap",
}

const statusIconStyle: React.CSSProperties = {
  display: "inline-flex",
  width: 14,
  justifyContent: "center",
  fontSize: 13,
  lineHeight: 1,
}

const legendStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  padding: uiSpace.lg,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}

const legendHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
}

const legendTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  fontWeight: 650,
  color: uiColors.textPrimary,
}

const legendIntroStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: "0.875rem",
  lineHeight: 1.5,
}

const legendGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: uiSpace.md,
}

const legendItemStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  alignItems: "start",
}

const legendTextStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: "0.8125rem",
  lineHeight: 1.45,
}

const navStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  padding: uiSpace.lg,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
  position: "sticky",
  top: uiSpace.lg,
}

const navHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
}

const navEyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textMuted,
  fontSize: "0.75rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.08,
}

const navTitleStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: "0.95rem",
  fontWeight: 650,
}

const navListStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: uiSpace.sm,
}

const navButtonStyle: React.CSSProperties = {
  width: "100%",
  display: "block",
  textAlign: "left",
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  padding: uiSpace.md,
  background: uiColors.surface,
  cursor: "pointer",
}

const navButtonContentStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
}

const navSectionTitleStyle: React.CSSProperties = {
  color: uiColors.textPrimary,
  fontSize: "0.875rem",
  fontWeight: 600,
  lineHeight: 1.35,
}
