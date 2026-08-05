# Implementation Workflow — AI Consulting Workbench

Status: **Draft** · Version: 1.2 · Derived from [product-vision.md](./product-vision.md), [domain-model.md](./domain-model.md), [roadmap.md](./roadmap.md), [architecture.md](./architecture.md), [agent-rules.md](./agent-rules.md), and [coding-standards.md](./coding-standards.md).

> **Revision 1.2 (approved).** Aligned with roadmap Revision 1.2: the **Phase 2 Extension** (value & measurement baseline, discovery draft/submitted workflow, client-completed discovery with consultant review), the new **Phase 3A — Multi-user & Client Collaboration Foundation**, and the refocusing of production readiness on deployment, monitoring, operational security, backup, recovery, and performance. Phase 3A is also the point where the dedicated auth/email boundary enters the implementation: authentication data stays separate from consulting-domain state, and the auth and email providers are treated as infrastructure behind the phase's access model. Two quality gates are added — **access control** (§13.6a) and **localization** (§13.6b) — and the phase sequence now reads Phase 0 → 1 → 2 → 3 → *Phase 2 Extension* → 3A → 4 → 5 → 5A → 6 → … → 12. The workflow itself is unchanged: every phase, new, lettered, or re-entered, passes through the same gates.
>
> **Revision 1.1 (approved).** Aligned with the introduction of the Technology Knowledge Base, Technology Curator, and Technology Update History, delivered as the **Phase 5A** extension of Phase 5. Existing roadmap phase numbers as they stood at that revision, and the MVP boundary, are unchanged by it. The workflow itself is unchanged — every phase, new and existing, passes through the same gates.

This document defines the **standard implementation process** for the AI Consulting Workbench: how roadmap phases are implemented, reviewed, and accepted. It is a **development workflow document**, not a product or architecture document.

**Scope boundary.** This document defines *the implementation workflow only*.
- It does **not** redefine product requirements. Those are owned by [product-vision.md](./product-vision.md) and [domain-model.md](./domain-model.md).
- It does **not** redefine architecture. That is owned by [architecture.md](./architecture.md).
- It does **not** define Git workflow (branching, commits, PRs, releases, versioning).
- It does **not** restate coding standards already defined in [coding-standards.md](./coding-standards.md); where a coding rule is relevant it appears only as a reference, not a re-decision.

Where a rule here reflects a frozen commitment, the frozen document remains the source of truth; this document only describes the *process* by which that commitment is realized.

---

## 1. Purpose

The purpose of this workflow is to make the execution of the roadmap **predictable, safe, and trustworthy**, so that each roadmap phase lands as a complete, working capability without redesigning the product or destabilizing what already works.

- **Turn frozen documentation into working software.** The frozen documents describe *what* is built and *how* it is structured; this workflow describes *the process* by which each roadmap phase is turned into accepted, working implementation.
- **One phase, fully done, before the next.** The workflow exists so that the product grows one complete capability at a time, each one leaving the application working, rather than through a broad, half-finished front (roadmap "How to read this roadmap"; coding-standards §2).
- **Protect the stable center.** The domain model is the most stable, most valuable part of the system (architecture §4). The workflow keeps changes incremental and reviewed so that center stays clean.
- **Make trust explicit.** Because outputs are placed in front of clients, the workflow requires that every phase be reported, reviewed, and accepted before the next one begins — trust is verified, not assumed.

This document applies equally to **human developers and AI coding agents** working in this repository.

---

## 2. Documentation-first development

**Documentation is completed before implementation.** The project is documentation-first by deliberate choice: the product is defined, the domain is modeled, the roadmap is sequenced, the architecture is decided, and the behavioral and coding rules are set *before* code for a capability is written.

