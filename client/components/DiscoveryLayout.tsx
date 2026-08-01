"use client"

import type { WorkflowSectionItem } from "./WorkflowPrimitives"
import { t } from "../i18n"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"
import { summarizeDiscoveryProgress } from "../lib/discovery-progress"
import {
  WORKFLOW_SECTION_STATUSES,
  sectionStatusLabelInContext,
  sectionStatusTone,
  workflowSectionStatusIcon,
  workflowSectionStatusLabel,
  workflowSectionStatusSummary,
  type WorkflowSectionStatus,
} from "../lib/workflow-status"

// The parts of the Discovery screen the consultant and the client see the same
// way: how far the Discovery has come, which sections there are, and the
// accordion itself. Only the chrome around them differs.

// Status is never carried by colour alone: the glyph and the wording travel
// with it (UI-KIT §3.8, §16).
export function DiscoveryStatusIcon({
  status,
  wasReturned = false,
}: {
  status: WorkflowSectionStatus
  wasReturned?: boolean
}) {
  const tone = sectionStatusTone(status)

  return (
    <span
      role="img"
      aria-label={sectionStatusLabelInContext(status, wasReturned)}
      style={{
        ...statusIconStyle,
        background: tone.background,
        borderColor: tone.border,
        color: tone.text,
      }}
    >
      <span aria-hidden="true">{workflowSectionStatusIcon(status)}</span>
    </span>
  )
}

export function DiscoveryProgressSummary({
  sections,
  wasReturned,
}: {
  sections: readonly WorkflowSectionItem[]
  wasReturned: boolean
}) {
  const progress = summarizeDiscoveryProgress(sections)

  return (
    <section style={progressStyle} aria-label={t("workflow.progress.title")}>
      <div style={progressLeadStyle}>
        <p style={progressTitleStyle}>{t("workflow.progress.title")}</p>
        <p style={progressCopyStyle}>
          {t("workflow.progress.summary", {
            completed: progress.complete,
            total: progress.total,
          })}
        </p>
        <div style={progressBarRowStyle}>
          <div
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("workflow.progress.title")}
            style={progressTrackStyle}
          >
            <div style={{ ...progressFillStyle, width: `${progress.percent}%` }} />
          </div>
          <span style={progressPercentStyle}>{`${progress.percent}%`}</span>
        </div>
      </div>

      <dl style={progressCountsStyle}>
        <ProgressCount
          status="complete"
          label={t("workflow.progress.complete")}
          value={progress.counts.complete}
        />
        <ProgressCount
          status="in_progress"
          label={t("workflow.progress.partial")}
          value={progress.counts.in_progress}
        />
        <ProgressCount
          status="not_started"
          label={t("workflow.progress.not_started")}
          value={progress.counts.not_started}
        />
        <ProgressCount
          status="action_required"
          label={sectionStatusLabelInContext("action_required", wasReturned)}
          value={progress.counts.action_required}
        />
      </dl>
    </section>
  )
}

function ProgressCount({
  status,
  label,
  value,
}: {
  status: WorkflowSectionStatus
  label: string
  value: number
}) {
  return (
    <div style={progressCountStyle}>
      <dt style={progressCountLabelStyle}>
        <span aria-hidden="true" style={dotStyle(status)} />
        <span>{label}</span>
      </dt>
      <dd style={progressCountValueStyle}>{value}</dd>
    </div>
  )
}

// Compact rows, not cards: name, status icon, and the status in words. The
// selected row is the one whose section is open in the accordion.
export function DiscoverySectionNavigation({
  sections,
  activeId,
  wasReturned,
  onSelect,
}: {
  sections: readonly WorkflowSectionItem[]
  activeId: string
  wasReturned: boolean
  onSelect: (id: string) => void
}) {
  return (
    <nav aria-label={t("workflow.nav.discovery_title")} style={navStyle}>
      <p style={navTitleStyle}>{t("workflow.nav.discovery_title")}</p>
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
                  ...navItemStyle,
                  background: isActive ? uiColors.primaryTint : "transparent",
                  boxShadow: isActive
                    ? `inset 2px 0 0 ${uiColors.primary}`
                    : undefined,
                }}
              >
                <DiscoveryStatusIcon
                  status={section.status}
                  wasReturned={wasReturned}
                />
                <span style={navItemCopyStyle}>
                  <span
                    style={{
                      ...navItemTitleStyle,
                      color: isActive ? uiColors.primary : uiColors.textPrimary,
                    }}
                  >
                    {section.title}
                  </span>
                  <span style={navItemStatusStyle}>
                    {sectionStatusLabelInContext(section.status, wasReturned)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// On a phone the row list would take a screenful before the first question, so
// the same navigation collapses into one select.
export function DiscoverySectionSelector({
  sections,
  activeId,
  onSelect,
}: {
  sections: readonly WorkflowSectionItem[]
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <label className="discovery-section-selector" style={selectorStyle}>
      <span style={selectorLabelStyle}>{t("workflow.nav.discovery_title")}</span>
      <select
        value={activeId}
        onChange={(event) => onSelect(event.target.value)}
        style={selectorControlStyle}
      >
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {typeof section.title === "string" ? section.title : section.id}
          </option>
        ))}
      </select>
    </label>
  )
}

