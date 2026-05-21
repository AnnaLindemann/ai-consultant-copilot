export function parseLlmJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error("LLM returned invalid JSON")
  }
}