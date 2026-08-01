import type { DiscoveryFieldId } from "./discovery-guidance.ts"
import { DISCOVERY_FIELD_GUIDANCE } from "./discovery-guidance.ts"

import type {
  DiscoveryGap,
  DiscoveryGapCategory,
} from "../../shared/discovery-profile.schema"

// "Ich weiß es noch nicht", recorded rather than left blank.
//
// The Discovery Profile has no per-field "unknown" flag, and this task does not
// change the contract. What it does have is `missingInformation` — the explicit
// gaps a Discovery carries, which exist for exactly this meaning: a question
// nobody can answer yet is a finding that must survive into follow-up, not an
// empty field (domain-model.md §2; agent-rules.md §5).
//
// So a field marked unknown becomes one gap in that list, carrying the field's
// own English identifier. Storing the identifier rather than the German label
// is what lets the mark be read back without any behavior keying off displayed
// text (coding-standards.md §12A); the list renders it through the catalogue.
//
// Known limitation, deliberately not worked around: because the marker lives in
// a free-text description, a consultant who edits that description by hand
// detaches the mark from its field. The gap itself is never lost — only its
// association with the field it came from.

const UNKNOWN_MARKER = "unknown:"

export const unknownGapDescription = (field: DiscoveryFieldId): string =>
  `${UNKNOWN_MARKER}${field}`

// The field a gap marks as unknown, or null when the gap is ordinary prose.
export const unknownGapField = (
  description: string,
): DiscoveryFieldId | null => {
  if (!description.startsWith(UNKNOWN_MARKER)) return null

  const candidate = description.slice(UNKNOWN_MARKER.length).trim()

  return Object.hasOwn(DISCOVERY_FIELD_GUIDANCE, candidate)
    ? (candidate as DiscoveryFieldId)
    : null
}

export const isFieldUnknown = (
  gaps: readonly DiscoveryGap[],
  field: DiscoveryFieldId,
): boolean => gaps.some((gap) => unknownGapField(gap.description) === field)

// Marking is idempotent: asking twice records one gap, not two.
export const markFieldUnknown = (
  gaps: readonly DiscoveryGap[],
  field: DiscoveryFieldId,
  category: DiscoveryGapCategory,
): DiscoveryGap[] =>
  isFieldUnknown(gaps, field)
    ? [...gaps]
    : [...gaps, { category, description: unknownGapDescription(field) }]

export const clearFieldUnknown = (
  gaps: readonly DiscoveryGap[],
  field: DiscoveryFieldId,
): DiscoveryGap[] =>
  gaps.filter((gap) => unknownGapField(gap.description) !== field)
