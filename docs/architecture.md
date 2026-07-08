# Architecture — AI Consulting Workbench

Status: **Draft** · Version: 1.0 · Derived from [product-vision.md](./product-vision.md), [domain-model.md](./domain-model.md), and [roadmap.md](./roadmap.md).

This is the first **implementation** document. It defines *how* the product is built — its layers, boundaries, and infrastructure — while remaining fully aligned with the frozen product vision, the stable domain model, and the roadmap. It does **not** define product requirements, redesign the product, or change the roadmap.

Where this document names concrete technologies, it describes the current, already-present stack (TypeScript/Node, Express, Prisma/PostgreSQL, a provider-abstracted LLM client, Langfuse). The architecture is deliberately shaped so that these choices can change without disturbing the domain layer.

---

## 1. Architecture Principles

These principles govern every decision below. They are the implementation-side reflection of the vision's frozen commitments.

1. **Domain-centric, infrastructure-peripheral.** Business logic (Engagement, Assessment, Recommendation, Knowledge Base) is expressed in a domain layer that has no knowledge of Express, Prisma, Groq, or Langfuse. Frameworks are details wired in at the edges.
2. **Engagement is the primary business entity.** The Engagement is the aggregate root for all client-specific state. Every methodology stage reads and writes engagement state; nothing client-specific lives outside an engagement.
3. **Knowledge Base is the core reusable asset.** It is a first-class, engagement-independent subsystem. The reference direction is strictly one-way: engagement → knowledge. Knowledge is never mutated by running an engagement.
4. **Methodology ≠ architecture.** The nine methodology steps are not nine services or a rigid pipeline. Stages are re-entrant operations over persisted engagement state.
5. **Reuse existing infrastructure; do not rebuild it.** Engagement persistence, Analysis Run recording, prompt versioning/fingerprinting, cost calculation, and Langfuse tracing already exist. Each phase *extends* them.
6. **Avoid overengineering / build for the phase in front of you.** No multi-domain plugin framework, no RAG infrastructure, and no generic knowledge-item engine are built ahead of the phase that needs them. Abstractions are introduced when a second concrete case exists — never speculatively.
7. **Human-in-the-loop by construction.** Every AI-produced artifact is a persisted, editable draft carrying assumptions, confidence, and gaps. AI output never overwrites consultant edits silently.
8. **Every AI-assisted step is an observed, costed Analysis Run.** This is a non-negotiable cross-cutting obligation (roadmap §Cross-cutting Capabilities), satisfied by one shared mechanism, not re-implemented per stage.
9. **Each phase leaves the system fully working.** The architecture supports incremental delivery: a stage can exist with an empty or partial downstream without breaking earlier stages.
10. **Prefer explicitness over clever abstraction.** The architecture should favor clear, understandable structures over generic frameworks, hidden magic, or abstractions introduced before they are needed.

---

## 2. High-Level System Architecture

The system is a single-tenant web application with three deployable parts, all already present in the repository:

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (Next.js / React)                                    │
│  Engagement workspace UI — methodology stages, review & edit   │
└───────────────┬──────────────────────────────────────────────┘
                │  HTTP / JSON (REST)
┌───────────────▼──────────────────────────────────────────────┐
│  Backend (Node / Express)                                      │
│                                                                │
│  Interface layer   → routes, request/response validation       │
│  Application layer  → use cases / services (stage orchestration)│
│  Domain layer       → Engagement, Assessment, Recommendation,  │
│                       Knowledge Base model, invariants          │
│  AI orchestration   → prompt build → LLM call → parse → evaluate│
│                       → record Analysis Run                     │
│  Infrastructure     → Prisma repos, LLM provider adapters,      │
│                       Langfuse, config                          │
└──────┬──────────────────────────┬──────────────────┬─────────┘
       │                          │                  │
