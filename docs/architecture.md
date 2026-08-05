# Architecture — AI Consulting Workbench

Status: **Draft** · Version: 1.2 · Derived from [product-vision.md](./product-vision.md), [domain-model.md](./domain-model.md), and [roadmap.md](./roadmap.md).

> **Revision 1.2 (approved).** Reflects the domain model's new access side and the extended Discovery Profile:
> - The **Workspace** becomes the ownership and isolation boundary in the architecture: every engagement-side query, command, aggregate, and export is workspace-scoped, and **authorization is enforced server-side on every request** (§7A). Authentication, authorization, roles, and isolation are delivered in **Phase 3A**, **not** the production-readiness phase — which is refocused on deployment, monitoring, operational security, backup, recovery, and performance.
> - **Authentication data stays separate from consulting domain state.** Better Auth is the initial authentication provider behind `AuthenticationProvider`, and Resend is the initial email-delivery provider behind the email boundary. The consulting domain depends on neither provider directly.
> - Adds the **Client Portal** as a bounded client-facing surface, the discovery **Draft / Submit / Return** workflow, **Notifications**, and an append-only **Audit Trail** — the third governance log, kept distinct from Analysis Runs and the Technology Update History. The portal surface includes Dashboard, Discovery, Documents, and Profile; the Documents view is read-only and shows only published versions.
> - Adds persistence and orchestration support for the Discovery Profile's **value & measurement baseline**, status, and content provenance (Phase 2 Extension).
> - Commits the frontend to an **internationalization-ready, German-only** UI: user-facing strings are localizable from the start, internal identifiers stay English (§7.1). The visual direction is a clean, process-oriented SaaS interface with an engagement pipeline, design tokens, and reusable components.
>
> Section numbering is preserved: the new access architecture is added as **§7A**, mirroring the lettered Phase 3A/5A convention, and new principles are appended rather than inserted. **No existing phase number and no architectural principle is changed.**
>
> **Revision 1.1 (approved).** Reflects the split of the Knowledge Base into a **Consulting Knowledge Base** and a separate **Technology Knowledge Base** — the latter organized **hierarchically by Technology Category** (not a flat list) — and adds the **Technology Curator** subsystem (detect → propose → human-approve → update) as the only write path, plus a **Technology Update History** append-only audit log of approved revisions. Updates are attributed to first-class **Technology Sources** (official vendor origins) that proposals reference and the history preserves. Delivered as the **Phase 5A** extension of Phase 5 — **existing phase numbers and the MVP boundary were unchanged by that revision**. No architectural principle is changed.

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
11. **The Workspace is the ownership boundary, and authorization is server-side.** *(Revision 1.2, from Phase 3A.)* Every engagement-side read, write, listing, aggregation, and export is scoped to the acting user's workspace, and every access decision — workspace, role, engagement ownership, discovery access — is made and enforced on the server, on every request. The client may reflect permissions; it never constitutes them. A capability that is safe only because the UI hides it is a defect.
12. **German-only UI, internationalization-ready architecture.** *(Revision 1.2.)* User-facing strings are externalized and localizable from the start; internal identifiers — domain types, field names, enum and status values, event names, API contracts, log and audit entries — remain English. Locale is a presentation concern and never reaches the domain layer.
13. **Authentication is infrastructure, not consulting state.** *(Revision 1.2.)* Passwords, sessions, verification, reset, and invitation-link handling live behind a dedicated access/auth boundary. The consulting domain knows users, roles, workspace membership, and invitations; it never knows permanent passwords.
14. **Clean, process-oriented UI.** *(Revision 1.2.)* The approved frontend is a focused SaaS workspace inspired by Linear and Notion: the engagement pipeline is visually clear, design tokens provide consistency, and reusable components keep the consultant workspace and client portal coherent without one-off screens.

---

## 2. High-Level System Architecture

Until Phase 3A the system runs as a single-consultant web application; **from Phase 3A it is a multi-user application partitioned by Workspace** (logical multi-tenancy inside one deployment, not one deployment per tenant). It has three deployable parts, all already present in the repository:

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (Next.js / React)                                    │
│  Engagement workspace UI — methodology stages, review & edit   │
│  Client Portal (Phase 3A) — dashboard, discovery, documents, profile    │
│  i18n-ready presentation (German-only MVP)                     │
└───────────────┬──────────────────────────────────────────────┘
                │  HTTP / JSON (REST) + authenticated session
┌───────────────▼──────────────────────────────────────────────┐
│  Backend (Node / Express)                                      │
│                                                                │
│  Interface layer   → routes, authn, request/response validation│
│  Access control    → workspace scope + role + ownership /      │
│   (Phase 3A, §7A)     invitation checks, enforced per request  │
│  Application layer  → use cases / services (stage orchestration)│
│  Domain layer       → Workspace, User/Role, Engagement,        │
│                       Assessment, Recommendation,               │
│                       Knowledge Base model, invariants          │
│  AI orchestration   → prompt build → LLM call → parse → evaluate│
│                       → record Analysis Run                     │
│  Infrastructure     → Prisma repos, LLM provider adapters,      │
│                       Langfuse, config                          │
└──────┬──────────────────────────┬──────────────────┬─────────┘
       │                          │                  │
