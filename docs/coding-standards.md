# Coding Standards — AI Consulting Workbench

Status: **Draft** · Version: 1.0 · Derived from [product-vision.md](./product-vision.md), [domain-model.md](./domain-model.md), [roadmap.md](./roadmap.md), [architecture.md](./architecture.md), and [agent-rules.md](./agent-rules.md).

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

- **Use the ubiquitous language.** Name types and operations with the domain vocabulary exactly as defined (Engagement, Organization, Discovery Profile, Assessment, Opportunity, Recommendation, Implementation Roadmap, Consultant Report, Knowledge Base, AI Use Case, Solution Pattern, Analysis Run). Do not use the legacy `ClientCase` name for new engagement concepts.
- **Engagement is the aggregate root for client state.** Client-specific state (discovery, assessment and its dimensions, opportunities, recommendations, roadmap, report versions) is owned by the Engagement. Nothing client-specific lives outside an engagement (architecture §4.2).
- **Assessment dimensions are values, not entities.** Business Process, Data, Technology, AI Readiness, Risks, and Opportunities are dimensions *within* the Assessment. Do not model AI Readiness (or any dimension) as a separate top-level entity (domain-model §2; architecture §4.2).
- **Grounding is a domain invariant.** A Recommendation is valid only if it is traceable backward to Discovery facts and outward to the Knowledge Base knowledge that justifies it. Code should enforce "recommendation without grounding is invalid" as a validation rule, not treat it as optional (architecture §4.3, §9; agent-rules §3, §11).
- **One-directional reference to knowledge.** Engagement code may read knowledge and copy the reasoning it used into engagement content, but must never write to or mutate the Knowledge Base. There must be no code path from running an engagement to modifying knowledge (domain-model §4; architecture §9; agent-rules §4).
- **Reports are append-only versions.** Producing a new Consultant Report version must never destroy or overwrite a prior one (architecture §4.3).
- **Stages are transformations of persisted state.** A stage takes persisted engagement state to new engagement state, so it can be re-entered and re-run without restarting the engagement. Do not hold engagement state in the backend between requests (architecture §2, §4.3).
- **Keep the domain pure.** Domain code contains no I/O, no persistence, no prompts, no provider calls. Side effects belong to application/infrastructure.

---

## 7. Error Handling Standards

The error-handling *strategy* is set in architecture §13. These are the coding rules that implement it consistently; this is not a redesign of that strategy.

- **Validate external input at the interface layer.** Reject invalid requests at the boundary with a structured error; invalid input must never reach the domain.
- **Treat AI output failure as a domain-meaningful outcome, not an exception.** A parse or schema-validation failure of AI output returns a structured failure result to the caller; it is not thrown as an unhandled error (architecture §5, §13).
- **Failed AI generation never mutates engagement state.** If an AI-assisted step fails parsing, validation, or provider execution, the previous engagement state remains unchanged and no partial or invalid output is persisted (architecture §13; agent-rules §10, §14).
- **The audit trail survives failure.** A failed AI-assisted step is still recorded as an Analysis Run (with the error), and observability is still flushed. Never drop the record on the error path (architecture §5, §13).
- **Side effects are best-effort and non-blocking.** Observability, tracing, and cost recording must never fail a consultant's operation; wrap them so their failure is logged and swallowed, not propagated (architecture §11, §13).
- **Fail with meaning.** Surface errors that tell the consultant what happened ("no draft yet / try again," with a reason), not opaque stack traces. Do not swallow errors that the caller needs to act on.
- **No silent catches.** Never catch an error and continue as if nothing happened, except for the explicitly best-effort side effects above. Every other caught error is handled or surfaced.

---

## 8. AI Integration Standards

Every AI-assisted capability is built on the shared mechanisms that already exist. This section is about writing that code correctly; the AI's *behavior* is governed by [agent-rules.md](./agent-rules.md).

- **Every new AI capability reuses the shared mechanisms.** Any new AI-assisted step must go through the shared AI orchestration path and reuse the existing **Analysis Run** recording, **prompt versioning**, **prompt fingerprinting**, **cost tracking**, and **observability** mechanisms. Do not introduce a separate orchestration, logging, cost, or tracing path (roadmap Cross-cutting Capabilities; architecture §5, §8; agent-rules §11).
- **Record every AI-assisted step as an Analysis Run.** No AI functionality ships without capturing provider, model, prompt version, prompt fingerprint, input/output/total tokens, latency, cost, objective quality signals, and — where available — a trace reference. This is a non-negotiable acceptance condition (roadmap Cross-cutting Capabilities; architecture §8).
- **A new stage supplies only its three specifics.** To add an AI stage, provide its prompt module, its output schema, and how the parsed result maps into engagement state. The surrounding call → parse → evaluate → record → trace flow is shared and reused, not re-implemented (architecture §5, §15).
- **Prompts are versioned, fingerprinted assets.** Each stage has its own prompt module carrying a human-readable version and a content fingerprint, recorded on every run. Pair each prompt with its output schema so contract and parser stay in lockstep (architecture §10).
- **Ground by construction.** Retrieved knowledge is passed *into* the prompt so the model reasons over supplied knowledge rather than inventing it, and grounding references are captured on the produced content. Do not generate recommendations without passing knowledge through the pipeline (architecture §5, §9; agent-rules §3, §12).
- **Persist AI output as an editable draft.** Validated AI output is stored as engagement state marked as an unreviewed draft; a re-run must not silently overwrite consultant edits (architecture §5, §7; agent-rules §10).
- **No fake quality signals.** Do not present placeholder or hard-coded quality scores as real evaluation. Store only objective signals (parse success, schema validity, tokens, cost, latency) unless a genuine evaluator produced the subjective ones (roadmap Phase 0; architecture §5).
- **Provider changes stay behind the abstraction.** New models or providers are added as adapters behind the existing LLM abstraction; orchestration, cost, and observability code is unchanged (architecture §15).

