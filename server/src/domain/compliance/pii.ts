import type {
  PersonalIdentifierKind,
  PersonalIdentifierRule,
} from "../../../../shared/compliance.schema.js"

// Detecting and removing personal identifiers before text reaches an AI
// provider (roadmap Phase 10: "Automatically detect and redact/pseudonymize
// personally identifiable information (PII) before AI processing where required
// by Workspace policy, including names, email addresses, telephone numbers,
// postal addresses, contract identifiers, and other configurable personal
// identifiers").
//
// **This is PII redaction, and at best pseudonymization — it is not
// anonymization.** Each recognized identifier is replaced with a stable
// placeholder, and the mapping from placeholder back to value is trivially
// reconstructible by anyone holding the original text. The result is therefore
// still personal data in the GDPR sense, and the product never claims otherwise
// (roadmap Phase 10 corrections §4). What redaction buys is that the *provider*
// does not receive the identifiers; it does not take the processing outside the
// regulation, and it is not a substitute for a lawful basis.
//
// It is pure and **deterministic**: the same text and the same rules always
// produce the same output, with the same placeholders in the same order. That
// is not a convenience — determinism is what makes a redaction decision
// reproducible and therefore auditable (agent-rules.md §14; coding-standards.md
// §9 "Determinism in tests").
//
// **What it cannot do.** It is deliberately not a general-purpose name
// recognizer, and it does not detect every name or every piece of free-form
// personal data. Guessing which capitalized word is a person would be a
// statistical judgement dressed as a safeguard: it would miss names and redact
// ordinary nouns, and the consultant could trust neither outcome. Instead, the
// identifiers whose *format* is unambiguous are matched by shape, and the ones
// that are not — a contact's name, a client's customer-number scheme — are
// matched from the workspace's own configured rules, which an administrator
// maintains. What the redactor cannot recognize, it does not silently claim to
// have removed: `findPersonalIdentifiers` re-scans the result, and a request
// whose identifiers could not be removed is refused rather than sent.

export type Redaction = {
  kind: PersonalIdentifierKind
  // The placeholder the value was replaced with, e.g. `[EMAIL_1]`.
  placeholder: string
}

export type PiiRedactionResult = {
  text: string
  // What was replaced, in the order the placeholders were first assigned. The
  // original values are deliberately **absent**: this record is carried into
  // logs and audit payloads, and a "record of what we removed" that contains
  // the removed personal data would defeat the removal.
  redactions: readonly Redaction[]
}

// The built-in identifier shapes. Order matters and is fixed: emails are
// matched before phone numbers so the digits inside an address are not taken
// for a telephone number, and IBANs before contract identifiers for the same
// reason.
//
// Each pattern is anchored on a word boundary rather than being greedy, so
// ordinary prose passes through untouched — over-redaction destroys the
// engagement content the consultant needs the AI to reason about.
const BUILT_IN_PATTERNS: readonly {
  kind: PersonalIdentifierKind
  pattern: RegExp
}[] = [
  {
    kind: "email",
    pattern: /\b[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}\b/gu,
  },
  {
    // An IBAN as written in the SEPA area: two country letters, two check
    // digits, then up to thirty alphanumerics, optionally grouped in fours.
    kind: "iban",
    pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
  },
  {
    // An international or national telephone number: an optional country code,
    // then at least seven digits separated by spaces, dashes, slashes or
    // parentheses. The minimum length keeps years, counts and amounts out.
    kind: "phone",
    pattern: /(?:\+\d{1,3}[ -]?)?(?:\(\d{2,5}\)[ -]?|\d{2,5}[ /-])\d{3,}(?:[ -]?\d{2,})*\b/g,
  },
  {
    // A German-style street address: a street name ending in one of the usual
    // suffixes, followed by a house number. Postal codes and city names are not
    // matched on their own — "80331" alone is not personal data, and a city is
    // context the assessment legitimately needs.
    kind: "postal_address",
    pattern:
      /\b[\p{Lu}][\p{L}.-]*(?:stra(?:ss|ß)e|str\.|weg|allee|platz|gasse|ring|damm)\s+\d+[a-zA-Z]?\b/gu,
  },
  {
    // A contract, customer or order identifier as it is normally written: a
    // labelled reference. The label is required — a bare alphanumeric token is
    // indistinguishable from a product name or a system identifier.
    //
    // The "nummer"/"-Nr." part of the label is required too, on every branch.
    // While it was optional the label could be satisfied by the *stem* alone,
    // and because the separator `[:\s#]*` also matches nothing, the rest of an
    // ordinary German compound then played the part of the identifier:
    // "Vertragspartner", "Vertragsbedingungen" and "Auftragsvolumen" were all
    // read as contract references. That is over-redaction of exactly the kind
    // the note above these patterns warns about — under a policy that removes
    // personal data, everyday consulting vocabulary left for the model as
    // `[contract_identifier_1]`. The `Kunden` branch already required the
    // suffix and was never affected; the other three now match it.
    kind: "contract_identifier",
    pattern:
      /\b(?:Vertrag(?:s)?(?:nummer|-Nr\.?)|Kunden(?:nummer|-Nr\.?)|Auftrag(?:s)?(?:nummer|-Nr\.?)|Contract(?:\s+No\.?|\s+Number)|Customer\s+(?:No\.?|Number))[:\s#]*[A-Z0-9][A-Z0-9\/-]{2,}\b/gi,
  },
]

// Replace every personal identifier the rules recognize with a stable
// placeholder. The same value always receives the same placeholder within one
// call, so the model can still reason about "the same customer" appearing twice
// without ever being told who they are.
export const redactPersonalIdentifiers = (
  text: string,
  rules: readonly PersonalIdentifierRule[],
): PiiRedactionResult => {
  const placeholders = new Map<string, string>()
  const redactions: Redaction[] = []
  const counters = new Map<PersonalIdentifierKind, number>()

  const placeholderFor = (kind: PersonalIdentifierKind, value: string) => {
    const key = `${kind}:${value.toLowerCase()}`
    const existing = placeholders.get(key)
    if (existing) return existing

    const next = (counters.get(kind) ?? 0) + 1
    counters.set(kind, next)

    const placeholder = `[${kind.toUpperCase()}_${next}]`
    placeholders.set(key, placeholder)
    redactions.push({ kind, placeholder })
    return placeholder
  }

  let result = text

  // The workspace's own rules run first. They name the identifiers this client
  // actually uses — a contact's name, a customer-number scheme — which the
  // generic shapes below cannot know about.
  for (const rule of rules) {
    const pattern = compileRule(rule)
    if (pattern === null) continue

    result = result.replace(pattern, (match) =>
      placeholderFor(rule.kind, match),
    )
  }

  for (const { kind, pattern } of BUILT_IN_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), (match) =>
      // A placeholder written by an earlier pass is not personal data and must
      // not be redacted again into a placeholder of a placeholder.
      isPlaceholder(match) ? match : placeholderFor(kind, match),
    )
  }

  return { text: result, redactions }
}

