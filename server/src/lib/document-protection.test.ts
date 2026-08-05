import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"

import {
  decryptDocument,
  encryptDocument,
  isEncryptionAvailable,
} from "./document-encryption.js"
import {
  issueDocumentAccessToken,
  verifyDocumentAccessToken,
} from "./document-access-token.js"

// Protecting a stored document (roadmap Phase 10): encrypted at rest, and
// reachable through an expiring signed link that names one artifact, for one
// user, until one moment.

const claims = {
  workspaceId: "ws_1",
  engagementId: "eng_1",
  reportVersionId: "ver_1",
  userId: "user_1",
}

beforeEach(() => {
  process.env.DOCUMENT_ENCRYPTION_KEY = "test-document-encryption-key"
  process.env.DOCUMENT_ACCESS_SECRET = "test-document-access-secret"
})

test("a stored document round-trips through encryption", () => {
  const plaintext = Buffer.from("%PDF-1.7 a client's report")

  const wrapped = encryptDocument(plaintext)
  assert.notEqual(wrapped, null)
  assert.equal(wrapped!.algorithm, "aes-256-gcm")

  // What is stored is not what was rendered.
  assert.equal(wrapped!.bytes.equals(plaintext), false)

  assert.equal(
    decryptDocument(wrapped!.bytes, wrapped!.algorithm).equals(plaintext),
    true,
  )
})

test("an artifact stored before this phase is returned as it is", () => {
  const plaintext = Buffer.from("%PDF-1.7 an older report")

  // No algorithm recorded means the bytes were never wrapped, which is the
  // state of every artifact written before Phase 10.
  assert.equal(decryptDocument(plaintext, null).equals(plaintext), true)
})

test("an altered stored document fails to open rather than being served", () => {
  const wrapped = encryptDocument(Buffer.from("%PDF-1.7 report"))!
  const tampered = Buffer.from(wrapped.bytes)
  tampered[tampered.length - 1] ^= 0xff

  assert.throws(() => decryptDocument(tampered, wrapped.algorithm))
})

test("a deployment with no key configured stores what it rendered", () => {
  delete process.env.DOCUMENT_ENCRYPTION_KEY

  assert.equal(isEncryptionAvailable(), false)
  assert.equal(encryptDocument(Buffer.from("report")), null)
})

test("a signed link names exactly one artifact, for one user", () => {
  const token = issueDocumentAccessToken(claims, 15)
  assert.notEqual(token, null)

  const verified = verifyDocumentAccessToken(token!)
  assert.equal(verified.valid, true)
  assert.equal(verified.valid === true && verified.claims.userId, "user_1")
  assert.equal(
    verified.valid === true && verified.claims.reportVersionId,
    "ver_1",
  )
})

test("a link stops granting when it expires", () => {
  const issuedAt = new Date("2026-08-04T10:00:00.000Z")
  const token = issueDocumentAccessToken(claims, 15, issuedAt)!

  assert.equal(
    verifyDocumentAccessToken(token, new Date("2026-08-04T10:14:59.000Z")).valid,
    true,
  )

  const expired = verifyDocumentAccessToken(
    token,
    new Date("2026-08-04T10:15:00.000Z"),
  )
  assert.deepEqual(expired, { valid: false, failure: "expired" })
})

test("a forged or edited token is refused", () => {
  const token = issueDocumentAccessToken(claims, 15)!
  const [payload, signature] = token.split(".")

  // Claims edited to name another engagement, with the original signature.
  const edited = Buffer.from(
    JSON.stringify({ ...claims, engagementId: "eng_2", expiresAt: Date.now() + 60_000 }),
    "utf8",
  ).toString("base64url")

  assert.deepEqual(verifyDocumentAccessToken(`${edited}.${signature}`), {
    valid: false,
    failure: "signature_invalid",
  })

  // The signature checked before the expiry, so a forgery is never reported as
  // "merely expired".
  assert.deepEqual(verifyDocumentAccessToken(`${payload}.notasignature`), {
    valid: false,
    failure: "signature_invalid",
  })

  assert.deepEqual(verifyDocumentAccessToken("nonsense"), {
    valid: false,
    failure: "malformed",
  })
})

test("a token signed with another secret is refused", () => {
  const token = issueDocumentAccessToken(claims, 15)!

  process.env.DOCUMENT_ACCESS_SECRET = "a-different-secret"

  assert.deepEqual(verifyDocumentAccessToken(token), {
    valid: false,
    failure: "signature_invalid",
  })
})