┌──────▼─────────────┐  ┌────────▼────────┐   ┌─────▼─────────┐
│ PostgreSQL (Prisma)│  │ LLM provider(s) │   │  Langfuse      │
│  Workspace/User    │  │ (Groq → others) │   │ observability  │
│  Engagement        │  └─────────────────┘   └────────────────┘
│  + AuditTrail      │
│  + Consulting KB   │       (workspace-scoped: Workspace, User,
│  + Technology KB   │        Engagement, AnalysisRun, AuditTrail)
│    (+ curator)     │       (product-level, shared: both KBs)
│  + AnalysisRun     │
└────────────────────┘
```

- **One backend, one PostgreSQL database (current deployment).** The current implementation uses one backend and one PostgreSQL database; the architecture does not depend on this deployment topology. Both the Consulting Knowledge Base and the Technology Knowledge Base live in the same PostgreSQL instance as engagement data but in **separate schemas/table groups** (each knowledge base distinct from engagement data and from the other), with a one-directional reference boundary enforced in the domain layer (§9). The Technology Knowledge Base's only write path is the human-approved Technology Curator (§9).
- **Workspace-partitioned data, shared knowledge (Phase 3A).** Workspace, User, Engagement and everything an engagement owns (including Analysis Runs, invitations, notifications, and audit entries) are **workspace-scoped rows in the same database**, isolated by an enforced scope on every query rather than by a separate database per workspace. Both knowledge bases stay **product-level and shared across workspaces**: they hold no client-specific content, and sharing them is what makes curated knowledge compound (domain-model §3A.1).
- **Access/auth data is separate from consulting domain state (Phase 3A).** Authentication records, sessions, verification state, invitation-link handling, and password-reset state live in a dedicated access/auth table group, not in the engagement tables. Better Auth is the initial provider behind the authentication boundary, and Resend is the initial email-delivery provider behind the email boundary. The domain and engagement services depend on the ports, not on either provider directly.
- **Stateless backend.** All state is in PostgreSQL; the backend holds no session-bound engagement state, which keeps stages re-runnable and the service horizontally deployable later (Phase 11). Authentication state (Phase 3A) is carried per request and verified against persisted identity — it does not become server-held engagement state.
- **External services are optional and swappable.** Langfuse is toggled by config and degrades gracefully when disabled; the LLM provider is chosen behind an abstraction.

---

## 3. Application Layers and Responsibilities

The backend is organized in four layers with a strict dependency rule: **dependencies point inward** (interface → application → domain; infrastructure implements ports defined toward the domain/application side). The domain layer depends on nothing framework-specific.

| Layer | Responsibility | Depends on | Must NOT contain |
|---|---|---|---|
| **Interface (routes)** | HTTP transport, **authentication** (establishing *who* is acting — Phase 3A), request parsing, Zod input validation, mapping results to HTTP responses. | Application | Business rules, prompt text, SQL, **authorization decisions** |
| **Application (services / use cases)** | Orchestrate a methodology stage: **resolve and enforce the caller's access** (workspace scope, role, engagement ownership or discovery access — Phase 3A), load engagement state, invoke domain logic and/or AI orchestration, persist results, record the Analysis Run, append audit entries. One application service per business capability (stages need not map one-to-one to services). | Domain, ports (repositories, LLM, KB retrieval, audit) | HTTP objects, provider SDKs, raw SQL |
| **Domain** | The business model and rules: Engagement aggregate and its parts, Assessment dimensions, Opportunity/Recommendation semantics, Knowledge Base model, **Workspace / User / Role / ownership and the discovery workflow's legal transitions**, grounding and traceability invariants. Pure and framework-free. | Nothing external | Express, Prisma, Groq, Langfuse, `process.env`, **locale/translation** |
| **Infrastructure** | Concrete adapters that implement the ports: Prisma repositories, LLM provider adapters, cost calculator, Langfuse tracer, config loading. | Domain/application ports | Business decisions |

The already-present split (`routes/` → `services/` → `repositories/` + `lib/`) is exactly this shape and is preserved and extended rather than replaced. The main change over time is making the **domain** an explicit layer rather than logic scattered inside services.

**Ports (interfaces) the application depends on:**
- `EngagementRepository`, `KnowledgeRepository`, `TechnologyKnowledgeRepository`, `AnalysisRunRepository` — persistence. `TechnologyKnowledgeRepository` exposes read access for engagement stages and a write path reachable **only** from the approved-proposal curator flow. From Phase 3A, every engagement-side repository operation takes the **workspace scope** as a required part of its query, not as an optional filter (§7A.4).
- `WorkspaceRepository`, `UserRepository`, `ClientInvitationRepository`, `NotificationRepository`, `AuditTrailRepository` — persistence for the access and collaboration side (Phase 3A). `AuditTrailRepository` is **append-only for every ordinary caller**: the operations reachable from a business workflow are appending and reading. From Phase 10 it additionally exposes two governed operations that only the compliance surfaces may call — erasure minimization and retention deletion (§7A.8) — and no other path in the codebase reaches them.
- `AuthenticationProvider` — verifies a caller's identity and yields the acting user (Phase 3A). It also owns password handling, sessions, email verification, password reset, and invitation-link consumption. Better Auth is the initial implementation behind this port. Keeping it a port is what lets the initial identity mechanism be replaced later (e.g., by an external identity provider) without touching the authorization rules or the domain.
- `EmailDeliveryProvider` — sends verification, reset, and invitation emails behind a dedicated boundary. Resend is the initial implementation behind this port.
- `AccessPolicy` — decides, for an acting user and a target resource, whether an action is permitted (workspace scope → role → engagement ownership → discovery access). It is a single, shared decision point rather than per-route checks (§7A.2).
- `AiComplianceGate` — the second shared decision point beside AccessPolicy. It decides whether a prompt may leave for a provider, applies required redaction, carries governed provider/model approval, and hands the stage the only prompt it may send. After the provider response is parsed, the centralized output-scan helper classifies or refuses the actual model output before usable persistence.
- `ComplianceService` / `ComplianceRepository` — workspace policy, engagement privacy records, consent, DPIA, governed model approvals, retention, export, erasure, and compliance dashboard aggregates.
- `LlmClient` — text generation with usage/latency metadata (already exists as `callLlm`).
- `KnowledgeRetrieval` — deterministic retrieval/matching over the Consulting Knowledge Base (Phase 5); a later RAG adapter (Phase 11) implements the *same* port.
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

From the Phase 2 Extension, the `DiscoveryProfile` additionally owns its **value & measurement baseline** (business impact; error frequency/severity/cost; existing KPIs; baseline metrics; target success metrics; measurement method; data sources), its **workflow status** (draft / submitted / returned / accepted), and the **provenance** of its content (consultant-captured vs. client-provided). Provenance and "measured vs. estimated" are domain facts that travel with the content, not presentation flags.

From Phase 3A, the Engagement additionally carries its **Workspace** and its **owning Manager** (Engagement Ownership). These are not decorations on the aggregate: they are what every access decision about the engagement is evaluated against.

### 4.2a Access-side domain concepts (Phase 3A)

**Workspace**, **User**, **Role**, and **Discovery Access** are domain concepts, not infrastructure. The rules that belong in the domain layer are:

- which role reaches which engagements (Administrator → all in own workspace; Manager → owned only; Client → self-registered discovery only),
- what makes Discovery Access valid (scoped to one engagement's discovery, not expired, not revoked),
- which **Draft / Submit / Return** transitions are legal, and that no transition discards content or provenance.

What stays out of the domain: how a password or token is verified, how a session is carried, how a notification is delivered, how a query is scoped in SQL. Those are infrastructure implementations of domain decisions.

### 4.3 Invariants owned by the domain
- Engagement-specific content may reference knowledge but must copy the reasoning it relied on, so the record stays faithful to knowledge *as it stood* when the work was done.
- **Every engagement-side entity belongs to exactly one Workspace, and no operation may read or join across workspaces** (Phase 3A). An unscoped engagement-side query is an invariant violation, not a performance detail.
- **Every engagement has exactly one owning Manager**, and access is decided as workspace → role → ownership/discovery access, in that order.
- **Discovery Access grants access to exactly one engagement's Discovery and nothing else**; expiry or revocation ends that access immediately.
- **Discovery workflow transitions preserve content and provenance.** A return never discards client-provided content; an acceptance never discards consultant edits; client-provided content is never silently reattributed to the consultant.
- **Client-provided discovery is not accepted fact until the consultant reviews it** — the same human-in-the-loop rule that governs AI output.
- **The Audit Trail is append-only**, like Consultant Report versions and the Technology Update History; no business workflow ever rewrites or deletes an entry. Phase 10 adds exactly two governed exceptions — GDPR erasure minimization and an explicitly executed retention action — which are Administrator-only, audited, and described in §7A.8.
- A Recommendation is only valid if it is traceable **backward** to Discovery facts and **outward** to the Consulting Knowledge Base entries that justify its approach; any concrete technologies or models it names must additionally reference the Technology Knowledge Base entries behind them (grounding invariant).
- Reports are **append-only versions**; producing a new version never destroys a prior one.
- Every stage is a pure transformation of persisted engagement state → new engagement state, enabling re-entry and re-run without restarting the engagement.

### 4.4 What the domain excludes
No HTTP, no Prisma models, no prompt strings, no provider SDKs, **no locale or translated text** (Revision 1.2). The domain speaks in business types; infrastructure maps those to/from storage and transport, and the frontend maps identifiers to the user's language. This is what lets storage, transport, model provider, and display language change without touching business rules.

---

## 5. AI Orchestration Layer

AI orchestration is a thin, uniform pipeline shared by every AI-assisted stage (Assessment, Solution Matching, Report drafting, Feedback revision, and any later AI step). It already exists in `analysis.service.ts` and is generalized into a reusable shape.

**The pipeline (single shared shape):**

```
build stage input (engagement state + retrieved knowledge)
   → build prompt (versioned template + fingerprint)
   → call LLM (provider-abstracted)
   → parse output (strict JSON → Zod validation)
   → scan output for personal data and assign final classification
   → evaluate quality signals
   → persist stage result to engagement state (as editable draft)
   → record Analysis Run (cost, tokens, latency, provider, model,
                          prompt version, prompt fingerprint, trace ref)
   → trace in Langfuse