// Which kinds of personal identifier a piece of text still contains.
//
// It serves two callers, and the same scan answers both:
//
//  - **Verification after redaction.** This is what makes the guarantee real
//    rather than assumed: the redactor's output is scanned again with the same
//    rules, and anything still matching means the removal did not complete. The
//    caller refuses the AI request on a failure — it never sends the original
//    text as a fallback.
//  - **Scanning the model's response.** An output is not assumed clean because
//    the input was redacted (roadmap Phase 10 corrections §5). The response is
//    scanned before it is classified or stored as usable content.
//
// The return value is kinds, never values: it travels into audit payloads and
// log lines, and a list of what was found would carry the personal data the
// scan exists to keep out of them.
export const findPersonalIdentifiers = (
  text: string,
  rules: readonly PersonalIdentifierRule[],
): readonly PersonalIdentifierKind[] => {
  const remaining = new Set<PersonalIdentifierKind>()

  for (const rule of rules) {
    const pattern = compileRule(rule)
    if (pattern === null) continue
    if (matchesOutsidePlaceholder(text, pattern)) remaining.add(rule.kind)
  }

  for (const { kind, pattern } of BUILT_IN_PATTERNS) {
    const fresh = new RegExp(pattern.source, pattern.flags)
    if (matchesOutsidePlaceholder(text, fresh)) remaining.add(kind)
  }

  return [...remaining].sort()
}

// Turn a configured rule into a matcher. A literal is escaped and matched on
// word boundaries; a pattern is the workspace's own regular expression.
//
// An invalid pattern yields `null` rather than throwing: a mistyped rule must
// not be able to break every AI stage in the workspace. It is skipped, and the
// verification pass above is what still refuses the request if the identifier
// the broken rule was meant to catch is genuinely present in a recognizable
// form.
const compileRule = (rule: PersonalIdentifierRule): RegExp | null => {
  try {
    const source =
      rule.match === "literal"
        ? `(?<![\\p{L}0-9])${escapeRegExp(rule.value)}(?![\\p{L}0-9])`
        : rule.value

    return new RegExp(source, "giu")
  } catch {
    return null
  }
}

// Whether a workspace rule compiles at all. The administration surface uses it
// to refuse a mistyped pattern at the boundary, where the administrator can
// still fix it, rather than silently skipping it at redaction time.
export const isCompilablePersonalIdentifierRule = (
  rule: PersonalIdentifierRule,
): boolean => compileRule(rule) !== null

const PLACEHOLDER_PATTERN = /^\[[A-Z_]+_\d+\]$/

const isPlaceholder = (value: string): boolean =>
  PLACEHOLDER_PATTERN.test(value.trim())

// A pattern may legitimately match inside a placeholder this module itself
// wrote — `[CONTRACT_IDENTIFIER_1]` looks like a labelled reference. Those are
// not leftovers.
const matchesOutsidePlaceholder = (text: string, pattern: RegExp): boolean => {
  for (const match of text.matchAll(pattern)) {
    if (!isWithinPlaceholder(text, match.index, match[0].length)) return true
  }

  return false
}

const isWithinPlaceholder = (
  text: string,
  index: number,
  length: number,
): boolean => {
  const open = text.lastIndexOf("[", index)
  if (open === -1) return false

  const close = text.indexOf("]", open)
  if (close === -1 || close < index + length - 1) return false

  return isPlaceholder(text.slice(open, close + 1))
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
