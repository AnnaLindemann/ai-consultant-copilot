import assert from "node:assert/strict"
import { test } from "node:test"

import { LLM_JSON_ERRORS, parseLlmJson } from "./parse-llm-json.js"

const REPORT = { clientSummary: "Der Support verliert Zeit.", risks: [] }

const throwsWith = (raw: string, message: string) =>
  assert.throws(() => parseLlmJson(raw), { message })

// --- What it accepts --------------------------------------------------------

test("plain JSON, which is what the prompts ask for", () => {
  assert.deepEqual(parseLlmJson(JSON.stringify(REPORT)), REPORT)
})

test("surrounding whitespace and newlines", () => {
  assert.deepEqual(parseLlmJson(`\n\n   ${JSON.stringify(REPORT)}  \n `), REPORT)
})

test("a fenced json block", () => {
  assert.deepEqual(
    parseLlmJson("```json\n" + JSON.stringify(REPORT) + "\n```"),
    REPORT,
  )
})

test("an unlabelled fence", () => {
  assert.deepEqual(parseLlmJson("```\n" + JSON.stringify(REPORT) + "\n```"), REPORT)
})

test("a fence with prose around it", () => {
  assert.deepEqual(
    parseLlmJson(
      "Hier ist das Ergebnis:\n\n```json\n" +
        JSON.stringify(REPORT) +
        "\n```\n\nBei Rückfragen melden Sie sich gern.",
    ),
    REPORT,
  )
})

test("a leading reasoning block", () => {
  // A reasoning model may put its thinking in the body. The provider is asked
  // not to, but provider behaviour is a per-model fact to verify rather than
  // assume, so the parser handles it independently.
  assert.deepEqual(
    parseLlmJson(
      "<think>Zuerst prüfe ich die Discovery-Fakten…</think>\n" +
        JSON.stringify(REPORT),
    ),
    REPORT,
  )
})

test("several reasoning tag spellings, and several blocks", () => {
  for (const tag of ["think", "thinking", "reasoning", "analysis"]) {
    assert.deepEqual(
      parseLlmJson(`<${tag}>...</${tag}>${JSON.stringify(REPORT)}`),
      REPORT,
      tag,
    )
  }

  assert.deepEqual(
    parseLlmJson(`<think>a</think>\n<analysis>b</analysis>\n${JSON.stringify(REPORT)}`),
    REPORT,
  )
})

test("a reasoning block followed by a fence", () => {
  assert.deepEqual(
    parseLlmJson(
      "<think>Überlegung</think>\n```json\n" + JSON.stringify(REPORT) + "\n```",
    ),
    REPORT,
  )
})

test("prose wrapping exactly one JSON object", () => {
  assert.deepEqual(
    parseLlmJson(`Das Ergebnis lautet ${JSON.stringify(REPORT)} — viel Erfolg.`),
    REPORT,
  )
})

test("braces inside German string values do not end the object early", () => {
  const withBraces = {
    clientSummary: 'Der Kunde sagte: "{kein Ticket}" und [keine Nummer].',
    note: "Ein Backslash \\ und ein Anführungszeichen \" im Text.",
  }

  assert.deepEqual(parseLlmJson(JSON.stringify(withBraces)), withBraces)
})

test("nested objects do not terminate the outer one", () => {
  const nested = { a: { b: { c: [1, { d: 2 }] } } }
  assert.deepEqual(parseLlmJson(`Ergebnis: ${JSON.stringify(nested)}`), nested)
})

// --- What it refuses --------------------------------------------------------

test("empty content", () => {
  throwsWith("", LLM_JSON_ERRORS.empty)
  throwsWith("   \n  ", LLM_JSON_ERRORS.empty)
})

test("truncated JSON is a failed run, never a repaired one", () => {
  // The line the whole module is built on. Adding the missing brace would
  // invent content that lands in an Assessment finding a consultant reads as
  // the model's work.
  throwsWith('{"clientSummary": "Der Support verliert Ze', LLM_JSON_ERRORS.notFound)
  throwsWith('{"a": 1, "b": [1, 2', LLM_JSON_ERRORS.notFound)
})

test("a trailing comma is not silently repaired", () => {
  throwsWith('{"a": 1, "b": 2,}', LLM_JSON_ERRORS.invalid)
})

test("single quotes are not silently repaired", () => {
  throwsWith("{'a': 1}", LLM_JSON_ERRORS.invalid)
})

test("two candidate objects are ambiguous, not a guess", () => {
  // The model produced two candidate answers; choosing between them is a
  // judgement this module has no basis to make.
  throwsWith(
    `${JSON.stringify(REPORT)}\n\n${JSON.stringify({ other: true })}`,
    LLM_JSON_ERRORS.ambiguous,
  )
})

test("two fenced blocks are ambiguous", () => {
  throwsWith(
    "```json\n{\"a\":1}\n```\nund alternativ\n```json\n{\"a\":2}\n```",
    LLM_JSON_ERRORS.ambiguous,
  )
})

test("an unterminated reasoning block is a truncated response", () => {
  throwsWith(
    "<think>Ich überlege noch und dann",
    LLM_JSON_ERRORS.unterminatedReasoning,
  )
})

test("an array is refused where an object is expected", () => {
  throwsWith("[1, 2, 3]", LLM_JSON_ERRORS.notAnObject)
  throwsWith(`[${JSON.stringify(REPORT)}]`, LLM_JSON_ERRORS.notAnObject)
})

test("an array is accepted when the caller says any shape will do", () => {
  assert.deepEqual(parseLlmJson("[1, 2, 3]", { expect: "any" }), [1, 2, 3])
})

test("prose with no JSON at all", () => {
  throwsWith(
    "Es tut mir leid, ich kann diese Anfrage nicht bearbeiten.",
    LLM_JSON_ERRORS.notFound,
  )
})

test("a fence in another language is not read as the answer", () => {
  throwsWith(
    "```bash\necho '{\"a\":1}'\n```",
    LLM_JSON_ERRORS.notFound,
  )
})

test("a mismatched bracket pair is not parsed by accident", () => {
  throwsWith('{"a": 1]', LLM_JSON_ERRORS.notFound)
})

test("a bare JSON literal is not an object", () => {
  throwsWith("null", LLM_JSON_ERRORS.notFound)
  throwsWith("42", LLM_JSON_ERRORS.notFound)
})

// --- No semantic change -----------------------------------------------------

test("located JSON is returned byte-for-byte equivalent to what the model wrote", () => {
  // Locating must never alter values: numbers keep their precision, strings
  // keep their escapes and their unicode.
  const exact = {
    zahl: 1234567.891011,
    text: "Zeile 1\nZeile 2\tTab äöüß \\ \" ende",
    leer: "",
    nichts: null,
    wahr: false,
  }

  assert.deepEqual(
    parseLlmJson("```json\n" + JSON.stringify(exact) + "\n```"),
    exact,
  )
})
