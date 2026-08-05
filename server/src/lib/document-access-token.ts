import { createHmac, timingSafeEqual } from "node:crypto"

// Expiring signed links to a stored document (roadmap Phase 10: "Protect
// uploaded documents using secure storage and controlled access mechanisms,
// including expiring signed URLs where appropriate").
//
// A token names exactly one artifact, for exactly one user, until exactly one
// moment. It is signed with a server secret and carries no secret of its own,
// so a link that leaks grants what it names and nothing else, and stops
// granting even that when it expires.
//
// It is deliberately **not** an alternative to authorization: the download
// endpoint still establishes the acting user and still asks the AccessPolicy.
// The token narrows what an already-authorized caller may fetch — it never
// widens anyone's reach, and a token for another workspace's document is
// refused by the policy exactly as a request without one would be
// (architecture.md §7A.2 "deny by default").

export type DocumentAccessClaims = {
  workspaceId: string
  engagementId: string
  reportVersionId: string
  // Who the link was issued to. A token presented by anyone else is refused, so
  // a forwarded link does not become a shared one.
  userId: string
  expiresAt: number
}

export type DocumentAccessTokenFailure =
  | "malformed"
  | "signature_invalid"
  | "expired"
  | "not_configured"

export type VerifiedDocumentAccess =
  | { valid: true; claims: DocumentAccessClaims }
  | { valid: false; failure: DocumentAccessTokenFailure }

export const isDocumentAccessSigningConfigured = (): boolean =>
  readSecret() !== null

// Issue a token for one artifact, valid for `ttlMinutes` from now. The lifetime
// comes from the workspace's Compliance Policy, not from this module: how long
// a link may live is a policy decision an administrator makes.
export const issueDocumentAccessToken = (
  claims: Omit<DocumentAccessClaims, "expiresAt">,
  ttlMinutes: number,
  now: Date = new Date(),
): string | null => {
  const secret = readSecret()
  if (secret === null) return null

  const payload: DocumentAccessClaims = {
    ...claims,
    expiresAt: now.getTime() + ttlMinutes * 60_000,
  }

  const encoded = encode(payload)
  return `${encoded}.${sign(encoded, secret)}`
}

// Verify a presented token. Order matters: the signature is checked before the
// expiry, so an unsigned or forged token is never read as "merely expired", and
// the comparison is timing-safe so a signature cannot be discovered one byte at
// a time.
export const verifyDocumentAccessToken = (
  token: string,
  now: Date = new Date(),
): VerifiedDocumentAccess => {
  const secret = readSecret()
  if (secret === null) return { valid: false, failure: "not_configured" }

  const separator = token.lastIndexOf(".")
  if (separator <= 0) return { valid: false, failure: "malformed" }

  const encoded = token.slice(0, separator)
  const presented = token.slice(separator + 1)

  if (!matches(sign(encoded, secret), presented)) {
    return { valid: false, failure: "signature_invalid" }
  }

  const claims = decode(encoded)
  if (claims === null) return { valid: false, failure: "malformed" }

  if (claims.expiresAt <= now.getTime()) {
    return { valid: false, failure: "expired" }
  }

  return { valid: true, claims }
}

const encode = (claims: DocumentAccessClaims): string =>
  Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")

const decode = (encoded: string): DocumentAccessClaims | null => {
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<DocumentAccessClaims>

    if (
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.engagementId !== "string" ||
      typeof parsed.reportVersionId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null
    }

    return parsed as DocumentAccessClaims
  } catch {
    return null
  }
}

const sign = (encoded: string, secret: string): string =>
  createHmac("sha256", secret).update(encoded).digest("base64url")

const matches = (expected: string, presented: string): boolean => {
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(presented, "utf8")

  // `timingSafeEqual` requires equal lengths, and the length itself is not a
  // secret worth a branch — a wrong length is simply wrong.
  return a.length === b.length && timingSafeEqual(a, b)
}

// The signing secret. It reuses the deployment's existing authentication secret
// rather than introducing a second one to configure and rotate: both sign
// short-lived, server-issued bearers for one deployment, and a second secret
// that nobody sets is worse than one that is already required to be set.
const readSecret = (): string | null =>
  process.env.DOCUMENT_ACCESS_SECRET ?? process.env.BETTER_AUTH_SECRET ?? null
