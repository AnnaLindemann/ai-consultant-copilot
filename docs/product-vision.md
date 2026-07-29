# Product Vision — AI Consulting Workbench

Status: **Frozen** · Version: 1.2 · This document defines the product vision only. It does not define software architecture, roadmap, or implementation details.

> **Revision 1.2 (approved).** Extends the vision in three ways, changing no existing principle:
> - **The workbench becomes multi-user and workspace-bounded.** A **Workspace** is the ownership boundary; users hold one of three roles — **Administrator**, **Manager**, **Client** — and a **Client** takes part in exactly one thing: completing the Discovery form associated with their own self-registration, through a bounded **Client Discovery Portal** (§4A).
> - **Discovery is quantified and reviewable.** Discovery captures what the client's problem costs today and what success would measurably look like, and moves through a **draft / submit / return** review workflow whether the consultant or the client filled it in (§5).
> - **The MVP ships in German, on an internationalization-ready foundation** (§8A).
>
> **Revision 1.1 (approved).** Introduces a separate **Technology Knowledge Base** alongside the existing **Consulting Knowledge Base**, and the **Technology Curator** workflow that updates it under explicit human approval, keeping an audit history of approved updates. The Technology Knowledge Base is **hierarchical and category-based**, and updates are attributed to explicit **Technology Sources** (official vendor origins). No other part of the vision, and no existing principle, is changed.

---

## 1. What we are building

An **AI Consulting Workbench**: a real working tool that an AI Consultant uses *during* customer engagements.

This is **not** an AI-engineering demonstration. Success is measured by whether a consultant can run a real engagement faster and produce a more defensible deliverable — not by how many AI techniques are showcased. Every capability exists to support the consultant's real work.

The workbench assists the consultant through a structured consulting methodology, grounds its recommendations in a reusable knowledge base, and produces a professional, client-ready report.

---

## 2. Who it is for

The primary user is an **AI Consultant** engaged by a client to identify and recommend AI opportunities in the client's operations. The consultant remains the expert and the decision-maker at all times; the tool accelerates and structures their work, it does not replace their judgment.

Consultants rarely work entirely alone, and clients hold information the consultant needs. The product therefore supports **a consulting team working side by side inside a Workspace**, and **a bounded form of client participation**: a self-registered client may complete the Discovery form for their own engagement and nothing else. The consultant remains the only person who decides what the engagement concludes (§4A).

---

## 3. First domain: Customer Operations

The first supported business domain is **Customer Operations**. Initial scope:

- Email Support
- Customer Service
- Call Centers
- Live Chat
- Help Desk
- CRM
- Ticket Management
- Booking & Reservations
- Guest Communication
- Sales Support

**Hotels are only one possible customer domain**, not the product's focus. Guest Communication and Booking & Reservations are included because they are common Customer-Operations functions, not because the product is hospitality-specific.

**Extensibility principle.** The architecture must allow additional domains (HR, Finance, Legal, Manufacturing, and others) to be added later **without redesigning the system**. In practice this means a domain is a self-contained unit — its taxonomy, discovery questions, assessment criteria, and knowledge base scope — added alongside Customer Operations rather than replacing it. Only Customer Operations is implemented first; the multi-domain abstraction is not built ahead of the second domain.

---

## 4. Core entity: Engagement

The primary business entity is the **Engagement**. It replaces the previous `ClientCase` concept.

- An **Organization** is the client company.
- One organization may have **multiple engagements**.
- An **Engagement** represents an entire consulting engagement — from discovery through the final report — and is the unit of work the consultant opens, saves, resumes, and returns to.

An engagement holds all the client-specific state produced during the methodology: discovery answers, assessment findings, prioritized problems, recommendations, roadmap, and report versions.

Every engagement belongs to exactly one **Workspace** and has exactly one **owning Manager** (§4A).

---

## 4A. Workspace, roles, and client participation

*(Revision 1.2. Lettered so existing section numbers are unchanged.)*

The workbench holds real client information, and more than one person touches it. Three commitments follow.

**The Workspace is the ownership boundary.** A Workspace is one consulting practice's own space: its users, its client organizations, its engagements, and everything those engagements contain. **Nothing crosses a workspace boundary** — not a record, not a listing, not a search result, not a cost total.

