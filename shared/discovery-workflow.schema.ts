import { z } from "zod"

// The Discovery review workflow and the provenance of discovery content
// (Phase 2 Extension; domain-model.md §3A.3, architecture.md §7A.6).
//
// Content lives in `discovery-profile.schema.ts`. This module carries what is
// *about* that content: where it stands in review, who provided which part of
// it, and the consultant's notes when it was sent back. Keeping the two apart
// is what lets a workflow transition move without touching a single fact.

// Where the Discovery Profile stands. Submission is a review checkpoint, not a
// lock: discovery stays re-entrant in every one of these states.
export const discoveryStatusSchema = z.enum([
  "draft",
  "submitted",
  "returned",
  "accepted",
])

// Who is acting on discovery. Until the Phase 3A authentication and
// authorization foundation exists this is a declared role, not an
// authenticated identity — it decides which transitions the domain permits,
// and it is not, and must not be mistaken for, access control.
export const discoveryActorSchema = z.enum(["consultant", "client"])

// How a piece of discovery content came to be. Client-provided content stays
// attributed to the client even after the consultant edits or accepts it, so
// the engagement record stays honest about where a fact came from
// (domain-model.md §3A.3; agent-rules.md §2A.3).
export const discoveryProvenanceSchema = z.enum([
  "consultant_captured",
  "client_provided",
])

// The parts of the Discovery Profile that provenance is recorded against.
// These mirror the discovery gap categories (the consultant captures and the
// client answers discovery a section at a time), with the Phase 2 Extension's
// `value_measurement` added. `operations` folds into `situation`, which is the
// section the editor has always presented as "client situation & operations".
export const discoverySectionSchema = z.enum([
  "situation",
  "problems",
  "current_process",
  "tools",
  "data",
  "constraints",
  "goals",
  "value_measurement",
])

// Provenance per section, as a complete snapshot: `null` means nothing has
// been captured in that section yet, so an unanswered section is never
// attributed to anyone.
export const discoveryContentProvenanceSchema = z.object({
  situation: discoveryProvenanceSchema.nullable(),
  problems: discoveryProvenanceSchema.nullable(),
  current_process: discoveryProvenanceSchema.nullable(),
  tools: discoveryProvenanceSchema.nullable(),
  data: discoveryProvenanceSchema.nullable(),
  constraints: discoveryProvenanceSchema.nullable(),
  goals: discoveryProvenanceSchema.nullable(),
  value_measurement: discoveryProvenanceSchema.nullable(),
})

// The transitions a person may perform on the Discovery Profile. `submit`
// belongs to the contributor; reviewing — accepting, returning, reopening — is
// the consultant's authority (domain-model.md §3A.3).
export const discoveryTransitionSchema = z.enum([
  "submit",
  "return",
  "accept",
  "reopen",
])

// What the workbench shows about the state of discovery review.
export const discoveryWorkflowStateSchema = z.object({
  status: discoveryStatusSchema,
  submittedAt: z.string().nullable(),
  submittedBy: discoveryActorSchema.nullable(),
  reviewedAt: z.string().nullable(),
  // The consultant's notes from the last return. Kept after the contributor
  // resumes work so the request that sent it back stays visible.
  returnNotes: z.string().nullable(),
  contentProvenance: discoveryContentProvenanceSchema,
})

export const DISCOVERY_SECTIONS = discoverySectionSchema.options

// Discovery of an engagement nobody has worked on yet — also what an
// engagement saved before this extension existed resumes as.
export const emptyDiscoveryContentProvenance =
  (): DiscoveryContentProvenance => ({
    situation: null,
    problems: null,
    current_process: null,
    tools: null,
    data: null,
    constraints: null,
    goals: null,
    value_measurement: null,
  })

export type DiscoveryStatus = z.infer<typeof discoveryStatusSchema>
export type DiscoveryActor = z.infer<typeof discoveryActorSchema>
export type DiscoveryProvenance = z.infer<typeof discoveryProvenanceSchema>
export type DiscoverySection = z.infer<typeof discoverySectionSchema>
export type DiscoveryContentProvenance = z.infer<
  typeof discoveryContentProvenanceSchema
>
export type DiscoveryTransition = z.infer<typeof discoveryTransitionSchema>
export type DiscoveryWorkflowState = z.infer<
  typeof discoveryWorkflowStateSchema
>
