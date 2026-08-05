# Coding Standards — AI Consulting Workbench

Status: **Draft** · Version: 1.2 · Derived from [product-vision.md](./product-vision.md), [domain-model.md](./domain-model.md), [roadmap.md](./roadmap.md), [architecture.md](./architecture.md), and [agent-rules.md](./agent-rules.md).

> **Revision 1.2 (approved).** Adds two rule sets and extends the existing ones, changing no existing standard:
> - **§6A — Access control and workspace isolation.** Workspace scope is required on every engagement-side query, authorization is server-side through a single decision point, deny-by-default, denials are non-revealing, the Client Portal is a separate narrow surface, and the **Audit Trail** is append-only and never merged with Analysis Runs or the Technology Update History.
> - **§12A — Internationalization and localization.** No user-facing literal in a component; internal identifiers (enums, statuses, events, contracts, audit entries) stay English; one locale (German) ships behind a key-based lookup.
>
> §6 gains rules for the Discovery Profile's value & measurement baseline, status, and provenance, and §13/§14 are extended accordingly. Delivered by the Phase 2 Extension and Phase 3A; **authentication and authorization are no longer Phase 11 work.** Section numbering is preserved by lettered insertion.
>
> **Revision 1.1 (approved).** Adds coding rules for the separate, **category-organized Technology Knowledge Base**, first-class **Technology Sources** (referenced by proposals and preserved in history), the **Technology Curator** (its only, human-approved write path), and the append-only **Technology Update History** of approved revisions. Delivered as the Phase 5A extension — existing roadmap phase numbers are unchanged. No existing standard is changed.

This document defines the **engineering standards** that must be followed throughout implementation of the AI Consulting Workbench. It guides **both human developers and AI coding agents** writing code in this repository.

It is **implementation-oriented** — it is about how code is written — but **independent of any specific roadmap phase**: these standards hold whether you are building Phase 1 or Phase 11.

**Scope boundary.** This document defines *coding standards only*.
- It does **not** restate or re-decide architecture. Layering, the domain/knowledge split, the shared AI orchestration pipeline, the Analysis Run mechanism, persistence choices, and provider abstraction are already decided in [architecture.md](./architecture.md); here they appear only as *coding rules to follow*, not as design decisions to make.
- It does **not** define implementation workflow or Git workflow (branching, commits, PR process, release). Those are out of scope.
- It does **not** redefine product behavior; AI *behavioral* rules live in [agent-rules.md](./agent-rules.md). This document covers how the *code* that realizes those behaviors is written.

Where a rule here reflects a frozen commitment, the frozen document remains the source of truth; this document translates it into an engineering expectation.

---

## 1. Purpose

The purpose of these standards is to keep the codebase **trustworthy, understandable, and cheap to change** as the roadmap is executed phase by phase.

- **Serve the product, not the tooling.** Code exists to give a consultant a real, usable capability (product-vision §1). Engineering choices are judged by whether they support that, not by technical sophistication.
- **One consistent codebase.** Human developers and AI coding agents produce code that looks and behaves as if written by one careful engineer. New code reads like the code already around it.
- **Protect the stable center.** The domain model is the most stable, most valuable part of the system (architecture §4). These standards exist largely to keep it clean and to keep infrastructure at the edges.
- **Make change safe.** Because the roadmap is incremental and iterative, the standards prioritize small, safe, reversible change over large rewrites.

---

## 2. General Engineering Principles

- **Each implementation must follow the frozen documentation.** Product vision, domain model, roadmap, architecture, and agent-rules are the source of truth. Code must conform to them; when code and a frozen document disagree, the code is wrong. Do not redesign the product or the architecture in code.
- **Build for the phase in front of you.** Implement what the current roadmap phase needs and no more. Do not build ahead of need (architecture §1.6).
- **Every roadmap phase must leave the application working.** No change may leave the application in a broken or half-migrated state that depends on a later phase to become usable (roadmap "How to read this roadmap"). A phase delivers one complete, working capability.
- **Reuse existing infrastructure whenever possible.** Engagement persistence, Analysis Run recording, prompt versioning, prompt fingerprinting, cost tracking, and Langfuse observability already exist. Extend them; do not rebuild them or introduce a parallel mechanism (roadmap Cross-cutting Capabilities; architecture §1.5).
- **Correctness and trust first.** Because outputs are placed in front of clients, correctness, faithful representation, and the audit trail outrank convenience and speed of writing code.
- **Explicitness over cleverness.** Prefer clear, obvious structures over generic frameworks, hidden magic, or abstractions introduced before they are needed (architecture §1.10). See §3.
- **Consistency over personal preference.** Match the conventions, idioms, and structure already present in the repository rather than importing a different style.

---

## 3. Simplicity and Maintainability

