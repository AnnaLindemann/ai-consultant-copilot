// What a token costs, per provider and model.
//
// --- Why this is a table and not a number -----------------------------------
//
// Cost was a pair of constants — $0.59 and $0.79 per million tokens — applied
// to every run regardless of what answered it. That was correct for exactly one
// model, and the moment `LLM_MODEL` changed, every recorded `costEstimateUsd`
// became quietly wrong: not missing, not flagged, just wrong, in a column a
// consultant reads to decide whether a stage is worth re-running (audit finding
// 2.2).
//
// --- Why an unknown model has no price rather than a default ----------------
//
// A missing estimate is an honest gap. A defaulted one is a fabricated figure
// presented as a measurement, which is the thing this codebase refuses to do
// everywhere else: no placeholder quality scores, no invented specifics in a
// Technology Profile, no AI-supplied baseline numbers (agent-rules.md §12;
// architecture.md §5). A cost is no different. So an unpriced model records
// tokens and latency — the objective signals, which are still complete — and
// records no cost at all.
//
// --- These rates are manually maintained and time-sensitive -----------------
//
// **Nothing here is fetched at runtime**, deliberately: a pricing lookup on the
// path of an engagement's AI call would add a dependency, a failure mode, and a
// latency budget to buy a number that changes a few times a year. The cost is
// that the table goes stale silently, so each entry carries the date it was
// last confirmed and by whom it must be re-confirmed. Treat an entry older than
// a quarter as unverified.
//
// Re-verification is a manual step in `docs/operations.md`.

export type VerificationStatus =
  // Confirmed against the provider's published pricing on `confirmedOn`.
  | "verified"
  // Carried forward from an earlier implementation. The figures are the ones
  // the product has always used and are kept so cost history stays continuous,
  // but nobody has re-read the provider's price list against them.
  | "carried_forward"
  // Known model, deliberately unpriced: the rate has not been confirmed, and a
  // guess would be worse than a gap.
  | "verification_required"

export type LlmRate = {
  status: VerificationStatus
  // Absent whenever the status is `verification_required` — the type makes an
  // unpriced entry unpriceable rather than relying on a convention.
  inputUsdPerMillionTokens?: number
  outputUsdPerMillionTokens?: number
  // ISO date the figures were last established, where they were.
  confirmedOn?: string
  // Where an operator goes to re-confirm them.
  source: string
  note?: string
}

// Keyed provider → model. Model identifiers are matched exactly, as they are
// everywhere else in this codebase: an approximate match here would price a run
// against a model that did not produce it.
export const LLM_RATES: Readonly<
  Record<string, Readonly<Record<string, LlmRate>>>
> = {
  groq: {
    "llama-3.3-70b-versatile": {
      status: "carried_forward",
      inputUsdPerMillionTokens: 0.59,
      outputUsdPerMillionTokens: 0.79,
      source: "https://groq.com/pricing",
      note:
        "The figures the product has used since Phase 3, kept so existing cost history stays comparable. Not re-confirmed against Groq's current price list — re-verify before relying on them commercially.",
    },

    // The model this deployment intends to run. Deliberately unpriced.
    //
    // Groq publishes per-token pricing for it, and this table does not carry
    // that number because nobody has read it off the price list and written it
    // down here. Inventing one — or carrying one across from a different model
    // because they are both "large" — would put a fabricated figure in an
    // Analysis Run. Until an operator confirms it, GPT-OSS runs record tokens
    // and latency and no cost.
    //
    // Filling this in is a one-line change plus a `confirmedOn` date, and it is
    // step 3 of the model-migration checklist in `docs/operations.md`.
    "openai/gpt-oss-120b": {
      status: "verification_required",
      source: "https://groq.com/pricing",
      note:
        "Confirm input and output price per million tokens on Groq's pricing page, then set the figures, status 'verified', and confirmedOn.",
    },

    "openai/gpt-oss-20b": {
      status: "verification_required",
      source: "https://groq.com/pricing",
      note:
        "Confirm input and output price per million tokens on Groq's pricing page, then set the figures, status 'verified', and confirmedOn.",
    },
  },
}

export const findLlmRate = (
  provider: string,
  model: string,
): LlmRate | undefined => LLM_RATES[provider]?.[model]

// Whether a rate can produce an estimate at all.
export const isPriced = (
  rate: LlmRate | undefined,
): rate is LlmRate &
  Required<Pick<LlmRate, "inputUsdPerMillionTokens" | "outputUsdPerMillionTokens">> =>
  rate !== undefined &&
  typeof rate.inputUsdPerMillionTokens === "number" &&
  typeof rate.outputUsdPerMillionTokens === "number"

// The models this table knows about, priced or not. Used by the benchmark to
// report honestly on what it could and could not cost.
export const knownRateKeys = (): readonly string[] =>
  Object.entries(LLM_RATES).flatMap(([provider, models]) =>
    Object.keys(models).map((model) => `${provider}:${model}`),
  )