- **The documentation is the source of truth; the code conforms to it.** When code and a frozen document disagree, the code is wrong (coding-standards §2). Implementation realizes the documentation; it does not discover or invent the design as it goes.
- **A phase is not started until its governing documentation is settled.** Before implementation of a roadmap phase begins, the vision, domain model, roadmap, architecture, agent-rules, and coding standards that govern it are already frozen and available. Implementation reads from them; it does not race ahead of them.
- **Design decisions live in documentation, not in code archaeology.** The intended design of a capability is found by reading the frozen documents, not by reverse-engineering the implementation. New documentation (where permitted, see §9) is written before the code it governs, not after.
- **If the documentation is insufficient to implement, that is a documentation task first.** When a phase cannot be implemented because a frozen document is silent, ambiguous, or apparently contradictory, the correct response is to raise it for a documentation decision (§9), not to improvise a design in code.

---

## 3. Frozen documentation policy

The following documents are **frozen** and are the source of truth for all implementation:

- [product-vision.md](./product-vision.md)
- [domain-model.md](./domain-model.md)
- [roadmap.md](./roadmap.md)
- [architecture.md](./architecture.md)
- [agent-rules.md](./agent-rules.md)
- [coding-standards.md](./coding-standards.md)

The policy governing them:

- **Frozen documents are authoritative and are not edited to match code.** If code diverges from a frozen document, the code is fixed — the document is not quietly rewritten to describe what the code happens to do (coding-standards §10).
- **Implementation follows the frozen documentation.** Every phase is implemented to conform to these documents. Code must not redesign the product or the architecture (coding-standards §2).
- **Documentation changes require explicit approval once documents are frozen.** A frozen document is changed only through a deliberate, explicitly approved revision — never as a side effect of an implementation change, and never by an AI coding agent on its own initiative (see §9).
- **Non-frozen documents may reflect implementation reality.** Developer setup docs, README, and environment examples are updated to match the code as it changes; only the frozen source-of-truth documents are protected from being edited to match code (coding-standards §10).

---

## 4. Phase implementation process

Roadmap phases are implemented **one at a time**, in the order the roadmap defines, and **no phase begins before the previous one is accepted** (see §7).

For each roadmap phase, the standard process is:

1. **Read the governing documentation.** Re-read the relevant sections of the frozen documents for the phase: the roadmap phase's goal, scope, Definition of Done, and success criteria, plus the domain, architecture, agent-rules, and coding standards that apply. Implementation starts from what is written, not from memory or assumption.
2. **Confirm the previous phase is accepted.** Implementation of a phase does not begin until the previous phase has passed review and been accepted (§7). Phases do not overlap or run ahead of acceptance.
3. **Establish the phase scope.** State, from the roadmap, exactly which business capability this phase delivers and what is explicitly out of scope for it (§5). Anything not required by the current phase is deferred.
4. **Implement incrementally on the existing structure.** Build the capability by extending the existing, working layout rather than rewriting it (§8; architecture §14; coding-standards §11). Reuse existing infrastructure (engagement persistence, Analysis Run recording, prompt versioning/fingerprinting, cost tracking, Langfuse) rather than rebuilding it (roadmap Cross-cutting Capabilities).
5. **Keep the application working throughout.** At no point may the phase leave the application in a broken or half-migrated state that depends on a later phase to become usable (roadmap; coding-standards §2). Each meaningful step is a safe, reversible increment.
6. **Satisfy the phase's Definition of Done.** The capability meets the roadmap phase's stated Definition of Done and success criteria, and the per-change Definition of Done in coding-standards §14, including the cross-cutting cost/observability obligation for any AI-assisted functionality (roadmap Cross-cutting Capabilities).
7. **Validate the capability end-to-end.** Confirm the capability works as the roadmap phase intends, that critical parse/validation and invariant paths are covered by deterministic tests (coding-standards §9), and that the application as a whole still works.
8. **Report the phase.** Produce the phase report described in §6.
9. **Submit for review and acceptance.** The phase enters review (§7). Only once it is accepted does the next phase begin.

This process is uniform across every roadmap phase, from Phase 0 through Phase 12 — including the **lettered extension phases** (Phase 3A, Phase 5A) and the **Phase 2 Extension**.