- **Code should be easy to understand rather than clever.** Optimize for the next reader. A straightforward solution that is obviously correct is preferred over a compact or ingenious one that is not.
- **Avoid premature abstraction and overengineering.** Do not introduce an abstraction, generic layer, or configuration surface until a second concrete case actually needs it (architecture §1.6). No multi-domain plugin framework, no RAG infrastructure, and no generic knowledge-item engine ahead of the phase that requires them.
- **Rule of the second case.** Duplication is acceptable until a genuine second use exists; abstract when the pattern is proven, not when it is anticipated.
- **Small, focused units.** Functions and modules should do one thing at a well-defined level. Prefer several clear, small pieces over one large multi-purpose one.
- **Least surprise.** A reader should be able to predict what a function does from its name and signature. Avoid hidden side effects, especially writes to persistence or external services from code that reads as pure.
- **Delete dead paths.** Remove unused code, dead branches, and obsolete placeholders rather than leaving them to mislead future readers.
- **Keep the default simple.** Prefer plain data and explicit control flow; reach for metaprogramming, dynamic dispatch, or heavy generics only when they clearly earn their cost.

---

## 4. Project Structure Rules

The repository layout is already established (architecture §14). These are the coding rules for working within it — not a redesign of it.

- **Put code where its layer lives.** Interface code in the interface layer, orchestration in the application layer, business meaning in the domain layer, adapters in infrastructure. Do not place business rules in routes or repositories.
- **Extend the existing layout; do not reorganize it.** Add files alongside their siblings following the established structure. Do not restructure directories to suit a single change.
- **No premature folders.** Do not create speculative top-level areas (e.g., a retrieval framework or a domain-plugin tree) before the phase that needs them (architecture §14 notes).
- **Shared contracts live in the shared area.** Types and schemas used by both client and server belong in the shared location so both sides agree on shape; do not duplicate a contract on each side.
- **One home per concept.** A given business concept, schema, or prompt has a single authoritative location. Avoid copies that can drift apart.
- **Co-locate what changes together.** Keep a stage's prompt and its output schema together so a change to one surfaces the need to change the other (architecture §10).

---

## 5. Layering and Dependency Rules

The layering and its dependency direction are decided in architecture §3. These are the coding rules that keep code honest to it.

- **Dependencies point inward.** Interface → application → domain; infrastructure implements ports defined toward the domain/application side. Never let an inner layer depend on an outer one.
- **Business logic belongs in the domain layer.** Business rules, invariants, and the meaning of engagement and knowledge concepts live in the domain layer — not in routes, services, or repositories. Application services orchestrate; they do not *own* business rules.
- **Infrastructure must not leak into the domain.** The domain layer must not import or reference web framework types, ORM/persistence models, provider SDKs, environment/config access, or observability clients. It speaks in business types only (architecture §3, §4.4). If a domain file needs a framework type, that is a design error to fix, not to work around.
- **Depend on ports, not concretions.** Application code depends on repository/LLM/retrieval/tracer *ports* (interfaces), and infrastructure provides the implementations. Do not reach past a port to a concrete adapter.
- **Validate at the boundary.** External input is validated at the interface boundary and AI output is validated at the orchestration boundary before it is trusted deeper in (architecture §13). Inner layers assume already-validated data.
- **The client holds no business rules.** The frontend renders what the backend persisted (grounding, cost, evaluation, confidence); it does not recompute business results (architecture §7).

---

## 6. Domain Model Rules

The domain layer is the code expression of [domain-model.md](./domain-model.md) and is the most stable part of the system. Code must protect that.

