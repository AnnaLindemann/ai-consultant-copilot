import { findPersonalIdentifiers } from "../domain/compliance/pii.js"
import { defaultCompliancePolicy } from "../domain/compliance/compliance.js"
import { buildKnowledgePackage } from "../domain/knowledge/consulting-knowledge.js"
import { buildTechnologyPackage } from "../domain/technology/technology-knowledge.js"
import { consultingKnowledgeSeed } from "../domain/knowledge/consulting-knowledge-seed.js"
import { technologyProfileSeed } from "../domain/technology/technology-knowledge-seed.js"
import { calculateLlmCost } from "../evaluation/calculate-llm-cost.js"
import { findLlmRate, isPriced } from "../evaluation/llm-rates.js"
import { parseAnalysisReport } from "../lib/parse-analysis-report.js"
import { parseAssessment } from "../lib/parse-assessment.js"
import { parseConsultantReport } from "../lib/parse-consultant-report.js"
import { parseImplementationRoadmap } from "../lib/parse-implementation-roadmap.js"
import { parseOpportunities } from "../lib/parse-opportunities.js"
import { parseRecommendations } from "../lib/parse-recommendations.js"

import { ANALYSIS_PROMPT } from "../prompts/analysis-prompt.js"
import { ASSESSMENT_PROMPT } from "../prompts/assessment-prompt.js"
import { OPPORTUNITIES_PROMPT } from "../prompts/opportunities-prompt.js"
import { RECOMMENDATIONS_PROMPT } from "../prompts/recommendations-prompt.js"
import { IMPLEMENTATION_ROADMAP_PROMPT } from "../prompts/implementation-roadmap-prompt.js"
import { CONSULTANT_REPORT_PROMPT } from "../prompts/consultant-report-prompt.js"

import { buildAssessmentPrompt } from "../prompts/build-assessment-prompt.js"
import { buildOpportunitiesPrompt } from "../prompts/build-opportunities-prompt.js"
import { buildRecommendationsPrompt } from "../prompts/build-recommendations-prompt.js"
import { buildImplementationRoadmapPrompt } from "../prompts/build-implementation-roadmap-prompt.js"

import {
  BENCHMARK_ENGAGEMENT,
  BENCHMARK_ORGANIZATION,
  benchmarkAssessment,
  benchmarkDiscoveryProfile,
  benchmarkOpportunities,
  benchmarkRecommendations,
  benchmarkRoadmap,
} from "./benchmark-fixtures.js"

import type { LlmResponse } from "../lib/llm-client.js"

// The model benchmark (audit §12; roadmap Phase 12).
//
// It answers one question — *can this provider and model actually run the six
// AI-assisted stages, and how well?* — and it answers it the only way that
// counts: by building the **real prompts**, sending them, and running the
// **real parsers and validators** over what comes back. A benchmark that
// approximated any of those would measure something that is not the product.
//
// --- What it deliberately does not touch ------------------------------------
//
//  - **No database.** Nothing here opens a connection, and the runner never
//    imports one. The knowledge and technology packages come from the same
//    deterministic domain retrieval the stages use, run directly over the
//    seed arrays.
//  - **No client data.** The fixtures are synthetic and German
//    (`benchmark-fixtures.ts`). This is not a formality: the prompts leave for
//    an external provider.
//  - **No compliance gate, and therefore no engagement.** The gate exists to
//    protect *client* content, and there is none here. Skipping it also means a
//    benchmark can never write an Analysis Run, mutate an engagement, or
//    consume a Workspace's model approval.
//  - **No fallback.** If the configured model fails, the stage is recorded as
//    failed. Substituting another model would measure the wrong one.
//
// --- Why it never runs in the test suites -----------------------------------
//
// It costs money and needs a live key, and a suite that silently called a
// provider would make `npm test` non-deterministic and billable. The runner
// lives in `run-llm-benchmark.ts` behind an explicit command
// (`npm run benchmark:llm`); this module is pure orchestration and is unit
// tested without a network.

export const BENCHMARK_STAGES = [
  "analysis",
  "assessment",
  "opportunities",
  "recommendations",
  "roadmap",
  "consultant_report",
] as const

