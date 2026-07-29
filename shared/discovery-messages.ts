// The user-facing outcomes of the Discovery endpoints, as **stable English
// identifiers** rather than prose (architecture.md §7.1; coding-standards.md
// §12A: "the server returns identifiers and parameters, not prose").
//
// The server names an outcome; the client renders it in the user's language.
// These identifiers are part of the API contract — they are never translated,
// and renaming one is a contract change.

import type { DiscoveryTransition } from "./discovery-workflow.schema.js"

export const discoveryMessageIds = [
  "discovery.message.profile_saved",
  "discovery.message.submitted",
  "discovery.message.returned",
  "discovery.message.accepted",
  "discovery.message.reopened",
  "discovery.error.invalid_profile",
  "discovery.error.invalid_transition_input",
  "discovery.error.engagement_not_found",
  "discovery.error.actor_not_permitted",
  "discovery.error.illegal_transition",
  "discovery.error.baseline_not_explained",
  "discovery.error.internal",
] as const

export type DiscoveryMessageId = (typeof discoveryMessageIds)[number]

// Structured values a message is rendered with. Parameter values are either
// plain text or themselves identifiers (an actor, a transition, a status),
// which the presentation layer localizes in turn — so no displayed text is
// ever built on the server.
export type DiscoveryMessageParams = Record<string, string>

// What a completed review transition is called. Part of the contract rather
// than a routing detail: both sides agree on the identifier, and only the
// frontend decides how it reads.
export const discoveryTransitionMessageIds: Record<
  DiscoveryTransition,
  DiscoveryMessageId
> = {
  submit: "discovery.message.submitted",
  return: "discovery.message.returned",
  accept: "discovery.message.accepted",
  reopen: "discovery.message.reopened",
}

export const isDiscoveryMessageId = (
  value: string,
): value is DiscoveryMessageId =>
  (discoveryMessageIds as readonly string[]).includes(value)
