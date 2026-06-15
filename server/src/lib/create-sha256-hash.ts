import { createHash } from "node:crypto"

export function createSha256Hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}