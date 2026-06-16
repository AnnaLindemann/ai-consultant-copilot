import { Langfuse } from "langfuse"

const isLangfuseEnabled = process.env.LANGFUSE_ENABLED === "true"

export const langfuse = isLangfuseEnabled
  ? new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
    })
  : null

export function isObservabilityEnabled(): boolean {
  return langfuse !== null
}