export type BenchmarkStage = (typeof BENCHMARK_STAGES)[number]

export type StageOutcome = {
  stage: BenchmarkStage
  promptVersion: string
  promptFingerprint: string
  promptCharacters: number

  // Did the provider answer at all?
  apiSuccess: boolean
  // Did what it returned survive `parseLlmJson`?
  jsonParseSuccess: boolean
  // Did it satisfy the stage's own schema?
  schemaValid: boolean
  // Where a stage's contract goes beyond its schema — a citation that must
  // resolve, a ranking that must be a real ordering — what the contract said.
  groundingOutcome: "not_applicable" | "accepted" | "refused"
  groundingDetail: string | null

  // Personal identifiers found in the model's *output*, by kind. A response is
  // never assumed clean because the input was synthetic: a model can complete a
  // placeholder into something that looks like a real address.
  outputPiiKinds: readonly string[]

  latencyMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  // `null` where the provider/model pair has no confirmed rate — never a
  // guessed figure (`evaluation/llm-rates.ts`).
  costEstimateUsd: number | null

  // Identifiers only, exactly as everywhere else: a provider error arrives with
  // the failing request attached, API key included.
  errorName: string | null
  errorCode: string | null
  // The parser's or validator's own stable message. Safe by construction — it
  // names a failure, never the response.
  failureMessage: string | null
}

export type BenchmarkRun = {
  startedAt: string
  finishedAt: string
  provider: string
  model: string
  // Whether the deployment's rate table can price this run at all.
  costingAvailable: boolean
  iterations: number
  outcomes: readonly StageOutcome[]
}

// What the runner needs from the outside world: one call, and a clock.
export type BenchmarkDependencies = {
  callLlm: (prompt: string) => Promise<LlmResponse>
  now?: () => Date
}

// --- The six prompts --------------------------------------------------------

