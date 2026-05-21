import { getDefaultLlmConfig } from "./llm-config.js"
import { callGroq } from "./providers/groq.provider.js"

export type LlmProvider = "groq" | "openai" | "anthropic"

export type LlmCallOptions = {
  provider?: LlmProvider
  model?: string
}

export type LlmResponse = {
  content: string
  provider: LlmProvider
  model: string
  latencyMs: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export async function callLlm(
  prompt: string,
  options?: LlmCallOptions,
): Promise<LlmResponse> {
  const defaultConfig = getDefaultLlmConfig()

  const provider = options?.provider ?? defaultConfig.provider
  const model = options?.model ?? defaultConfig.model

  const startedAt = Date.now()

if (provider === "groq") {
  const providerResponse = await callGroq(prompt, model)

  return {
    content: providerResponse.content,
    provider,
    model,
    latencyMs: Date.now() - startedAt,
    promptTokens: providerResponse.promptTokens,
    completionTokens: providerResponse.completionTokens,
    totalTokens: providerResponse.totalTokens,
  }
}

  throw new Error(`Unsupported provider: ${provider}`)
}