┌──────▼──────┐          ┌────────▼────────┐   ┌─────▼─────────┐
│ PostgreSQL  │          │ LLM provider(s) │   │  Langfuse      │
│ (Prisma)    │          │ (Groq → others) │   │ observability  │
│ Engagement  │          └─────────────────┘   └────────────────┘
│ + Knowledge │
│ + AnalysisRun│
└─────────────┘
```

- **One backend, one PostgreSQL database (current deployment).** The current implementation uses one backend and one PostgreSQL database; the architecture does not depend on this deployment topology. The Knowledge Base and engagement data live in the same PostgreSQL instance but in **separate schemas/table groups** with a one-directional reference boundary enforced in the domain layer (§9).
- **Stateless backend.** All state is in PostgreSQL; the backend holds no session-bound engagement state, which keeps stages re-runnable and the service horizontally deployable later (Phase 11).
- **External services are optional and swappable.** Langfuse is toggled by config and degrades gracefully when disabled; the LLM provider is chosen behind an abstraction.

---

## 3. Application Layers and Responsibilities

The backend is organized in four layers with a strict dependency rule: **dependencies point inward** (interface → application → domain; infrastructure implements ports defined toward the domain/application side). The domain layer depends on nothing framework-specific.

| Layer | Responsibility | Depends on | Must NOT contain |
|---|---|---|---|
| **Interface (routes)** | HTTP transport, request parsing, Zod input validation, mapping results to HTTP responses. | Application | Business rules, prompt text, SQL |
| **Application (services / use cases)** | Orchestrate a methodology stage: load engagement state, invoke domain logic and/or AI orchestration, persist results, record the Analysis Run. One application service per business capability (stages need not map one-to-one to services). | Domain, ports (repositories, LLM, KB retrieval) | HTTP objects, provider SDKs, raw SQL |
| **Domain** | The business model and rules: Engagement aggregate and its parts, Assessment dimensions, Opportunity/Recommendation semantics, Knowledge Base model, grounding and traceability invariants. Pure and framework-free. | Nothing external | Express, Prisma, Groq, Langfuse, `process.env` |
| **Infrastructure** | Concrete adapters that implement the ports: Prisma repositories, LLM provider adapters, cost calculator, Langfuse tracer, config loading. | Domain/application ports | Business decisions |

The already-present split (`routes/` → `services/` → `repositories/` + `lib/`) is exactly this shape and is preserved and extended rather than replaced. The main change over time is making the **domain** an explicit layer rather than logic scattered inside services.

**Ports (interfaces) the application depends on:**
- `EngagementRepository`, `KnowledgeRepository`, `AnalysisRunRepository` — persistence.
- `LlmClient` — text generation with usage/latency metadata (already exists as `callLlm`).
- `KnowledgeRetrieval` — deterministic retrieval/matching over the Knowledge Base (Phase 5); a later RAG adapter (Phase 10) implements the *same* port.
- `Tracer` / `CostCalculator` — observability and cost (already exist as `langfuse` and `calculateLlmCost`).

---

## 4. Domain Layer

The domain layer is the direct code expression of `domain-model.md`. It is where the product's business meaning lives and it is intentionally the most stable part of the system.

### 4.1 The two sides
The domain is split into two packages that mirror the model's two sides:

- **Engagement side** — client-specific, mutable state.
- **Knowledge side** — reusable, curated, engagement-independent knowledge.

The only permitted dependency is engagement-side → knowledge-side, expressed as **references (identifiers) plus copied reasoning**, never as a live mutation of knowledge (see §9 grounding).

### 4.2 Engagement aggregate
**Engagement** is the aggregate root. It owns:

- `DiscoveryProfile` (known facts + explicit gaps),
- `Assessment` with its **dimensions** (Business Process, Data, Technology, AI Readiness, Risks, Opportunities) — dimensions are values within the Assessment, **not** separate entities, exactly as the domain model requires,
- `Opportunity` set,
- `Recommendation` set (each carrying rationale, assumptions, confidence, and grounding references),
- `ImplementationRoadmap`,
- `ConsultantReport` **versions**,
- and the `stage`/status marker of where the engagement stands.

**Organization** is a thin grouping entity (identity + context) that owns many Engagements and holds no methodology state — matching the "not a CRM" boundary.

### 4.3 Invariants owned by the domain
- Engagement-specific content may reference knowledge but must copy the reasoning it relied on, so the record stays faithful to knowledge *as it stood* when the work was done.
- A Recommendation is only valid if it is traceable **backward** to Discovery facts and **outward** to the Knowledge Base entries that justify it (grounding invariant).
- Reports are **append-only versions**; producing a new version never destroys a prior one.
- Every stage is a pure transformation of persisted engagement state → new engagement state, enabling re-entry and re-run without restarting the engagement.

### 4.4 What the domain excludes
No HTTP, no Prisma models, no prompt strings, no provider SDKs. The domain speaks in business types; infrastructure maps those to/from storage and transport. This is what lets storage, transport, and model provider change without touching business rules.

---

## 5. AI Orchestration Layer

AI orchestration is a thin, uniform pipeline shared by every AI-assisted stage (Assessment, Solution Matching, Report drafting, Feedback revision, and any later AI step). It already exists in `analysis.service.ts` and is generalized into a reusable shape.

**The pipeline (single shared shape):**

```
build stage input (engagement state + retrieved knowledge)
   → build prompt (versioned template + fingerprint)
   → call LLM (provider-abstracted)
   → parse output (strict JSON → Zod validation)
   → evaluate quality signals
   → persist stage result to engagement state (as editable draft)
   → record Analysis Run (cost, tokens, latency, provider, model,
                          prompt version, prompt fingerprint, trace ref)
   → trace in Langfuse