// Built once and reused across iterations, so every iteration measures the same
// input and a difference between them is the model's variance rather than the
// fixture's.
export const buildBenchmarkPrompts = (): readonly {
  stage: BenchmarkStage
  promptVersion: string
  promptFingerprint: string
  prompt: string
}[] => {
  const discovery = benchmarkDiscoveryProfile()
  const assessment = benchmarkAssessment()
  const opportunities = benchmarkOpportunities()
  const roadmap = benchmarkRoadmap()

  // The real deterministic retrieval, run over the shipped seed. Using it
  // rather than a hand-written package is what makes the recommendation and
  // roadmap prompts the size and shape the product actually sends.
  const situationText = [
    discovery.statedProblem ?? "",
    discovery.currentProcess ?? "",
    discovery.desiredOutcome ?? "",
    ...discovery.painPoints,
  ]

  const knowledgeContext = {
    domainCode: "customer-operations",
    situationText,
  }

  const assessmentKnowledge = buildKnowledgePackage(
    consultingKnowledgeSeed,
    "assessment",
    knowledgeContext,
  )

  const solutionKnowledge = buildKnowledgePackage(
    consultingKnowledgeSeed,
    "solution_matching",
    knowledgeContext,
  )

  const roadmapKnowledge = buildKnowledgePackage(
    consultingKnowledgeSeed,
    "roadmap",
    knowledgeContext,
  )

  const reportKnowledge = buildKnowledgePackage(
    consultingKnowledgeSeed,
    "report",
    knowledgeContext,
  )

  // No approved Technology Update History here — the benchmark runs against the
  // shipped seed, so every profile carries its product declaration and nothing
  // claims curator approval it does not have.
  const technology = buildTechnologyPackage(
    technologyProfileSeed,
    new Map(),
    {
      categoryCodes: ["ai-models"],
      situationText: [...situationText, "Klassifikation", "Sprachmodell"],
    },
  )

  // Grounding is taken from what was *actually retrieved*, never asserted, so
  // the recommendation fixture can never cite something the retrieval did not
  // supply — the same rule the product enforces on the model.
  const recommendations = benchmarkRecommendations({
    knowledgeEntryCodes: solutionKnowledge.entries
      .slice(0, 2)
      .map((entry) => ({
        code: entry.code,
        kind: entry.kind,
        title: entry.title,
      })),
    technologyProfileCodes: technology.profiles.slice(0, 1).map((profile) => ({
      code: profile.code,
      categoryCode: profile.categoryCode,
      title: profile.title,
    })),
  })

  return [
    {
      stage: "analysis",
      promptVersion: ANALYSIS_PROMPT.version,
      promptFingerprint: ANALYSIS_PROMPT.fingerprint,
      // The analysis stage serializes the engagement row itself. The benchmark
      // supplies the synthetic engagement in the same shape.
      prompt: `${ANALYSIS_PROMPT.template}

Engagement:
${JSON.stringify(
  {
    organization: BENCHMARK_ORGANIZATION,
    ...BENCHMARK_ENGAGEMENT,
    ...discovery,
  },
  null,
  2,
)}
`,
    },
    {
      stage: "assessment",
      promptVersion: ASSESSMENT_PROMPT.version,
      promptFingerprint: ASSESSMENT_PROMPT.fingerprint,
      prompt: buildAssessmentPrompt({
        organization: { ...BENCHMARK_ORGANIZATION },
        engagement: { ...BENCHMARK_ENGAGEMENT },
        discoveryProfile: discovery,
        knowledgePackage: assessmentKnowledge,
      }),
    },
    {
      stage: "opportunities",
      promptVersion: OPPORTUNITIES_PROMPT.version,
      promptFingerprint: OPPORTUNITIES_PROMPT.fingerprint,
      prompt: buildOpportunitiesPrompt({
        organization: { ...BENCHMARK_ORGANIZATION },
        engagement: { ...BENCHMARK_ENGAGEMENT },
        assessment,
      }),
    },
    {
      stage: "recommendations",
      promptVersion: RECOMMENDATIONS_PROMPT.version,
      promptFingerprint: RECOMMENDATIONS_PROMPT.fingerprint,
      prompt: buildRecommendationsPrompt({
        organization: { ...BENCHMARK_ORGANIZATION },
        engagement: { ...BENCHMARK_ENGAGEMENT },
        opportunities,
        discoveryTrace: {
          opp_benchmark_1: [
            {
              findingTitle: "Manuelle Vorsortierung als Engpass",
              supportingFacts: [
                "Eingehende Nachrichten werden morgens gesichtet und per Hand einer von neun Kategorien zugeordnet",
              ],
            },
          ],
        },
        knowledgePackage: solutionKnowledge,
        technologyPackage: technology,
      }),
    },
    {
      stage: "roadmap",
      promptVersion: IMPLEMENTATION_ROADMAP_PROMPT.version,
      promptFingerprint: IMPLEMENTATION_ROADMAP_PROMPT.fingerprint,
      prompt: buildImplementationRoadmapPrompt({
        organization: { ...BENCHMARK_ORGANIZATION },
        engagement: {
          ...BENCHMARK_ENGAGEMENT,
          businessImpact: discovery.businessImpact,
          currentProcess: discovery.currentProcess,
          desiredOutcome: discovery.desiredOutcome,
          technicalConstraints: discovery.technicalConstraints,
          missingInformation: discovery.missingInformation,
        },
        recommendations,
        implementationPatterns: roadmapKnowledge,
      }),
    },
    {
      stage: "consultant_report",
      promptVersion: CONSULTANT_REPORT_PROMPT.version,
      promptFingerprint: CONSULTANT_REPORT_PROMPT.fingerprint,
      // The report stage's own builder resolves follow-up templates from a
      // persisted source bundle. The benchmark supplies the same accepted
      // material directly, which is what that bundle serializes to — including
      // the engagement context, which the report's `engagementContext` names
      // and no other supplied source carries.
      prompt: `${CONSULTANT_REPORT_PROMPT.template}

Engagement context:
${JSON.stringify(
  {
    organization: { name: BENCHMARK_ORGANIZATION.name },
    engagement: {
      title: BENCHMARK_ENGAGEMENT.title,
      department: BENCHMARK_ENGAGEMENT.department,
    },
  },
  null,
  2,
)}

Accepted source material:
${JSON.stringify(
  {
    discovery,
    assessment,
    opportunities,
    recommendations,
    roadmap,
  },
  null,
  2,
)}

Curated follow-up templates:
${JSON.stringify(reportKnowledge.entries, null, 2)}
`,
    },
  ]
}

