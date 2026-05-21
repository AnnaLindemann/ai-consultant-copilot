import type { LlmProvider } from "./llm-client.js"

const supportedProviders: LlmProvider[] = ["groq", "openai", "anthropic"]

export type LlmConfig = {
  provider: LlmProvider
  model: string
}

export function getDefaultLlmConfig(): LlmConfig {
  const provider = process.env.LLM_PROVIDER
  const model = process.env.LLM_MODEL

  if (!provider) {
    throw new Error("LLM_PROVIDER is required")
  }

  if (!supportedProviders.includes(provider as LlmProvider)) {
    throw new Error(`Unsupported LLM_PROVIDER: ${provider}`)
  }

  if (!model) {
    throw new Error("LLM_MODEL is required")
  }

  return {
    provider: provider as LlmProvider,
    model,
  }
}