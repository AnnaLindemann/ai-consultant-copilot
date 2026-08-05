import "dotenv/config"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { callLlm } from "../lib/llm-client.js"
import { getDefaultLlmConfig } from "../lib/llm-config.js"
import { readGroqSettings } from "../lib/providers/groq.provider.js"
import { renderBenchmarkReport, runBenchmark } from "./llm-benchmark.js"

// `npm run benchmark:llm` — the explicit command.
//
// **It calls a live provider and it costs money.** That is why it is a command
// and not a test: nothing in `npm test`, `npm run test:integration`, or any
// other suite reaches this file, so the suites stay deterministic, offline, and
// free. Running it is always a decision someone made.
//
// It touches no database and no client data (see `llm-benchmark.ts`). What it
// writes is a JSON result and a Markdown report under `tmp/benchmark/`, which
// is git-ignored — a benchmark result records prompts' *metadata*, not their
// content, but the directory is scratch space either way.
//
// Usage:
//
//   npm run benchmark:llm                      # one iteration of all six stages
//   LLM_MODEL=llama-3.3-70b-versatile npm run benchmark:llm
//   BENCHMARK_ITERATIONS=5 npm run benchmark:llm
//
// Compare two models by running it twice with different `LLM_MODEL` values and
// diffing the two reports. Five iterations is the number the audit's plan calls
// for when a decision actually rests on the result: one run shows whether a
// model *can* do the job, five show whether it does so reliably.

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

const OUTPUT_DIRECTORY = path.join(serverRoot, "tmp", "benchmark")

const MAX_ITERATIONS = 20

async function main() {
  const config = getDefaultLlmConfig()
  const settings = readGroqSettings()
  const iterations = readIterations()

  if (!process.env.GROQ_API_KEY) {
    // Fail before building a single prompt, with the one instruction that
    // helps. No key is ever printed, here or anywhere else.
    console.error(
      "GROQ_API_KEY is not set. The benchmark calls a live provider; set the key in server/.env and run again.",
    )
    process.exit(1)
  }

  // Everything the run depends on, stated up front — a result is only
  // comparable against another run whose settings are known.
  console.log(
    [
      "Running the LLM benchmark.",
      `  provider           ${config.provider}`,
      `  model              ${config.model}`,
      `  iterations         ${iterations}`,
      `  timeout            ${settings.timeoutMs} ms`,
      `  max retries        ${settings.maxRetries}`,
      `  temperature        ${settings.temperature ?? "provider default"}`,
      `  max completion     ${settings.maxCompletionTokens ?? "provider default"}`,
      `  response format    ${settings.responseFormat ?? "not sent"}`,
      `  reasoning format   ${settings.reasoningFormat ?? "not sent"}`,
      "",
      "The last two are unset by default on purpose: whether this model supports",
      "structured JSON output, and what it does with reasoning, are facts to",
      "establish from this run rather than to assume.",
      "",
    ].join("\n"),
  )

  const run = await runBenchmark({ callLlm }, iterations)
  const report = renderBenchmarkReport(run)

  await mkdir(OUTPUT_DIRECTORY, { recursive: true })

  const stamp = run.startedAt.replace(/[:.]/g, "-")
  const slug = `${run.provider || config.provider}-${(run.model || config.model).replace(/[^A-Za-z0-9]+/g, "-")}`
  const base = path.join(OUTPUT_DIRECTORY, `${stamp}-${slug}`)

  await writeFile(`${base}.json`, JSON.stringify(run, null, 2), { mode: 0o600 })
  await writeFile(`${base}.md`, report, { mode: 0o600 })

  console.log(report)
  console.log(`\nWritten to ${base}.json and ${base}.md`)

  // A non-zero exit when any stage failed outright, so the command is usable
  // from a script without parsing the report.
  const failed = run.outcomes.filter(
    (outcome) => !outcome.apiSuccess || !outcome.schemaValid,
  ).length

  if (failed > 0) {
    console.error(`\n${failed} of ${run.outcomes.length} stage runs did not produce valid output.`)
    process.exit(2)
  }
}

const readIterations = (): number => {
  const raw = process.env.BENCHMARK_ITERATIONS?.trim()
  if (!raw) return 1

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_ITERATIONS) {
    console.error(
      `BENCHMARK_ITERATIONS must be a whole number between 1 and ${MAX_ITERATIONS}.`,
    )
    process.exit(1)
  }

  return parsed
}

// Run only when invoked as the command. Importing this module — which nothing
// currently does, and which a future test might — must never call a provider.
const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntryPoint) {
  try {
    await main()
  } catch (error) {
    // Identifiers only. A provider SDK error arrives carrying the failing
    // request, `Authorization: Bearer <key>` included, and a terminal is copied
    // into issues and pasted into chats.
    console.error({
      event: "LLM_BENCHMARK_FAILED",
      errorName: error instanceof Error ? error.name : typeof error,
    })
    process.exit(1)
  }
}