- **Use the ubiquitous language.** Name types and operations with the domain vocabulary exactly as defined (Workspace, User, Role — Administrator/Manager/Client, Engagement Ownership, Discovery Access, Client Portal, Notification, Audit Trail, Engagement, Organization, Discovery Profile, Assessment, Opportunity, Recommendation, Implementation Roadmap, Consultant Report, Consulting Knowledge Base, Technology Knowledge Base, Technology Category, Technology Profile, Technology Source, Technology Curator, Technology Update Proposal, Technology Update History, AI Use Case, Solution Pattern, Analysis Run). Use **Consulting Knowledge Base** and **Technology Knowledge Base** by their specific names rather than an undifferentiated "Knowledge Base." Do not use the legacy `ClientCase` name for new engagement concepts.
- **Engagement is the aggregate root for client state.** Client-specific state (discovery, assessment and its dimensions, opportunities, recommendations, roadmap, report versions) is owned by the Engagement. Nothing client-specific lives outside an engagement (architecture §4.2). From Phase 3A the Engagement additionally carries its **Workspace** and its **owning Manager**; these are load-bearing for access decisions, not metadata (§6A).
- **The Discovery Profile's baseline, status, and provenance are domain data.** The value & measurement baseline (business impact; error frequency/severity/cost; existing KPIs; baseline metrics; target success metrics; measurement method; data sources), the workflow status (`draft`/`submitted`/`returned`/`accepted`), and content provenance (consultant-captured vs. client-provided) belong to the Discovery Profile on the Engagement aggregate — not to a parallel store and not to the UI. **Never drop a figure's measurement method or data source**, never let an estimate be stored as a measurement, and never reattribute client-provided content to the consultant. A missing baseline is represented as an explicit gap, not as an empty value (domain-model §2; architecture §4.2, §6).
- **Authentication state is not domain data.** Passwords, sessions, verification, resets, and invitation-link mechanics belong to the access/auth boundary and its provider adapters, not to consulting-domain entities. Domain code must never store, read, or infer a permanent password.
- **Discovery workflow transitions are domain logic and content-preserving.** Legal transitions and their permitted actors live in the domain; a transition must never discard content, notes, or provenance. Client-provided content is not accepted fact until the consultant's review — enforce that, do not leave it to the UI (architecture §4.3, §7A.6).
- **Assessment dimensions are values, not entities.** Business Process, Data, Technology, AI Readiness, Risks, and Opportunities are dimensions *within* the Assessment. Do not model AI Readiness (or any dimension) as a separate top-level entity (domain-model §2; architecture §4.2).
- **Grounding is a domain invariant.** A Recommendation is valid only if it is traceable backward to Discovery facts and outward to the Consulting Knowledge Base knowledge that justifies its approach; any concrete technologies or models it names must additionally reference Technology Knowledge Base entries (Technology Profiles). Code should enforce "recommendation without grounding is invalid" as a validation rule, not treat it as optional (architecture §4.3, §9; agent-rules §3, §11).
- **One-directional reference to knowledge — for both knowledge bases.** Engagement code may read from the Consulting Knowledge Base and the Technology Knowledge Base and copy the reasoning it used into engagement content, but must never write to or mutate either. There must be no code path from running an engagement to modifying knowledge (domain-model §4; architecture §9; agent-rules §4).
- **The Technology Knowledge Base is category-organized, independent, and write-gated.** It is a separate module/table group from the Consulting Knowledge Base (they change at different rates) and from engagement data. Technology Profiles are organized under a **Technology Category** (AI Models, AI Providers, Embedding Models, Speech, OCR, Vector Databases, Rerankers, MCP Servers, Browser / Computer Use, Workflow Engines, Evaluation Frameworks, Monitoring, Deployment Patterns) — model this hierarchy, not a flat list — with categories as curated data (extensible/nestable) rather than hard-coded types. Its **only** write path is the Technology Curator applying an explicitly human-approved Technology Update Proposal; there must be no autonomous-AI write and no engagement-reachable write (architecture §9.2, §9.3; agent-rules §4.1).
- **Technology Sources are first-class and referenced, not inlined strings.** The trusted official origins (OpenAI, Anthropic, Google, Meta, Groq, Mistral, …) are modeled as a **Technology Source** registry; a Technology Update Proposal references one or more Technology Sources rather than storing free-text provenance. Keep the Technology Source concept distinct from the AI Providers category (provenance vs. curated content) (domain-model §2; architecture §9.3).
- **The Technology Update History is append-only and approval-only, and preserves source references.** Every applied change appends a Technology Update History entry (change, targeted category/profile, **the referenced Technology Source(s) preserved for auditability**, approver, timestamp); entries are never rewritten or deleted, rejected proposals are never recorded there, and it is stored separately from both the Technology Update Proposal record and engagement Analysis Runs (domain-model §2; architecture §9.3). Treat it like append-only Consultant Report versions.
- **Reports are append-only versions.** Producing a new Consultant Report version must never destroy or overwrite a prior one (architecture §4.3).
- **Stages are transformations of persisted state.** A stage takes persisted engagement state to new engagement state, so it can be re-entered and re-run without restarting the engagement. Do not hold engagement state in the backend between requests (architecture §2, §4.3).
- **Keep the domain pure.** Domain code contains no I/O, no persistence, no prompts, no provider calls. Side effects belong to application/infrastructure.

---

## 6A. Access Control and Workspace Isolation Rules

*(Revision 1.2. Lettered so existing section numbering is preserved. These rules apply from Phase 3A onward; the architecture that decides them is §7A.)*

- **Every engagement-side query is workspace-scoped, in the repository.** The workspace scope is a **required parameter** of engagement-side repository operations, never an optional filter a caller might forget. An unscoped engagement-side read or write is a review-blocking defect, not a performance note.
- **Authentication data is separate from consulting-domain tables.** Access/auth records, session state, verification state, password-reset state, and invitation-link state live in dedicated access/auth storage and are handled through the authentication provider boundary. The consulting domain never stores permanent passwords.
- **Aggregates, listings, searches, counts, and exports are scoped identically.** A leak through a cost roll-up, a count, or an export is a leak. Cost reporting (per engagement, lifetime) is read within the acting user's workspace and role.
- **Authorization is server-side, on every request.** Every action — read, write, generate, submit, return, accept, export — is authorized on the server. UI hiding is a convenience and never a control; a capability protected only by a hidden button is unprotected.
- **One decision point.** Access questions go through the shared `AccessPolicy` in the fixed order **workspace → role → engagement ownership (Manager) / discovery access (Client)**. Do not re-implement access rules per route or per service; a route that invents its own rule is a defect.
- **Deny by default.** A new route, capability, field, or query is unreachable until explicitly permitted. Adding a stage must not silently widen anyone's reach.
- **Denials must not leak existence.** A resource in another workspace is refused exactly as a nonexistent resource is. Do not vary status codes, messages, or timing in a way that lets another workspace's data be enumerated.
- **Client-facing endpoints are separate and narrow.** The Client Portal has its own endpoints, authorized as *client + valid Discovery Access + this engagement*. Do not serve the portal from consultant endpoints with a filter applied, and do not reuse a consultant component that fetches more than a client may see.
- **Invitation validity is checked on every request**, not only at acceptance. Expiry and revocation take effect immediately; revocation ends access without deleting the content the client already contributed.
- **The Audit Trail is append-only by construction.** Its repository exposes append and read only — no update or delete path exists in code. Record access- and collaboration-relevant events, **including denied attempts**, with the acting user, target engagement, and timestamp.
- **Never merge the three governance logs.** The **Analysis Run** (engagement AI assistance), the **Technology Update History** (approved knowledge curation), and the **Audit Trail** (access and collaboration) have separate ports, separate storage, and separate meanings. Do not write one from another's path or reuse one to record the other's events.
- **Identity is established once, at the boundary, and passed inward.** Inner layers do not re-derive the acting user from transport details, and no layer reads identity from client-supplied data.
- **Isolation is tested, not assumed.** Critical paths get deterministic tests proving a Manager cannot reach another Manager's engagement (by identifier, listing, search, aggregate, or export), an Administrator cannot reach another workspace, and a Client cannot reach anything but their own discovery (§9).