**Three roles, deliberately few.**

- **Administrator** — sees **all engagements in their own workspace** and manages that workspace's people, roles, engagement ownership, and client access associations.
- **Manager** — the consultant role. Runs engagements and sees **only the engagements they own**. A colleague's engagement is not theirs to open.
- **Client** — an external participant with **no access to the workbench**. A client reaches exactly one thing: the **Discovery form of the engagement they are associated with after self-registration**.

The role identifiers are `ADMIN`, `MANAGER`, and `CLIENT`; this document uses the human-readable role names above when reading more naturally.

**Client participation is bounded and self-registered.** A client contributes through self-registration to one engagement's Discovery, in a dedicated **Client Discovery Portal** that shows them their own discovery form and nothing else — no assessment, no opportunities, no recommendations, no roadmap, no report, no other engagement, no other client. The client contributes facts; the consultant decides what the engagement makes of them.

**Authentication is separate from consulting domain state.** The product keeps authentication data, sessions, verification, password reset, and invitation handling behind a dedicated infrastructure boundary. Clients self-register, confirm their email, and create their own password. Managers and additional administrators are created by an administrator and receive an invitation link to set their own password. The first administrator is created through a secure bootstrap process. Administrators never create, know, store, or view users' permanent passwords.

**Access is decided by the system, not by the screen.** What a person may see and do is enforced by the product itself, on every action. Hiding a button is not a safeguard. And because client work is at stake, the product keeps a permanent record of the events that matter — who was invited, who submitted, who returned, who accepted, who was denied.

This is an ownership and confidentiality model, not an administration product: the roles are few by design, and the workbench does not become an identity or permission-management system (see §10).

---

## 5. Consulting methodology (the workflow)

The consultant works through the following methodology:

1. Client Discovery
2. Business Assessment
3. AI Readiness Assessment
4. Problem Prioritization
5. Knowledge Base Retrieval
6. Solution Matching
7. Implementation Roadmap
8. Consultant Report
9. Follow-up Questions

**This is the consulting methodology, not the software architecture.** These nine steps describe how a consultant thinks and works. They do not require nine modules, nine services, or nine separate AI calls, and they must not be implemented as a rigid one-directional pipeline.

**The workflow is repeatable and iterative.** Consultants may return to earlier stages multiple times within a single engagement — revising discovery after assessment, re-prioritizing after knowledge-base retrieval, or re-running solution matching with corrected assumptions. Each stage operates on persisted engagement state that can be re-entered and re-run without restarting the engagement.

**Discovery quantifies the problem, and can be completed by the client.** *(Revision 1.2.)* Client Discovery captures not only what is wrong but **what it costs and what success would measurably look like**: business impact; how often errors occur, how severe they are, and what they cost; the KPIs the client already tracks; today's baseline figures; the target figures that would count as success; how each figure is measured; and where it came from. Where the client cannot answer, **that absence is itself recorded as a finding** — an unmeasured process is something the consultant must know, not an empty field to pass over. An estimate is never presented as a measurement.

Discovery may be filled in by the consultant or **by the client themselves**, and it moves through a simple review workflow: worked on as a **draft**, **submitted** when the contributor is finished, **returned** with the consultant's notes if it needs more, and **accepted** once the consultant has reviewed it. **Nothing a client submits becomes the engagement's accepted fact until the consultant has reviewed it** — the same human-in-the-loop rule that governs AI output (§7).

---

## 6. Knowledge Bases

The product relies on **two separate, reusable knowledge bases**. Both are core product capabilities — not document libraries and not side features — and both are shared across engagements so the product compounds in value over time. They are kept **independent of each other** because they change at very different rates.

### 6.1 Consulting Knowledge Base

The **Consulting Knowledge Base** holds the **structured, reusable consulting knowledge** that is the consultant's accumulated methodology expertise. It changes slowly and deliberately, through human curation. It stores:

- AI use cases
- Solution patterns
- Implementation patterns
- Customer Operations taxonomy
- Best practices
- Risks
- ROI guidance
- Discovery questions
- Assessment criteria
- Follow-up question templates

### 6.2 Technology Knowledge Base

The **Technology Knowledge Base** is a **separate, reusable subsystem describing the AI technologies** a solution might use. It is **hierarchical and category-based, not a flat list of profiles**: individual technology descriptions are organized under technology **categories** such as:

