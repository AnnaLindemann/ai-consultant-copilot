import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

// Encryption at rest for stored documents (roadmap Phase 10: "Support
// encryption of engagement data and uploaded documents both at rest and in
// transit").
//
// Application-level envelope encryption of the rendered report PDF, which is
// the one place the workbench stores a whole client-facing document as bytes.
// AES-256-GCM: authenticated, so a stored artifact that has been altered fails
// to decrypt rather than being served as if intact.
//
// **Transport** security is the other half and is not this module's: it is
// configuration of the deployment (TLS termination, `sslmode` on the database
// connection) enforced by `transport-security.ts` and documented in
// `.env.example`. Operating and hardening that deployment remains Phase 12.
//
// The key comes from configuration, never from the database, so the ciphertext
// and the key that opens it are never stored together. A deployment with no key
// configured stores the bytes as rendered, exactly as every artifact written
// before this phase is stored: a missing key must not silently turn documents
// into unreadable blobs, and it must not silently be pretended to be
// encryption either — `isEncryptionAvailable` is what the policy is reported
// against.

export const DOCUMENT_ENCRYPTION_ALGORITHM = "aes-256-gcm"

const IV_BYTES = 12
const AUTH_TAG_BYTES = 16

export type EncryptedDocument = {
  bytes: Buffer
  algorithm: string
  keyId: string
}

export const isEncryptionAvailable = (): boolean => readKey() !== null

// Wrap the rendered bytes. The stored blob is `iv | authTag | ciphertext`, so
// the pieces travel together and no second column has to stay in step with the
// bytes it belongs to.
export const encryptDocument = (plaintext: Buffer): EncryptedDocument | null => {
  const key = readKey()
  if (key === null) return null

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(DOCUMENT_ENCRYPTION_ALGORITHM, key.material, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    bytes: Buffer.concat([iv, authTag, ciphertext]),
    algorithm: DOCUMENT_ENCRYPTION_ALGORITHM,
    keyId: key.id,
  }
}

// Unwrap a stored artifact. An artifact stored before this phase — or by a
// deployment with no key — carries no algorithm and is returned as it is.
//
// A tampered or truncated blob, and a blob the configured key cannot open,
// throw rather than returning something: a document that cannot be
// authenticated must never be served as the client's report.
export const decryptDocument = (
  stored: Buffer,
  algorithm: string | null,
): Buffer => {
  if (algorithm === null) return stored

  if (algorithm !== DOCUMENT_ENCRYPTION_ALGORITHM) {
    throw new Error(`Unsupported document encryption algorithm: ${algorithm}`)
  }

  const key = readKey()
  if (key === null) {
    throw new Error(
      "DOCUMENT_ENCRYPTION_KEY is not configured, but a stored document is encrypted",
    )
  }

  if (stored.length <= IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("Stored document is too short to be a valid ciphertext")
  }

  const iv = stored.subarray(0, IV_BYTES)
  const authTag = stored.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
  const ciphertext = stored.subarray(IV_BYTES + AUTH_TAG_BYTES)

  const decipher = createDecipheriv(
    DOCUMENT_ENCRYPTION_ALGORITHM,
    key.material,
    iv,
  )
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// The configured key and a stable identifier for it. The identifier is a hash
// of the key, never the key: it is written next to every artifact so a later
// rotation can tell which artifacts a new key still has to re-wrap, and it must
// not itself disclose the secret.
const readKey = (): { material: Buffer; id: string } | null => {
  const configured = process.env.DOCUMENT_ENCRYPTION_KEY
  if (!configured) return null

  const material = createHash("sha256").update(configured).digest()
  const id = createHash("sha256").update(material).digest("hex").slice(0, 16)

  return { material, id }
}