---

## 7. Error Handling Standards

The error-handling *strategy* is set in architecture §13. These are the coding rules that implement it consistently; this is not a redesign of that strategy.

- **Validate external input at the interface layer.** Reject invalid requests at the boundary with a structured error; invalid input must never reach the domain.
- **Treat AI output failure as a domain-meaningful outcome, not an exception.** A parse or schema-validation failure of AI output returns a structured failure result to the caller; it is not thrown as an unhandled error (architecture §5, §13).
- **Failed AI generation never mutates engagement state.** If an AI-assisted step fails parsing, validation, or provider execution, the previous engagement state remains unchanged and no partial or invalid output is persisted (architecture §13; agent-rules §10, §14).
- **The audit trail survives failure.** A failed AI-assisted step is still recorded as an Analysis Run (with the error), and observability is still flushed. Never drop the record on the error path (architecture §5, §13).
- **Side effects are best-effort and non-blocking.** Observability, tracing, and cost recording must never fail a consultant's operation; wrap them so their failure is logged and swallowed, not propagated (architecture §11, §13).
- **Use the shared application logger.** [Application Logging](./application-logging.md) defines the minimum structured application logging and privacy rules. Runtime code must use that shared logger and its admitted fields rather than direct console output or ad hoc error serialization.
- **Fail with meaning.** Surface errors that tell the consultant what happened ("no draft yet / try again," with a reason), not opaque stack traces. Do not swallow errors that the caller needs to act on.
- **No silent catches.** Never catch an error and continue as if nothing happened, except for the explicitly best-effort side effects above. Every other caught error is handled or surfaced.
- **Unauthenticated and forbidden are distinct, structured outcomes.** Refuse an unauthenticated request as unauthenticated and an out-of-reach request as forbidden; keep denial responses uniform and non-revealing (§6A), append an audit entry, and treat a denial as a normal outcome rather than a system fault to alarm on (architecture §13, §7A).
- **Notification delivery is best-effort.** A failure to raise or deliver a notification never fails the operation that triggered it; log and swallow, as with tracing (architecture §7A.7).

---

## 8. AI Integration Standards

Every AI-assisted capability is built on the shared mechanisms that already exist. This section is about writing that code correctly; the AI's *behavior* is governed by [agent-rules.md](./agent-rules.md).

- **Every new AI capability reuses the shared mechanisms.** Any new AI-assisted step must go through the shared AI orchestration path and reuse the existing **Analysis Run** recording, **prompt versioning**, **prompt fingerprinting**, **cost tracking**, and **observability** mechanisms. Do not introduce a separate orchestration, logging, cost, or tracing path (roadmap Cross-cutting Capabilities; architecture §5, §8; agent-rules §11).
- **Every AI provider call passes through the compliance gate.** A stage sends only the prompt returned by the gate. It may not call a configured provider/model that the gate did not approve, and it may not fall back to the original prompt after redaction or policy refusal.
- **Every AI output is scanned before trusted persistence.** After the provider response is parsed, pass the actual model output through the centralized output review helper before assigning the final output classification, writing compliance metadata, persisting usable stage content, or returning generated content. Never duplicate output scanning logic in a stage.
- **Record every AI-assisted step as an Analysis Run.** No AI functionality ships without capturing provider, model, prompt version, prompt fingerprint, input/output/total tokens, latency, cost, objective quality signals, and — where available — a trace reference. This is a non-negotiable acceptance condition (roadmap Cross-cutting Capabilities; architecture §8).
- **A new stage supplies only its three specifics.** To add an AI stage, provide its prompt module, its output schema, and how the parsed result maps into engagement state. The surrounding call → parse → evaluate → record → trace flow is shared and reused, not re-implemented (architecture §5, §15).
- **Prompts are versioned, fingerprinted assets.** Each stage has its own prompt module carrying a human-readable version and a content fingerprint, recorded on every run. Pair each prompt with its output schema so contract and parser stay in lockstep (architecture §10).
- **Ground by construction.** Retrieved knowledge is passed *into* the prompt so the model reasons over supplied knowledge rather than inventing it, and grounding references are captured on the produced content. This applies to both knowledge bases: consulting knowledge from the Consulting Knowledge Base and, for technology and model suggestions, Technology Profiles from the Technology Knowledge Base. Do not generate recommendations — or the technologies/models they name — without passing the relevant knowledge through the pipeline (architecture §5, §9; agent-rules §3, §12).
- **The Technology Curator is not an engagement stage.** Its proposal drafting does not go through the engagement AI orchestration path and records **no** engagement Analysis Run (an Analysis Run always belongs to an engagement). Its governance records are the persisted Technology Update Proposal (referenced Technology Source(s), targeted category/profile, proposed change, approval decision) and, for approved changes, the append-only Technology Update History that preserves those source references. Do not force curator activity into the Analysis Run mechanism, do not conflate the Technology Update History with Analysis Runs, and do not let the curator's write path be reachable from an engagement stage (architecture §5, §8, §9.3; agent-rules §4.1).
- **Persist AI output as an editable draft.** Validated AI output is stored as engagement state marked as an unreviewed draft; a re-run must not silently overwrite consultant edits (architecture §5, §7; agent-rules §10).
- **Raw personal data never enters logs, audit, errors, or client failures.** PII redaction and output-scan records may carry counts, kinds, classifications, and safe error identities only; never raw detected values, model responses, prompts, database messages, provider messages, or client-authored content.
- **Ordinary draft save is not human review.** Pending AI-output review is cleared only by the explicit authorized review action for that stage. Accept/approve transitions must check the pending state server-side and fail safely if review recording fails.
- **Legal and compliance decisions are explicit human actions.** Legal basis, consent, DPIA screening, provider/model approval, legal hold, erasure, and retention execution are never inferred from ordinary content edits or navigation.
- **Application logging follows the logging standard.** Any operational log line follows [application-logging.md](./application-logging.md) and uses safe failure identities instead of raw exception text.
- **No fake quality signals.** Do not present placeholder or hard-coded quality scores as real evaluation. Store only objective signals (parse success, schema validity, tokens, cost, latency) unless a genuine evaluator produced the subjective ones (roadmap Phase 0; architecture §5).
- **Provider changes stay behind the abstraction.** New models or providers are added as adapters behind the existing LLM abstraction; orchestration, cost, and observability code is unchanged (architecture §15).

