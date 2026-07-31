import "dotenv/config"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { failureIdentity } from "../lib/failure-identity.js"
import { callLlm } from "../lib/llm-client.js"
import { getDefaultLlmConfig } from "../lib/llm-config.js"

// `npm run llm:test` — a smoke test of the configured provider connection.
//
// Both of its outputs are assembled field by field rather than by handing an
// object to `console`. That matters most on the failure path: every call this
// script makes is authenticated, and a provider SDK error routinely arrives
// with the failing request attached — `Authorization: Bearer <api key>` in its
// headers, the response body, and the URL. Printing the error would print all
// of it, and a terminal is copied into issues and pasted into chats
// (coding-standards.md §6A).
//
// So nothing here is sanitized. The report starts empty and admits four things,
// each only if it has the shape it should: the error's class and machine code
// (`failure-identity.ts`), the provider and model that were being reached, and
// an HTTP status. A message, a stack, a `cause`, a body, and any other attached
// property never reach the output.

const SUPPORTED_PROVIDERS = ["groq", "openai", "anthropic"] as const

// A model identifier is public, but it is read from the environment, so it is
// admitted by shape rather than on trust: identifier characters only, and short
// enough that no prose, URL, or key fits.
const MODEL_SHAPE = /^[A-Za-z0-9._:\/-]{1,64}$/

export type LlmSmokeTestFailure = {
  event: "LLM_SMOKE_TEST_FAILED"
  provider: string | null
  model: string | null
  httpStatus: number | null
  errorName: string
  errorCode: string | null
}

// What a failed smoke test is allowed to say. Pure, so the property that it
// discloses nothing is testable without a provider, a network, or a key.
export const describeLlmFailure = (
  error: unknown,
  context: { provider?: unknown; model?: unknown } = {},
): LlmSmokeTestFailure => ({
  event: "LLM_SMOKE_TEST_FAILED",
  provider: SUPPORTED_PROVIDERS.includes(context.provider as never)
    ? (context.provider as string)
    : null,
  model:
    typeof context.model === "string" && MODEL_SHAPE.test(context.model)
      ? context.model
      : null,
  httpStatus: httpStatusOf(error),
  ...failureIdentity(error),
})

// The one number a provider failure contributes. Anything that is not a plain
// HTTP status — a string, a body, a nested response object — is not one.
const httpStatusOf = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null

  const status = (error as { status?: unknown }).status

  return typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
    ? status
    : null
}

// Which provider and model the attempt was aimed at. Resolved defensively: the
// configuration is exactly what may be missing when the smoke test fails, and a
// reporter that throws reports nothing.
const attemptedConfig = (): { provider?: string; model?: string } => {
  try {
    return getDefaultLlmConfig()
  } catch {
    return {}
  }
}

async function main() {
  const result = await callLlm("Say hello in one short sentence.")

  // Named fields, so a later addition to `LlmResponse` cannot start printing
  // itself here without someone deciding that it should.
  console.log({
    event: "LLM_SMOKE_TEST_SUCCEEDED",
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    promptTokens: result.promptTokens ?? null,
    completionTokens: result.completionTokens ?? null,
    totalTokens: result.totalTokens ?? null,
    content: result.content,
  })
}

// Run only when invoked as the command; importing this module — which the test
// beside it does — must not call a provider.
const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntryPoint) {
  try {
    await main()
  } catch (error: unknown) {
    console.error(describeLlmFailure(error, attemptedConfig()))
    process.exit(1)
  }
}