// --- Judging one response ---------------------------------------------------

// Each stage's own parser and validator, so "schema valid" means exactly what
// it means in production.
const judge = (
  stage: BenchmarkStage,
  content: string,
): {
  jsonParseSuccess: boolean
  schemaValid: boolean
  failureMessage: string | null
} => {
  switch (stage) {
    case "analysis":
      return summarize(parseAnalysisReport(content))
    case "assessment":
      return summarize(parseAssessment(content))
    case "opportunities":
      return summarize(parseOpportunities(content))
    case "recommendations":
      return summarize(parseRecommendations(content))
    case "roadmap":
      return summarize(parseImplementationRoadmap(content))
    case "consultant_report":
      return summarize(parseConsultantReport(content))
  }
}

const summarize = (result: {
  success: boolean
  jsonParseSuccess: boolean
  schemaValid: boolean
  error?: string
}) => ({
  jsonParseSuccess: result.jsonParseSuccess,
  schemaValid: result.schemaValid,
  failureMessage: result.success ? null : (result.error ?? "unknown failure"),
})

// --- Running ----------------------------------------------------------------

export const runBenchmark = async (
  dependencies: BenchmarkDependencies,
  iterations: number = 1,
): Promise<BenchmarkRun> => {
  const now = dependencies.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const prompts = buildBenchmarkPrompts()
  const outcomes: StageOutcome[] = []

  // The workspace's own personal-identifier rules are a deployment decision, so
  // the benchmark scans with the shipped defaults: the built-in shapes.
  const scanRules = defaultCompliancePolicy().personalIdentifierRules

  let provider = ""
  let model = ""

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const stage of prompts) {
      outcomes.push(
        await runStage(stage, dependencies, scanRules, (response) => {
          provider = response.provider
          model = response.model
        }),
      )
    }
  }

  return {
    startedAt,
    finishedAt: now().toISOString(),
    provider,
    model,
    // Listed is not the same as priced: GPT-OSS is in the table precisely so
    // that it is discoverable, and carries no figures until someone confirms
    // them. Only a priced pair can cost a run.
    costingAvailable: isPriced(findLlmRate(provider, model)),
    iterations,
    outcomes,
  }
}

const runStage = async (
  stage: ReturnType<typeof buildBenchmarkPrompts>[number],
  dependencies: BenchmarkDependencies,
  scanRules: ReturnType<typeof defaultCompliancePolicy>["personalIdentifierRules"],
  observe: (response: LlmResponse) => void,
): Promise<StageOutcome> => {
  const base = {
    stage: stage.stage,
    promptVersion: stage.promptVersion,
    promptFingerprint: stage.promptFingerprint,
    promptCharacters: stage.prompt.length,
    groundingOutcome: "not_applicable" as const,
    groundingDetail: null,
    outputPiiKinds: [] as readonly string[],
  }

  let response: LlmResponse
  try {
    response = await dependencies.callLlm(stage.prompt)
    observe(response)
  } catch (error) {
    // Identifiers only. A provider SDK error arrives carrying the failing
    // request — `Authorization: Bearer <key>`, the body, and the URL.
    return {
      ...base,
      apiSuccess: false,
      jsonParseSuccess: false,
      schemaValid: false,
      latencyMs: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      costEstimateUsd: null,
      errorName: nameOf(error),
      errorCode: codeOf(error),
      failureMessage: null,
    }
  }

  const parsed = judge(stage.stage, response.content)

  return {
    ...base,
    apiSuccess: true,
    jsonParseSuccess: parsed.jsonParseSuccess,
    schemaValid: parsed.schemaValid,
    // Kinds only, never values — a record of what leaked would be the leak.
    outputPiiKinds: findPersonalIdentifiers(response.content, scanRules),
    groundingOutcome: parsed.schemaValid ? "accepted" : "refused",
    groundingDetail: parsed.failureMessage,
    latencyMs: response.latencyMs,
    promptTokens: response.promptTokens ?? null,
    completionTokens: response.completionTokens ?? null,
    totalTokens: response.totalTokens ?? null,
    costEstimateUsd:
      calculateLlmCost({
        provider: response.provider,
        model: response.model,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
      }) ?? null,
    errorName: null,
    errorCode: null,
    failureMessage: parsed.failureMessage,
  }
}

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const CODE = /^[A-Z][A-Z0-9_]{0,31}$/

