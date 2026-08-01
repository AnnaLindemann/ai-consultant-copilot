"use client"

import DiscoveryReviewControl from "./DiscoveryReviewControl"
import {
  DiscoveryAccordion,
  DiscoveryProgressSummary,
  DiscoverySectionSelector,
} from "./DiscoveryLayout"
import { useDiscoveryEditor } from "./useDiscoveryEditor"
import { errorStyle, successStyle } from "./DiscoveryFields"
import { buttonStyle } from "./UiKit"
import { t } from "../i18n"
import { uiSpace } from "../lib/design-tokens"

import type { DiscoveryProfile } from "../../shared/discovery-profile.schema"
import type { DiscoveryWorkflowState } from "../../shared/discovery-workflow.schema"

// The client's Discovery: the same sections, the same statuses, and the same
// help as the consultant sees — with the consulting context left out and the
// workbench chrome absent entirely. No sidebar, no stage navigation, no review
// controls that are not the client's to use (UI-KIT §6.2, §19.9).

type ClientDiscoveryWorkspaceProps = {
  engagementId: string
  initialProfile: DiscoveryProfile
  workflow: DiscoveryWorkflowState
}

export default function ClientDiscoveryWorkspace({
  engagementId,
  initialProfile,
  workflow,
}: ClientDiscoveryWorkspaceProps) {
  const editor = useDiscoveryEditor({
    engagementId,
    initialProfile,
    workflow,
    audience: "client",
    contributor: "client",
    pathPrefix: "/portal/engagements",
  })

  const wasReturned = workflow.status === "returned"

  return (
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

      {/* One selector rather than a navigation column: the portal is one
          readable column at every width. */}
      <DiscoverySectionSelector
        sections={editor.sections}
        activeId={editor.activeSectionId}
        onSelect={editor.openSection}
      />

      <DiscoveryAccordion
        sections={editor.sections}
        activeId={editor.activeSectionId}
        wasReturned={wasReturned}
        onToggle={editor.toggleSection}
      />

      <div style={actionsStyle}>
        <button
          type="button"
          onClick={editor.save}
          disabled={editor.isSaving}
          style={saveButtonStyle(editor.isSaving)}
        >
          {editor.isSaving
            ? t("discovery.editor.saving")
            : t("discovery.workspace.action.save_draft")}
        </button>
      </div>

      <DiscoveryReviewControl
        engagementId={engagementId}
        actor="client"
        audience="client"
        workflow={workflow}
        pathPrefix="/portal/engagements"
        onTransitionRefused={editor.revealFirstOpenSection}
      />
    </div>
  )
}

const workspaceStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  alignContent: "start",
}

const actionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: uiSpace.sm,
}

// The shared primary button, raised to the 44px touch target the portal's
// mobile-first requirement sets (UI-KIT §5.1).
const touchTargetStyle: React.CSSProperties = {
  minHeight: 44,
}

const saveButtonStyle = (saving: boolean): React.CSSProperties => ({
  ...buttonStyle("primary", saving),
  ...touchTargetStyle,
})
