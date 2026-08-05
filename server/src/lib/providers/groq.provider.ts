import Groq from "groq-sdk"

// The Groq call, with the parameters a deployment actually depends on stated
// rather than inherited (roadmap Phase 12 "Operational error handling").
//
// Until Phase 12 this passed a model and a message and nothing else. Every
// other parameter was the SDK's or the provider's default, which left four
// things nobody had decided true in production: no timeout, so a hung socket
// held a consultant's request open until something upstream gave up; an
// implicit retry count, so a failed call could be billed more than once without
// anyone choosing that; no completion ceiling, so a runaway generation was
// bounded only by the model; and no control over how a reasoning model returns
// its thinking.
//
// --- Two rules that are not configurable ------------------------------------
//
//  1. **No silent model fallback.** The model requested is the model called. If
//     the provider answers naming a different one, the *actual* model is what
//     gets recorded — an Analysis Run naming a model the response did not come
//     from would make the compliance approval it was checked against
//     meaningless.
//  2. **Retries are opt-in and bounded.** The default is zero. The SDK retries
//     only connection failures, 408, 429 and 5xx — never a 4xx that would
//     repeat the same rejection — so raising the count is safe, but it is still
//     a decision about spending money twice, made by configuration and never by
//     default.
//
// --- What must be verified rather than assumed ------------------------------
//
// `LLM_RESPONSE_FORMAT` and `LLM_REASONING_FORMAT` are **unset by default**,
// deliberately. Whether a given Groq model supports structured JSON output, and
// what it does with a reasoning model's thinking, are per-model facts that have
// to be established against the live API — the benchmark (`npm run
// benchmark:llm`) is what establishes them. Sending a parameter a model rejects
// fails every call; assuming a default that is not the real one produces
// unparseable output. So neither is sent unless a deployment says so, and
// `parse-llm-json.ts` independently tolerates a thinking block in the body, so
// the parser does not depend on this layer getting it right.

export type GroqProviderResponse = {
  content: string
  // The model the provider says answered. Recorded in preference to the
  // requested one, so an Analysis Run names what actually ran.
  model: string | null
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export type GroqRequestSettings = {
  timeoutMs: number
  maxRetries: number
  temperature: number | null
  maxCompletionTokens: number | null
  // `json_object` asks the provider to constrain output to valid JSON. Null
  // means "do not send the parameter".
  responseFormat: "json_object" | null
  // How a reasoning model returns its thinking: `hidden` keeps it out of the
  // response, `parsed` puts it in its own field, `raw` leaves it in the
  // content. Null means "do not send the parameter".
  reasoningFormat: "hidden" | "parsed" | "raw" | null
}

// The defaults, and why each is what it is.
export const DEFAULT_GROQ_SETTINGS: GroqRequestSettings = {
  // Long enough for a full Consultant Report over a large engagement on a busy
  // provider; short enough that a hung call fails inside a hosting platform's
  // own request timeout rather than being killed by it, which is what turns a
  // recorded failure into an opaque one.
  timeoutMs: 120_000,
  // See rule 2 above.
  maxRetries: 0,
  // Unset: the provider's default is the right starting point, and pinning a
  // temperature is a quality decision the benchmark should inform.
  temperature: null,
  maxCompletionTokens: null,
  responseFormat: null,
  reasoningFormat: null,
}

export const readGroqSettings = (
  env: Record<string, string | undefined> = process.env,
): GroqRequestSettings => ({
  timeoutMs: numberOr(env.LLM_TIMEOUT_MS, DEFAULT_GROQ_SETTINGS.timeoutMs),
  maxRetries: numberOr(env.LLM_MAX_RETRIES, DEFAULT_GROQ_SETTINGS.maxRetries),
  temperature: numberOrNull(env.LLM_TEMPERATURE),
  maxCompletionTokens: numberOrNull(env.LLM_MAX_COMPLETION_TOKENS),
  responseFormat:
    env.LLM_RESPONSE_FORMAT?.trim() === "json_object" ? "json_object" : null,
  reasoningFormat: reasoningFormatOf(env.LLM_REASONING_FORMAT),
})

// The request body, assembled from the settings. Pure, so what a given
// configuration actually sends is assertable without a network call or a key —
// which is the only way to test that an unset option sends *nothing* rather
// than sending a default.
export const groqRequestBody = (
  prompt: string,
  model: string,
  settings: GroqRequestSettings,
): Record<string, unknown> => ({
  model,
  messages: [{ role: "user", content: prompt }],
  ...(settings.temperature === null
    ? {}
    : { temperature: settings.temperature }),
  ...(settings.maxCompletionTokens === null
    ? {}
    : { max_completion_tokens: settings.maxCompletionTokens }),
  ...(settings.responseFormat === null
    ? {}
    : { response_format: { type: settings.responseFormat } }),
  // Not in the SDK's typed surface for every model, and a per-model fact
  // besides, so it is passed through as an extra body field only when a
  // deployment has configured one.
  ...(settings.reasoningFormat === null
    ? {}
    : { reasoning_format: settings.reasoningFormat }),
})

export async function callGroq(
  prompt: string,
  model: string,
  settings: GroqRequestSettings = readGroqSettings(),
): Promise<GroqProviderResponse> {
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required")
  }

  const groq = new Groq({
    apiKey,
    // Stated rather than inherited: both have SDK defaults, and both are
    // decisions about a consultant's waiting time and about spend.
    timeout: settings.timeoutMs,
    maxRetries: settings.maxRetries,
  })

  // The body is assembled as plain data by `groqRequestBody` so that what a
  // configuration sends is testable without a key. `reasoning_format` is not in
  // the SDK's typed parameters — it is a Groq extension that applies to some
  // models — so the cast goes through `unknown` rather than pretending the two
  // shapes overlap.
  const response = await groq.chat.completions.create(
    groqRequestBody(prompt, model, settings) as unknown as Parameters<
      typeof groq.chat.completions.create
    >[0],
  )

  const completion = response as {
    choices?: { message?: { content?: string | null } }[]
    model?: string
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  }

  const content = completion.choices?.[0]?.message?.content

  if (!content || content.trim() === "") {
    // Empty content from a reasoning model usually means the thinking consumed
    // the completion budget, or that the reasoning format put the answer
    // somewhere this adapter deliberately does not read. Either way there is no
    // answer, and reporting a reasoning field as the conclusion would be
    // presenting the model's scratch work as its result.
    throw new Error("Groq returned empty content")
  }

  return {
    content,
    model: typeof completion.model === "string" ? completion.model : null,
    promptTokens: completion.usage?.prompt_tokens,
    completionTokens: completion.usage?.completion_tokens,
    totalTokens: completion.usage?.total_tokens,
  }
}

const numberOr = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw?.trim())
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(parsed)
    ? parsed
    : fallback
}

const numberOrNull = (raw: string | undefined): number | null => {
  const parsed = Number(raw?.trim())
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(parsed)
    ? parsed
    : null
}

const reasoningFormatOf = (
  raw: string | undefined,
): GroqRequestSettings["reasoningFormat"] => {
  const value = raw?.trim().toLowerCase()
  return value === "hidden" || value === "parsed" || value === "raw"
    ? value
    : null
}