---

## 9. Testing Standards

- **Tests should focus on business behavior.** Test what a capability *does* for the consultant and what invariants must hold, not incidental implementation details. A test should survive a refactor that preserves behavior.
- **Cover the critical trust paths.** Prioritize tests for parsing and validation of external input and AI output, grounding/traceability invariants, "failed AI step does not mutate state," append-only report versioning, and the one-directional knowledge reference. These are where a defect harms client trust.
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
- **One word, one meaning.** Do not use one term for two concepts or two terms for one. Avoid reintroducing retired names (`ClientCase`) for current concepts (Engagement).
- **Names reveal intent.** Prefer descriptive, unabbreviated names that state purpose over short or clever ones. A reader should not need to open a function to know roughly what it does.
- **Match existing casing and style conventions.** Follow the casing, file-naming, and identifier conventions already used in the surrounding code and directory; do not introduce a competing style.
- **Distinguish the layers in naming.** Ports/interfaces, application services, domain types, and infrastructure adapters should be named so their role and layer are recognizable, consistent with the existing patterns.
- **Prompt and schema naming stays paired and versioned.** A stage's prompt module and its output schema are named so their pairing and the active version are obvious (architecture §10).
- **No misleading names.** A name must not imply behavior the code does not have (e.g., a "get" that writes, an "evaluate" that returns a hard-coded value).

---

## 13. Code Review Checklist

Every change — whether written by a human or an AI coding agent — should be checked against this list before it is considered complete. (This is a quality checklist, not a Git or PR workflow.)

- **Conforms to the frozen docs.** The change respects product-vision, domain-model, roadmap, architecture, and agent-rules; it does not redesign the product or architecture.
- **Right layer.** Business logic is in the domain; orchestration in the application layer; no infrastructure types leak into the domain; dependencies point inward.
- **Grounding and traceability intact.** Recommendations remain grounded and traceable; no code path lets an engagement mutate the Knowledge Base; report versions remain append-only.
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
- **Invariants hold.** Grounding/traceability, one-directional knowledge reference, append-only report versions, and "failed generation does not mutate state" are enforced and, where critical, tested.
- **AI steps are observed and costed.** Every new AI-assisted step records an Analysis Run (provider, model, prompt version, fingerprint, tokens, latency, cost, objective signals, trace reference where available) via the shared mechanism.
- **Critical behavior is tested.** Parse/validation and the relevant invariants have deterministic tests focused on business behavior.
- **No fake or misleading output.** No placeholder quality scores presented as real; no invented knowledge or facts.
- **Simplicity respected.** No premature abstraction or overengineering; the code is understandable and matches the surrounding style.
- **Reuse respected.** Existing infrastructure was extended, not rebuilt or duplicated.
- **Documentation is current.** Any documentation affected by the change was updated alongside it.
- **Naming is correct.** The ubiquitous language is used; no retired terminology; names reveal intent.

---

## 15. Future Extensibility

These standards are written to stay valid as the roadmap advances, in the same spirit as the frozen documents' extensibility commitments.

- **New stages follow the same standards.** A new AI-assisted stage is added by supplying a prompt module, an output schema, a mapping into engagement state, and a service — reusing the shared orchestration and Analysis Run recording. No new infrastructure and no relaxation of these standards (architecture §15).
- **New domains add knowledge, not exceptions.** A new business domain is added as curated Knowledge Base content scoped by business domain; the domain-agnostic engagement code does not change, and these standards apply unchanged (product-vision §3; architecture §15).
- **Enhanced retrieval keeps the rules.** If semantic retrieval (RAG) is introduced later, it enters behind the existing retrieval port and only changes *which* knowledge is supplied; grounding, traceability, and every standard here remain in force (roadmap Phase 10; architecture §15).
- **New providers stay behind the abstraction.** Additional models or providers are adapters behind the existing LLM abstraction; the standards for orchestration, cost, and observability are unchanged.
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
- **Modified:** none. No source code was written or changed. No existing documentation was modified; the frozen documents (`product-vision.md`, `domain-model.md`, `roadmap.md`, `architecture.md`, `agent-rules.md`) were read only.

## Possible Conflicts with the Frozen Documentation

- **None identified.** These standards are derived from, and consistent with, the frozen documentation:
  - "Business logic in the domain," "infrastructure must not leak into the domain," inward dependencies, and "build for the phase in front of you" restate **architecture.md** §1, §3, §4 as coding rules.
  - "Reuse existing infrastructure," "every AI capability reuses Analysis Run / prompt versioning / fingerprinting / cost tracking / observability," and "each phase leaves the app working" restate **roadmap.md** Cross-cutting Capabilities and its reading rules.
  - "Follow the frozen documentation," "no invented data," "no fake quality signals," grounding, and traceability align with **product-vision.md** §6–§9, **domain-model.md** §2/§4/§5, and **agent-rules.md** §3, §11, §12.
  - "Incremental over rewritten," "refactor only for the current phase or clear debt," and "avoid premature abstraction" restate **architecture.md** §1.6, §1.10, §14, and §15.
- **Scope boundaries respected.** The document defines coding standards only. It does not restate architecture design decisions as new decisions, and it contains no implementation or Git workflow, so it does not compete with or contradict the frozen documents.
