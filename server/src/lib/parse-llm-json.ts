// Getting a JSON object out of what a model actually returned.
//
// Every prompt in `src/prompts/` says "return ONLY valid JSON", "do not use
// markdown", "do not wrap the response in ```json". Those instructions are the
// right thing to say and they are not a guarantee: a model wraps output in a
// fence anyway, prefixes a sentence, or — being a reasoning model — emits a
// thinking block before the answer. Until Phase 12 this module was a bare
// `JSON.parse`, so any of those turned a usable response into a recorded
// failure, and a migration to a reasoning model risked turning *every* response
// into one (audit finding 2.3).
//
// --- What it will do, and what it refuses to do -----------------------------
//
// It **locates** the JSON. It never **repairs** it.
//
// That line is the whole design. Stripping a fence, skipping a thinking block,
// and finding the one object inside a sentence are all evidence-based: the
// bytes that remain are bytes the model wrote, and either they parse or they do
// not. Repair is not — inserting a closing brace, dropping a trailing comma, or
// balancing a quote invents content, and the invention lands in an Assessment
// finding or a Recommendation's rationale where a consultant reads it as the
// model's work. A truncated response is a failed run, and the honest outcome is
// to record it as one (agent-rules.md §12; coding-standards.md §7).
//
// **Ambiguity is refused for the same reason.** Two parseable values in one
// response means the model produced two candidate answers, and this module
// would be *choosing* between them — a judgement it has no basis to make.
// Refusing leaves the choice with the consultant, who can re-run.

export type ParseLlmJsonOptions = {
  // What the caller's schema needs. Every stage in this codebase validates an
  // object, so that is the default; an array response is a shape error worth
  // naming as one rather than letting the schema fail with something vaguer.
  expect?: "object" | "any"
}

// Stable, English, deliberately short. They are stored on
// `AnalysisRun.errorMessage` and surfaced to a consultant through the
// frontend's own catalogue, so they name the failure without quoting the
// response — the response is engagement content and does not belong in an error
// string.
export const LLM_JSON_ERRORS = {
  empty: "LLM returned empty content",
  unterminatedReasoning: "LLM response contains an unterminated reasoning block",
  ambiguous: "LLM returned more than one JSON value",
  notFound: "LLM returned no parseable JSON",
  invalid: "LLM returned invalid JSON",
  notAnObject: "LLM returned JSON that is not an object",
} as const

export function parseLlmJson(
  raw: string,
  options: ParseLlmJsonOptions = {},
): unknown {
  const expect = options.expect ?? "object"

  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(LLM_JSON_ERRORS.empty)
  }

  const withoutReasoning = stripLeadingReasoning(raw)
  const candidates = candidateJsonTexts(withoutReasoning)

  if (candidates.length === 0) throw new Error(LLM_JSON_ERRORS.notFound)

  const parsed: unknown[] = []
  for (const candidate of candidates) {
    const value = tryParse(candidate)
    if (value !== NOT_JSON) parsed.push(value)
  }

  if (parsed.length === 0) {
    // Something JSON-shaped was there and did not parse. Overwhelmingly this is
    // a truncated response — a completion that hit its token ceiling mid-object.
    throw new Error(LLM_JSON_ERRORS.invalid)
  }

  if (parsed.length > 1) throw new Error(LLM_JSON_ERRORS.ambiguous)

  const value = parsed[0]

  if (expect === "object" && !isPlainObject(value)) {
    throw new Error(LLM_JSON_ERRORS.notAnObject)
  }

  return value
}

// --- Reasoning blocks -------------------------------------------------------
//
// A reasoning model may put its thinking in the response body rather than in a
// separate field. The provider is asked not to (`groq.provider.ts` sets a
// reasoning format where one is configured), but provider behaviour is a fact
// to be verified per model, not assumed — so the parser handles it too, and
// neither layer depends on the other being right.
//
// Only a **leading** block is removed, and only a properly closed one. A block
// that opens and never closes is a truncated response, not a response with a
// preamble: the answer that would have followed was never written.

const REASONING_TAGS = ["think", "thinking", "reasoning", "analysis"] as const

const stripLeadingReasoning = (raw: string): string => {
  let text = raw.trimStart()

  // A response may open with more than one block; each is removed in turn.
  for (;;) {
    const lowered = text.toLowerCase()
    const tag = REASONING_TAGS.find((name) => lowered.startsWith(`<${name}>`))
    if (tag === undefined) return text

    const close = lowered.indexOf(`</${tag}>`)
    if (close === -1) throw new Error(LLM_JSON_ERRORS.unterminatedReasoning)

    text = text.slice(close + `</${tag}>`.length).trimStart()
  }
}

// --- Locating the JSON ------------------------------------------------------

// The texts that might be the answer.
//
// A fence is an explicit claim by the model about where its answer is, so once
// the response contains **any** fence, only fenced content is considered —
// everything outside is commentary by construction. That matters for the case
// where the fence is labelled as something else entirely: a `bash` block
// containing `echo '{"a":1}'` is a shell snippet, and scanning around it would
// pull that literal out and return it as the engagement's Assessment. With no
// fence at all, the whole response is scanned for balanced top-level values.
const candidateJsonTexts = (text: string): string[] => {
  if (hasFence(text)) return fencedBlocks(text)

  return balancedValues(text.trim())
}

const FENCE_PATTERN = /```[ \t]*([A-Za-z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g

const hasFence = (text: string): boolean =>
  new RegExp(FENCE_PATTERN.source).test(text)

const fencedBlocks = (text: string): string[] => {
  const blocks: string[] = []

  for (const match of text.matchAll(FENCE_PATTERN)) {
    const language = (match[1] ?? "").toLowerCase()
    const body = (match[2] ?? "").trim()

    if (body === "") continue
    // A fence labelled as something else entirely — `bash`, `text` — is not a
    // claim about JSON. An unlabelled fence is, because the prompts ask for the
    // answer and nothing else.
    if (language !== "" && language !== "json" && language !== "json5") continue
    if (!body.startsWith("{") && !body.startsWith("[")) continue

    blocks.push(body)
  }

  return blocks
}

// Every balanced `{...}` or `[...]` region at the top level of the text.
//
// String-aware and escape-aware, so a brace inside a German sentence in a
// string value — `"Er sagte: {kein Ticket}"` — does not end the object early.
// Nesting is tracked by depth, so an inner object never terminates the outer
// one.
const balancedValues = (text: string): string[] => {
  const values: string[] = []

  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  let opener: "{" | "[" | null = null

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{" || char === "[") {
      if (depth === 0) {
        start = index
        opener = char
      }
      depth += 1
      continue
    }

    if (char === "}" || char === "]") {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && start !== -1) {
        const closes = opener === "{" ? "}" : "]"
        // A mismatched pair (`{ ... ]`) is malformed. Leaving it out here lets
        // it be reported as "no parseable JSON" rather than parsed by accident.
        if (char === closes) values.push(text.slice(start, index + 1))
        start = -1
        opener = null
      }
    }
  }

  // An unterminated value — `depth` never returned to zero — is deliberately
  // *not* emitted. That is the truncated-response case, and inventing the
  // missing braces is exactly the repair this module refuses to do.
  return values
}

// A sentinel, so a response of literal `null` — valid JSON, and not an object —
// is distinguished from "this text did not parse".
const NOT_JSON = Symbol("not-json")

const tryParse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return NOT_JSON
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