---

## 9. Testing Standards

- **Tests should focus on business behavior.** Test what a capability *does* for the consultant and what invariants must hold, not incidental implementation details. A test should survive a refactor that preserves behavior.
- **Cover the critical trust paths.** Prioritize tests for parsing and validation of external input and AI output, grounding/traceability invariants, "failed AI step does not mutate state," append-only report versioning, the one-directional knowledge reference, and — from Phase 3A — **workspace isolation, role reach, discovery access validity, and the append-only Audit Trail**. These are where a defect harms client trust.
- **Test isolation negatively.** An access test must prove the *denial*, not only the permitted path: a Manager denied a colleague's engagement, an Administrator denied another workspace, a Client denied everything but their own discovery — across direct fetch, listing, search, aggregate, and export. Cover discovery workflow transitions the same way: a client cannot accept their own submission, and no transition loses content or provenance.
- **Test the domain in isolation.** Because the domain layer is pure, its rules and invariants are testable without a database, web server, or LLM. Do not require infrastructure to test business rules.
- **Keep infrastructure at the edges of tests.** Exercise business logic against ports/fakes rather than live providers, databases, or observability backends where practical, so tests are deterministic and fast.
- **Determinism in tests.** Tests must not depend on live LLM output, network, wall-clock timing, or ordering that is not guaranteed. AI-dependent behavior is tested via the port boundary, not by calling a real model.
- **Test at the right altitude.** Prefer testing a capability through its port/service boundary over asserting on private internals; internals may change, behavior should not.
- **A capability is not done until its critical behavior is covered.** New behavior ships with tests for its critical parse/validation and invariant paths (roadmap Phase 0 "Definition of Done"; see §14).
- **Tests are code.** They follow the same clarity, naming, and simplicity standards as production code; a confusing test is a liability.

---

## 10. Documentation Standards

- **Documentation must be updated whenever implementation changes affect it.** If a change alters behavior, structure, or setup that a document describes, update that document in the same change. Do not leave documentation describing a state the code no longer matches.
- **Frozen documents are not edited to match code.** The frozen source-of-truth documents are authoritative; if code diverges from them, fix the code. Only non-frozen documents (such as developer setup docs) are updated to reflect implementation reality.
- **Keep setup runnable.** A developer must be able to get the project running from the documentation alone; keep run instructions and environment examples current when they change (roadmap Phase 0).
- **Explain why, not what.** Comments should capture intent, invariants, and non-obvious reasoning — not restate what the code plainly says. Prefer clear code over explanatory comments where possible.
- **Match the surrounding documentation.** New docs and comments follow the tone, terminology, and structure already in the repository, and use the ubiquitous language (§6).
- **Document invariants at their enforcement point.** Where code enforces a domain invariant (grounding, append-only versions, one-directional reference), a brief note ties it to the rule it upholds so future readers do not weaken it unknowingly.
- **No stale placeholders.** Remove TODOs and placeholder notes once resolved; do not leave misleading notes in shipped code.

---

## 11. Refactoring Rules

