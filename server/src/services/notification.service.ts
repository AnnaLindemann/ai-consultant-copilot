import { failureIdentity } from "../lib/failure-identity.js"
import {
  createNotification,
  getActiveDiscoveryAccessByEngagement,
} from "../repositories/access.repository.js"

import type { NotificationKind } from "../../../shared/access.schema.js"

// The Phase 3A notification mechanism (architecture.md §7A.7). One path raises
// every workflow notification, rather than each transition growing bespoke code.
//
// Two rules hold throughout:
//  - **Notifications inform; they never authorize.** Being notified grants no
//    access to the thing the event concerns, and a notification to a Client
//    carries no engagement content beyond their own discovery — which is why
//    the payloads below carry identifiers, never discovery facts or notes.
//  - **A notification failure never fails the operation that raised it.** The
//    same best-effort discipline as tracing: log and swallow.

type NotificationRequest = {
  workspaceId: string
  userId: string
  kind: NotificationKind
  engagementId?: string | null
  payload?: Record<string, string | null>
}

export const raiseNotification = async (request: NotificationRequest) => {
  try {
    await createNotification({
      workspaceId: request.workspaceId,
      userId: request.userId,
      kind: request.kind,
      engagementId: request.engagementId ?? null,
      payload: request.payload ?? {},
    })
  } catch (error) {
    // The transition, invitation, or grant that raised this has already
    // happened and stays valid; only the notification is lost. Reported as
    // identifiers — a database error arrives with the failing statement and its
    // parameters attached, which is not a thing to put in a log.
    console.error("NOTIFICATION_RAISE_FAILED", {
      kind: request.kind,
      workspaceId: request.workspaceId,
      userId: request.userId,
      ...failureIdentity(error),
    })
  }
}

// Notify the client who is currently working on an engagement's Discovery.
// Resolved from the active Discovery Access rather than passed in, so a
// notification can never be addressed to a client whose access has been
// revoked.
export const notifyEngagementClient = async (input: {
  workspaceId: string
  engagementId: string
  kind: NotificationKind
  payload?: Record<string, string | null>
}) => {
  try {
    const access = await getActiveDiscoveryAccessByEngagement(
      { workspaceId: input.workspaceId },
      input.engagementId,
    )

    if (!access) return

    await raiseNotification({
      workspaceId: input.workspaceId,
      userId: access.userId,
      kind: input.kind,
      engagementId: input.engagementId,
      payload: input.payload,
    })
  } catch (error) {
    console.error("NOTIFICATION_CLIENT_LOOKUP_FAILED", {
      kind: input.kind,
      workspaceId: input.workspaceId,
      engagementId: input.engagementId,
      ...failureIdentity(error),
    })
  }
}