```

Key properties:

- **Stage-agnostic mechanism.** Each stage supplies three things — the prompt module, the output schema, and how the parsed result maps into engagement state. The surrounding orchestration (call → parse → output scan → evaluate → record → trace) is shared, satisfying the cross-cutting obligation once.
- **Deterministic grounding first.** Knowledge is retrieved deterministically — from the Consulting Knowledge Base (Phase 5) and, for technology and model suggestions, the Technology Knowledge Base (Phase 5A) — and passed *into* the prompt. The LLM reasons over supplied knowledge rather than inventing it; grounding references (into both knowledge bases) are captured alongside the generated content. This makes traceability structural, not best-effort.
- **AI output is a draft.** The parsed, validated result is persisted as engagement state marked as an unreviewed draft. Consultant edits are first-class and are never overwritten by a re-run without explicit intent.
- **The output scan is a trust boundary.** A model response that contains recognized personal data is refused before it becomes usable stage content, before a final output classification is assigned, and before it is returned as accepted generated content. The Analysis Run records counts/kinds and the scan outcome, never raw detected values.
- **Human review is explicit.** When policy requires review, generated output remains pending until an authorized Manager or Administrator calls the stage-scoped review action. Ordinary draft save does not clear the pending state, and trusted accept/approve transitions ask the server-side pending-review check before they proceed.
- **Failure is a first-class outcome.** Parse/validation failure still produces an Analysis Run (with the error recorded) and returns a structured failure to the caller — it does not lose the audit trail (§13).
- **Stage input is workspace-scoped and authorized before it is built (Phase 3A).** The engagement state fed into a prompt is loaded through the scoped repositories for an authorized acting user, so no AI step can be the route by which data crosses a workspace boundary. Triggering a generation is itself an authorized action (§7A.2), and client-provided discovery enters the pipeline carrying its provenance — the AI is told what the client asserted, not that the consultant established it.

**Real evaluation vs. the current placeholder.** The current `evaluateAnalysisOutput` returns hard-coded `"medium"` quality signals. Per roadmap Phase 0, this fake evaluation is removed/disabled so no placeholder score is ever presented as a real one. The Analysis Run record keeps the *objective* signals (parse success, schema validity, tokens, cost, latency); subjective quality signals are only stored when a genuine evaluator produces them.

**The Technology Curator is not part of this pipeline.** The pipeline above serves engagement stages and records an engagement-scoped Analysis Run. The Technology Curator (Phase 5A, §9) is a separate, cross-engagement flow: detect a candidate update → draft a Technology Update Proposal (AI-assisted at most) → obtain explicit human approval → apply the change → append a Technology Update History entry. It belongs to no engagement and therefore records **no** Analysis Run; its governance records are the Technology Update Proposal and the Technology Update History. Keeping it off the engagement pipeline preserves the invariant that an Analysis Run always belongs to an engagement.

---

## 6. Persistence Layer

- **Store:** PostgreSQL via Prisma (already in place). Prisma models are **infrastructure**, not the domain; repositories translate between Prisma rows and domain types.
- **Repository pattern.** Application code depends on repository *ports*; Prisma-backed repositories implement them. `AnalysisRunRepository` already exists in this shape and is the template for `EngagementRepository` and `KnowledgeRepository`.
- **Engagement persistence is the single engagement store.** Later phases attach discovery, assessment, opportunities, recommendations, roadmap, and report versions to the existing engagement record rather than introducing a parallel store (roadmap Phase 1).
- **Structured-but-flexible columns.** The current schema already uses typed columns for stable fields and `Json` columns for evolving nested structures (pain points, process steps, etc.). Methodology stage outputs that are still stabilizing (assessment findings, opportunities) are stored as validated `Json` payloads owned by the Engagement, with typed columns introduced only once a shape is stable. This avoids a migration per stage in early phases while keeping validation at the Zod boundary.
- **Terminology migration (Phase 0/1).** The existing `ClientCase` model is the legacy name for engagement state. It is renamed/reshaped toward `Engagement` (+ `Organization` grouping) as Phase 0 aligns terminology and Phase 1 establishes the engagement foundation. Existing Analysis Run persistence is retained; its foreign key follows the rename (`caseId` → `engagementId`) without changing its behavior.
- **Workspace scoping in storage (Phase 3A).** Every engagement-side table carries its workspace association (directly or through an owning row that does), and every engagement-side query is scoped by the acting user's workspace **in the repository**, so no application service can accidentally issue an unscoped read. Aggregates — engagement counts, per-engagement and lifetime cost, search, exports — are scoped the same way. Isolation is by enforced scope within one database, not by a database per workspace (§2); if a stronger physical separation is ever required, it is a persistence change behind the same repository ports.
- **Access-side tables (Phase 3A).** `Workspace`, `User` (with role and workspace), `ClientInvitation` (engagement-scoped, time-bounded, revocable), `Notification`, and `AuditTrail` are their own table group. The audit table is **append-only** — no ordinary workflow has an update or delete path to it — mirroring the Technology Update History and report versions. The only writes that are not appends are the two governed compliance operations of §7A.8, which live in the compliance repository and nowhere else.
- **Discovery Profile storage (Phase 2 Extension).** The value & measurement baseline, the workflow status, and content provenance are stored on the engagement's existing discovery state rather than in a parallel store, following the same structured-but-flexible strategy: typed columns for the stable parts (status, provenance, timestamps), validated `Json` for the still-stabilizing metric structures, with a Zod schema in `shared/` for each.
- **Separation boundary in storage.** Consulting Knowledge Base tables, Technology Knowledge Base tables, and engagement tables are three distinct groups. Engagement rows hold knowledge **identifiers** (and copied reasoning) into either knowledge base, never foreign-key ownership *into* engagements from knowledge. No knowledge write path — to either knowledge base — is reachable from an engagement stage.
- **Technology Knowledge Base structure.** The Technology Knowledge Base stores **Technology Profiles classified under Technology Categories** (AI Models, AI Providers, Embedding Models, Speech, OCR, Vector Databases, Rerankers, MCP Servers, Browser / Computer Use, Workflow Engines, Evaluation Frameworks, Monitoring, Deployment Patterns). A profile carries a `category` (the hierarchy can nest via a self-referential category, added only if a real second level appears — principle §1.6). Retrieval filters by category. A separate **Technology Source** registry holds the trusted official origins.
- **Technology Knowledge Base write path.** The only write path to the Technology Knowledge Base is the Technology Curator applying an **approved** Technology Update Proposal. Proposals and their approval decisions are persisted (referenced Technology Source(s), targeted profile/category, proposed change, approver, decision), and every approved, applied change additionally appends a **Technology Update History** row (change, category/profile, **preserved Technology Source reference(s)**, approver, timestamp) — an append-only audit log of approved revisions only, separate from Analysis Runs. Detection may be assisted or manual initially (roadmap Phase 5A); no automated scheduler is required before the phase that needs it.

### 6.1 Compliance and Protection Boundaries

- **Output PII scan boundary.** Raw model responses are scanned centrally before
  generated content is trusted. Rejections record safe counts and kinds only.
- **Document encryption boundary.** Rendered document bytes are encrypted at
  rest behind the document-protection adapter; callers receive plaintext only
  after authorization and decryption succeed.
- **Signed document-link boundary.** A signed link narrows an already-authorized
  document download to one artifact, one user, and one expiry. It never grants
  access by itself.
- **Log separation.** Application logs, Audit Trail, Analysis Runs, Langfuse
  traces, and Technology Update History are separate records with separate
  purposes. Application logs hold operational safe identities; Audit Trail holds
  access/compliance events; Analysis Runs hold engagement AI metadata;
  Langfuse holds model observability; Technology Update History holds approved
  knowledge curation changes.
- **Regulatory readiness documentation.** EU AI Act posture is recorded in
  [ai-act-readiness.md](./ai-act-readiness.md) as product governance guidance,
  not as legal advice or certification.

---

## 7. Frontend Architecture

- **Stack:** Next.js (App Router) + React + Tailwind, already scaffolded under `client/`. The frontend is a thin, server-backed client — it holds no business rules.

> Note: this repository pins a Next.js version whose conventions differ from common defaults (`client/AGENTS.md`). Frontend work must follow the in-repo guidance rather than assumed Next.js patterns.

- **Engagement-centric workspace.** The primary UI object is the Engagement. The consultant opens an engagement and moves between methodology stages within it; the URL structure is engagement-scoped (`/engagements/[id]/...`), mirroring that the engagement is the unit of work.
- **Stage views over persisted state.** Each methodology stage is a view that reads engagement state and lets the consultant generate (AI-assisted), then **review, edit, accept, or override**. Because stages are re-entrant on the backend, the UI can return to and re-run any stage without a wizard-style forced sequence.
- **Human-in-the-loop is visible.** Assumptions, confidence, and gaps are surfaced in the stage views; AI output is clearly presented as a draft; report versions are listed and comparable. This is a UI obligation derived from the vision, not a backend concern.
- **The backend is the source of truth.** The client does not compute grounding, cost, or evaluation; it renders what the backend persisted. This keeps business logic server-side and the client replaceable.
- **Two frontend surfaces from Phase 3A.** The **consultant workspace UI** (the existing engagement-centric surface, for Administrators and Managers) and the **Client Portal** (for self-registered Clients) are separate surfaces with separate navigation and separate entry points. The portal renders one engagement's Dashboard, Discovery, Documents, and Profile, with the Documents view read-only and limited to published versions — no stage navigation, no engagement list, no cost or analysis-run views, no report. Keeping them separate means a client-facing page cannot accidentally inherit a consultant-facing component that fetches more than the client may see.
- **Permission-aware UI is a convenience, never a control.** The consultant UI hides or disables what the acting user's role and ownership do not permit, but every one of those actions is independently refused by the server (§7A). The client is never trusted with a permission decision.

### 7.1 Internationalization-ready UI (German-only MVP)

The MVP ships a **German-only** interface — consultant workspace and Client Portal alike — on a foundation that makes a second language a translation task rather than a rewrite.

- **All user-facing strings are externalized.** Labels, help text, validation and error messages, notification text, empty states, and exported document headings are looked up by key rather than written inline in components. There is no hard-coded German literal in a component.
- **Internal identifiers stay English.** Domain types, field names, enum and status values (`draft`, `submitted`, `returned`, `accepted`), role names, stage names, event names, API contracts, and audit entries are English and are never translated. Translation happens at the presentation edge, by mapping an identifier to a localized string.
- **One locale ships, the seam exists.** A single active locale (German) is configured; the lookup indirection, key structure, and formatting (dates, numbers, currency) are locale-driven from the start. Additional locales are added as translation data, not as code changes — and per principle §1.6, no locale-switching UI, no translation-management tooling, and no runtime language negotiation is built before a second language actually exists.
- **Server-produced text follows the same rule.** Where the backend must produce user-facing text (notification content, validation failures surfaced to a user), it returns identifiers and structured parameters that the frontend localizes — it does not return German prose that a future locale would have to intercept.
- **Entered content is never translated.** Consultant- and client-entered discovery content, and AI-drafted engagement content, are stored and displayed as written. Localization applies to the product's own chrome, not to the client's facts.

---

## 7A. Multi-user, Workspace, and Access Architecture (Phase 3A)

*(Revision 1.2. Added as a lettered section so §8–§15 keep their numbers.)*

This section is the implementation shape of domain-model §3A. It is delivered by roadmap **Phase 3A** — **not** Phase 12, which covers deployment and operations only.

### 7A.1 Authentication (who is acting)

- **Identity is established at the interface layer** and yields an **acting user** (identity, workspace, role) that is passed inward. No inner layer re-derives identity from the transport.
- **`AuthenticationProvider` is a port.** Better Auth is the initial implementation behind it, and it handles password creation, password verification, sessions, email verification, password reset, and invitation-link acceptance. Replacing it later changes an adapter, not the authorization rules.
- **`EmailDeliveryProvider` is a port.** Resend is the initial implementation behind it and carries invitation, verification, and password-reset emails. Delivery is separate from the consulting domain and from the auth provider itself.
- **Clients self-register and are then associated with Discovery.** A client creates their own account, confirms their email, and is associated with the engagement they are meant to complete discovery for. The association binds that identity to one Discovery Access record and therefore to one engagement's discovery.
- **The backend stays stateless about engagement work.** Authentication state travels per request and is verified against persisted identity; it never becomes server-held engagement state (§2). Authentication data remains separate from consulting domain state.

### 7A.2 Authorization (what they may do) — one decision point

- **A single `AccessPolicy` answers every access question**, in a fixed order: **workspace scope → role → engagement ownership (Manager) / discovery access (Client)**. Routes and services ask the policy; they do not re-implement rules. One decision point is what makes the rules reviewable and testable — scattered per-route checks are how isolation quietly breaks.
- **The policy is domain logic, its enforcement is application-layer.** The rules live with the domain concepts (§4.2a); the application service is where they are *applied* before any state is loaded or written.
- **Deny by default.** A new route, capability, or field is inaccessible until it is explicitly permitted. Adding a stage must not silently widen anyone's reach.
- **Authorization is enforced on every request**, including reads, listings, aggregates, exports, and AI-generation triggers. There is no "already checked upstream" exemption.

### 7A.3 Role model

| Role | Enforced reach |
|---|---|
| **Administrator** | All engagements **in their own workspace**; manages that workspace's users, roles, engagement ownership, and invitations. No cross-workspace reach whatsoever. |
| **Manager** | Only engagements **they own**, in their own workspace — the consultant role. |
| **Client** | Only the **Client Portal** of the one engagement named by valid Discovery Access. The portal exposes Dashboard, Discovery, Documents, and Profile; documents are read-only and only published versions are visible. |

Roles are deliberately few and are **not** a general permission framework: no per-field permissions, no groups, no custom roles, no delegation (principle §1.6). Engagement ownership is transferable by an Administrator, and the transfer is audited.

### 7A.4 Workspace isolation in practice

- **Scope is applied in the repository, not remembered by the caller.** Engagement-side repository operations require the workspace scope as part of the query; there is no code path that reads engagement-side data without it. This makes isolation a structural property rather than a discipline every service must remember.
- **Isolation covers derived data too.** Counts, cost roll-ups (§12), search, and exports are scoped identically. A leak through an aggregate is a leak.
- **Denials do not leak existence.** A request for a resource in another workspace is refused the same way as a request for a resource that does not exist, so responses cannot be used to enumerate other workspaces' data.
- **The knowledge bases are outside the boundary** and remain shared, read-only from engagements (§9). They hold no client-specific content.

### 7A.5 Discovery Access and the Client Portal

- **Discovery access is the only grant.** It names one self-registered client, one engagement, an issuer, and an expiry; it can be revoked, and revocation takes effect immediately on the next request. It is validated on every portal request, not only at acceptance.
- **Access notifications use the email boundary.** Access-related emails are sent through the dedicated email-delivery provider boundary, not by the consulting domain.
- **The portal is a separate surface with its own routes** (§7), serving one engagement's Dashboard, Discovery, Documents, and Profile. Portal endpoints are authorized as *client + valid discovery access + this engagement* and reach nothing else. They do not reuse the consultant endpoints with a filter — a narrower surface is easier to keep narrow.
- **Revocation does not delete contributions.** Content the client already provided stays in the Discovery Profile with its provenance intact.

### 7A.6 The Draft / Submit / Return workflow

- **The workflow is a domain state machine** over the Discovery Profile (draft → submitted → returned → draft → … → accepted), with legal transitions and their actors defined in the domain and enforced in the application layer. It is not UI state.
- **Transitions are content-preserving.** Return keeps the client's content and adds the consultant's notes; acceptance keeps the consultant's edits; provenance survives both.
- **Review authority is the consultant's.** Accept, return, and reopen are permitted to the owning Manager (or a workspace Administrator); submit is permitted to the contributor. The client cannot accept their own submission.
- **Each transition raises a notification and appends an audit entry** through the shared mechanisms below, not through per-transition bespoke code.

### 7A.7 Notifications

- **Notifications inform; they never authorize.** Being notified of an event grants no access to the thing the event concerns, and a notification to a Client never carries engagement content beyond their own discovery.
- **Delivery is behind a port and starts minimal.** In-app notification records are the Phase 3A scope; email or other channels are added as adapters when a phase needs them (principle §1.6).
- **Notification failures never fail the operation that raised them** — the same best-effort discipline as tracing (§13).

### 7A.8 The Audit Trail — the third governance log

- **Append-only, by construction.** For every ordinary caller the repository exposes append and read only. No business workflow — a stage transition, a save, a publication, a sign-in, a denial — can rewrite or remove an entry. This mirrors report versions and the Technology Update History.
- **What is recorded.** Sign-in, invitation issued/accepted/revoked/expired, discovery submitted/returned/accepted, engagement ownership transfer, role change, and **denied permission attempts** — with the acting user, the target engagement where applicable, and the timestamp. Phase 10 adds the compliance events (policy, classification, privacy record, consent, DPIA, legal hold, provider/model approval, denied AI requests, redaction, output scan, export, erasure, retention).
- **Two governed exceptions, and only two (Phase 10).** The append-only rule holds against the application; it does not hold against the law, which is why both exceptions exist and why neither is reachable from ordinary code:
  - **Erasure minimization.** A GDPR erasure may reduce the surviving entries of the erased engagement to their event type and their time, removing client-identifying payload content. The trail of *what happened* survives; what it said about a person does not. The minimization is itself appended as `audit_entries_minimized`.
  - **Retention execution.** An explicitly executed retention action may delete entries past the workspace's configured audit-retention cutoff. Entries whose engagement is under **legal hold** are never deleted, and the action is itself appended as `retention_action_executed` with its per-category outcome.
  Both are Administrator-only, pass the same `AccessPolicy` decision point as every other action, are deliberate human commands rather than background sweeps, and leave an entry naming what they did. Neither is a general audit-edit path, and adding a third exception is a documentation decision, not an implementation choice.
- **Application logs are not the Audit Trail.** Operational log lines (§13, [application-logging.md](./application-logging.md)) are a separate record with a separate lifetime: they carry safe failure identities for operators, never client content, and they are neither governance evidence nor subject to these two exceptions.
- **Three logs, three purposes, never merged.** The **Analysis Run** records engagement AI assistance (§8); the **Technology Update History** records approved knowledge curation (§9.3); the **Audit Trail** records access and collaboration. None is written by another's path, and none absorbs another's role. Conflating them would destroy the meaning of all three.
- **Audit entries are English and identifier-based** (§7.1), so they stay queryable regardless of the user's display language.

### 7A.9 Document publication and Client Portal documents

- **Publication is explicit.** A consultant report version is not visible to clients until a Manager explicitly publishes it. Publication is a manager action, and revocation removes visibility rather than rewriting history.
- **Only published documents are visible to clients.** The Client Portal Documents view is read-only; clients can view and download published PDFs, but they cannot edit manager documents, upload changes, or modify the manager's version.
- **Publication notifies the client.** Publishing raises a notification and sends an email that links the client back to the Client Portal, because the portal is the primary place to access published documents.
- **Download history is auditable.** Client downloads are recorded as audit events so managers and administrators can see document access history without conflating it with publication history.

---

## 8. Analysis Run Architecture

The Analysis Run is the audit-and-trust record behind every AI-assisted step and already exists as a persisted model. It is central to the cross-cutting obligation.

- **Definition.** An Analysis Run is a record *about* AI assistance — never client deliverable content. It belongs to one **Engagement** and is associated with the stage/output it supported.
- **Captured on every run** (already modeled): provider, model, prompt version, prompt fingerprint, latency, input/output/total tokens, estimated cost, objective quality signals (JSON parse success, schema validity), optional error message, timestamp, and — where available — a Langfuse trace reference.
- **Stage association.** As more AI stages are added, each run records *which stage* it supported (e.g., `assessment`, `solution-matching`, `report`) so runs can be filtered by stage while still rolling up to the engagement. This is a small additive field, not a new mechanism.
- **History is preserved.** Runs accumulate across re-runs and iterations as the engagement's audit trail; nothing is deleted when a stage is re-run. This directly supports explainability, traceability, and the consultant's confidence in (or correction of) AI output.
- **One recording path.** All stages record runs through the same repository and orchestration path, guaranteeing consistency and satisfying the roadmap's "stated once, not repeated per phase" obligation.
- **The Analysis Run is not the curation audit log, and not the access audit log.** Approved changes to the Technology Knowledge Base are recorded in the append-only **Technology Update History** (§9.3), which belongs to the Technology Knowledge Base subsystem and to no engagement; access and collaboration events are recorded in the append-only **Audit Trail** (§7A.8), which belongs to a workspace. All three are kept distinct: Analysis Runs record engagement AI assistance, the Technology Update History records approved knowledge revisions, and the Audit Trail records who accessed or moved what. None is written by another's path.
- **Runs are workspace-scoped through their engagement (Phase 3A).** Because an Analysis Run belongs to an engagement and an engagement belongs to a workspace, run history and every cost roll-up over it are read within the acting user's workspace and role (§7A.4, §12).

---

## 9. Knowledge Base Architecture

The knowledge side is made of **two separate subsystems, not separate databases**: the **Consulting Knowledge Base** and the **Technology Knowledge Base** are each a distinct module with its own tables inside the single PostgreSQL instance, independent of each other and of engagements, and neither is an independently deployed store. They are kept separate because they change at very different rates.

**Both sit outside the workspace boundary (Phase 3A).** They are product-level curated assets shared across workspaces and read-only from any engagement; they hold no client-specific content, so sharing them leaks nothing. Workspace isolation (§7A.4) protects engagement-side data, which is where client confidentiality lives. Making curated knowledge workspace-private would be a domain-model change requiring an approved revision, not an implementation choice.

### 9.1 Consulting Knowledge Base

- **Separate subsystem, same database.** Consulting knowledge lives in its own tables/module, curated independently of any engagement (roadmap Phase 5). It is read-only from the engagement's perspective.
- **Specific kinds first, generic container second.** The domain is defined by the *named* kinds of knowledge (Business Domains, Business Processes, Business Problems, Customer Operations Taxonomy, Discovery Questions, Assessment Frameworks, AI Readiness Criteria, AI Use Cases, Solution Patterns, Implementation Patterns, ROI Models, Risk Models, Best Practices, Follow-up Templates). Technology Profiles are **not** here — they live in the Technology Knowledge Base (§9.2). A shared "knowledge item" convenience may exist internally, but the modeled concepts are the specific kinds — matching the domain model's explicit warning against a generic container.
- **Domain scoping without a plugin framework.** Every consulting-knowledge entry is scoped by `BusinessDomain` (Customer Operations first). This scoping *field* is what allows a future domain to be added as new curated knowledge without touching the domain-agnostic engagement entities. The multi-domain **abstraction/plugin framework is not built** until a second domain actually exists (vision §10, roadmap MVP boundary).
- **Retrieval behind a port.** `KnowledgeRetrieval` is deterministic and structured in Phase 5 (filter/match over taxonomy, problems, and use cases — no embeddings). Phase 11 adds a RAG adapter implementing the **same port**, *complementing* curated retrieval; grounding traceability is unchanged because retrieval only selects *which* knowledge is passed to the pipeline. No engagement code changes when the retrieval implementation changes.

### 9.2 Technology Knowledge Base

- **Separate subsystem, separate cadence.** Technology knowledge lives in its own tables/module (roadmap Phase 5A), independent of the Consulting Knowledge Base precisely because AI technologies and models churn far faster than consulting methodology. It is read-only from the engagement's perspective.
- **Category-based, not a flat list.** It is organized **hierarchically by `TechnologyCategory`** — AI Models, AI Providers, Embedding Models, Speech, OCR, Vector Databases, Rerankers, MCP Servers, Browser / Computer Use, Workflow Engines, Evaluation Frameworks, Monitoring, Deployment Patterns. Each Technology Profile is classified under exactly one category and describes role, strengths, limitations, and suitability. The category set is extensible (and may nest) without touching engagement entities.
- **Cross-domain, not per-domain-scoped.** AI technologies are relevant regardless of business domain, so Technology Profiles and their categories are shared rather than duplicated per `BusinessDomain`. Adding a business domain does not touch this subsystem.
- **Retrieval behind its own port.** `TechnologyRetrieval` is deterministic and structured (filter/match by **category** and by capability/suitability), following the same pattern as `KnowledgeRetrieval` over a separate store. It stays structured; RAG over the Technology Knowledge Base is not part of Phase 11.

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
- **Lifetime total cost** is the aggregation across all engagements — again a query, not a parallel ledger. **From Phase 3A, "all engagements" means all engagements the acting user may see**: a Manager's lifetime total covers the engagements they own, an Administrator's covers their workspace, and no roll-up ever spans workspaces (§7A.4). A cost aggregate is as much a disclosure as a record is.
- **Attribution built in.** Provider and model are stored per run, so cost is attributable to exactly the provider/model that produced it. When rate tables need to vary by model/provider, the cost calculator gains a lookup — an internal change behind the existing function, not an architectural one.

This satisfies the roadmap's three required reporting levels (per request, per engagement, lifetime) from a single recorded signal.

---

## 13. Error Handling Strategy

Errors are handled at the boundary appropriate to their kind, and never at the cost of the audit trail.

- **Input validation (interface layer).** All external input is validated with Zod at the route boundary; invalid input returns a structured `400` and never reaches the domain. (Already the pattern in `routes/`.)
- **AI output validation (orchestration layer).** LLM output is strictly parsed and schema-validated. A parse/validation failure is a *domain-meaningful outcome*, not an exception: the run is still recorded (with the error), Langfuse is still flushed, and the caller receives a structured failure result (the current `analysis.service` `success: false` shape). The consultant sees that the draft could not be produced, with the reason.
- **Infrastructure failures (LLM/provider/DB/tracer).** Provider and database errors are caught in the application layer and surfaced as structured `5xx`/`422` responses; observability failures are swallowed (logged) so they never break a consultant's work. Best-effort side effects (tracing, cost) are wrapped so they cannot fail the primary operation.
- **Minimum application logging.** [Application Logging](./application-logging.md) defines the minimum structured application logging and privacy rules: safe fields only, sanitized technical identifiers, stdout/stderr destinations, and the boundary between Application Logs and Audit Trail.
- **Consultant-facing clarity.** Because AI output is a draft, an AI failure degrades to "no draft yet / try again," never a corrupted engagement. Persisted engagement state is only advanced on validated results.
- **Failed AI generation never mutates engagement state.** If an AI-assisted step fails parsing, validation, or provider execution, the previous Engagement state remains unchanged. The failed attempt is still recorded as an Analysis Run, but no partial or invalid stage output is persisted.
- **Authentication and authorization failures are distinct, structured outcomes (Phase 3A).** An unauthenticated request is refused as unauthenticated; an authenticated request outside the caller's workspace, role, or ownership is refused as forbidden. Denials are **uniform and non-revealing** — they must not disclose whether the resource exists, who owns it, or which workspace it is in (§7A.4) — and every denial appends an audit entry (§7A.8). A denial is a normal outcome, not an exception to be logged as a system fault.
- **Hardening deferred, not ignored.** Production-grade error observability and recovery are explicitly a Phase 12 concern; earlier phases keep the structured-outcome discipline above so the hardening phase has a consistent base to build on. Note that the *access-control model itself* is not deferred — it is Phase 3A; Phase 12 verifies it holds in the production environment.

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
      access/                 #   (Phase 3A) workspace, user, role, ownership, invitation, access policy rules
    prompts/                  # versioned, fingerprinted prompt modules (per stage)
    evaluation/               # cost calculation + (real) output evaluation
    repositories/             # infrastructure — Prisma-backed repos implementing ports
    lib/                      # infrastructure — LLM client, provider adapters, parsing, prisma, config
      providers/              #   per-provider adapters (groq now; others behind same interface)
      auth/                   #   (Phase 3A) authentication adapter implementing AuthenticationProvider
    observability/            # Langfuse tracer (config-gated)
    schemas/                  # request/DTO validation schemas
  prisma/                     # schema + migrations (engagement, knowledge, analysis-run, access/audit)

client/
  app/                        # Next.js App Router — engagement workspace + stage views
    portal/                   # (Phase 3A) Client Portal — separate client-facing surface
  components/                 # stage/review/edit UI components
  i18n/                       # user-facing string catalogue (German-only MVP, key-based lookup)
```

