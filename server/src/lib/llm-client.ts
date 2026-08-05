import { getDefaultLlmConfig } from "./llm-config.js"
import { logger } from "./application-logger.js"
import { callGroq } from "./providers/groq.provider.js"

export type LlmProvider = "groq" | "openai" | "anthropic"

export type LlmCallOptions = {
  provider?: LlmProvider
  model?: string
}

export type LlmResponse = {
  content: string
  provider: LlmProvider
  // The model that actually answered. Where the provider names one in its
  // response, this is that name rather than the one requested — an Analysis Run
  // records what ran, and the Workspace approval it was checked against is only
  // meaningful if the two are the same thing.
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
  const requestedModel = options?.model ?? defaultConfig.model

  const startedAt = Date.now()

  if (provider === "groq") {
    const providerResponse = await callGroq(prompt, requestedModel)
    const model = providerResponse.model ?? requestedModel

    if (
      providerResponse.model !== null &&
      providerResponse.model !== requestedModel
    ) {
      // Not a fallback: nothing is retried and nothing is substituted. It is a
      // fact worth seeing — a provider that resolved an alias, or routed
      // elsewhere, has answered from a model the Workspace may not have
      // approved. Both names are public identifiers, so both may be logged.
      logger.warn("llm.model_mismatch", { provider, model })
    }

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
