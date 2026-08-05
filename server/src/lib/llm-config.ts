import type { LlmProvider } from "./llm-client.js"

// Which provider and model this deployment calls.
//
// Both are environment-driven, and both now have a default — the change Phase
// 12 makes here. Before, a missing `LLM_MODEL` threw, and it threw from inside
// the AI compliance gate, which turned a configuration omission into an opaque
// 500 from every AI-assisted stage rather than a named refusal. The omission is
// now caught at startup by `config/environment.ts`, as one identifier among all
// the others, and the value here has a default so a development checkout works
// without one.
//
// **The default is a decision, not a convenience.** `openai/gpt-oss-120b` is
// the model this deployment intends to run; `LLM_MODEL` overrides it for a
// benchmark, a comparison, or a rollback. What does *not* happen is any kind of
// fallback: if the configured model fails, the stage fails and is recorded as
// failed. Silently answering with a different model would put content into an
// engagement that no Workspace approval covers.
//
// **Changing the model stops AI processing until an Administrator re-approves.**
// That is the compliance gate working as designed, not a regression:
// `decideAiProcessing` matches the Workspace's approval against the exact
// provider/model pair that would actually be called, and denies by default. It
// belongs in the runbook (`docs/operations.md`), because the first symptom is
// otherwise "the AI stopped working".

const supportedProviders: LlmProvider[] = ["groq", "openai", "anthropic"]

export const DEFAULT_LLM_PROVIDER: LlmProvider = "groq"
export const DEFAULT_LLM_MODEL = "openai/gpt-oss-120b"

export type LlmConfig = {
  provider: LlmProvider
  model: string
}

export function getDefaultLlmConfig(
  env: Record<string, string | undefined> = process.env,
): LlmConfig {
  const provider = env.LLM_PROVIDER?.trim() || DEFAULT_LLM_PROVIDER
  const model = env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL

  if (!supportedProviders.includes(provider as LlmProvider)) {
    throw new Error(`Unsupported LLM_PROVIDER: ${provider}`)
  }

  return {
    provider: provider as LlmProvider,
    model,
  }
}