```

Key properties:

- **Stage-agnostic mechanism.** Each stage supplies three things — the prompt module, the output schema, and how the parsed result maps into engagement state. The surrounding orchestration (call → parse → evaluate → record → trace) is shared, satisfying the cross-cutting obligation once.
- **Deterministic grounding first.** Knowledge is retrieved deterministically (Phase 5) and passed *into* the prompt. The LLM reasons over supplied knowledge rather than inventing it; grounding references are captured alongside the generated content. This makes traceability structural, not best-effort.
- **AI output is a draft.** The parsed, validated result is persisted as engagement state marked as an unreviewed draft. Consultant edits are first-class and are never overwritten by a re-run without explicit intent.
- **Failure is a first-class outcome.** Parse/validation failure still produces an Analysis Run (with the error recorded) and returns a structured failure to the caller — it does not lose the audit trail (§13).

**Real evaluation vs. the current placeholder.** The current `evaluateAnalysisOutput` returns hard-coded `"medium"` quality signals. Per roadmap Phase 0, this fake evaluation is removed/disabled so no placeholder score is ever presented as a real one. The Analysis Run record keeps the *objective* signals (parse success, schema validity, tokens, cost, latency); subjective quality signals are only stored when a genuine evaluator produces them.

---

## 6. Persistence Layer

- **Store:** PostgreSQL via Prisma (already in place). Prisma models are **infrastructure**, not the domain; repositories translate between Prisma rows and domain types.
- **Repository pattern.** Application code depends on repository *ports*; Prisma-backed repositories implement them. `AnalysisRunRepository` already exists in this shape and is the template for `EngagementRepository` and `KnowledgeRepository`.
- **Engagement persistence is the single engagement store.** Later phases attach discovery, assessment, opportunities, recommendations, roadmap, and report versions to the existing engagement record rather than introducing a parallel store (roadmap Phase 1).
- **Structured-but-flexible columns.** The current schema already uses typed columns for stable fields and `Json` columns for evolving nested structures (pain points, process steps, etc.). Methodology stage outputs that are still stabilizing (assessment findings, opportunities) are stored as validated `Json` payloads owned by the Engagement, with typed columns introduced only once a shape is stable. This avoids a migration per stage in early phases while keeping validation at the Zod boundary.
- **Terminology migration (Phase 0/1).** The existing `ClientCase` model is the legacy name for engagement state. It is renamed/reshaped toward `Engagement` (+ `Organization` grouping) as Phase 0 aligns terminology and Phase 1 establishes the engagement foundation. Existing Analysis Run persistence is retained; its foreign key follows the rename (`caseId` → `engagementId`) without changing its behavior.
- **Separation boundary in storage.** Knowledge tables and engagement tables are distinct groups. Engagement rows hold knowledge **identifiers** (and copied reasoning), never foreign-key ownership *into* engagements from knowledge. No knowledge write path is reachable from an engagement stage.

---

## 7. Frontend Architecture

- **Stack:** Next.js (App Router) + React + Tailwind, already scaffolded under `client/`. The frontend is a thin, server-backed client — it holds no business rules.

> Note: this repository pins a Next.js version whose conventions differ from common defaults (`client/AGENTS.md`). Frontend work must follow the in-repo guidance rather than assumed Next.js patterns.

- **Engagement-centric workspace.** The primary UI object is the Engagement. The consultant opens an engagement and moves between methodology stages within it; the URL structure is engagement-scoped (`/engagements/[id]/...`), mirroring that the engagement is the unit of work.
- **Stage views over persisted state.** Each methodology stage is a view that reads engagement state and lets the consultant generate (AI-assisted), then **review, edit, accept, or override**. Because stages are re-entrant on the backend, the UI can return to and re-run any stage without a wizard-style forced sequence.
- **Human-in-the-loop is visible.** Assumptions, confidence, and gaps are surfaced in the stage views; AI output is clearly presented as a draft; report versions are listed and comparable. This is a UI obligation derived from the vision, not a backend concern.
- **The backend is the source of truth.** The client does not compute grounding, cost, or evaluation; it renders what the backend persisted. This keeps business logic server-side and the client replaceable.

---

## 8. Analysis Run Architecture

The Analysis Run is the audit-and-trust record behind every AI-assisted step and already exists as a persisted model. It is central to the cross-cutting obligation.

- **Definition.** An Analysis Run is a record *about* AI assistance — never client deliverable content. It belongs to one **Engagement** and is associated with the stage/output it supported.
- **Captured on every run** (already modeled): provider, model, prompt version, prompt fingerprint, latency, input/output/total tokens, estimated cost, objective quality signals (JSON parse success, schema validity), optional error message, timestamp, and — where available — a Langfuse trace reference.
- **Stage association.** As more AI stages are added, each run records *which stage* it supported (e.g., `assessment`, `solution-matching`, `report`) so runs can be filtered by stage while still rolling up to the engagement. This is a small additive field, not a new mechanism.
- **History is preserved.** Runs accumulate across re-runs and iterations as the engagement's audit trail; nothing is deleted when a stage is re-run. This directly supports explainability, traceability, and the consultant's confidence in (or correction of) AI output.
- **One recording path.** All stages record runs through the same repository and orchestration path, guaranteeing consistency and satisfying the roadmap's "stated once, not repeated per phase" obligation.

---

## 9. Knowledge Base Architecture

The Knowledge Base is a core subsystem, not a feature bolted onto engagements. **The Knowledge Base is a separate subsystem, not a separate database:** it is a distinct module with its own tables inside the single PostgreSQL instance, not an independently deployed store.

- **Separate subsystem, same database.** Knowledge lives in its own tables/module, curated independently of any engagement (roadmap Phase 5). It is read-only from the engagement's perspective.
- **Specific kinds first, generic container second.** The domain is defined by the *named* kinds of knowledge (Business Domains, Business Processes, Business Problems, Customer Operations Taxonomy, Discovery Questions, Assessment Frameworks, AI Readiness Criteria, AI Use Cases, Solution Patterns, Implementation Patterns, Technology Profiles, ROI Models, Risk Models, Best Practices, Follow-up Templates). A shared "knowledge item" convenience may exist internally, but the modeled concepts are the specific kinds — matching the domain model's explicit warning against a generic container.
- **Domain scoping without a plugin framework.** Every knowledge entry is scoped by `BusinessDomain` (Customer Operations first). This scoping *field* is what allows a future domain to be added as new curated knowledge without touching the domain-agnostic engagement entities. The multi-domain **abstraction/plugin framework is not built** until a second domain actually exists (vision §10, roadmap MVP boundary).
- **Retrieval behind a port.** `KnowledgeRetrieval` is deterministic and structured in Phase 5 (filter/match over taxonomy, problems, and use cases — no embeddings). Phase 10 adds a RAG adapter implementing the **same port**, *complementing* curated retrieval; grounding traceability is unchanged because retrieval only selects *which* knowledge is passed to the pipeline. No engagement code changes when the retrieval implementation changes.
- **One-directional reference (the grounding rule).** Engagement entities store knowledge identifiers and copy the reasoning they used into their own client-specific content. Curation is a separate, deliberate activity with no path from an engagement run. This keeps the Knowledge Base stable, shareable, and compounding in value.

---

## 10. Prompt Architecture

Prompts are versioned, fingerprinted assets — infrastructure that feeds the AI orchestration pipeline. The current `analysis-prompt` module is the template.

- **A prompt module per AI stage.** Each stage has its own prompt module exporting `{ version, template, fingerprint }`. The current pattern (`analysis-prompt.v1.ts` → `analysis-prompt.ts` re-export of the active version) is the convention for all stages.
- **Explicit versioning.** A human-readable `version` (e.g., `assessment-v1`) is recorded on every Analysis Run so outputs are attributable to a known prompt and prompts can evolve deliberately.
- **Content fingerprinting.** A SHA-256 fingerprint of the exact template content (already implemented via `createSha256Hash`) is recorded per run, tying a run to precisely what was sent even between version bumps.
- **Prompt assembly is separate from prompt content.** Building the final prompt (template + engagement input + retrieved knowledge) is a `build*Prompt` step in the orchestration layer, keeping the versioned template stable and the per-run inputs dynamic. This is also where retrieved knowledge is injected to enforce grounding.
- **Schema-coupled prompts.** Each prompt's expected output is paired with a Zod schema (as `consultant-report.schema.ts` does today) so the model's contract and the parser stay in lockstep. Shared output types live in `shared/` so client and server agree on shape.

### 10.1 Prompt ownership

Prompts are owned and governed like source code, not treated as runtime configuration:

- Prompts are **version-controlled assets**, living in the repository alongside the code that uses them.
- Prompts are **treated like code** — authored, reviewed, and released through the same engineering workflow.
- **Prompt changes require review** before they take effect.
- Prompts are **not edited directly in production**; a change reaches production only through the reviewed, version-controlled path.
- The **prompt version and prompt fingerprint must remain recorded on every AI-assisted Analysis Run**, so each output stays attributable to exactly the prompt that produced it.

---

## 11. Observability Architecture

- **Langfuse as the tracing backbone.** Every AI-assisted step is traced end-to-end (trace → generation → update), already implemented for the analysis stage. Each new stage reuses the same tracer, not a new mechanism.
- **Config-gated and non-blocking.** Langfuse is enabled only when configured and is `null` otherwise; the pipeline degrades gracefully when observability is off (already the case via `isObservabilityEnabled`). Tracing failures never fail a consultant's stage.
- **Trace ↔ Analysis Run linkage.** Where available, a Langfuse trace reference is stored on the Analysis Run so a persisted run can be opened directly in the observability tooling, and the trace carries the same identifiers (engagement id, prompt version, fingerprint) for correlation.
- **Signals are captured once, viewed many ways.** Tokens, latency, cost, model, provider, prompt version/fingerprint, and objective quality signals are recorded on the run and traced — giving both durable, queryable governance data (DB) and interactive exploration (Langfuse).

---

## 12. Cost Tracking Architecture

Cost tracking is derived from token usage recorded on each Analysis Run; it is not a separate system.

- **Per-request cost** is computed at run time from prompt/completion tokens and the model's rate, and stored on the Analysis Run (`calculateLlmCost` already does this). Storing the computed value keeps historical cost faithful even if rates change later.
- **Per-engagement cost** is the aggregation of all Analysis Runs belonging to that engagement — a query over existing data, no new storage.
- **Lifetime total cost** is the aggregation across all engagements — again a query, not a parallel ledger.
- **Attribution built in.** Provider and model are stored per run, so cost is attributable to exactly the provider/model that produced it. When rate tables need to vary by model/provider, the cost calculator gains a lookup — an internal change behind the existing function, not an architectural one.

This satisfies the roadmap's three required reporting levels (per request, per engagement, lifetime) from a single recorded signal.

---

## 13. Error Handling Strategy

Errors are handled at the boundary appropriate to their kind, and never at the cost of the audit trail.

- **Input validation (interface layer).** All external input is validated with Zod at the route boundary; invalid input returns a structured `400` and never reaches the domain. (Already the pattern in `routes/`.)
- **AI output validation (orchestration layer).** LLM output is strictly parsed and schema-validated. A parse/validation failure is a *domain-meaningful outcome*, not an exception: the run is still recorded (with the error), Langfuse is still flushed, and the caller receives a structured failure result (the current `analysis.service` `success: false` shape). The consultant sees that the draft could not be produced, with the reason.
- **Infrastructure failures (LLM/provider/DB/tracer).** Provider and database errors are caught in the application layer and surfaced as structured `5xx`/`422` responses; observability failures are swallowed (logged) so they never break a consultant's work. Best-effort side effects (tracing, cost) are wrapped so they cannot fail the primary operation.
- **Consultant-facing clarity.** Because AI output is a draft, an AI failure degrades to "no draft yet / try again," never a corrupted engagement. Persisted engagement state is only advanced on validated results.
- **Failed AI generation never mutates engagement state.** If an AI-assisted step fails parsing, validation, or provider execution, the previous Engagement state remains unchanged. The failed attempt is still recorded as an Analysis Run, but no partial or invalid stage output is persisted.
- **Hardening deferred, not ignored.** Production-grade error observability and recovery are explicitly a Phase 11 concern; earlier phases keep the structured-outcome discipline above so the hardening phase has a consistent base to build on.

---

## 14. Project Structure

The structure follows the layering in §3 and preserves the existing, working layout — extending it rather than reorganizing it.

```
docs/                         # vision, domain model, roadmap, this document
shared/                       # cross-cutting types & schemas shared by client + server
  consultant-report.schema.ts #   (report contract; more stage schemas added here)