- AI Models
- AI Providers
- Embedding Models
- Speech
- OCR
- Vector Databases
- Rerankers
- MCP Servers
- Browser / Computer Use
- Workflow Engines
- Evaluation Frameworks
- Monitoring
- Deployment Patterns

Within a category, each entry describes a technology's role, strengths, limitations, and suitability, so that the technologies and models named in a recommendation are grounded rather than invented. New categories can be added over time without disturbing the rest of the subsystem.

It is **kept independent from the Consulting Knowledge Base because it changes far more frequently.** AI technologies and models are released, revised, repriced, and deprecated constantly, whereas consulting methodology knowledge is comparatively stable. Coupling the two would force the slow-moving consulting knowledge to churn at the pace of the technology market. Keeping them separate lets the Technology Knowledge Base be updated on its own cadence without destabilizing consulting knowledge.

**Trusted origins — Technology Sources.** The official origins of technology information are modeled explicitly as **Technology Sources** — the vendors and official channels an update can legitimately come from (for example OpenAI, Anthropic, Google, Meta, Groq, Mistral). A Technology Source represents *where* information officially came from, which is what makes updates auditable.

**Human-approved updates only — the Technology Curator.** The Technology Knowledge Base supports **dynamic updates from trusted official sources** (official vendor announcements, model cards, and documentation), but **the AI never updates it autonomously.** Every change flows through a **Technology Curator** workflow:

1. **Detect** a candidate update from one or more **Technology Sources**.
2. **Generate a structured update proposal** describing the change and citing the Technology Source(s) it derives from.
3. **Require explicit human approval** of that proposal.
4. **Only then** is the Technology Knowledge Base updated — and each approved, applied update is recorded in an append-only **Technology Update History** that preserves the Technology Source references.

There is no path by which the AI writes to the Technology Knowledge Base on its own; a human curator always approves the change first, and every approved change leaves a permanent audit-history entry that records which Technology Source(s) it came from.

**How the Copilot uses it.** The Copilot may use the Technology Knowledge Base **only to recommend implementation technologies and suitable AI models, with explanations** — surfacing candidate technologies and models and *why* they fit an opportunity. It never makes an autonomous technology decision on the consultant's behalf; the choice, like every recommendation, is a reviewed draft the consultant accepts, edits, or overrides.

### 6.3 Shared properties

**Grounding.** Recommendations must ultimately be grounded in curated knowledge rather than produced as free-form model output. A recommendation should be traceable to the consulting knowledge that justifies its approach and, where it names concrete technologies or models, to the Technology Knowledge Base entries behind them.

**Separation.** Both knowledge bases are reusable and independent of any single engagement. Engagement state references knowledge; neither knowledge base ever depends on a specific engagement, and neither is modified as a side effect of running one.

**Retrieval approach.** The first implementation of both uses **curated, structured content with deterministic retrieval and matching.** **RAG is not part of the initial implementation.** RAG (embeddings and semantic retrieval) will be introduced later as an enhancement to the Consulting Knowledge Base, once it holds meaningful content.

**Scope discipline.** These knowledge bases exist to support the consultant's Discovery Workshops and decision-making. Introducing the Technology Knowledge Base does **not** turn the workbench into a PromptOps or AI-engineering platform: it curates *knowledge about* technologies to inform recommendations; it does not build, deploy, benchmark, or operate them.

---

## 7. Human-in-the-loop

The **consultant always remains in control.** The system assists; it does not decide.

- Recommendations must be **editable** by the consultant.
- Reports must be **versioned**, preserving what the consultant reviewed and delivered.
- **Assumptions, confidence levels, and missing information must always be visible** — the tool surfaces what it inferred, how sure it is, and what it did not know, so the consultant can trust, correct, or override it.

AI output is treated as a reviewed draft, never as an unquestioned final answer.

---

## 8. The deliverable

The output of an engagement is a **professional, client-ready consultant report** that a consultant can confidently place in front of a client. It assembles the discovery, assessment, prioritized problems, grounded recommendations, implementation roadmap, and follow-up questions into a coherent deliverable, is editable by the consultant, and is versioned.

---

## 8A. Language and internationalization

