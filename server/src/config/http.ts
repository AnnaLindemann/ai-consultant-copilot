// HTTP-level limits the deployment depends on.
//
// Kept in its own module, rather than beside the middleware that applies it, so
// that reading or asserting the limit does not require constructing the whole
// application — which reaches a database, an authentication provider and a mail
// vendor at import time.

// The request body limit, stated rather than inherited.
//
// Express's default is 100 kB, comfortably under what this API's largest
// legitimate writes carry. A Consultant Report version holds an executive
// summary, every prioritized problem with its rationale, every recommendation
// with approach/rationale/assumptions, the roadmap's phases, the assumptions
// and risks, and the follow-up questions — all as German prose, and all in one
// PATCH alongside the source snapshot it was assembled from. The Roadmap and
// Recommendation saves have the same shape. Exceeding 100 kB on a real
// engagement is ordinary, not abusive; before Phase 12 those saves failed with
// a generic internal error (audit finding 1.5).
//
// 1 MB is the smallest bound that clears those comfortably while still refusing
// anything that could only be an attempt to exhaust memory. It is a ceiling,
// not a target: the largest payloads a real engagement produces sit well inside
// it.
export const JSON_BODY_LIMIT = "1mb"
