# Architecture — AI Consulting Workbench

Status: **Draft** · Version: 1.1 · Derived from [product-vision.md](./product-vision.md), [domain-model.md](./domain-model.md), and [roadmap.md](./roadmap.md).

> **Revision 1.1 (approved).** Reflects the split of the Knowledge Base into a **Consulting Knowledge Base** and a separate **Technology Knowledge Base** — the latter organized **hierarchically by Technology Category** (not a flat list) — and adds the **Technology Curator** subsystem (detect → propose → human-approve → update) as the only write path, plus a **Technology Update History** append-only audit log of approved revisions. Updates are attributed to first-class **Technology Sources** (official vendor origins) that proposals reference and the history preserves. Delivered as the **Phase 5A** extension of Phase 5 — **existing phase numbers and the MVP boundary are unchanged** (RAG stays Phase 10, Production Readiness Phase 11). No architectural principle is changed.

This is the first **implementation** document. It defines *how* the product is built — its layers, boundaries, and infrastructure — while remaining fully aligned with the frozen product vision, the stable domain model, and the roadmap. It does **not** define product requirements, redesign the product, or change the roadmap.

Where this document names concrete technologies, it describes the current, already-present stack (TypeScript/Node, Express, Prisma/PostgreSQL, a provider-abstracted LLM client, Langfuse). The architecture is deliberately shaped so that these choices can change without disturbing the domain layer.

---

## 1. Architecture Principles

These principles govern every decision below. They are the implementation-side reflection of the vision's frozen commitments.

