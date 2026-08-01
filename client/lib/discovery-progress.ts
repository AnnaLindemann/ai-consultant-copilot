import type { WorkflowSectionStatus } from "./workflow-status"

// How far Discovery has come, and which section to work on next. Both are read
// off the section statuses the profile already produces — nothing here invents
// a figure, and the same numbers drive the progress summary, the section
// navigation, and the recommended next step, so they cannot disagree.

export type DiscoverySectionStatuses = readonly {
  id: string
  status: WorkflowSectionStatus
}[]

export type DiscoveryProgress = {
  total: number
  complete: number
  /** Whole percent of sections that are complete; 0 when there are none. */
  percent: number
  counts: Record<WorkflowSectionStatus, number>
}

export const summarizeDiscoveryProgress = (
  sections: DiscoverySectionStatuses,
): DiscoveryProgress => {
  const counts: Record<WorkflowSectionStatus, number> = {
    not_started: 0,
    in_progress: 0,
    complete: 0,
    action_required: 0,
  }

  for (const section of sections) counts[section.status] += 1

  const total = sections.length

  return {
    total,
    complete: counts.complete,
    percent: total === 0 ? 0 : Math.round((counts.complete / total) * 100),
    counts,
  }
}

// The section that most deserves attention: one that was returned for
// correction first, then one that is under way, then one that has not been
// started. A fully complete Discovery recommends nothing.
export const nextRecommendedSectionId = (
  sections: DiscoverySectionStatuses,
): string | null => {
  const order: readonly WorkflowSectionStatus[] = [
    "action_required",
    "in_progress",
    "not_started",
  ]

  for (const status of order) {
    const match = sections.find((section) => section.status === status)
    if (match) return match.id
  }

  return null
}

// Which section a workspace opens on: the first one still needing work, in the
// order the sections are asked, so the editor opens where reading left off
// rather than jumping around. A fully complete Discovery opens on its first
// section.
export const defaultOpenSectionId = (
  sections: DiscoverySectionStatuses,
  fallback: string,
): string =>
  sections.find((section) => section.status !== "complete")?.id ??
  sections[0]?.id ??
  fallback

// One section is open at a time. Clicking the open section's own header closes
// it — the empty string is "nothing open", which is a real choice and is kept
// rather than being corrected back to a default.
export const toggledSectionId = (activeId: string, clickedId: string): string =>
  clickedId === activeId ? "" : clickedId

// Which section the accordion actually shows: what the reader last asked for,
// as long as it still exists. Before anything is asked for, and after a chosen
// section disappears, the default applies.
export const resolveActiveSectionId = (
  requestedId: string | null,
  sections: DiscoverySectionStatuses,
  fallback: string,
): string => {
  if (requestedId === "") return ""
  if (
    requestedId !== null &&
    sections.some((section) => section.id === requestedId)
  ) {
    return requestedId
  }

  return defaultOpenSectionId(sections, fallback)
}