const nameOf = (error: unknown): string => {
  const name = error instanceof Error ? error.name : typeof error
  return IDENTIFIER.test(name) ? name : "unrecognized"
}

const codeOf = (error: unknown): string | null => {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code: unknown }).code
      : undefined
  return typeof code === "string" && CODE.test(code) ? code : null
}

// --- Reporting --------------------------------------------------------------

// The run as a table an operator reads, plus the manual checklist. Kept
// separate from the run so a stored JSON result can be re-rendered without
// calling a provider again.
export const renderBenchmarkReport = (run: BenchmarkRun): string => {
  const rows = run.outcomes.map((outcome) =>
    [
      outcome.stage,
      outcome.apiSuccess ? "yes" : "NO",
      outcome.jsonParseSuccess ? "yes" : "NO",
      outcome.schemaValid ? "yes" : "NO",
      outcome.outputPiiKinds.length === 0
        ? "clean"
        : `FOUND: ${outcome.outputPiiKinds.join("/")}`,
      outcome.latencyMs === null ? "—" : `${outcome.latencyMs} ms`,
      outcome.promptTokens ?? "—",
      outcome.completionTokens ?? "—",
      outcome.costEstimateUsd === null
        ? "unpriced"
        : `$${outcome.costEstimateUsd.toFixed(6)}`,
      outcome.failureMessage ?? outcome.errorName ?? "—",
    ].join(" | "),
  )

  return [
    `# LLM benchmark — ${run.provider} / ${run.model}`,
    "",
    `Started ${run.startedAt}, finished ${run.finishedAt}, ${run.iterations} iteration(s).`,
    "",
    run.costingAvailable
      ? ""
      : "> **Cost is not reported for this model.** No confirmed rate is recorded for this provider/model pair, and a guessed figure would be worse than none. Fill in `evaluation/llm-rates.ts` after confirming the published price.",
    "",
    "| stage | api | json | schema | output PII | latency | in | out | cost | failure |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((row) => `| ${row} |`),
    "",
    MANUAL_CHECKLIST,
  ]
    .filter((line) => line !== "")
    .join("\n")
}

// What no automated metric can decide, and which therefore has to be looked at
// by a person before a model is adopted.
export const MANUAL_CHECKLIST = `## Manual review — required before adopting a model

The table above measures what a machine can measure. None of it establishes
that the output is *good*, and a model can score perfectly on every column
while producing German a consultant would not send to a client.

Read at least one full response per stage and answer, in writing:

**German quality**
- [ ] Is it fluent, professional German — not translated-sounding?
- [ ] Is the register right for a client-facing consulting document (Sie-Form,
      no marketing tone, no anglicisms where a German term exists)?
- [ ] Is the vocabulary the domain's — "Vorgang", "Anliegen", "Freigabe" —
      rather than a literal rendering of English consulting jargon?
- [ ] Did any English leak into a German field?

**Groundedness**
- [ ] Does every finding, opportunity, and recommendation rest on something in
      the supplied material, rather than on plausible-sounding invention?
- [ ] Are the citations real — do the codes and finding titles actually appear
      in what the prompt supplied?
- [ ] Did the model supply a figure anywhere? It must not: baselines, targets
      and timeframes belong to the client.
- [ ] Are uncertainties stated as uncertainties rather than smoothed over?

**Instruction following**
- [ ] Did it return JSON and nothing else, or did it wrap, explain, or
      apologize around it?
- [ ] Did it invent an enum value the schema does not define?
- [ ] Did it respect the required field set, or omit the awkward ones?

**Reasoning behaviour** (for a reasoning model)
- [ ] Did any thinking appear inside the JSON content?
- [ ] If so, which \`LLM_REASONING_FORMAT\` setting removes it, and was that
      verified against the live API rather than assumed?

Record the answers alongside the run. A model is adopted on the strength of
this section, not the table.`