- **Code should be incremental rather than rewritten.** Prefer small, safe, reversible changes that extend the existing structure over wholesale rewrites. The existing working layout is extended, not replaced (architecture §3, §14).
- **Refactoring is allowed only when it directly supports the current roadmap phase or removes clear technical debt.** Do not refactor for taste, style preference, or speculative future needs. A refactor must either unblock the phase in front of you or eliminate identified, concrete debt.
- **Separate refactoring from behavior change in intent.** A refactor preserves behavior; when you must change behavior, be clear that is what you are doing. Do not bundle opportunistic unrelated rewrites into a behavioral change.
- **Preserve the working state.** A refactor must leave the application fully working at completion; it must not require a later phase to become usable again (roadmap).
- **Move logic toward its correct layer.** A legitimate, ongoing refactor is lifting business logic out of services into the explicit domain layer (architecture §14 notes). Do this incrementally and only as stages are built, not as a big-bang extraction.
- **Do not weaken invariants to simplify.** Simplification must never remove a grounding, traceability, append-only, or separation invariant. If a refactor makes an invariant harder to hold, it is the wrong refactor.
- **Leave it at least as covered.** Do not reduce test coverage of critical behavior in the course of a refactor.

---

## 12. Naming Conventions

- **Names come from the ubiquitous language.** Business types and operations use the domain vocabulary (§6). The same concept has the same name everywhere — client, server, shared, tests, and prompts.
- **One word, one meaning.** Do not use one term for two concepts or two terms for one. Avoid reintroducing retired names (`ClientCase`) for current concepts (Engagement). Name the two knowledge bases specifically — **Consulting Knowledge Base** and **Technology Knowledge Base** — rather than a bare "Knowledge Base" that hides which one is meant, and keep **Technology Source** (curation provenance) distinct in naming from the **AI Providers** Technology Category (curated content).
- **Role identifiers are stable and explicit.** Use `ADMIN`, `MANAGER`, and `CLIENT` for role identifiers in code, schemas, and contracts; keep the human-readable prose form where it improves readability.
- **Names reveal intent.** Prefer descriptive, unabbreviated names that state purpose over short or clever ones. A reader should not need to open a function to know roughly what it does.
- **Match existing casing and style conventions.** Follow the casing, file-naming, and identifier conventions already used in the surrounding code and directory; do not introduce a competing style.
- **Distinguish the layers in naming.** Ports/interfaces, application services, domain types, and infrastructure adapters should be named so their role and layer are recognizable, consistent with the existing patterns.
- **Prompt and schema naming stays paired and versioned.** A stage's prompt module and its output schema are named so their pairing and the active version are obvious (architecture §10).
- **No misleading names.** A name must not imply behavior the code does not have (e.g., a "get" that writes, an "evaluate" that returns a hard-coded value).

---

## 12A. Internationalization and Localization Rules

*(Revision 1.2. Lettered so existing section numbering is preserved. The architecture that decides this is §7.1; the MVP ships German only, on an i18n-ready foundation.)*

- **No user-facing literal in a component.** Every string a user reads — labels, help text, placeholders, validation and error messages, empty states, notification text, exported document headings — is looked up by key. A hard-coded German (or English) literal in a component is a defect, however small.
- **Internal identifiers stay English, always.** Domain type and field names, enum and status values (`draft`, `submitted`, `returned`, `accepted`), role names, stage names, event names, API contracts, log lines, and audit entries are English and are never translated, localized, or duplicated per language. Translating an identifier breaks queries, contracts, and traceability.
- **Never key off displayed text.** Business logic, comparisons, routing, and storage use identifiers — never the localized string a user happens to see. A translation must never be able to change behavior.
- **The server returns identifiers and parameters, not prose.** Where the backend must convey user-facing text, it returns a message identifier plus structured parameters and lets the frontend localize it. Do not return language-specific prose the frontend cannot re-render in another locale.
- **Entered and generated content is not localized.** Consultant- and client-entered discovery content, and AI-drafted engagement content, are stored and displayed as written. Localization applies to the product's own chrome, never to the client's facts.
- **One locale, no locale machinery.** German is the only active locale; the key lookup and locale-driven formatting (dates, numbers, currency) exist, but no locale switcher, negotiation, or translation-management tooling is built before a second language exists (§3, architecture §1.6).
- **Keys are stable and meaningful.** Name keys after what the string *is* (its screen and role), not after its current German wording, so re-wording a string does not force a key change.

---

## 12B. UI Kit and Component Standards

*(Revision 1.2. Lettered so existing section numbering is preserved. The approved UI direction is the clean, process-oriented SaaS experience described in the frozen docs.)*

- **Build from design tokens.** Visual values such as spacing, color, radii, elevation, and typography come from design tokens or shared theme variables. Do not hard-code per-page visual values when a tokenized value exists.
- **Use reusable components.** Common UI patterns belong in reusable components shared across the consultant workspace and the Client Portal. A one-off component is acceptable only when a pattern truly appears once.
- **Keep the UI process-oriented.** Pages should read like steps in an engagement pipeline, not like a generic CRM dashboard. The consultant workspace should foreground the current stage and next action; the Client Portal should foreground status, Discovery, and published documents.
- **Favor a clean SaaS layout.** The approved visual direction is Linear/Notion-inspired: strong hierarchy, restrained chrome, clear empty states, and minimal ornamental styling. Avoid decorative complexity that does not support the workflow.
- **Separate interactive and read-only surfaces.** Client documents, publication history, and similar portal views are read-only by design. The code should make that distinction obvious in the component structure and not rely on CSS alone.