export function DiscoveryAccordion({
  sections,
  activeId,
  wasReturned,
  onToggle,
}: {
  sections: readonly WorkflowSectionItem[]
  activeId: string
  wasReturned: boolean
  onToggle: (id: string) => void
}) {
  return (
    <div style={accordionStackStyle}>
      {sections.map((section) => {
        const isOpen = section.id === activeId
        const tone = sectionStatusTone(section.status)

        return (
          <section
            key={section.id}
            id={section.id}
            className="discovery-section"
            style={{
              ...accordionItemStyle,
              borderColor: isOpen ? uiColors.borderStrong : uiColors.border,
            }}
          >
            <h2 style={accordionHeadingStyle}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${section.id}-panel`}
                onClick={() => onToggle(section.id)}
                style={accordionHeaderStyle}
              >
                <DiscoveryStatusIcon
                  status={section.status}
                  wasReturned={wasReturned}
                />
                <span style={accordionTitleStyle}>{section.title}</span>
                {/* The status stays readable while the section is closed. */}
                <span style={{ ...accordionStatusStyle, color: tone.text }}>
                  {sectionStatusLabelInContext(section.status, wasReturned)}
                </span>
                <span
                  aria-hidden="true"
                  className="discovery-chevron"
                  style={{
                    display: "inline-flex",
                    color: uiColors.textMuted,
                    transform: isOpen ? "rotate(180deg)" : undefined,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>
            </h2>

            {/* Closing a section unmounts its panel but not its values: the
                profile lives above the accordion, so what was typed is still
                there when it reopens. */}
            {isOpen && (
              <div id={`${section.id}-panel`} style={accordionPanelStyle}>
                {section.content}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

export function DiscoveryStatusLegend({ wasReturned }: { wasReturned: boolean }) {
  return (
    <ul style={legendListStyle}>
      {WORKFLOW_SECTION_STATUSES.map((status) => (
        <li key={status} style={legendItemStyle}>
          <DiscoveryStatusIcon status={status} wasReturned={wasReturned} />
          <div>
            <p style={legendTermStyle}>
              {sectionStatusLabelInContext(status, wasReturned)}
            </p>
            <p style={legendCopyStyle}>{workflowSectionStatusSummary(status)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export { workflowSectionStatusLabel }

const progressStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: `${uiSpace.md} ${uiSpace.xl}`,
  padding: uiSpace.md,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}

const progressLeadStyle: React.CSSProperties = {
  flex: "1 1 300px",
  minWidth: 0,
  display: "grid",
  gap: uiSpace.xxs,
}

const progressTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 650,
  color: uiColors.textPrimary,
}

const progressCopyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: uiColors.textSecondary,
}

const progressBarRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: uiSpace.sm,
  marginTop: uiSpace.xxs,
}

const progressTrackStyle: React.CSSProperties = {
  flex: 1,
  height: 6,
  minWidth: 100,
  borderRadius: uiRadius.pill,
  background: uiColors.subtle,
  overflow: "hidden",
}

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: uiRadius.pill,
  background: uiColors.primary,
}

const progressPercentStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 650,
  color: uiColors.textSecondary,
  minWidth: 38,
  textAlign: "right",
}

const progressCountsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: `${uiSpace.sm} ${uiSpace.lg}`,
  margin: 0,
}

const progressCountStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
}

const progressCountLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: uiSpace.xs,
  fontSize: 12,
  color: uiColors.textSecondary,
}

const progressCountValueStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 650,
  lineHeight: 1.2,
  color: uiColors.textPrimary,
}

const dotStyle = (status: WorkflowSectionStatus): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: uiRadius.pill,
  background: sectionStatusTone(status).text,
})

const navStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  padding: uiSpace.xs,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}

const navTitleStyle: React.CSSProperties = {
  margin: `${uiSpace.xs} 0 0 ${uiSpace.xs}`,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: uiColors.textMuted,
}

const navListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 2,
}

const navItemStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: uiSpace.xs,
  minHeight: 44,
  padding: uiSpace.xs,
  border: 0,
  borderRadius: uiRadius.control,
  textAlign: "left",
  cursor: "pointer",
}

const navItemCopyStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 1,
}

const navItemTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.3,
}

const navItemStatusStyle: React.CSSProperties = {
  fontSize: 11,
  color: uiColors.textSecondary,
  lineHeight: 1.3,
}

const selectorStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xxs,
}

const selectorLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: uiColors.textMuted,
}

const selectorControlStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: `0 ${uiSpace.sm}`,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.borderStrong}`,
  background: uiColors.surface,
  color: uiColors.textPrimary,
  fontSize: 14,
}

const accordionStackStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: uiSpace.xs,
  alignContent: "start",
}

const accordionItemStyle: React.CSSProperties = {
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
  overflow: "clip",
}

const accordionHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "inherit",
  fontWeight: 400,
}

const accordionHeaderStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: uiSpace.sm,
  minHeight: 52,
  padding: `${uiSpace.xs} ${uiSpace.md}`,
  border: 0,
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
}

const accordionTitleStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 15,
  fontWeight: 650,
  color: uiColors.textPrimary,
}

const accordionStatusStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
}

const accordionPanelStyle: React.CSSProperties = {
  padding: `${uiSpace.md} ${uiSpace.md} ${uiSpace.lg}`,
  borderTop: `1px solid ${uiColors.border}`,
}

const legendListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: uiSpace.xs,
}

const legendItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "start",
  gap: uiSpace.xs,
}

const legendTermStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 650,
  color: uiColors.textPrimary,
}

const legendCopyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.4,
  color: uiColors.textSecondary,
}

const statusIconStyle: React.CSSProperties = {
  display: "inline-grid",
  placeItems: "center",
  flexShrink: 0,
  width: 20,
  height: 20,
  borderRadius: uiRadius.pill,
  border: "1px solid transparent",
  fontSize: 11,
  lineHeight: 1,
  fontWeight: 700,
}