Notes:
- **`domain/` is the main additive change.** Today domain logic lives inside services; it is progressively lifted into an explicit, framework-free `domain/` package as stages are built. This is a refinement of the existing structure, not a rewrite.
- **`shared/` is the client/server contract.** Stage output schemas live here so both sides agree on shape and types.
- **`access/` and `portal/` arrive with Phase 3A**, and `i18n/` with the first localized surface — each is created by the phase that needs it, not ahead of it.
- **No premature folders.** No `rag/`, no `domains/` plugin tree, no generic knowledge-engine package, and no permission-framework or translation-management tree is created before the phase that needs it.

---

## 15. Future Extensibility Principles

Extensibility is achieved by **stable seams**, not by speculative frameworks.

- **New methodology stages** attach to the Engagement aggregate and reuse the shared AI orchestration pipeline and Analysis Run recording. Adding a stage means: a prompt module, an output schema, a mapping into engagement state, and a service — no new infrastructure. This is what lets each roadmap phase land without redesign.
- **New business domains** are added as new curated Consulting Knowledge Base content scoped by `BusinessDomain`. The domain-agnostic engagement entities do not change, and the cross-domain Technology Knowledge Base is unaffected. The multi-domain abstraction is only elaborated when a second domain is actually introduced (vision §10).
- **The Technology Knowledge Base (Phase 5A)** enters as a separate, **category-organized** subsystem behind its own `TechnologyRetrieval` port, with the Technology Curator as its sole, human-approved write path, **Technology Sources** as first-class provenance, and the Technology Update History as its append-only audit log. New Technology Categories and Technology Sources are added as curated data, not code changes. Engagement stages consume it exactly like the Consulting Knowledge Base — read-only, one-directional reference — so recommendations gain grounded technology and model suggestions without new engagement infrastructure, and without renumbering any existing phase.
- **RAG (Phase 11)** enters as a second implementation of the existing `KnowledgeRetrieval` port over the Consulting Knowledge Base, complementing curated retrieval. Grounding and traceability are unaffected because retrieval only decides *which* knowledge is supplied to the pipeline.
- **New LLM providers** are added as adapters behind the existing `LlmClient` abstraction (the provider union already anticipates `openai` and `anthropic`); orchestration, cost, and observability are unchanged.
- **Multi-user and access (Phase 3A)** enter as a workspace scope enforced in the repositories, a single `AccessPolicy` decision point, and an `AuthenticationProvider` port. Because the scope is structural and the policy is one place, every later phase inherits isolation without adding access code of its own: a new stage asks the existing policy and queries through the existing scoped repositories. Replacing the identity mechanism later (an external identity provider, SSO) changes one adapter, not the rules.
- **New collaboration surfaces** — should a later phase let a client see anything beyond Discovery — extend the invitation model and the existing portal surface rather than widening consultant endpoints. The narrow surface is the safeguard.
- **Additional languages** are added as translation data behind the existing key-based lookup (§7.1); no domain, contract, or storage change follows from a new locale, because internal identifiers are English and never translated.
- **Production readiness (Phase 12)** — deployment, monitoring, operational security, backup, recovery, performance — layers around the stateless backend and existing observability without touching the domain. It **operates and verifies** the Phase 3A access model rather than introducing it.