---

## 13. Code Review Checklist

Every change — whether written by a human or an AI coding agent — should be checked against this list before it is considered complete. (This is a quality checklist, not a Git or PR workflow.)

- **Conforms to the frozen docs.** The change respects product-vision, domain-model, roadmap, architecture, and agent-rules; it does not redesign the product or architecture.
- **Right layer.** Business logic is in the domain; orchestration in the application layer; no infrastructure types leak into the domain; dependencies point inward.
- **Grounding and traceability intact.** Recommendations remain grounded and traceable (to the Consulting Knowledge Base, and to Technology Profiles for any technologies or models named); no code path lets an engagement mutate either knowledge base; the Technology Knowledge Base is written only via an approved Technology Update Proposal, with each applied change appended to the append-only Technology Update History; report versions remain append-only.
- **Authentication state stays separate.** Passwords, sessions, verification, reset, and invitation-link handling are isolated behind the auth boundary; consulting-domain code never reads or stores permanent passwords.
- **Access control intact** *(from Phase 3A)*. Every engagement-side query is workspace-scoped in the repository (including listings, aggregates, and exports); authorization goes through the shared decision point, server-side, deny-by-default; denials are non-revealing; client-facing endpoints stay narrow and discovery-access-scoped; the Audit Trail is append-only and not conflated with Analysis Runs or the Technology Update History.
- **Discovery integrity intact.** Measurement method, data source, measured-vs-estimated, and content provenance survive every write and workflow transition; a missing baseline is an explicit gap; client-provided content is not treated as accepted fact before consultant review.
- **Localization rules respected.** No user-facing literal in a component; internal identifiers, enums, events, and audit entries remain English; no behavior keys off displayed text.
- **Reuses shared mechanisms.** Any AI-assisted step goes through the shared orchestration and records an Analysis Run with cost, tokens, latency, prompt version, and fingerprint, and is traced; no parallel mechanism was introduced.
- **No invented data / no fake signals.** No fabricated knowledge or facts; no placeholder quality score presented as real evaluation.
- **Error handling correct.** Input validated at the boundary; AI-output failure returns a structured result; failed generation does not mutate state; side effects are best-effort and non-blocking.
- **Simplicity.** No premature abstraction; the solution is understandable rather than clever; no speculative frameworks or folders.
- **Leaves the app working.** The change is complete and self-contained; nothing is left half-migrated depending on a future phase.
- **Tested at the behavior level.** Critical parse/validation and invariant paths are covered; tests are deterministic and do not depend on live models.
- **Naming and vocabulary.** Uses the ubiquitous language; no retired terms; names reveal intent.
- **Docs updated.** Any documentation affected by the change is updated in the same change.

---

## 14. Definition of Done for Implementation

A piece of implementation work is **done** only when all of the following hold. This is a per-change quality bar and is independent of any specific roadmap phase.

- **The frozen documentation is respected.** The implementation conforms to the vision, domain model, roadmap intent, architecture, and agent-rules.
- **The application is fully working.** The capability works end-to-end and leaves the whole application in a working state, not a partial slice awaiting a later phase.
- **Business logic is in the domain; infrastructure stays at the edges.** No infrastructure leaked into the domain; dependencies point inward.
- **Invariants hold.** Grounding/traceability, one-directional knowledge reference (to both knowledge bases), the Technology Knowledge Base's human-approved-only write path, the append-only Technology Update History, append-only report versions, "failed generation does not mutate state," and — from Phase 3A — **workspace isolation on every engagement-side query, server-side authorization, invitation scoping, content-preserving discovery transitions, and the append-only Audit Trail** are enforced and, where critical, tested.
- **Authentication stays separate from the domain.** Access/auth state, including passwords, sessions, verification, reset, and invitation-link mechanics, remains behind the provider boundary and out of consulting-domain storage.
- **AI steps are observed and costed.** Every new AI-assisted step records an Analysis Run (provider, model, prompt version, fingerprint, tokens, latency, cost, objective signals, trace reference where available) via the shared mechanism.
- **Critical behavior is tested.** Parse/validation and the relevant invariants have deterministic tests focused on business behavior.
- **No fake or misleading output.** No placeholder quality scores presented as real; no invented knowledge or facts.
- **Simplicity respected.** No premature abstraction or overengineering; the code is understandable and matches the surrounding style.
- **Reuse respected.** Existing infrastructure was extended, not rebuilt or duplicated.
- **Documentation is current.** Any documentation affected by the change was updated alongside it.
- **Naming is correct.** The ubiquitous language is used; no retired terminology; names reveal intent. Internal identifiers are English and user-facing strings are externalized (§12A).

---

## 15. Future Extensibility

These standards are written to stay valid as the roadmap advances, in the same spirit as the frozen documents' extensibility commitments.