server/
  src/
    routes/                   # interface layer — HTTP + Zod input validation
    services/                 # application layer — one application service per business capability
    domain/                   # (introduced) pure domain: engagement + knowledge model, invariants
      engagement/             #   engagement-side aggregate and parts
      knowledge/              #   knowledge-side kinds + retrieval port
    prompts/                  # versioned, fingerprinted prompt modules (per stage)
    evaluation/               # cost calculation + (real) output evaluation
    repositories/             # infrastructure — Prisma-backed repos implementing ports
    lib/                      # infrastructure — LLM client, provider adapters, parsing, prisma, config
      providers/              #   per-provider adapters (groq now; others behind same interface)
    observability/            # Langfuse tracer (config-gated)
    schemas/                  # request/DTO validation schemas
  prisma/                     # schema + migrations (engagement, knowledge, analysis-run)

client/
  app/                        # Next.js App Router — engagement workspace + stage views
  components/                 # stage/review/edit UI components
```

Notes:
- **`domain/` is the main additive change.** Today domain logic lives inside services; it is progressively lifted into an explicit, framework-free `domain/` package as stages are built. This is a refinement of the existing structure, not a rewrite.
- **`shared/` is the client/server contract.** Stage output schemas live here so both sides agree on shape and types.
- **No premature folders.** No `rag/`, no `domains/` plugin tree, and no generic knowledge-engine package is created before the phase that needs it.

---

## 15. Future Extensibility Principles

Extensibility is achieved by **stable seams**, not by speculative frameworks.

- **New methodology stages** attach to the Engagement aggregate and reuse the shared AI orchestration pipeline and Analysis Run recording. Adding a stage means: a prompt module, an output schema, a mapping into engagement state, and a service — no new infrastructure. This is what lets each roadmap phase land without redesign.
- **New business domains** are added as new curated Knowledge Base content scoped by `BusinessDomain`. The domain-agnostic engagement entities do not change. The multi-domain abstraction is only elaborated when a second domain is actually introduced (vision §10).
- **RAG (Phase 10)** enters as a second implementation of the existing `KnowledgeRetrieval` port, complementing curated retrieval. Grounding and traceability are unaffected because retrieval only decides *which* knowledge is supplied to the pipeline.
- **New LLM providers** are added as adapters behind the existing `LlmClient` abstraction (the provider union already anticipates `openai` and `anthropic`); orchestration, cost, and observability are unchanged.
- **Production readiness (Phase 11)** — auth, deployment, hardening — layers around the stateless backend and existing observability without touching the domain.

Each seam corresponds to a roadmap boundary, so the roadmap can be executed phase by phase with the domain layer as the stable center of gravity.

---

## Assumptions

- **Terminology migration is expected, not a redesign.** The existing `ClientCase` model is treated as the current, to-be-renamed embodiment of engagement state (roadmap Phase 0/1). This document assumes that rename/reshape rather than proposing a new product concept.
- **Single-tenant, single-consultant for now.** Authentication, multi-user access, and tenancy are Phase 11 concerns; the architecture assumes one consultant/local operation until then, while keeping the backend stateless so multi-user is addable later.
- **One PostgreSQL instance hosts both sides.** Knowledge and engagement data share a database but are separated by module/schema boundary and enforced reference direction; a physical split is not required at MVP.
- **Groq is the initial provider** behind the existing abstraction; `openai`/`anthropic` are already anticipated by the provider union and are added as adapters when needed.
- **The `Json`-column strategy** for still-stabilizing stage outputs is acceptable in early phases; typed columns are introduced as shapes stabilize.

## Architectural Decisions Made

1. **Explicit four-layer architecture with an inward dependency rule**, extending the existing `routes → services → repositories/lib` layout by lifting business logic into a framework-free `domain/` package.
2. **A single, shared AI orchestration pipeline** (build → call → parse → evaluate → persist draft → record run → trace) reused by every AI-assisted stage, so the cross-cutting cost/observability obligation is implemented once.
3. **Analysis Run as the single recording mechanism** for all AI stages, with an additive `stage` association rather than per-stage bespoke logging.
4. **Knowledge Base as a separate, read-only-from-engagement subsystem** with a `KnowledgeRetrieval` port; RAG later implements the same port. Domain scoping via a `BusinessDomain` field, without a plugin framework.
5. **Grounding enforced structurally** by injecting deterministically retrieved knowledge into the prompt and capturing references on the produced content, making traceability a property of the pipeline rather than a hope.
6. **Cost reporting derived by aggregation** from per-run recorded cost/tokens (per request → per engagement → lifetime), with no separate ledger.
7. **Removal of the placeholder evaluation** so no fake quality score is presented as real; only objective signals are stored until a genuine evaluator exists (roadmap Phase 0).
8. **Reuse-first posture**: prompt versioning/fingerprinting, cost calc, Langfuse, and Analysis Run persistence are extended, never rebuilt.

## Possible Risks

- **Domain extraction drift.** Business logic currently lives inside services; lifting it into `domain/` incrementally risks partial extraction where some rules leak into services or repositories. Mitigation: treat the inward dependency rule as a review gate on each new stage.
- **`Json`-column overuse.** Convenient early, but under-typed stage outputs can accumulate implicit contracts. Mitigation: pair every `Json` payload with a Zod schema in `shared/` and promote to typed columns as shapes stabilize.
- **Grounding is only as strong as retrieval.** If a stage generates content without passing knowledge through the pipeline, traceability weakens silently. Mitigation: make "recommendation without grounding references" a domain invariant that fails validation, not a lint suggestion.
- **Prompt/schema divergence.** A prompt template can drift from its Zod schema, causing avoidable parse failures. Mitigation: co-locate and version prompt + schema per stage; the fingerprint surfaces uncoordinated changes.
- **Cost fidelity.** A single hard-coded rate in `calculateLlmCost` will misprice as models/providers diversify. Mitigation: move to a per-model/provider rate lookup behind the existing function before multi-model use.
- **Observability coupling.** Care is needed that Langfuse or tracing failures never fail a consultant's stage; the best-effort/swallow discipline must be preserved as stages multiply.

## Files Created or Modified

- **Created:** `docs/architecture.md` (this document).
- **Modified:** none. No code was written or changed; no roadmap, vision, or domain-model edits were made.
