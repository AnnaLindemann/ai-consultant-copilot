import { z } from "zod"

import { discoveryProfileSchema } from "../../../shared/discovery-profile.schema.js"
import { discoveryActorSchema } from "../../../shared/discovery-workflow.schema.js"

// Request contracts for the Discovery stage. The profile itself is the shared
// client/server contract; what these add is *who* is acting, because content
// has to be attributed to whoever provided it.

// A complete-snapshot save. The contributor is required rather than defaulted:
// a silent default would attribute a client's own words to the consultant
// (domain-model.md §3A.3; agent-rules.md §2A.3).
export const saveDiscoveryProfileSchema = z.object({
  contributor: discoveryActorSchema,
  profile: discoveryProfileSchema,
})

export const submitDiscoverySchema = z.object({
  actor: discoveryActorSchema,
})

// Returning discovery is sending it back *with notes*; a return without a
// reason gives the contributor nothing to act on.
export const returnDiscoverySchema = z.object({
  actor: discoveryActorSchema,
  notes: z.string().trim().min(1),
})

// Accepting and reopening carry no payload beyond who is acting.
export const reviewDiscoverySchema = z.object({
  actor: discoveryActorSchema,
})

export type SaveDiscoveryProfileInput = z.infer<
  typeof saveDiscoveryProfileSchema
>
export type SubmitDiscoveryInput = z.infer<typeof submitDiscoverySchema>
export type ReturnDiscoveryInput = z.infer<typeof returnDiscoverySchema>
export type ReviewDiscoveryInput = z.infer<typeof reviewDiscoverySchema>