1. **Domain-centric, infrastructure-peripheral.** Business logic (Engagement, Assessment, Recommendation, the two Knowledge Bases) is expressed in a domain layer that has no knowledge of Express, Prisma, Groq, or Langfuse. Frameworks are details wired in at the edges.
2. **Engagement is the primary business entity.** The Engagement is the aggregate root for all client-specific state. Every methodology stage reads and writes engagement state; nothing client-specific lives outside an engagement.
3. **Two knowledge bases are the core reusable assets.** The **Consulting Knowledge Base** and the separate, more frequently-updated **Technology Knowledge Base** are each first-class, engagement-independent subsystems, independent of each other. The reference direction is strictly one-way: engagement → knowledge; neither is ever mutated by running an engagement. The Technology Knowledge Base is updated **only** through the human-approved **Technology Curator** (detect → propose → human-approve → update) — its sole write path — never by engagement code or an autonomous AI path.
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
┌──────▼─────────────┐  ┌────────▼────────┐   ┌─────▼─────────┐
│ PostgreSQL (Prisma)│  │ LLM provider(s) │   │  Langfuse      │
│  Engagement        │  │ (Groq → others) │   │ observability  │
│  + Consulting KB   │  └─────────────────┘   └────────────────┘
│  + Technology KB   │
│    (+ curator)     │
│  + AnalysisRun     │
└────────────────────┘
```

- **One backend, one PostgreSQL database (current deployment).** The current implementation uses one backend and one PostgreSQL database; the architecture does not depend on this deployment topology. Both the Consulting Knowledge Base and the Technology Knowledge Base live in the same PostgreSQL instance as engagement data but in **separate schemas/table groups** (each knowledge base distinct from engagement data and from the other), with a one-directional reference boundary enforced in the domain layer (§9). The Technology Knowledge Base's only write path is the human-approved Technology Curator (§9).
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
- `EngagementRepository`, `KnowledgeRepository`, `TechnologyKnowledgeRepository`, `AnalysisRunRepository` — persistence. `TechnologyKnowledgeRepository` exposes read access for engagement stages and a write path reachable **only** from the approved-proposal curator flow.
- `LlmClient` — text generation with usage/latency metadata (already exists as `callLlm`).
- `KnowledgeRetrieval` — deterministic retrieval/matching over the Consulting Knowledge Base (Phase 5); a later RAG adapter (Phase 10) implements the *same* port.
- `TechnologyRetrieval` — deterministic retrieval/matching over the Technology Knowledge Base (Phase 5A), scoped by **Technology Category**, following the same pattern as `KnowledgeRetrieval` over a separate store.
- `TechnologySourceRepository` — persistence for the registry of **Technology Sources** (trusted official origins: OpenAI, Anthropic, Google, Meta, Groq, Mistral, …), referenced by proposals and preserved on history entries (Phase 5A).
- `TechnologySourceWatcher` / `TechnologyCuratorRepository` — the Technology Curator's ports (Phase 5A): detect candidate updates *from* a Technology Source, and persist Technology Update Proposals (with their Technology Source references), their approval decisions, and the append-only Technology Update History of applied changes (which preserves those source references). Not reachable from an engagement stage.
- `Tracer` / `CostCalculator` — observability and cost (already exist as `langfuse` and `calculateLlmCost`).

---

## 4. Domain Layer

The domain layer is the direct code expression of `domain-model.md`. It is where the product's business meaning lives and it is intentionally the most stable part of the system.

### 4.1 The two sides
The domain is split to mirror the model's two sides:

- **Engagement side** — client-specific, mutable state.
- **Knowledge side** — reusable, curated, engagement-independent knowledge, comprising two independent bodies: the **Consulting Knowledge Base** and the **Technology Knowledge Base**.

The only permitted dependency is engagement-side → knowledge-side, expressed as **references (identifiers) plus copied reasoning**, never as a live mutation of knowledge (see §9 grounding). This applies to both knowledge bases; a Recommendation may carry grounding references into the Consulting Knowledge Base (use case / solution pattern) and into the Technology Knowledge Base (technology profiles) at once.

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
- A Recommendation is only valid if it is traceable **backward** to Discovery facts and **outward** to the Consulting Knowledge Base entries that justify its approach; any concrete technologies or models it names must additionally reference the Technology Knowledge Base entries behind them (grounding invariant).
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
- **Deterministic grounding first.** Knowledge is retrieved deterministically — from the Consulting Knowledge Base (Phase 5) and, for technology and model suggestions, the Technology Knowledge Base (Phase 5A) — and passed *into* the prompt. The LLM reasons over supplied knowledge rather than inventing it; grounding references (into both knowledge bases) are captured alongside the generated content. This makes traceability structural, not best-effort.
- **AI output is a draft.** The parsed, validated result is persisted as engagement state marked as an unreviewed draft. Consultant edits are first-class and are never overwritten by a re-run without explicit intent.
- **Failure is a first-class outcome.** Parse/validation failure still produces an Analysis Run (with the error recorded) and returns a structured failure to the caller — it does not lose the audit trail (§13).

**Real evaluation vs. the current placeholder.** The current `evaluateAnalysisOutput` returns hard-coded `"medium"` quality signals. Per roadmap Phase 0, this fake evaluation is removed/disabled so no placeholder score is ever presented as a real one. The Analysis Run record keeps the *objective* signals (parse success, schema validity, tokens, cost, latency); subjective quality signals are only stored when a genuine evaluator produces them.

**The Technology Curator is not part of this pipeline.** The pipeline above serves engagement stages and records an engagement-scoped Analysis Run. The Technology Curator (Phase 5A, §9) is a separate, cross-engagement flow: detect a candidate update → draft a Technology Update Proposal (AI-assisted at most) → obtain explicit human approval → apply the change → append a Technology Update History entry. It belongs to no engagement and therefore records **no** Analysis Run; its governance records are the Technology Update Proposal and the Technology Update History. Keeping it off the engagement pipeline preserves the invariant that an Analysis Run always belongs to an engagement.

---

## 6. Persistence Layer

- **Store:** PostgreSQL via Prisma (already in place). Prisma models are **infrastructure**, not the domain; repositories translate between Prisma rows and domain types.
- **Repository pattern.** Application code depends on repository *ports*; Prisma-backed repositories implement them. `AnalysisRunRepository` already exists in this shape and is the template for `EngagementRepository` and `KnowledgeRepository`.
- **Engagement persistence is the single engagement store.** Later phases attach discovery, assessment, opportunities, recommendations, roadmap, and report versions to the existing engagement record rather than introducing a parallel store (roadmap Phase 1).
- **Structured-but-flexible columns.** The current schema already uses typed columns for stable fields and `Json` columns for evolving nested structures (pain points, process steps, etc.). Methodology stage outputs that are still stabilizing (assessment findings, opportunities) are stored as validated `Json` payloads owned by the Engagement, with typed columns introduced only once a shape is stable. This avoids a migration per stage in early phases while keeping validation at the Zod boundary.
- **Terminology migration (Phase 0/1).** The existing `ClientCase` model is the legacy name for engagement state. It is renamed/reshaped toward `Engagement` (+ `Organization` grouping) as Phase 0 aligns terminology and Phase 1 establishes the engagement foundation. Existing Analysis Run persistence is retained; its foreign key follows the rename (`caseId` → `engagementId`) without changing its behavior.
- **Separation boundary in storage.** Consulting Knowledge Base tables, Technology Knowledge Base tables, and engagement tables are three distinct groups. Engagement rows hold knowledge **identifiers** (and copied reasoning) into either knowledge base, never foreign-key ownership *into* engagements from knowledge. No knowledge write path — to either knowledge base — is reachable from an engagement stage.
- **Technology Knowledge Base structure.** The Technology Knowledge Base stores **Technology Profiles classified under Technology Categories** (AI Models, AI Providers, Embedding Models, Speech, OCR, Vector Databases, Rerankers, MCP Servers, Browser / Computer Use, Workflow Engines, Evaluation Frameworks, Monitoring, Deployment Patterns). A profile carries a `category` (the hierarchy can nest via a self-referential category, added only if a real second level appears — principle §1.6). Retrieval filters by category. A separate **Technology Source** registry holds the trusted official origins.
- **Technology Knowledge Base write path.** The only write path to the Technology Knowledge Base is the Technology Curator applying an **approved** Technology Update Proposal. Proposals and their approval decisions are persisted (referenced Technology Source(s), targeted profile/category, proposed change, approver, decision), and every approved, applied change additionally appends a **Technology Update History** row (change, category/profile, **preserved Technology Source reference(s)**, approver, timestamp) — an append-only audit log of approved revisions only, separate from Analysis Runs. Detection may be assisted or manual initially (roadmap Phase 5A); no automated scheduler is required before the phase that needs it.

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
- **The Analysis Run is not the curation audit log.** Approved changes to the Technology Knowledge Base are recorded in a separate, append-only **Technology Update History** (§9.3), which belongs to the Technology Knowledge Base subsystem and to no engagement. The two logs are kept distinct: Analysis Runs record engagement AI assistance; the Technology Update History records approved knowledge revisions. Neither is written by the other's path.

---

## 9. Knowledge Base Architecture

The knowledge side is made of **two separate subsystems, not separate databases**: the **Consulting Knowledge Base** and the **Technology Knowledge Base** are each a distinct module with its own tables inside the single PostgreSQL instance, independent of each other and of engagements, and neither is an independently deployed store. They are kept separate because they change at very different rates.

### 9.1 Consulting Knowledge Base

- **Separate subsystem, same database.** Consulting knowledge lives in its own tables/module, curated independently of any engagement (roadmap Phase 5). It is read-only from the engagement's perspective.
- **Specific kinds first, generic container second.** The domain is defined by the *named* kinds of knowledge (Business Domains, Business Processes, Business Problems, Customer Operations Taxonomy, Discovery Questions, Assessment Frameworks, AI Readiness Criteria, AI Use Cases, Solution Patterns, Implementation Patterns, ROI Models, Risk Models, Best Practices, Follow-up Templates). Technology Profiles are **not** here — they live in the Technology Knowledge Base (§9.2). A shared "knowledge item" convenience may exist internally, but the modeled concepts are the specific kinds — matching the domain model's explicit warning against a generic container.
- **Domain scoping without a plugin framework.** Every consulting-knowledge entry is scoped by `BusinessDomain` (Customer Operations first). This scoping *field* is what allows a future domain to be added as new curated knowledge without touching the domain-agnostic engagement entities. The multi-domain **abstraction/plugin framework is not built** until a second domain actually exists (vision §10, roadmap MVP boundary).
- **Retrieval behind a port.** `KnowledgeRetrieval` is deterministic and structured in Phase 5 (filter/match over taxonomy, problems, and use cases — no embeddings). Phase 10 adds a RAG adapter implementing the **same port**, *complementing* curated retrieval; grounding traceability is unchanged because retrieval only selects *which* knowledge is passed to the pipeline. No engagement code changes when the retrieval implementation changes.

### 9.2 Technology Knowledge Base

- **Separate subsystem, separate cadence.** Technology knowledge lives in its own tables/module (roadmap Phase 5A), independent of the Consulting Knowledge Base precisely because AI technologies and models churn far faster than consulting methodology. It is read-only from the engagement's perspective.
- **Category-based, not a flat list.** It is organized **hierarchically by `TechnologyCategory`** — AI Models, AI Providers, Embedding Models, Speech, OCR, Vector Databases, Rerankers, MCP Servers, Browser / Computer Use, Workflow Engines, Evaluation Frameworks, Monitoring, Deployment Patterns. Each Technology Profile is classified under exactly one category and describes role, strengths, limitations, and suitability. The category set is extensible (and may nest) without touching engagement entities.
- **Cross-domain, not per-domain-scoped.** AI technologies are relevant regardless of business domain, so Technology Profiles and their categories are shared rather than duplicated per `BusinessDomain`. Adding a business domain does not touch this subsystem.
- **Retrieval behind its own port.** `TechnologyRetrieval` is deterministic and structured (filter/match by **category** and by capability/suitability), following the same pattern as `KnowledgeRetrieval` over a separate store. It stays structured; RAG over the Technology Knowledge Base is not part of Phase 10.

### 9.3 The Technology Curator (the only write path)

- **Technology Sources are first-class provenance.** A curated registry of **Technology Sources** models the trusted official origins (OpenAI, Anthropic, Google, Meta, Groq, Mistral, …). A Technology Source is the provenance concept; it is distinct from — though it often corresponds to a vendor also profiled in — the **AI Providers** category, which is curated content used in recommendations.
- **Human-approved write path.** The **only** way the Technology Knowledge Base changes is the Technology Curator applying an explicitly **human-approved** Technology Update Proposal. The flow is: detect a candidate update from one or more Technology Sources → generate a structured Technology Update Proposal referencing those source(s) (AI-assisted drafting at most) → obtain explicit human approval → apply the change → append a Technology Update History entry. There is no autonomous-AI write and no engagement-reachable write.
- **Proposals as the governance trail.** Each Technology Update Proposal persists its provenance as **references to one or more Technology Sources**, the targeted Technology Profile/Category, the proposed change, and the approval decision — covering proposals whether approved or rejected. This is the Technology Knowledge Base's curation trail and is deliberately *not* an Analysis Run (which stays engagement-scoped, §8).
- **Technology Update History as the append-only audit log.** When an approved proposal is applied, an entry is appended to the **Technology Update History** — an append-only log of **approved, applied revisions only** (what changed, the approved proposal behind it, **the Technology Source reference(s) preserved for auditability**, the approver, and the timestamp). It never records rejected proposals, is never rewritten or deleted (append-only, like Consultant Report versions), and is separate from both the proposal record and the engagement's Analysis Runs. It answers "how, and from which official source, did the Technology Knowledge Base come to say what it says today?"
- **Detection is minimal until needed.** Initial detection may be assisted or manual; an automated vendor-watch scheduler is not built ahead of the phase that needs it (principle §1.6). Detection adapters sit behind `TechnologySourceWatcher` (one per Technology Source), so how updates are detected can change without touching the approval-and-write path.

### 9.4 One-directional reference (the grounding rule)

- **Engagement → knowledge only, for both bases.** Engagement entities store knowledge identifiers and copy the reasoning they used into their own client-specific content — referencing the Consulting Knowledge Base (use case / solution pattern) and, where technologies or models are named, the Technology Knowledge Base (technology profiles). Curation of either base is a separate, deliberate activity with no path from an engagement run. This keeps both knowledge bases stable, shareable, and compounding in value.

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
      knowledge/              #   consulting knowledge kinds + retrieval port
      technology/             #   (Phase 5A) category-organized technology profiles + retrieval port + technology sources + curator model + update history
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
- **New business domains** are added as new curated Consulting Knowledge Base content scoped by `BusinessDomain`. The domain-agnostic engagement entities do not change, and the cross-domain Technology Knowledge Base is unaffected. The multi-domain abstraction is only elaborated when a second domain is actually introduced (vision §10).
- **The Technology Knowledge Base (Phase 5A)** enters as a separate, **category-organized** subsystem behind its own `TechnologyRetrieval` port, with the Technology Curator as its sole, human-approved write path, **Technology Sources** as first-class provenance, and the Technology Update History as its append-only audit log. New Technology Categories and Technology Sources are added as curated data, not code changes. Engagement stages consume it exactly like the Consulting Knowledge Base — read-only, one-directional reference — so recommendations gain grounded technology and model suggestions without new engagement infrastructure, and without renumbering any existing phase.
- **RAG (Phase 10)** enters as a second implementation of the existing `KnowledgeRetrieval` port over the Consulting Knowledge Base, complementing curated retrieval. Grounding and traceability are unaffected because retrieval only decides *which* knowledge is supplied to the pipeline.
- **New LLM providers** are added as adapters behind the existing `LlmClient` abstraction (the provider union already anticipates `openai` and `anthropic`); orchestration, cost, and observability are unchanged.
- **Production readiness (Phase 11)** — auth, deployment, hardening — layers around the stateless backend and existing observability without touching the domain.

Each seam corresponds to a roadmap boundary, so the roadmap can be executed phase by phase with the domain layer as the stable center of gravity.

---

## Assumptions

- **Terminology migration is expected, not a redesign.** The existing `ClientCase` model is treated as the current, to-be-renamed embodiment of engagement state (roadmap Phase 0/1). This document assumes that rename/reshape rather than proposing a new product concept.
- **Single-tenant, single-consultant for now.** Authentication, multi-user access, and tenancy are Phase 11 concerns; the architecture assumes one consultant/local operation until then, while keeping the backend stateless so multi-user is addable later.
- **One PostgreSQL instance hosts all three groups.** The Consulting Knowledge Base, the Technology Knowledge Base, and engagement data share a database but are separated by module/schema boundary and enforced reference direction (engagement → each knowledge base, one-way); a physical split is not required at MVP.
- **Technology Curator detection starts simple.** The Technology Curator's detection of vendor updates may be assisted or manual initially; an automated vendor-watch scheduler is deferred. What is fixed from Phase 5A is the human-approval gate and the provenance model: the only write to the Technology Knowledge Base is an approved Technology Update Proposal that references one or more **Technology Sources**, and each applied change appends a Technology Update History entry that preserves those source references.
- **Category set is a starting point, not a fixed schema.** The initial Technology Categories (AI Models, AI Providers, Embedding Models, Speech, OCR, Vector Databases, Rerankers, MCP Servers, Browser / Computer Use, Workflow Engines, Evaluation Frameworks, Monitoring, Deployment Patterns) are curated data, not hard-coded types; categories can be added or nested through curation without a code change to engagement entities.
- **Groq is the initial provider** behind the existing abstraction; `openai`/`anthropic` are already anticipated by the provider union and are added as adapters when needed.
- **The `Json`-column strategy** for still-stabilizing stage outputs is acceptable in early phases; typed columns are introduced as shapes stabilize.

## Architectural Decisions Made

1. **Explicit four-layer architecture with an inward dependency rule**, extending the existing `routes → services → repositories/lib` layout by lifting business logic into a framework-free `domain/` package.
2. **A single, shared AI orchestration pipeline** (build → call → parse → evaluate → persist draft → record run → trace) reused by every AI-assisted stage, so the cross-cutting cost/observability obligation is implemented once.
3. **Analysis Run as the single recording mechanism** for all AI stages, with an additive `stage` association rather than per-stage bespoke logging.
4. **Two knowledge bases as separate, read-only-from-engagement subsystems.** The Consulting Knowledge Base (`KnowledgeRetrieval` port, `BusinessDomain`-scoped, without a plugin framework; RAG later implements the same port) and the independent, cross-domain, **category-organized** Technology Knowledge Base (`TechnologyRetrieval` port, scoped by `TechnologyCategory`). Kept separate because technology knowledge changes far more frequently than consulting knowledge.
4a. **Technology Knowledge Base is category-based with source-attributed, human-approved curation.** Technology Profiles are organized under `TechnologyCategory` (not a flat list). The sole write path is the Technology Curator: detect from one or more **Technology Sources** → draft Technology Update Proposal referencing those sources (AI-assisted at most) → explicit human approval → apply → append a Technology Update History entry that preserves the source references. The proposal and the append-only history are the curation audit trail, deliberately not engagement Analysis Runs, preserving the "Analysis Run belongs to an engagement" invariant. Delivered as the Phase 5A extension without renumbering existing phases.
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
- **Technology Knowledge Base staleness vs. autonomy.** Because the only write path is human approval, the Technology Knowledge Base can lag fast-moving vendor releases if curation is neglected. Mitigation: keep detection cheap and proposals well-structured so approval is quick — but never relax the human-approval gate to chase currency; autonomous updates are out of scope by design.
- **Curator write path leaking into engagements.** The value of the separation collapses if any engagement code can reach a Technology Knowledge Base write. Mitigation: expose only read access on the engagement side, keep the write path behind the curator's approved-proposal flow, and treat any engagement→knowledge write as a review-blocking defect.

## Files Created or Modified

- **Created:** `docs/architecture.md` (this document).
- **Revised (1.1):** updated to introduce the Technology Knowledge Base (category-organized), the Technology Curator (sole human-approved write path), first-class Technology Sources for provenance, and the append-only Technology Update History alongside the Consulting Knowledge Base, delivered as the Phase 5A extension. Existing roadmap phase numbers and the MVP boundary are unchanged (RAG stays Phase 10, Production Readiness Phase 11). No code was written or changed as part of this documentation revision.