Each seam corresponds to a roadmap boundary, so the roadmap can be executed phase by phase with the domain layer as the stable center of gravity.

---

## Assumptions

- **Terminology migration is expected, not a redesign.** The existing `ClientCase` model is treated as the current, to-be-renamed embodiment of engagement state (roadmap Phase 0/1). This document assumes that rename/reshape rather than proposing a new product concept.
- **Single-consultant until Phase 3A, workspace-partitioned multi-user from Phase 3A** *(revised in 1.2; previously deferred to production readiness)*. The pre-Phase 3A implementation path remains single-consultant, with the backend kept stateless so multi-user is addable. From Phase 3A, authentication, authorization, roles, workspace isolation, and engagement ownership are in place, and every later phase is built inside that boundary. Phase 12 no longer owns access control; it deploys, monitors, and hardens it.
- **Workspaces are isolated logically, not physically.** Isolation is an enforced query scope within one database and one deployment, not a database or deployment per workspace. This is deliberate for the MVP; because the scope is applied behind repository ports, a stronger physical separation later is a persistence change, not an architectural redesign.
- **Both knowledge bases stay shared across workspaces.** The Consulting and Technology Knowledge Bases are product-level curated assets, not workspace-owned: they contain no client-specific content, and sharing them is what makes curated knowledge compound across engagements. **If workspace-private curated knowledge is ever required, that is a domain-model decision and an approved revision — not something to be introduced in implementation.**
- **Identity starts behind a port and stays separate from consulting state.** Phase 3A delivers first-party authentication behind `AuthenticationProvider` and `EmailDeliveryProvider`; Better Auth and Resend are the initial adapters. Enterprise identity federation (SSO/SAML/OIDC) is explicitly out of scope, but client self-registration is in scope and does not expose passwords to administrators or consulting-domain code.
- **German-only at MVP, with the i18n seam in place.** One active locale ships; the key-based lookup, formatting, and English-identifier discipline exist from the start so a second language is translation data. No locale switcher, translation tooling, or language negotiation is built ahead of a second language (principle §1.6). AI-drafted engagement content is produced in the user's language while structured fields, enums, and grounding identifiers remain English.
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
9. **Workspace as the enforced ownership boundary, with one access-decision point** *(Revision 1.2, Phase 3A)*. Workspace scope is applied in the repositories so no service can issue an unscoped engagement-side query, and a single `AccessPolicy` answers every access question in a fixed order (workspace → role → ownership/invitation), rather than per-route checks. Authorization is server-side on every request, deny-by-default, and non-revealing in its denials.
10. **Authentication and email delivery behind dedicated infrastructure boundaries** *(Revision 1.2, Phase 3A)*. Better Auth is the initial authentication provider behind `AuthenticationProvider`, and Resend is the initial email-delivery provider behind `EmailDeliveryProvider`. Passwords, sessions, verification, reset, and invitation emails stay out of consulting-domain state.
11. **A separate, narrow client-facing surface** *(Phase 3A)*. The Client Portal is its own surface with its own endpoints authorized through **Discovery Access** for one engagement, enforced server-side on every request, rather than the consultant endpoints with a filter applied. Narrowness is the safeguard.
12. **A third governance log — the append-only Audit Trail** *(Phase 3A)* for access and collaboration events, deliberately separate from the engagement-scoped Analysis Run and the curation-scoped Technology Update History. Three logs, three purposes, never merged.
13. **Key-based localization with English internal identifiers** *(Revision 1.2)*. User-facing strings are looked up by key and one locale (German) ships; enums, statuses, events, contracts, and audit entries stay English, so a new language never reaches the domain, the storage, or the contracts.