- **New stages follow the same standards.** A new AI-assisted stage is added by supplying a prompt module, an output schema, a mapping into engagement state, and a service — reusing the shared orchestration and Analysis Run recording. No new infrastructure and no relaxation of these standards (architecture §15).
- **New domains add knowledge, not exceptions.** A new business domain is added as curated Consulting Knowledge Base content scoped by business domain; the domain-agnostic engagement code does not change, the cross-domain Technology Knowledge Base is unaffected, and these standards apply unchanged (product-vision §3; architecture §15).
- **The Technology Knowledge Base follows the same standards.** It is added as a separate module (the Phase 5A extension) behind its own retrieval port, consumed read-only by engagement stages like the Consulting Knowledge Base, and written only through the Technology Curator's human-approved path with an append-only Technology Update History. These standards — layering, one-directional reference, no autonomous writes, append-only audit history, no invented data — apply unchanged (architecture §9.2, §9.3; agent-rules §4.1).
- **Enhanced retrieval keeps the rules.** If semantic retrieval (RAG) is introduced later over the Consulting Knowledge Base, it enters behind the existing retrieval port and only changes *which* knowledge is supplied; grounding, traceability, and every standard here remain in force (roadmap Phase 11; architecture §15).
- **New providers stay behind the abstraction.** Additional models or providers are adapters behind the existing LLM abstraction; the standards for orchestration, cost, and observability are unchanged.
- **New capability inherits the access boundary; it does not extend it.** From Phase 3A, a new stage, surface, or report queries through the existing workspace-scoped repositories and asks the existing access decision point. It does not add roles, per-field permissions, or its own access checks; widening anyone's reach is a documentation decision, not an implementation choice (§6A; architecture §7A.3).
- **New languages are translation data.** Because internal identifiers are English and user-facing strings are key-based, adding a locale adds a catalogue — it touches no domain type, contract, or stored value (§12A).
- **Abstractions arrive with the second case.** New shared abstractions are introduced only when a second concrete case actually exists, never speculatively — the same rule these standards apply to today (architecture §1.6).
- **Standards evolve deliberately.** If a standard needs to change, it changes deliberately and in alignment with the frozen documentation, never by silent drift in how code is written.

---

## Assumptions

- **This is a coding-standards document, not an architecture or workflow document.** It deliberately avoids re-deciding architecture (owned by [architecture.md](./architecture.md)) and avoids implementation/Git workflow entirely, per the task scope. Where it names architectural facts, it does so only to state the coding rule that follows from them.
- **The existing stack and layout are the baseline.** Standards are written against the already-present structure (layered backend, shared contracts, Next.js client, shared AI orchestration, Analysis Run persistence, prompt versioning/fingerprinting, cost calculation, Langfuse) described in the frozen architecture, without pinning to any one framework detail so the standards survive technology change.
- **"Frozen documentation" includes agent-rules.md.** It is treated as source-of-truth alongside the other four for the purpose of these standards, per the task statement.
- **Terminology follows the frozen docs.** Engagement (not `ClientCase`) and the domain model's ubiquitous language are used throughout.
- **Language-agnostic where possible.** Standards are stated as engineering rules rather than as syntax rules for a specific language, so they apply across the codebase and remain valid as it grows.

## Files Created or Modified

- **Created:** `docs/coding-standards.md` (this document).
- **Revised (1.1):** added coding rules for the Technology Knowledge Base (separate, independent, **category-organized** module; read-only from engagements), first-class **Technology Sources**, the Technology Curator (only human-approved write path), and the append-only Technology Update History, and extended the ubiquitous-language, naming, review-checklist, and Definition-of-Done entries accordingly. Delivered as the Phase 5A extension; existing roadmap phase numbers are unchanged. No source code was written or changed as part of this documentation revision.
- **Revised (1.2):** added **§6A** (workspace scope required in repositories; server-side, deny-by-default authorization through one decision point; non-revealing denials; narrow discovery-access-scoped client endpoints; append-only Audit Trail kept distinct from the other two governance logs; isolation tested negatively) and **§12A** (no user-facing literals in components; English internal identifiers; no behavior keyed off displayed text; one locale, no locale machinery). Extended §6 with the Discovery Profile's value & measurement baseline, workflow status, and provenance rules; §7 with authentication/authorization outcomes and best-effort notifications; §9 with isolation and workflow testing; §13/§14 with the corresponding checks; and §15 with access- and locale-extensibility. Delivered by the Phase 2 Extension and Phase 3A; existing roadmap phase numbers are unchanged, and authentication/authorization are no longer Phase 11 work. No source code was written or changed as part of this documentation revision.

## Possible Conflicts with the Frozen Documentation

- **None identified.** These standards are derived from, and consistent with, the frozen documentation:
  - "Business logic in the domain," "infrastructure must not leak into the domain," inward dependencies, and "build for the phase in front of you" restate **architecture.md** §1, §3, §4 as coding rules.
  - "Reuse existing infrastructure," "every AI capability reuses Analysis Run / prompt versioning / fingerprinting / cost tracking / observability," and "each phase leaves the app working" restate **roadmap.md** Cross-cutting Capabilities and its reading rules.
  - "Follow the frozen documentation," "no invented data," "no fake quality signals," grounding, and traceability align with **product-vision.md** §6–§9, **domain-model.md** §2/§4/§5, and **agent-rules.md** §3, §11, §12.
  - "Incremental over rewritten," "refactor only for the current phase or clear debt," and "avoid premature abstraction" restate **architecture.md** §1.6, §1.10, §14, and §15.
- **Scope boundaries respected.** The document defines coding standards only. It does not restate architecture design decisions as new decisions, and it contains no implementation or Git workflow, so it does not compete with or contradict the frozen documents.