*(Revision 1.2. Lettered so existing section numbers are unchanged.)*

The MVP ships a **German-only** user interface — for consultants and for self-registered clients alike — because that is the language of the first real engagements.

It is built to be **internationalization-ready from the start**: everything a user reads is prepared for translation, so adding a language later is a translation effort rather than a rebuild. **Internal identifiers stay English** — the product's own vocabulary, the terms in the domain model, and everything the system records about itself remain in English regardless of what language a user sees.

What people write stays as they wrote it: client- and consultant-entered content is never machine-translated.

**Additional languages are deliberately deferred, not designed away** (§10). German-only is the scope; readiness is the requirement.

---

## 9. Principles (stable commitments)

These commitments are frozen and serve as the foundation for all future documentation:

1. **A real tool, not a demo.** Value is measured by usefulness in a real engagement.
2. **Engagement-centric and iterative.** The engagement is the unit of work; stages are re-runnable, not a linear one-shot pipeline.
3. **Methodology ≠ architecture.** The nine-step workflow guides the consultant; it does not dictate the internal software structure.
4. **Grounded recommendations.** Recommendations are grounded in the curated Consulting Knowledge Base, and any concrete technologies or AI models they name are grounded in the Technology Knowledge Base; RAG comes later.
5. **Two knowledge bases as core assets.** A Consulting Knowledge Base and a separate, more frequently-updated Technology Knowledge Base — both kept strictly separate from engagement data and from each other, and reusable across engagements.
6. **Human-curated technology knowledge.** The Technology Knowledge Base is updated only through the Technology Curator workflow — detect, propose, human-approve, then update — never autonomously by AI.
7. **Human-in-the-loop.** Editable recommendations, versioned reports, and always-visible assumptions, confidence, and gaps. Client-provided discovery is held to the same rule: reviewed by the consultant before it counts.
8. **Domain-first, extensible.** Customer Operations is implemented concretely first; additional domains can be added without redesign.
9. **Workspace-bounded, least-privilege access.** The Workspace is the ownership boundary; an Administrator sees their own workspace, a Manager only the engagements they own, a Client only the Discovery form they are associated with through self-registration. Access is enforced by the product on every action, and access events are recorded.
10. **Bounded client participation.** A client contributes at exactly one point — Discovery — by invitation, through a portal that shows them nothing else. Participation never becomes visibility into the consultant's analysis or deliverable.
11. **Measured value.** Discovery records what the problem costs today and what success would measurably look like — and records the absence of a baseline as a finding rather than passing over it.
12. **German-first, localization-ready.** The MVP interface is German; the product is built so that further languages are translation, not redesign, and its internal vocabulary stays English.
13. **Authentication is separate from consulting data.** Passwords, sessions, verification, resets, and invitation handling live behind a dedicated infrastructure boundary. Administrators never create, know, store, or view users' permanent passwords.

---

## 10. Explicitly out of scope for the initial vision

To keep the vision stable and focused, the following are deliberately deferred (not rejected):

- RAG / semantic retrieval over the Consulting Knowledge Base.
- Additional business domains beyond Customer Operations.
- A general multi-domain plugin framework built ahead of the second domain.
- **Autonomous updates to the Technology Knowledge Base.** Every change requires explicit human approval through the Technology Curator; there is no self-updating knowledge.
- **Any PromptOps or AI-engineering platform capability.** The workbench curates *knowledge about* technologies to inform recommendations; it does not build, benchmark, deploy, evaluate, or operate them.
- **Additional interface languages.** The MVP is German-only; the architecture is prepared for more, but no second language is delivered.
- **Client access beyond their own Discovery form.** No client-facing dashboard, deliverable sharing, messaging, or project portal. A client sees their own discovery form and nothing else.
- **Enterprise identity federation.** The product's initial authentication boundary is separate from the consulting domain and handles sign-up, passwords, sessions, verification, reset, and invitation links; SSO and external identity-provider integration are deferred.
- **A general permission or administration framework.** Three roles, deliberately few — no custom roles, permission matrices, groups, delegation, or per-field access rules.
- **Cross-workspace sharing.** Engagements, clients, and their data do not move or become visible between workspaces.

These may be revisited once the core workbench and Customer Operations domain are established.
