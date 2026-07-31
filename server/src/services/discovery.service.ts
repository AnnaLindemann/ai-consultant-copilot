import {
  applyContentProvenance,
  checkDiscoveryTransition,
  nextStatusAfterContentSave,
  unexplainedBaselineSubjects,
} from "../domain/engagement/discovery.js"
import {
  toDiscoveryProfile,
  toDiscoveryWorkflowState,
  type EngagementScope,
  updateEngagementDiscovery,
  updateEngagementDiscoveryWorkflow,
  type EngagementWithOrganization,
} from "../repositories/engagement.repository.js"

import type {
  DiscoveryProfile,
  MeasurementGapSubject,
} from "../../../shared/discovery-profile.schema.js"
import type {
  DiscoveryActor,
  DiscoveryTransition,
} from "../../../shared/discovery-workflow.schema.js"
import type {
  DiscoveryMessageId,
  DiscoveryMessageParams,
} from "../../../shared/discovery-messages.js"

// Discovery is consultant- or client-authored, never AI-assisted: saving and
// reviewing are deterministic transformations of persisted engagement state and
// create no Analysis Run (roadmap Phase 2; architecture.md §8).

// Save the complete Discovery Profile and record what the save did to the
// review workflow: who provided each changed section, and — because content
// the consultant has not reviewed may not stand as submitted or accepted —
// where the save leaves the profile's status.
export const saveDiscoveryProfile = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  discoveryProfile: DiscoveryProfile,
  contributor: DiscoveryActor,
) => {
  const previousProfile = toDiscoveryProfile(engagement)
  const { status, contentProvenance } = toDiscoveryWorkflowState(engagement)

  return updateEngagementDiscovery(engagement.id, scope, discoveryProfile, {
    status: nextStatusAfterContentSave(status, contributor),
    contentProvenance: applyContentProvenance(
      previousProfile,
      discoveryProfile,
      contentProvenance,
      contributor,
    ),
  })
}

// Why a review transition was refused. Each is a domain-meaningful outcome the
// person can act on, not an exception (architecture.md §13).
export type DiscoveryTransitionFailure =
  | "actor_not_permitted"
  | "illegal_transition"
  | "baseline_not_explained"

// A refusal names its outcome twice over, and in neither case as prose: the
// `failure` the caller branches on, and the `messageId` (with its parameters)
// the presentation layer renders in the user's language (architecture.md §7.1).
export type TransitionDiscoveryResult =
  | { success: true; engagement: EngagementWithOrganization }
  | {
      success: false
      failure: DiscoveryTransitionFailure
      messageId: DiscoveryMessageId
      messageParams: DiscoveryMessageParams
      unexplainedBaselineSubjects?: MeasurementGapSubject[]
    }

export type TransitionDiscoveryInput = {
  transition: DiscoveryTransition
  actor: DiscoveryActor
  // The consultant's notes when returning discovery for completion or
  // correction; unused by the other transitions.
  notes?: string
}

// Move the Discovery Profile through its review workflow. No transition writes
// a content column, so none can lose a fact, a note, or a provenance
// attribution (domain-model.md §3A.3; architecture.md §7A.6).
export const transitionDiscovery = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  input: TransitionDiscoveryInput,
): Promise<TransitionDiscoveryResult> => {
  const { status } = toDiscoveryWorkflowState(engagement)
  const check = checkDiscoveryTransition(input.transition, status, input.actor)

  if (!check.allowed) {
    return check.refusal === "actor_not_permitted"
      ? {
          success: false,
          failure: check.refusal,
          messageId: "discovery.error.actor_not_permitted",
          messageParams: { actor: input.actor, transition: input.transition },
        }
      : {
          success: false,
          failure: check.refusal,
          messageId: "discovery.error.illegal_transition",
          messageParams: { transition: input.transition, status },
        }
  }

  if (input.transition === "submit") {
    // Submitting is the contributor saying discovery is complete. An empty
    // baseline field would pass that claim off as answered, so every baseline
    // subject must either carry a figure or carry a gap stating why it does not
    // (roadmap Phase 2; coding-standards.md §6).
    const unexplained = unexplainedBaselineSubjects(
      toDiscoveryProfile(engagement).valueMeasurementBaseline,
    )

    if (unexplained.length > 0) {
      return {
        success: false,
        failure: "baseline_not_explained",
        messageId: "discovery.error.baseline_not_explained",
        messageParams: { subjectCount: String(unexplained.length) },
        unexplainedBaselineSubjects: unexplained,
      }
    }
  }

  const now = new Date()

  const updated = await updateEngagementDiscoveryWorkflow(engagement.id, scope, {
    status: check.nextStatus,
    ...(input.transition === "submit"
      ? { submittedAt: now, submittedBy: input.actor }
      : {}),
    ...(input.transition === "return"
      ? { reviewedAt: now, returnNotes: input.notes }
      : {}),
    ...(input.transition === "accept" ? { reviewedAt: now } : {}),
  })

  return { success: true, engagement: updated }
}
