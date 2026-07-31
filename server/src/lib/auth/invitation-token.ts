import { randomBytes } from "node:crypto"

import { createSha256Hash } from "../create-sha256-hash.js"

// Staff invitation links. The link itself is authentication-boundary material
// (architecture.md §7A.1: the auth boundary owns "invitation-link
// consumption"), so only its hash is persisted — an administrator can issue an
// invitation but can never read back the link, and therefore never sets or
// learns anyone's password (domain-model.md §3A.3).
//
// The hash is a plain SHA-256 of a 256-bit random token, reusing the existing
// hashing utility: the token is high-entropy, so the lookup needs to be
// deterministic, not slow.

export const generateInvitationToken = () => randomBytes(32).toString("hex")

export const hashInvitationToken = (token: string) => createSha256Hash(token)