## Possible Risks

- **Domain extraction drift.** Business logic currently lives inside services; lifting it into `domain/` incrementally risks partial extraction where some rules leak into services or repositories. Mitigation: treat the inward dependency rule as a review gate on each new stage.
- **`Json`-column overuse.** Convenient early, but under-typed stage outputs can accumulate implicit contracts. Mitigation: pair every `Json` payload with a Zod schema in `shared/` and promote to typed columns as shapes stabilize.
- **Grounding is only as strong as retrieval.** If a stage generates content without passing knowledge through the pipeline, traceability weakens silently. Mitigation: make "recommendation without grounding references" a domain invariant that fails validation, not a lint suggestion.
- **Prompt/schema divergence.** A prompt template can drift from its Zod schema, causing avoidable parse failures. Mitigation: co-locate and version prompt + schema per stage; the fingerprint surfaces uncoordinated changes.
- **Cost fidelity.** A single hard-coded rate in `calculateLlmCost` will misprice as models/providers diversify. Mitigation: move to a per-model/provider rate lookup behind the existing function before multi-model use.
- **Observability coupling.** Care is needed that Langfuse or tracing failures never fail a consultant's stage; the best-effort/swallow discipline must be preserved as stages multiply.
- **Technology Knowledge Base staleness vs. autonomy.** Because the only write path is human approval, the Technology Knowledge Base can lag fast-moving vendor releases if curation is neglected. Mitigation: keep detection cheap and proposals well-structured so approval is quick — but never relax the human-approval gate to chase currency; autonomous updates are out of scope by design.
- **Curator write path leaking into engagements.** The value of the separation collapses if any engagement code can reach a Technology Knowledge Base write. Mitigation: expose only read access on the engagement side, keep the write path behind the curator's approved-proposal flow, and treat any engagement→knowledge write as a review-blocking defect.
- **An unscoped query leaking across workspaces.** *(Phase 3A.)* A single engagement-side query written without the workspace scope — most likely in a listing, a count, a search, or a cost roll-up rather than in a record fetch — silently breaks isolation and is easy to miss in review. Mitigation: require the scope as part of the repository operation rather than as an optional filter, cover aggregates and exports with isolation tests, and treat any unscoped engagement-side query as a review-blocking defect.
- **Authorization drifting into the UI.** If a capability is protected only by a hidden button, it is unprotected. Mitigation: every UI-hidden action has a server-side denial test; permission logic in the client is treated as a convenience layer with no authority.
- **Access checks scattering as stages multiply.** Per-route ad-hoc checks diverge over time and produce inconsistent reach. Mitigation: keep the single `AccessPolicy` decision point and deny-by-default; a new route that implements its own rule is a defect.
- **The Client Portal widening over time.** Pressure to "just show the client the assessment too" is how a narrow surface becomes a client portal the product boundary rejects (domain-model §6). Mitigation: keep the portal's endpoints separate and discovery-access-scoped, and treat widening client reach as a documentation decision, not an implementation choice.
- **Audit-log conflation.** Merging the Audit Trail with Analysis Runs (or the Technology Update History) for convenience destroys the meaning of all three and their append-only guarantees. Mitigation: separate ports and tables, with append-only enforced by the absence of an update/delete path on every ordinary caller.
- **The governed audit exceptions widening.** Erasure minimization and retention deletion (§7A.8) are the only writes to the Audit Trail that are not appends. Reusing either as a convenient way to "fix" an entry would turn a legal exception into a general edit path and destroy the evidential value of the whole log. Mitigation: both stay in the compliance repository behind Administrator-only actions, each records its own audit entry, and a third exception requires a documented decision.
- **Localization decay.** German literals inlined in components, or English identifiers translated in data, quietly remove the i18n seam and turn a future language into a rewrite. Mitigation: no user-facing literal in a component, no translated enum or event name, and both checked in review (coding-standards §12A).

## Files Created or Modified

- **Created:** `docs/architecture.md` (this document).
- **Revised (1.1):** updated to introduce the Technology Knowledge Base (category-organized), the Technology Curator (sole human-approved write path), first-class Technology Sources for provenance, and the append-only Technology Update History alongside the Consulting Knowledge Base, delivered as the Phase 5A extension. That revision did not change the MVP boundary. No code was written or changed as part of this documentation revision.
- **Revised (1.2):** added the multi-user, workspace, and access architecture (§7A) delivered by **Phase 3A** — authentication behind a port, one server-side `AccessPolicy` decision point, workspace scope enforced in the repositories, the Administrator/Manager/Client role model, engagement ownership, client self-registration, the separate Client Portal surface, the Draft/Submit/Return state machine, notifications, and the append-only Audit Trail as the third governance log. Added the internationalization-ready, German-only frontend commitment (§7.1) and two new architecture principles (§1.11, §1.12). Extended §2–§4, §6–§8, §12–§15, the assumptions, decisions, and risks accordingly, and **moved authentication/authorization out of production readiness**, which is now deployment, monitoring, operational security, backup, recovery, and performance. Section numbering was preserved by adding §7A as a lettered section and appending new principles/decisions. No code was written or changed as part of this documentation revision.