**Lettered phases and phase extensions follow the same process.** Phase 3A and Phase 5A are full phases in every respect: each is scoped, implemented, validated, reported, reviewed, and accepted like any other, and none begins before the phase before it in the sequence is accepted. A **phase extension** — a deliberate, approved re-entry into an already-accepted phase, such as the Revision 1.2 Phase 2 Extension — is treated as a phase for the purpose of this workflow: it is scoped to the added capability, must leave the application fully working, and is reported and accepted before the next phase begins. It is not a licence to reopen the accepted scope of that phase generally, and it does not reorder the phases around it. The sequence set by Revision 1.2 is: **Phase 0 → 1 → 2 → 3 → Phase 2 Extension → 3A → 4 → 5 → 5A → 6 → 7 → 8 → 9 → 10 → 11 → 12**, ending in **Phase 10 — Security, Privacy & AI Compliance**, **Phase 11 — RAG Enhancement over the Consulting Knowledge Base**, and **Phase 12 — Production Readiness**.

---

## 5. Scope control

Scope is controlled to the **phase in front of you**. The roadmap decides what each phase delivers; the workflow keeps implementation inside that boundary.

- **One phase delivers one complete business capability.** Implement exactly what the current roadmap phase requires and no more. Do not build ahead of need — no infrastructure, abstraction, or capability from a later phase is introduced early (architecture §1.6; coding-standards §2, §3).
- **AI coding agents must not redesign the product.** Implementation realizes the documented design; it does not reinterpret the product vision, the domain model, or the roadmap. An agent that believes the design should differ raises it for a decision (§9, §11) — it does not encode its own product design in the implementation.
- **No scope creep across phase boundaries.** Work that belongs to a later phase stays in that phase. Convenient, related, or "while we're here" changes that exceed the current phase's scope are deferred, not bundled in.
- **Out-of-scope discoveries are recorded, not silently absorbed.** When implementing a phase surfaces work that belongs elsewhere (a later phase, a documentation decision, or clear technical debt), it is noted in the phase report's remaining risks/assumptions (§6) rather than quietly expanded into.
- **Refactoring stays within the scope rule.** Refactoring is undertaken only when it directly supports the current phase or removes clearly identified debt (§8; coding-standards §11) — never for taste or speculative future needs.

---

## 6. Reporting requirements

Every phase produces a **written report** on completion. The report is how the phase is made reviewable and how trust is established before the next phase begins. Reports must clearly state, at minimum:

- **Files changed.** Which files were created, modified, or removed, and — briefly — why each changed. The reader can see the shape of the change without reading every diff.
- **Assumptions.** Every assumption made during implementation, especially any place where a frozen document was silent or ambiguous and a reasonable default was chosen. Assumptions are stated openly so a reviewer can confirm or correct them (mirroring the product's own human-in-the-loop and assumption-visibility commitments — product-vision §7; agent-rules §5).
- **Validations.** What was done to confirm the capability works: which behaviors were exercised end-to-end, what tests were added or run and their result, and how the phase's Definition of Done and success criteria were checked. If something was not validated, that is stated plainly rather than implied as done.
- **Remaining risks.** Known limitations, deferred work, technical debt introduced, out-of-scope discoveries, and anything that could affect a later phase. Risks are surfaced, not hidden.

Reports are **honest about outcomes.** If tests failed, the report says so with the evidence; if a step was skipped, the report says that; a capability is reported as done and verified only when it actually is. Overstating completeness is a reporting failure.

The report also records **any documentation decisions requested or made** during the phase (§9) and **any architectural decision that required approval** (§7), so the decision trail travels with the phase.

---

## 7. Review and acceptance process

**Code review precedes the next roadmap phase.** A phase is not "done" because its code is written; it is done when it has been **reviewed and accepted**. No roadmap phase begins before the previous one is accepted.

- **Every phase is reviewed before acceptance.** The phase's implementation and its report (§6) are reviewed against the frozen documentation and the coding-standards review checklist (coding-standards §13). Review covers: conformance to the frozen docs, correct layering, intact grounding/traceability/append-only/one-directional invariants, reuse of shared mechanisms, correct error handling, simplicity, that the app is left working, that critical behavior is tested, and that affected documentation was updated.
- **Acceptance is explicit.** A phase is accepted by an explicit decision that its Definition of Done and success criteria (roadmap) are met and that the review passed. Acceptance is a deliberate act, not the mere absence of objections.
- **Architectural decisions require explicit approval.** Any decision that is not already settled by the frozen architecture — a new seam, a new port, a deviation from a documented pattern, a change to a stable structure — requires explicit approval before it is implemented and is recorded in the phase report. AI coding agents do not make architectural decisions on their own (§11).
- **Review can send a phase back.** If review finds the phase incomplete, non-conforming, or breaking an invariant or the working state, the phase is not accepted; the issues are addressed and the phase is re-reviewed. The next phase waits.
- **Only acceptance unlocks the next phase.** The sequential guarantee (one phase at a time, none before the previous is accepted) is enforced at this gate.

This process is a project acceptance workflow; it is intentionally kept separate from Git/PR mechanics, which are out of scope for this document.

---

## 8. Refactoring policy

**Implementation is incremental rather than rewritten.** The existing, working layout is extended; it is not replaced wholesale (architecture §3, §14; coding-standards §11).

- **Prefer small, safe, reversible change.** Extend the existing structure with focused increments rather than large rewrites. Each increment leaves the application working.
- **Refactor only for the current phase or clear debt.** Refactoring is legitimate only when it directly supports the phase in front of you or removes concrete, identified technical debt — never for style preference or speculative future needs (coding-standards §11).
- **Separate refactoring from behavior change in intent.** A refactor preserves behavior; a behavior change is stated as such. Opportunistic, unrelated rewrites are not bundled into a behavioral change (coding-standards §11).
- **Move logic toward its correct layer, incrementally.** Lifting business logic out of services into the explicit domain layer is an expected, ongoing refinement (architecture §14 notes), done incrementally as stages are built — never as a big-bang extraction.
- **Never weaken an invariant to simplify.** No refactor may remove or weaken a grounding, traceability, append-only-report, or engagement→knowledge separation invariant, and none may reduce test coverage of critical behavior (coding-standards §11).
- **A refactor leaves the app working.** At completion the application is fully working; a refactor never requires a later phase to become usable again (roadmap).

---

## 9. Documentation update policy

**Documentation changes require explicit approval once documents are frozen.** The frozen documents change only through a deliberate, approved revision.

- **Frozen documents are not edited as a side effect of implementation.** Implementation never quietly rewrites a frozen document to match what the code does. If code diverges from a frozen document, the code is fixed (coding-standards §10).
- **Changing a frozen document is an explicit, approved decision.** When implementation reveals a genuine need to change the product, domain, roadmap, architecture, agent-rules, or coding standards, that change is proposed and **explicitly approved** as a documentation decision *before* the implementation that relies on it proceeds. AI coding agents do not modify frozen documentation on their own initiative (§11).
- **Documentation-first still applies to changes.** An approved change to a frozen document is made *before* the code that depends on it, preserving documentation-first development (§2).
- **Non-frozen documentation is kept current with the code.** Developer setup docs, README, and environment examples are updated in the same change that alters the behavior, structure, or setup they describe, so a developer can always get the project running from the documentation alone (coding-standards §10; roadmap Phase 0).
- **Documentation affected by a phase is updated within that phase.** Any documentation that a phase's change affects is updated as part of that phase (coding-standards §13), and the update is noted in the phase report (§6).

---

## 10. Definition of Done for a roadmap phase

A roadmap phase is **done** only when all of the following hold. This complements — and does not replace — the roadmap phase's own Definition of Done and the per-change Definition of Done in coding-standards §14.

- **The roadmap phase's own Definition of Done and success criteria are met.** The specific criteria the roadmap states for that phase are satisfied.
- **Implementation conforms to the frozen documentation.** The phase respects the vision, domain model, roadmap intent, architecture, agent-rules, and coding standards; it does not redesign the product or architecture.
- **The application is fully working.** The capability works end-to-end and leaves the whole application working — not a partial slice awaiting a later phase (roadmap; coding-standards §2, §14).
- **The change is incremental, not a rewrite.** The phase extended the existing structure and reused existing infrastructure rather than rebuilding it (§8; roadmap Cross-cutting Capabilities).
- **Invariants hold.** Grounding/traceability, one-directional engagement→knowledge reference, append-only report versions, and "failed AI generation does not mutate engagement state" are enforced and, where critical, tested (coding-standards §6, §14).
- **AI-assisted steps are observed and costed.** Every new AI-assisted step records an Analysis Run (provider, model, prompt version, fingerprint, tokens, latency, cost, objective signals, trace reference where available) through the shared mechanism (roadmap Cross-cutting Capabilities; architecture §8).
- **Access control holds** *(from Phase 3A)*. Everything the phase adds is workspace-scoped and authorized server-side through the shared decision point, deny-by-default; client-facing surface stays discovery-access-scoped; access- and collaboration-relevant events are audited; and the isolation is covered by tests that prove the denials, not only the permitted paths (roadmap Cross-cutting Capabilities; architecture §7A; coding-standards §6A).
- **User-facing surface is localizable.** Any user-facing string the phase adds is externalized, internal identifiers remain English, and no behavior keys off displayed text (architecture §7.1; coding-standards §12A).
- **Critical behavior is tested.** Parse/validation and relevant invariant paths have deterministic tests focused on business behavior (coding-standards §9).
- **No fake or misleading output.** No placeholder quality scores presented as real; no invented knowledge or facts (roadmap Phase 0; agent-rules §12).
- **The phase is reported.** A report per §6 (files changed, assumptions, validations, remaining risks) exists and is honest about outcomes.
- **Affected documentation is current.** Any documentation the phase affects has been updated, and any frozen-document change it relied on was explicitly approved (§9).
- **The phase is reviewed and accepted.** Code review has passed and the phase has been explicitly accepted (§7) before the next phase begins.

---

## 11. AI coding agent responsibilities

AI coding agents are held to the same workflow as human developers, with these responsibilities made explicit:

- **Implement the documented design; do not redesign the product.** An AI coding agent realizes what the frozen documentation specifies. It must not reinterpret the product vision, reshape the domain model, reorder the roadmap, or redesign the architecture in code (coding-standards §2; §5 above).
- **Follow the frozen documentation.** The frozen documents are the source of truth. When code and a frozen document disagree, the agent treats the code as wrong (coding-standards §2).
- **Do not make architectural decisions unilaterally.** Any decision not already settled by the frozen architecture requires explicit human approval before implementation (§7). The agent surfaces the decision; it does not make it.
- **Do not modify frozen documentation on its own initiative.** Changes to frozen documents require explicit approval (§9). The agent may *propose* a change but never enacts one unasked.
- **Stay within the current phase.** The agent implements the phase in front of it and defers anything belonging to a later phase (§5). It builds for the phase in front of it, avoiding premature abstraction (architecture §1.6; coding-standards §3).
- **Surface assumptions, gaps, and uncertainty.** Where the documentation is silent or ambiguous, the agent states the assumption it is making and, when the decision is genuinely the human's, asks rather than guessing (§2, §6). This mirrors the product's own honesty-about-uncertainty commitments (agent-rules §5, §6).
- **Report honestly.** The agent produces the phase report (§6) and reports outcomes faithfully: failing tests are shown, skipped steps are stated, and work is called done only when it is verified.
- **Reuse, do not reinvent.** The agent extends existing infrastructure and shared mechanisms rather than introducing parallel ones (roadmap Cross-cutting Capabilities; coding-standards §8).

> Note: behavioral rules for AI acting *inside the product* (during an engagement) are governed by [agent-rules.md](./agent-rules.md). This section governs AI agents *writing the code* — a distinct role. Both are held to honesty, non-redesign, and human-in-the-loop principles.

---

## 12. Human responsibilities

The human developer/reviewer remains the decision-maker and owner of the implementation workflow.

- **Own the frozen documentation.** Humans decide what the frozen documents say and approve any change to them (§9). Documentation-first development is a human commitment.
- **Approve architectural decisions.** Any decision not settled by the frozen architecture is made — explicitly — by a human before it is implemented (§7).
- **Review and accept each phase.** Humans review the phase against the frozen documentation and the coding-standards checklist, and explicitly accept it before the next phase begins (§7). Acceptance is a human act.
- **Answer the questions implementation raises.** When an AI coding agent (or another developer) surfaces an assumption, a gap, or a decision that is genuinely the human's, the human resolves it rather than leaving it to be guessed (§2, §11).
- **Enforce scope and sequencing.** Humans keep implementation to the phase in front of it, prevent scope creep across phase boundaries, and uphold the "one phase at a time, none before the previous is accepted" guarantee (§4, §5, §7).
- **Own outward-facing and irreversible actions.** Anything hard to reverse or client-facing is a human decision, consistent with the product's own human-in-the-loop stance (product-vision §7; agent-rules §2).

---

## 13. Quality gates

A phase passes through a series of **quality gates** on its way to acceptance. A phase does not advance past a gate until that gate is satisfied; the final gate unlocks the next roadmap phase.

1. **Documentation gate.** The governing frozen documentation for the phase is settled, and any frozen-document change the phase depends on has been explicitly approved (§2, §9). Implementation does not start otherwise.
2. **Scope gate.** The phase's business capability and its out-of-scope boundary are stated, and implementation stays within them (§5).
3. **Working-application gate.** The application remains working throughout the phase and is fully working at its completion — nothing is left half-migrated depending on a later phase (§4, §8; coding-standards §2).
4. **Conformance gate.** The implementation conforms to the frozen documentation — correct layering, intact invariants (grounding/traceability, one-directional knowledge reference, append-only reports, failed-generation-does-not-mutate-state), reuse of shared mechanisms, and no product/architecture redesign (coding-standards §13, §14).
5. **AI-observability gate.** Every new AI-assisted step records an Analysis Run with cost, tokens, latency, provider, model, prompt version, and fingerprint, and is traced — the non-negotiable cross-cutting obligation (roadmap Cross-cutting Capabilities; architecture §8).
6. **Testing gate.** Critical parse/validation and invariant paths are covered by deterministic tests, and the capability is validated end-to-end (coding-standards §9).
6a. **Access-control gate** *(applies from Phase 3A onward).* Everything the phase adds is workspace-scoped in persistence and authorized server-side through the shared decision point, deny-by-default and non-revealing; client-facing surface stays discovery-access-scoped and narrow; access- and collaboration-relevant events (including denials) are audited in the append-only Audit Trail, which is not conflated with Analysis Runs or the Technology Update History; and isolation is proven by tests of the *denials* (roadmap Cross-cutting Capabilities; architecture §7A; coding-standards §6A). A phase that adds reachable data without passing this gate is not accepted.
6b. **Localization gate** *(applies to any phase adding user-facing surface).* User-facing strings are externalized and localizable, internal identifiers/enums/events/audit entries remain English, no behavior keys off displayed text, and entered content is not machine-translated (architecture §7.1; coding-standards §12A).
7. **Reporting gate.** The phase report exists and honestly states files changed, assumptions, validations, and remaining risks (§6).
8. **Review-and-acceptance gate.** Code review has passed and the phase is explicitly accepted (§7). Only this gate unlocks the next phase.

These gates restate obligations already set by the frozen documentation as a sequence of checkpoints for the workflow; they do not introduce new product or architecture requirements.

---

## 14. Working principles

The stable principles that govern how implementation is carried out under this workflow:

- **Documentation first.** Documentation is completed and settled before the implementation it governs (§2).
- **Frozen documentation is the source of truth.** Implementation conforms to it; code that disagrees is wrong; frozen documents change only by explicit approval (§3, §9).
- **One phase at a time.** Roadmap phases are implemented sequentially; none begins before the previous is accepted (§4, §7).
- **Every phase leaves the application working.** No phase is a partial slice that needs a later phase to become usable (§8, §13; roadmap).
- **Incremental, not rewritten.** Change extends the existing structure in small, safe, reversible steps; existing infrastructure is reused, not rebuilt (§8; coding-standards §11).
- **Do not redesign the product or architecture.** Implementation realizes the documented design; architectural decisions require explicit approval (§5, §7, §11).
- **Build for the phase in front of you.** No abstraction or capability is built ahead of the phase that needs it (§5; architecture §1.6).
- **Honesty over polish.** Assumptions, gaps, uncertainty, and failures are surfaced in reports; work is called done only when verified (§6, §11).
- **Trust is verified, not assumed.** Each phase is reviewed and explicitly accepted before the next begins (§7, §13).
- **Reuse before reinvention.** Shared mechanisms (Analysis Run, prompt versioning/fingerprinting, cost tracking, observability, engagement persistence) are extended, never duplicated (roadmap Cross-cutting Capabilities).

---

## 15. Future evolution of the workflow

This workflow is written to remain valid as the roadmap advances, in the same spirit as the frozen documents' extensibility commitments.

- **The workflow applies unchanged to every phase.** From Phase 0 through Phase 12, including the lettered phases (3A, 5A) and approved phase extensions, and any later work, the same process (read the docs → confirm previous phase accepted → scope → implement incrementally → keep the app working → satisfy Definition of Done → validate → report → review and accept) applies. New phases inherit it without exception.
- **New kinds of work inherit the same gates.** New methodology stages, new domains added as curated consulting knowledge, the Technology Knowledge Base and its Technology Curator (the Phase 5A extension), the multi-user and client-collaboration foundation (Phase 3A), enhanced retrieval (RAG), new providers, and production-readiness work all pass through the same quality gates (§13) and the same reporting and acceptance process (§6, §7). (Note: the **Draft / Submit / Return** review a consultant performs on a client's discovery submission is a *runtime product behavior*, distinct from this document's phase-acceptance review — as is the Technology Curator's approval gate below.) (Note: the **report publication / revocation** flow in the Client Portal — a Manager publishing a report version, the system notifying the client, and the client later downloading the PDF — is likewise a runtime product behavior, distinct from this document's phase-acceptance review.) (Note: the Technology Curator's *product* approval gate — a human approving a Technology Update Proposal before the Technology Knowledge Base changes, with each approved change appended to the Technology Update History — is a runtime product behavior, distinct from this document's phase-acceptance review.)
- **The workflow itself evolves deliberately.** If this workflow needs to change, it changes deliberately and by explicit decision — not by silent drift in how phases are executed. Because this document is not one of the frozen source-of-truth documents, it may be revised as the team learns, but revisions are made openly and in alignment with the frozen documentation, never in conflict with it.
- **Alignment with the frozen docs is preserved.** Any future revision of this workflow keeps it consistent with the product vision, domain model, roadmap, architecture, agent-rules, and coding standards. If a change here would require changing a frozen document, that frozen-document change follows the explicit-approval policy (§9) first.

---

## Assumptions

- **This is a workflow document, not a product, architecture, or coding-standards document.** It deliberately avoids redefining product requirements (owned by [product-vision.md](./product-vision.md) and [domain-model.md](./domain-model.md)) and architecture (owned by [architecture.md](./architecture.md)), and it does not restate coding standards already set in [coding-standards.md](./coding-standards.md). Where it references those, it does so only to describe the *process* around them.
- **Git workflow is intentionally out of scope.** Branching, commits, pull requests, releases, and versioning are not defined here, per the task. "Review" in this document means the project's phase acceptance review (conformance to the frozen docs and Definition of Done), kept separate from any Git/PR mechanics.
- **"Frozen documentation" includes all six listed documents.** product-vision, domain-model, roadmap, architecture, agent-rules, and coding-standards are all treated as source-of-truth and frozen for the purpose of this workflow, per the task statement. This workflow document is itself *not* frozen and may be revised deliberately (§15).
- **"Phase" means a roadmap phase.** Phase sequencing and Definition of Done refer to the phases defined in [roadmap.md](./roadmap.md) (Phase 0 through Phase 12, including the lettered Phase 3A and Phase 5A), together with its Cross-cutting Capabilities. An approved **phase extension** (a deliberate re-entry into an accepted phase, such as the Revision 1.2 Phase 2 Extension) is treated as a phase for the purposes of scoping, reporting, and acceptance (§4).
- **Roles are distinct.** "AI coding agent" here means an agent *writing code in this repository*; the AI acting *inside the product during an engagement* is governed separately by [agent-rules.md](./agent-rules.md). Both are held to non-redesign, honesty, and human-in-the-loop principles.
- **Authentication stays out of consulting-domain state.** Phase 3A introduces the auth/email boundary as infrastructure work; this workflow treats password handling, verification, reset, and invitation delivery as implementation details behind the phase's access model, not as consulting-domain state.
- **Terminology follows the frozen docs.** Engagement (not the legacy `ClientCase`) and the domain model's ubiquitous language are used throughout.

## Files Created or Modified

- **Created:** `docs/implementation-workflow.md` (this document).
- **Revised (1.1):** noted that the Technology Knowledge Base, Technology Curator, and Technology Update History (delivered as the Phase 5A extension) inherit the same quality gates. Existing roadmap phase numbers at that time and the MVP boundary were unchanged. No source code was written or changed as part of this documentation revision.
- **Revised (1.2):** aligned the workflow with roadmap Revision 1.2 — recorded the phase sequence including **Phase 3A** and the **Phase 2 Extension**, defined how a **phase extension** (an approved re-entry into an accepted phase) is handled under the same process (§4), added the **access-control gate (§13.6a)** and **localization gate (§13.6b)**, extended the phase Definition of Done (§10) accordingly, and noted that the consultant's Draft/Submit/Return review is a runtime product behavior distinct from phase-acceptance review (§15). No source code was written or changed as part of this documentation revision.

## Possible Conflicts with the Frozen Documentation

- **None identified.** This document was written to be strictly derived from, and consistent with, the frozen documentation:
  - "Documentation first," "implementation follows the frozen documentation," and "frozen documents are not edited to match code" restate **coding-standards.md** §2 and §10.
  - "One phase at a time," "no phase begins before the previous is accepted," "each phase leaves the application working," and "one complete business capability per phase" restate **roadmap.md** "How to read this roadmap" and its per-phase Definitions of Done.
  - "Incremental rather than rewritten," "refactor only for the current phase or clear debt," and "build for the phase in front of you" restate **architecture.md** §1.6, §3, §14, §15 and **coding-standards.md** §3, §11.
  - "AI coding agents must not redesign the product," "architectural decisions require explicit approval," and "reuse existing infrastructure" restate **coding-standards.md** §2, §8 and **architecture.md** §1.5.
  - "Reports must state files changed, assumptions, validations, and remaining risks" and "documentation changes require explicit approval once frozen" express the workflow around **coding-standards.md** §10 and the product's own assumption/uncertainty-visibility commitments (**product-vision.md** §7; **agent-rules.md** §5).
- **Scope boundaries respected.** The document defines the implementation workflow only. It does not redefine product requirements, does not redefine architecture, does not define Git workflow, and does not restate coding standards as new decisions — so it does not compete with or contradict the frozen documents.
