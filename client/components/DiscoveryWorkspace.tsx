"use client"

import { useState, type ReactNode } from "react"

import ManagerShell from "./ManagerShell"
import DiscoveryReviewControl from "./DiscoveryReviewControl"
import {
  DiscoveryAccordion,
  DiscoveryProgressSummary,
  DiscoverySectionNavigation,
  DiscoverySectionSelector,
  DiscoveryStatusLegend,
} from "./DiscoveryLayout"
import { useDiscoveryEditor } from "./useDiscoveryEditor"
import { SelectField, errorStyle, successStyle } from "./DiscoveryFields"
import { buttonStyle, compactButtonStyle } from "./UiKit"
import { t } from "../i18n"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"
import { stageLabel } from "../lib/engagement-stage"
import { nextRecommendedSectionId } from "../lib/discovery-progress"

import type { DiscoveryProfile } from "../../shared/discovery-profile.schema"
import type {
  DiscoveryActor,
  DiscoveryWorkflowState,
} from "../../shared/discovery-workflow.schema"

// The consultant's Discovery screen: section navigation, the Discovery
// accordion, and the contextual rail as three columns of one grid inside the
// application shell. One workspace filling the available width — not a stack of
// cards, and not a stage sharing a page with unrelated ones.

type DiscoveryWorkspaceProps = {
  engagementId: string
  organizationName: string
  engagementSubtitle: string
  initialProfile: DiscoveryProfile
  workflow: DiscoveryWorkflowState
}

const CONTRIBUTORS: readonly DiscoveryActor[] = ["consultant", "client"]

export default function DiscoveryWorkspace({
  engagementId,
  organizationName,
  engagementSubtitle,
  initialProfile,
  workflow,
}: DiscoveryWorkspaceProps) {
  // Who is entering this content. It is declared, not authenticated, in the
  // consultant workspace; the portal locks it to the client identity.
  const [contributor, setContributor] = useState<DiscoveryActor>("consultant")

  const editor = useDiscoveryEditor({
    engagementId,
    initialProfile,
    workflow,
    audience: "consultant",
    contributor,
    pathPrefix: "/engagements",
  })

  const wasReturned = workflow.status === "returned"
  const recommendedId = nextRecommendedSectionId(editor.sections)
  const recommended = editor.sections.find(
    (section) => section.id === recommendedId,
  )

  return (
    <ManagerShell
      breadcrumbs={[
        { label: t("engagements.title"), href: "/engagements" },
        { label: organizationName, href: `/engagements/${engagementId}` },
        { label: stageLabel("discovery") },
      ]}
      title={t("discovery.workspace.title")}
      description={t("discovery.workspace.intro")}
      actions={
        <>
          <span style={contextLabelStyle}>{engagementSubtitle}</span>
          <button
            type="button"
            onClick={editor.save}
            disabled={editor.isSaving}
            style={buttonStyle("primary", editor.isSaving)}
          >
            {editor.isSaving
              ? t("discovery.editor.saving")
              : t("discovery.workspace.action.save_draft")}
          </button>
        </>
      }
    >
      <div style={workspaceStyle}>
        {editor.message && (
          <p role="status" style={successStyle}>
            {editor.message}
          </p>
        )}
        {editor.error && (
          <p role="alert" style={errorStyle}>
            {editor.error}
          </p>
        )}

        <DiscoveryProgressSummary
          sections={editor.sections}
          wasReturned={wasReturned}
        />

        <div className="discovery-mobile-selector">
          <DiscoverySectionSelector
            sections={editor.sections}
            activeId={editor.activeSectionId}
            onSelect={editor.openSection}
          />
        </div>

        <div className="discovery-grid">
          <div className="discovery-nav-column">
            <div className="discovery-sticky">
              <DiscoverySectionNavigation
                sections={editor.sections}
                activeId={editor.activeSectionId}
                wasReturned={wasReturned}
                onSelect={editor.openSection}
              />
            </div>
          </div>

          <DiscoveryAccordion
            sections={editor.sections}
            activeId={editor.activeSectionId}
            wasReturned={wasReturned}
            onToggle={editor.toggleSection}
          />

          <div className="discovery-rail-column">
            <div className="discovery-sticky">
              <div className="discovery-rail">
                <RailCard title={t("discovery.editor.contributor.label")}>
                  <SelectField
                    label={t("discovery.workspace.contributor.field")}
                    value={contributor}
                    options={CONTRIBUTORS}
                    optionLabels={{
                      consultant: t("discovery.actor.consultant"),
                      client: t("discovery.actor.client"),
                    }}
                    includeUnknown={false}
                    onChange={(value) => setContributor(value as DiscoveryActor)}
                  />
                </RailCard>

                <RailCard title={t("discovery.workspace.next_step.title")}>
                  {recommended ? (
                    <>
                      <p style={railTextStyle}>
                        {t("discovery.workspace.next_step.hint", {
                          section:
                            typeof recommended.title === "string"
                              ? recommended.title
                              : recommended.id,
                        })}
                      </p>
                      <button
                        type="button"
                        onClick={() => editor.openSection(recommended.id)}
                        style={nextStepButtonStyle}
                      >
                        {t("discovery.workspace.next_step.action")}
                      </button>
                    </>
                  ) : (
                    <p style={railTextStyle}>
                      {t("discovery.workspace.next_step.done")}
                    </p>
                  )}
                </RailCard>

                {/* The lifecycle lives in the rail, beside the status it acts
                    on. A refused submit sends the consultant to the section
                    that still needs work. */}
                <DiscoveryReviewControl
                  engagementId={engagementId}
                  actor={contributor}
                  audience="consultant"
                  workflow={workflow}
                  onTransitionRefused={editor.revealFirstOpenSection}
                />

                <RailCard title={t("workflow.legend.title")}>
                  <DiscoveryStatusLegend wasReturned={wasReturned} />
                </RailCard>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ManagerShell>
  )
}

function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={railCardStyle}>
      <h2 style={railTitleStyle}>{title}</h2>
      {children}
    </section>
  )
}

const workspaceStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  alignContent: "start",
}

const contextLabelStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 13,
}

const nextStepButtonStyle: React.CSSProperties = {
  ...compactButtonStyle("secondary"),
  justifySelf: "start",
}

const railCardStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
  padding: uiSpace.sm,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
  alignContent: "start",
}

const railTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 650,
  color: uiColors.textPrimary,
}

const railTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.45,
  color: uiColors.textSecondary,
}
