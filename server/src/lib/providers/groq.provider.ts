import Groq from "groq-sdk"

export type GroqProviderResponse = {
  content: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export async function callGroq(
  prompt: string,
  model: string,
): Promise<GroqProviderResponse> {
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required")
  }

  const groq = new Groq({ apiKey })

  const response = await groq.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  })

  const content = response.choices[0]?.message?.content

  if (!content) {
    throw new Error("Groq returned empty content")
  }

  return {
    content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
    totalTokens: response.usage?.total_tokens,
  }
}