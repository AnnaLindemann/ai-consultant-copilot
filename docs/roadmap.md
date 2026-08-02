# Roadmap — AI Consulting Workbench

Status: **Stable** · Version: 1.2 · Derived from [product-vision.md](./product-vision.md) and [domain-model.md](./domain-model.md).

> **Revision 1.2 (approved).** Three changes, **none of which renumbers an existing phase** and none of which moves the MVP boundary (still after Phase 9):
> 1. **Phase 2 (Client Discovery) is extended** with the engagement's **value & measurement baseline** (Business Impact; Error Frequency / Severity / Cost; Existing KPIs; Baseline Metrics; Target Success Metrics; Measurement Method; Data Sources) and with a **discovery draft / submitted workflow** plus **client-completed Discovery reviewed by the consultant**. The extension is delivered as a **re-entry into Phase 2** ("Phase 2 Extension"), sequenced **after the in-flight Phase 3 is accepted and before Phase 3A** — it does not disturb Phase 3.
> 2. **A new Phase 3A — Multi-user & Client Collaboration Foundation** is added immediately after Phase 3, introducing the **Workspace** as the ownership and isolation boundary, the **Administrator / Manager / Client** roles, authentication, server-side authorization, engagement ownership, client self-registration, the **Client Portal**, the **Draft / Submit / Return** workflow, notifications, and an append-only **Audit Trail**. Authentication and email delivery are kept behind dedicated infrastructure boundaries so the consulting domain does not depend directly on either provider. Like Phase 5A, it is a lettered insertion, not a renumbering.
> 3. **Phase 11 (Production Readiness) is refocused** on deployment, monitoring, operational security, backup, recovery, and performance. **Authentication and authorization move out of Phase 11 into Phase 3A.**
> 4. **Report publication becomes explicit.** Consultant Report versions are manager-published to the Client Portal, only published versions are visible to clients, and publication sends an email notification with a portal link.
>
> Revision 1.2 also records the **internationalization-ready, German-only MVP** commitment as a cross-cutting UI obligation: user-facing strings are localizable from the start, internal identifiers stay English.
>
> **Revision 1.1 (approved).** Phase 5 is renamed to the **Curated Consulting Knowledge Base**, and a **Phase 5A — Technology Knowledge Base & Technology Curator** extension is added alongside it (both are the curated-knowledge foundation that grounds recommendations). **No existing phase is renumbered and the MVP boundary is unchanged** (still after Phase 9): Phase 5A rides under the Phase 5 umbrella and precedes Phase 6 Solution Matching. The extension also introduces a **Technology Update History** audit log of approved Technology Knowledge Base revisions, separate from Analysis Runs.

This roadmap is **implementation-independent**. It defines *what business capability* each phase delivers and *when*, in an order that respects the agreed product direction. It does not prescribe software architecture, frameworks, storage, APIs, or technology choices — those belong to `architecture.md`.

## How to read this roadmap

- The phases follow the **consulting methodology** as agreed in the product vision, delivered one complete capability at a time.
- **Each phase leaves the application in a fully working state.** A phase is never a partial slice that requires a later phase to become usable; the consultant gains a real, usable capability at the end of every phase.
- **Each phase delivers one complete business capability** from the domain model, not a technical layer.
- **The methodology is iterative, not a one-directional pipeline.** Later phases add re-entry and revision capability to stages delivered earlier; they do not replace them.
- **Existing infrastructure is reused wherever possible.** Engagement persistence, analysis-run recording, prompt versioning/fingerprinting, and Langfuse tracing already exist and are extended by each phase rather than rebuilt. These are described in [Cross-cutting Capabilities](#cross-cutting-capabilities).
- **Grounding order is fixed.** Recommendations are grounded in the curated Consulting Knowledge Base, and the technologies and models they name are grounded in the Technology Knowledge Base — so the curated-knowledge foundation (Phase 5 and its Phase 5A extension) precedes solution matching (Phase 6). **RAG remains after the curated Consulting Knowledge Base phase**, as an enhancement over meaningful curated content — never as the initial retrieval mechanism.
- **Lettered phases are extensions, not renumberings.** Phase 3A and Phase 5A are inserted at the point in the sequence where the capability is needed, without shifting any existing phase number or the MVP boundary. They are full phases in every other respect: each delivers one complete business capability, leaves the application working, and passes the same acceptance gates.
- **Access control begins at Phase 3A and applies to every phase after it.** From Phase 3A onward, the **Workspace** is the ownership and isolation boundary for all engagement-side data, and every capability a later phase adds is reachable only through server-side authentication and authorization. This obligation is stated once in [Cross-cutting Capabilities](#cross-cutting-capabilities) rather than repeated per phase.
- **The user interface is German-only at MVP but internationalization-ready from the start.** This is a cross-cutting UI obligation on every phase that ships user-facing surface, also stated once in [Cross-cutting Capabilities](#cross-cutting-capabilities). The approved UI direction is a clean, process-oriented SaaS experience with an engagement pipeline, design tokens, and reusable components.
- **Cost tracking and observability are cross-cutting.** Wherever a phase introduces new AI-assisted functionality, that functionality is recorded as an **Analysis Run** with cost, token usage, latency, prompt version, and prompt fingerprint, and traced in Langfuse. This obligation applies to every phase that adds AI functionality and is stated once in [Cross-cutting Capabilities](#cross-cutting-capabilities).

## Roadmap Principle

The roadmap prioritizes business value over technical sophistication.

Every phase exists because it enables the consultant to perform a meaningful new capability.

Technical improvements are introduced only when they directly support business value or reduce operational risk.

---

## Phase 0 — Foundation Stabilization

**Goal.** Prepare the existing project for the new Engagement-centered product direction.

**Business capability.** A stable working foundation that uses the new terminology and removes misleading or obsolete foundations.

**Scope.**
- Align existing **ClientCase** terminology with **Engagement** terminology where appropriate.
- Remove or clearly disable the fake evaluation that always returns "medium".
- Add or update README instructions.
- Add or update `.env.example`.
- Add basic tests for critical parsing / validation paths.
- Keep the existing LLM provider abstraction, Analysis Run persistence, prompt versioning, prompt fingerprinting, cost tracking, and Langfuse observability.
- Do not rebuild existing infrastructure.

**Definition of Done.**
- Existing functionality still works.
- The project uses **Engagement** as the product concept.
- No fake quality scores are presented as real evaluation.
- A developer can understand how to run the project.
- Critical parse / validation behavior has basic test coverage.

**Success Criteria**
- A consultant sees consistent Engagement terminology, not the old ClientCase concept.
- No misleading quality score is ever shown as if it were a real evaluation.
- A new developer can get the project running from the documentation alone.
- The foundation is trustworthy enough to build the methodology on top of.

---

## Phase 1 — Engagement Foundation

**Goal.** Establish the engagement as the unit of work: the consultant can open, save, resume, and return to a complete piece of consulting work for a client.

**Business capability.** Manage **Organizations** and **Engagements** — create an organization, open an engagement for it, and persist and resume that engagement's state across sessions.

**Scope.**
- Represent an **Organization** as the grouping of a client's engagements (identity and context only; not a customer-relationship record).
- Represent an **Engagement** as the primary business entity and single source of truth for all client-specific state.
- Support create / open / save / resume / list of engagements, and tracking where an engagement currently stands.
- One organization may hold multiple engagements; each engagement is self-contained.
- Reuse existing engagement persistence rather than introducing a parallel store.

**Definition of Done.**
- A consultant can create an organization, start an engagement, leave, and later resume the same engagement with its state intact.
- Engagement state is the container that later phases attach discovery, assessment, opportunities, recommendations, roadmap, and report versions to.
- No methodology content is required yet; the empty engagement is a valid, working state.

**Success Criteria**
- A consultant can open a real piece of client work and return to it later without losing anything.
- Multiple clients and multiple engagements can be kept side by side without confusion.
- The engagement feels like the natural home for everything the consultant does for that client.

---

## Phase 2 — Client Discovery

**Goal.** Let the consultant capture structured information about the client's situation, quantify what the problem actually costs and what success would look like, and make explicit what is still unknown.

**Business capability.** Build and revise the **Discovery Profile** for an engagement — including its **value & measurement baseline** — and move it through a **draft / submitted** review workflow, whether the consultant captured it or the client completed it.

**Scope.**
- Capture the client's situation, operations, problems, current process, tools, data, constraints, and goals as structured discovery content.
- Capture the engagement's **value & measurement baseline** alongside the qualitative picture (Revision 1.2):
  - **Business Impact** — what the problem costs the business in operational terms (lost time, lost revenue, rework, customer dissatisfaction, staff load).
  - **Error Frequency / Severity / Cost** — how often things go wrong, how bad each occurrence is, and what an occurrence costs.
  - **Existing KPIs** — the indicators the client already tracks for the affected operations.
  - **Baseline Metrics** — the current measured values of those indicators, as they stand today.
  - **Target Success Metrics** — what the client would consider success, expressed in the same terms as the baseline.
  - **Measurement Method** — how each metric is (or would be) measured, so a number can be trusted and re-measured later.
  - **Data Sources** — where each figure came from (system, report, estimate, interview), so its reliability is visible.
- Record not only what is known but **what is still missing**, so gaps are visible to the consultant. **An absent baseline, KPI, or measurement method is itself a first-class gap**, not an empty field: "the client does not measure this today" is a finding that must survive into assessment and follow-up questions.
- Distinguish **measured** figures from **estimated** ones, and never present an estimate as a measurement.
- Support a **draft / submitted** workflow for the Discovery Profile: discovery is worked on as a **draft**, **submitted** when the contributor considers it complete, and then **reviewed by the consultant**, who accepts it or reopens it for more work. Discovery remains re-entrant throughout — submission is a review checkpoint, not a lock.
- Support **client-completed Discovery with consultant review**: discovery content may originate from the client rather than the consultant, and the Discovery Profile records **who provided each part** (consultant-captured vs. client-provided). Client-provided content is a **reviewed draft** exactly as AI-assisted content is — the consultant accepts, edits, or returns it, and it never enters later stages as accepted fact without that review.
- Allow the Discovery Profile to be revised as understanding improves; it is re-entrant.
- Shape discovery around the Customer Operations domain (its discovery questions and taxonomy are supplied by the Consulting Knowledge Base once curated in Phase 5; until then, discovery uses the agreed Customer Operations structure).

> **Sequencing of the Revision 1.2 extension.** The value & measurement baseline and the draft/submitted + client-completed workflow are delivered as a **re-entry into Phase 2** (the "Phase 2 Extension"), sequenced **after Phase 3 is accepted and before Phase 3A begins**. Phase 2's original scope is already accepted and in place; the extension is a follow-on increment on that accepted capability, not a reopening of the phase order. It is placed before Phase 3A because Phase 3A's Client Portal and Draft / Submit / Return workflow build directly on the discovery workflow and provenance this extension introduces. It is placed after Phase 3 so the in-flight assessment work is not disturbed. Phase 3 itself is unchanged by this revision; whether the assessment later reads the value & measurement baseline is a separate, future decision, not a change to Phase 3's accepted scope.

**Definition of Done.**
- A consultant can enter, save, and revise a Discovery Profile on an engagement.
- Known information and missing information are both represented and visible.
- The value & measurement baseline (business impact, error frequency/severity/cost, existing KPIs, baseline metrics, target success metrics, measurement method, data sources) can be captured, revised, and left explicitly empty-with-a-reason, and each figure carries its source and whether it is measured or estimated.
- A Discovery Profile can be moved from draft to submitted, reviewed by the consultant, and accepted or reopened, without losing content on any transition.
- Discovery content records whether it was consultant-captured or client-provided, and client-provided content is visibly unreviewed until the consultant reviews it.
- The Discovery Profile persists as engagement state and is available as factual input to later stages.

**Success Criteria**
- Discovery can be completed end-to-end.
- Missing information is clearly identified.
- Discovery can be resumed later.
- The consultant can state what the client's problem costs today and what success would measurably look like — or can see plainly that the client cannot yet answer that.
- Discovery completed by the client arrives in a reviewable state, and nothing the client wrote is treated as accepted fact until the consultant has reviewed it.

---

## Phase 3 — Business & AI Readiness Assessment

**Goal.** Turn discovery facts into a structured, AI-assisted evaluation of the client across the agreed assessment dimensions.

**Business capability.** Produce an **Assessment** of the engagement, including its **AI Readiness** dimension.

**Scope.**
- Interpret the Discovery Profile to produce findings across the assessment dimensions: **Business Process**, **Data**, **Technology**, **AI Readiness**, **Risks**, and **Opportunities** (AI Readiness is a dimension, not a separate entity).
- Make explicit which findings are supported by discovery data and which rest on **assumptions**, and surface **confidence**.
- AI-assisted assessment output is treated as a **reviewed draft** the consultant can accept, edit, or override.
- The Assessment is re-runnable against updated discovery without restarting the engagement.
- **First AI-assisted stage:** its runs are recorded and observed per [Cross-cutting Capabilities](#cross-cutting-capabilities).

**Definition of Done.**
- A consultant can generate, review, edit, and save an Assessment across all dimensions for an engagement.
- Assumptions, confidence, and gaps are visible for the findings.
- Each assessment run is recorded as an Analysis Run with cost, tokens, latency, prompt version, and fingerprint, and is traced in Langfuse.

**Success Criteria**
- Assessment is understandable by a consultant.
- Assumptions and confidence are visible.
- Assessment can be regenerated after Discovery changes.

---

## Phase 3A — Multi-user & Client Collaboration Foundation

> **Extension inserted after Phase 3, not a renumbering.** Phase 3A follows the same convention as Phase 5A: it is placed where the capability is needed — once there is real engagement content worth protecting and worth sharing with a client — without shifting any existing phase number or the MVP boundary. It is sequenced **after the Phase 2 Extension** (Revision 1.2), because the Client Portal builds on the discovery draft/submitted workflow and provenance that extension delivers. **Authentication and authorization are delivered here, not in Phase 11.**

**Goal.** Turn the workbench from a single-consultant tool into a safe, multi-user working environment in which a consulting team runs engagements side by side and a client can contribute to Discovery without ever seeing anything else.

**Business capability.** Operate engagements inside a **Workspace** with real users and roles — **Administrator**, **Manager**, **Client** — where a Manager owns their engagements, an Administrator oversees the whole workspace, and a self-registered Client completes only the Discovery form associated with their own account, through the **Client Portal**, under a **Draft / Submit / Return** workflow with notifications and an audit trail. Authentication, access association, and email-based verification/password flows are handled through dedicated infrastructure boundaries, not through consulting-domain state.

**Scope.**
- **Workspace.** Introduce the **Workspace** as the ownership and isolation boundary for all engagement-side data. Every user, organization, engagement, and all engagement state belongs to exactly one workspace. Nothing crosses a workspace boundary.
- **Roles.** Introduce three roles with distinct authority:
  - **Administrator** — accesses **all engagements in their workspace**; manages the workspace's users, roles, and invitations.
  - **Manager** — the consultant role; creates and runs engagements and accesses **only the engagements they own**.
  - **Client** — an external participant with **no workbench access**; reaches only the Discovery form(s) associated with their own self-registration, for their own engagement.
- **Authentication.** Users have real identities and sign in; every request is attributable to a known user. Clients self-register, confirm their email, and create their own password. Managers and additional administrators are created by an administrator and receive an invitation link to set their own password. The first administrator is created through a secure bootstrap process. Authentication data stays separate from consulting domain state, and the auth boundary handles password management, sessions, email verification, password reset, and invitation-link flows. The initial implementation uses Better Auth behind the authentication boundary, and Resend behind the email-delivery boundary.
- **Authorization.** Every action is checked against the acting user's role and their relationship to the data. Authorization decisions cover reading, writing, generating, submitting, returning, accepting, and exporting.
- **Server-side permission enforcement.** Permissions are enforced **on the server, on every request**, as the single source of truth. The user interface may hide what a user cannot do, but hiding is never the control — a hidden action denied only in the UI is a defect, not a safeguard.
- **Workspace isolation.** Every read and write of engagement-side data is scoped to the acting user's workspace, so data from one workspace can never be read, listed, counted, aggregated, referenced, or exported from another.
- **Engagement ownership.** Every engagement has exactly one owning Manager and belongs to exactly one workspace. Ownership can be transferred by an Administrator. Ownership is what a Manager's access is measured against.
- **Client access association.** A Manager (or Administrator) associates a self-registered client contact with the Discovery form of **one specific engagement**. The association is explicit, scoped to that engagement's discovery, time-bounded, and revocable; revoking it ends the client's access immediately.
- **Client Portal.** A restricted, client-facing surface where a self-registered client sees **only their own engagement's Dashboard, Discovery, Documents, and Profile** — no assessment, no opportunities, no recommendations, no report, no other engagement, no other client, and no workbench navigation. The Documents section is read-only and shows only Published documents.
- **Draft / Submit / Return workflow.** The client works in **draft**, **submits** when finished, and the consultant **reviews** the submission and either **accepts** it or **returns** it with notes for completion or correction. Returned discovery goes back to draft for the client; the cycle can repeat. Every transition preserves prior content — a return never discards what the client wrote, and an acceptance never discards what the consultant edited.
- **Notifications.** Users are notified of the events that need their attention: an invitation issued, a discovery submitted, a discovery returned, a document published, a publication revoked, an invitation revoked or expired. Notifications inform; they never act on a user's behalf.
- **Audit trail.** Record an **append-only Audit Trail** of access- and collaboration-relevant events: sign-in, invitation issued/accepted/revoked/expired, submission, return, acceptance, publication, publication revocation, document download, ownership transfer, role change, and denied-permission attempts — who did what, to which engagement, and when. It is distinct from the engagement's **Analysis Runs** (AI assistance) and from the **Technology Update History** (knowledge curation); the three logs are never conflated.
- **Migration of existing work.** Existing organizations and engagements are brought into a workspace with an owning Manager as part of this phase, so the application is fully working — with access control on — at the end of it, and no engagement is left unowned or unreachable.
- **Authentication data separation.** Auth state, password handling, sessions, verification, and invitation delivery are stored and processed outside consulting-domain tables and services.
- **Out of scope here.** Enterprise identity federation (SSO/SAML/OIDC providers), cross-workspace sharing, per-user access to individual engagement sections beyond the roles above, and client access to any stage other than Discovery. Production deployment, monitoring, backup, and operational hardening remain Phase 11.

**Definition of Done.**
- A user signs in and sees only what their role and workspace permit; there is no unauthenticated path to engagement data.
- A Manager can reach their own engagements and **cannot** reach another Manager's engagements, including by direct identifier, listing, search, aggregate, or export.
- An Administrator can reach every engagement in their own workspace and **no** engagement in any other workspace.
- A self-registered Client can open **only** the Discovery form of the engagement they are associated with, and can reach no other engagement, stage, or client's data; revoking the discovery access ends that access immediately.
- Every permission decision is made and enforced server-side; the same request rejected in the UI is also rejected by the server.
- A client can complete a Discovery form as a draft, submit it, receive it back with the consultant's notes when returned, and resubmit — with no content lost on any transition.
- The consultant is notified of a submission and the client of a return, and both events, plus invitations, ownership changes, role changes, and denied attempts, appear in the append-only audit trail.
- Existing engagements from earlier phases are owned, workspace-scoped, and reachable by their owner after the phase.

**Success Criteria**
- A consulting team can work in the same workbench without seeing each other's engagements.
- An administrator can oversee the workspace's engagements without engagements leaking between workspaces.
- A client can fill in discovery themselves, in their own time, and see nothing else about the engagement.
- The consultant keeps full review authority: nothing a client submits enters the engagement as accepted fact without the consultant's review.
- Every access decision is enforced by the server, and who did what to an engagement can be reconstructed afterwards.

---

## Phase 4 — Problem Prioritization & Opportunities

**Goal.** Focus the engagement's effort where value is highest by weighing and ordering the problems surfaced in assessment.

**Business capability.** Derive, qualify, and prioritize **Opportunities**.

**Scope.**
- Carry assessment problems and bottlenecks forward as candidate **Opportunities**.
- Frame each opportunity as an actionable improvement candidate carrying the consultant's view of value, effort, impact, and confidence.
- Qualify opportunities against the Assessment's **AI Readiness** dimension.
- Prioritize opportunities against one another so effort is focused; prioritization is re-runnable when assessment changes.

**Definition of Done.**
- A consultant can review a prioritized set of Opportunities derived from the Assessment.
- Each Opportunity carries value/effort/impact/confidence and is editable by the consultant.
- Re-running prioritization after an assessment change updates the ordering without restarting the engagement.

**Success Criteria**
- The consultant can see, at a glance, where effort is best spent.
- Prioritization reflects the consultant's judgment and can be adjusted by hand.
- Re-prioritizing after new findings is quick and does not restart the engagement.

---

## Phase 5 — Curated Consulting Knowledge Base

**Goal.** Establish the reusable, engagement-independent consulting knowledge that grounds recommendations, with deterministic retrieval.

**Business capability.** Curate and retrieve the **Consulting Knowledge Base**, scoped to the Customer Operations business domain.

**Scope.**
- Hold the agreed kinds of reusable consulting knowledge: **Business Domains**, **Business Processes**, **Business Problems**, **Customer Operations Taxonomy**, **Discovery Questions**, **Assessment Frameworks**, **AI Readiness Criteria**, **AI Use Cases**, **Solution Patterns**, **Implementation Patterns**, **ROI Models**, **Risk Models**, **Best Practices**, and **Follow-up Templates**. (**Technology Profiles** live in the separate Technology Knowledge Base — Phase 5A.)
- Keep the Consulting Knowledge Base **strictly separate** from engagement state: engagements reference knowledge; knowledge never depends on an engagement.
- Provide **curated, structured, deterministic retrieval and matching** — no embeddings, no semantic retrieval at this phase.
- Curation is a deliberate activity, separate from running an engagement.
- Feed earlier stages that reference knowledge (discovery questions shape Discovery; frameworks and AI-readiness criteria shape Assessment).

**Definition of Done.**
- The Consulting Knowledge Base exists as a reusable asset with Customer Operations content, independent of any engagement.
- Deterministic retrieval returns relevant knowledge for a given engagement context.
- Discovery and Assessment can draw on Consulting Knowledge Base questions, frameworks, and criteria.
- **RAG is explicitly out of scope here and follows in Phase 10.**

**Success Criteria**
- Relevant knowledge can be found deterministically.
- Knowledge is reusable across engagements.

---

## Phase 5A — Technology Knowledge Base & Technology Curator

> **Extension of Phase 5, not a renumbering.** Phase 5A rides under the Phase 5 curated-knowledge umbrella: it delivers the second curated-knowledge foundation that grounds recommendations. It is placed here — before Phase 6 Solution Matching — so recommendations can ground their technology and model suggestions, without shifting any existing phase number or the MVP boundary. It may be delivered concurrently with, or immediately after, Phase 5.

**Goal.** Establish the reusable, engagement-independent, frequently-updated knowledge about AI technologies and models that grounds the technology and model choices in recommendations — kept separate from the Consulting Knowledge Base and updated only under explicit human approval.

**Business capability.** Curate and retrieve the **Technology Knowledge Base**, and maintain it through the human-approved **Technology Curator** workflow, recording every approved revision in a **Technology Update History**.

**Scope.**
- Hold **Technology Profiles** for AI technologies and models — for example LLMs, embedding models, speech models, OCR, rerankers, vector databases, MCP servers, browser/computer-use frameworks, and workflow engines — each describing role, strengths, limitations, and suitability.
- Keep the Technology Knowledge Base **independent from the Consulting Knowledge Base** (it changes far more frequently) and **strictly separate** from engagement state; engagements reference it, it never depends on an engagement.
- Provide **curated, structured, deterministic retrieval** so the technologies and models named in recommendations are grounded, not invented.
- Support **dynamic updates from trusted official sources**, but **never autonomous ones**, through the **Technology Curator** workflow:
  1. **Detect** a candidate update from a trusted official vendor source.
  2. **Generate a structured Technology Update Proposal** recording the change and its source (AI may draft the proposal; it does no more).
  3. **Require explicit human approval** of the proposal.
  4. **Only then update** the Technology Knowledge Base, and record the applied change in the **Technology Update History**.
- The Technology Update Proposal is the Technology Knowledge Base's governance trail for a *proposed* change (source, proposed change, approval decision); it is **not** an engagement-scoped Analysis Run.
- The **Technology Update History** is an **append-only audit log of approved, applied revisions only** — what changed, from which approved proposal and official source, by whom, and when. It records approved KB revisions; it does not record proposals that were rejected, and it is separate from Analysis Runs.
- Initial detection may be assisted or manual; automated scheduling of detection is not required at this phase (build for the phase in front of you).

**Definition of Done.**
- The Technology Knowledge Base exists as a reusable asset with Technology Profiles, independent of any engagement and of the Consulting Knowledge Base.
- Deterministic retrieval returns relevant Technology Profiles for a given context.
- Every update to the Technology Knowledge Base flows through a Technology Update Proposal that a human explicitly approves; there is no code path by which AI or an engagement writes to it autonomously.
- Each Technology Update Proposal records the official source it derives from and its approval decision.
- Every approved, applied update is recorded as an append-only **Technology Update History** entry (change, source, approver, timestamp), separate from Analysis Runs.

**Success Criteria**
- Relevant technology and model knowledge can be found deterministically and is reusable across engagements.
- The Technology Knowledge Base can be kept current from official sources without ever being updated autonomously.
- Every applied change is traceable to a human-approved proposal, its source, and a Technology Update History entry.

---

## Phase 6 — Solution Matching & Grounded Recommendations

**Goal.** Connect prioritized opportunities to reusable knowledge to produce grounded, explainable, editable recommendations.

**Business capability.** Produce **Recommendations** grounded in the Consulting Knowledge Base, with technology and model suggestions grounded in the Technology Knowledge Base.

**Scope.**
- Match Opportunities against the Consulting Knowledge Base (**AI Use Cases**, **Solution Patterns**) using the curated retrieval from Phase 5, and draw on the Technology Knowledge Base (**Technology Profiles**, Phase 5A) to recommend implementation technologies and suitable AI models with explanations.
- Each Recommendation carries **rationale, assumptions, confidence, and expected value**, and is **traceable** backward to Discovery Profile facts, to the Consulting Knowledge Base entries that justify its approach, and to the Technology Knowledge Base entries behind any technologies or models it names.
- Recommendations copy the reasoning into engagement-specific content but never modify either knowledge base (one-directional reference).
- Recommendations are **editable and overridable** by the consultant.
- AI-assisted matching runs are recorded and observed per [Cross-cutting Capabilities](#cross-cutting-capabilities).

**Definition of Done.**
- A consultant can generate, review, edit, and accept Recommendations for prioritized Opportunities.
- Every Recommendation is traceable to the discovery facts, Consulting Knowledge Base knowledge, and (where technologies or models are named) Technology Knowledge Base entries that ground it, and grounding is visible.
- Assumptions and confidence are surfaced; the consultant can override any recommendation.
- Each matching run is recorded as an Analysis Run and traced in Langfuse.

**Success Criteria**
- Every recommendation references the Consulting Knowledge Base, and any technology or model it names references a Technology Profile.
- Every recommendation contains rationale.
- Every recommendation contains confidence.

---

## Phase 7 — Implementation Roadmap

**Goal.** Sequence accepted recommendations into a practical path forward for the client.

**Business capability.** Assemble the **Implementation Roadmap** for an engagement.

**Scope.**
- Organize accepted **Recommendations** into an ordered set of phases or steps with goals and dependencies.
- Reflect the engagement's prioritization and the client's readiness.
- Draw on **Implementation Patterns** from the Consulting Knowledge Base to inform realistic sequencing and effort expectations.
- The Roadmap is re-assembled when recommendations change.

**Definition of Done.**
- A consultant can produce and edit an Implementation Roadmap from accepted Recommendations.
- The Roadmap reflects dependencies, sequencing, and readiness, and is available for inclusion in the report.

**Success Criteria**
- The client is given a clear, practical path forward, not just a list of ideas.
- Sequencing reflects real dependencies and the client's readiness.
- The roadmap stays consistent with the accepted recommendations behind it.

---

## Phase 8 — Consultant Report & Follow-up Questions

**Goal.** Assemble the engagement into a professional, client-ready deliverable and turn remaining gaps into follow-up questions.

**Business capability.** Produce a **versioned Consultant Report**, publish the selected version to the **Client Portal**, and produce **Follow-up Questions**.

**Scope.**
- Assemble discovery, assessment, prioritized problems, grounded recommendations, roadmap, and follow-up questions into one coherent, client-ready document.
- The report is **editable** by the consultant and **versioned**, preserving exactly what was reviewed and delivered at each iteration.
- The consultant can explicitly **publish** a chosen report version to the Client Portal, **revoke** publication, and preserve version and publication history.
- Only **Published** report versions are visible to clients; the Client Portal Documents view is read-only and acts as the primary place to access the published PDF.
- Publishing sends an email notification to the client with a link back to the Client Portal.
- Turn outstanding gaps and missing information into **Follow-up Questions** for the client, using the Consulting Knowledge Base's follow-up templates.
- Any AI-assisted assembly or drafting runs are recorded and observed per [Cross-cutting Capabilities](#cross-cutting-capabilities).

**Definition of Done.**
- A consultant can generate, edit, save, publish, and revoke a Consultant Report version, and the client can access the published PDF through the Client Portal.
- Each delivered version is preserved and retrievable.
- Follow-up questions covering the engagement's gaps are produced and included.

**Success Criteria**
- Report is client-ready.
- Report is editable.
- Report is versioned.
- Published reports are visible in the Client Portal and unpublished versions are not.

---

## Phase 9 — Feedback & Engagement Evolution

**Goal.** Support the reality that an engagement continues after the first report — client feedback drives revision and re-versioning.

**Business capability.** Iterate an engagement through **Client Feedback**, driving discovery updates, assessment updates, recommendation revision, and a new report version.

**Scope.**
- Capture **Client Feedback** on a report or its recommendations.
- Allow feedback to trigger a **Discovery Update** (new information), an **Assessment Update** (revised findings), and **Recommendation Revision** (adjusted or re-grounded proposals).
- Produce a **new Consultant Report version** reflecting the revisions, with prior versions preserved.
- Formalize re-entry into earlier stages on persisted engagement state, without restarting the engagement.
- Any AI-assisted revision runs are recorded and observed per [Cross-cutting Capabilities](#cross-cutting-capabilities).

**Definition of Done.**
- A consultant can record client feedback and re-enter earlier stages to revise discovery, assessment, and recommendations.
- Revisions produce a new report version while earlier versions remain intact.
- The full iterative lifecycle described in the domain model is supported end to end.

**Success Criteria**
- An engagement can keep evolving after the first report is delivered.
- Client feedback visibly flows through to updated findings and recommendations.
- Earlier report versions remain intact as a faithful record of what was delivered.

---
## Phase 10 — Security, Privacy & AI Compliance

**Goal.** Protect client information, govern AI usage responsibly, and ensure the workbench operates in accordance with applicable data protection and AI regulations.

**Business capability.** Operate engagements under a unified **Security, Privacy & AI Compliance** framework that protects confidential information, governs AI processing, and provides complete traceability, auditability, and regulatory readiness.

**Scope.**
- Introduce a unified **Compliance Policy** for each Workspace, defining how client data may be stored, processed, shared, retained, exported, and used by AI-assisted functionality.
- Support **Data Classification** for engagement content, documents, and generated outputs, including classifications such as Public, Internal, Confidential, Strictly Confidential, Personal Data (GDPR), and AI Restricted.
- Allow Workspace administrators to define **AI Policies**, including:
  - whether AI processing is permitted,
  - approved AI providers,
  - approved AI models,
  - whether confidential information may be processed,
  - whether human approval is required before AI-generated outputs become accepted engagement content.
- Support **AI Consent** at the engagement level so consultants can explicitly allow, restrict, or completely prohibit AI processing for a particular engagement.
- Automatically **detect and anonymize personally identifiable information (PII)** before AI processing where required by Workspace policy, including names, email addresses, telephone numbers, postal addresses, contract identifiers, and other configurable personal identifiers.
- Ensure AI processing never bypasses Workspace policy or engagement-specific restrictions.
- Support encryption of engagement data and uploaded documents both **at rest** and **in transit**.
- Protect uploaded documents using secure storage and controlled access mechanisms, including expiring signed URLs where appropriate.
- Expand the Audit Trail to include security- and compliance-relevant events, including:
  - access to confidential information,
  - document downloads,
  - exports,
  - AI policy decisions,
  - anonymization actions,
  - denied AI requests,
  - compliance-related administrative actions.
- Record compliance metadata for every AI-assisted Analysis Run, including provider, model, purpose, prompt version, input classification, output classification, anonymization status, and human review status.
- Introduce configurable **Data Retention Policies**, allowing Workspace administrators to define retention periods for engagements, documents, audit records, and AI-generated artifacts.
- Support GDPR rights including complete client-data export and permanent deletion in accordance with configured retention and legal obligations.
- Provide administrators with a **Compliance Dashboard** summarizing confidential engagements, AI-restricted engagements, policy violations, anonymization failures, retention status, and other operational compliance indicators.
- Design the compliance framework around current European regulations, including **GDPR**, the **EU AI Act**, and future jurisdiction-specific implementation requirements, while keeping regulatory rules configurable rather than hard-coded.

**Definition of Done.**
- Every engagement operates under an explicit Workspace Compliance Policy.
- Confidential information is classified, protected, and handled according to Workspace policy.
- AI processing respects Workspace policy, engagement restrictions, and AI consent before any request is sent to an external provider.
- Personal data can be automatically anonymized before AI processing where required.
- Compliance-relevant actions are fully auditable.
- Workspace administrators can configure AI usage, retention policies, and data protection rules without changing application code.
- Client data can be exported or permanently removed in accordance with applicable privacy regulations.

**Success Criteria**
- Consultants can confidently work with confidential customer information while maintaining regulatory compliance.
- Organizations can define and enforce their own AI governance policies.
- Every AI interaction involving customer data is traceable and auditable.
- Sensitive information is protected before, during, and after AI processing.
- The platform is prepared for evolving European AI and privacy regulations without requiring architectural redesign.

---
## Phase 11 — RAG Enhancement over the Consulting Knowledge Base

**Goal.** Enhance grounding with semantic retrieval once the curated Consulting Knowledge Base holds meaningful content.

**Business capability.** Add **semantic (RAG) retrieval** as an enhancement to Consulting Knowledge Base grounding, alongside the existing curated retrieval.

**Scope.**
- Introduce embeddings and semantic retrieval over the curated Consulting Knowledge Base to improve matching in discovery grounding, assessment, and solution matching.
- **RAG complements the curated Consulting Knowledge Base; it does not replace it.** The curated, structured knowledge and the traceability of grounding remain intact. The Technology Knowledge Base remains structured and deterministically retrieved; extending RAG to it is not required here.
- Recommendations remain grounded and **traceable** to the specific knowledge that justifies them, regardless of retrieval mechanism.
- Retrieval and any AI-assisted steps introduced here are recorded and observed per [Cross-cutting Capabilities](#cross-cutting-capabilities).

**Definition of Done.**
- Semantic retrieval improves relevant knowledge matching without removing curated retrieval or breaking grounding traceability.
- The application remains fully working with RAG enabled, and every recommendation is still traceable to its grounding knowledge.

**Success Criteria**
- The consultant finds relevant knowledge more easily than with curated retrieval alone.
- Recommendations remain grounded and traceable regardless of how knowledge was retrieved.
- Retrieval quality improves without making the product harder to trust or explain.

---

## Phase 12 — Production Readiness

> **Revision 1.2 — refocused.** Authentication, authorization, roles, workspace isolation, and server-side permission enforcement are **no longer part of this phase**; they are delivered in **Phase 3A**, where they are needed to make multi-user and client collaboration safe. Phase 11 is now about **operating** the product: deployment, monitoring, operational security, backup, recovery, and performance. It hardens and operates the access control built in Phase 3A; it does not introduce it.

**Goal.** Prepare the workbench to be deployed, operated, and relied on beyond a developer's machine.

**Business capability.** A deployable, observable, recoverable, and performant consulting platform that can be operated safely in production.

**Scope.**
- **Production deployment.** A repeatable path to running the application in a production environment, including environment configuration and secrets handling.
- **Monitoring and operational observability.** Health, availability, error rates, and operational alerting, so operational problems are seen before they harm client work. (Distinct from the AI-run observability that already exists per [Cross-cutting Capabilities](#cross-cutting-capabilities) — that is about AI runs; this is about the running system.)
- **Operational security.** Transport security, secrets and credential management, dependency and patch hygiene, secure configuration defaults, data-protection and retention handling for client data, and hardening of the deployed surface. **The application's authentication and authorization model comes from Phase 3A**; this phase secures the environment it runs in, keeps it correctly configured in production, and verifies it holds there.
- **Backup.** Regular, verified backups of engagement data, report versions, the knowledge bases, and the audit trail.
- **Recovery.** A tested restore path with a known recovery point and recovery time, so client deliverables and engagement history survive an incident.
- **Performance.** Review and address the performance of the operations a consultant actually waits on, under realistic engagement and workspace volumes.
- **Operational error handling.** Production-grade error reporting, degradation behavior, and runbook-level handling of failures.
- **Export reliability.** Report and engagement data export made dependable for real client delivery.
- **Operational documentation.** How to deploy, configure, monitor, back up, restore, and troubleshoot the system.

**Definition of Done.**
- The application can be deployed to, and operated in, a production environment from documented steps.
- The running system is monitored: failures and operational degradation are visible to an operator.
- Operational security controls are in place for the deployed environment, and the Phase 3A access-control model is verified to hold in production configuration.
- Backups run and a restore has actually been performed and verified — not merely configured.
- Performance under realistic volumes is measured and acceptable for the operations a consultant waits on.
- Deployment, configuration, monitoring, backup, restore, and troubleshooting are documented.

**Success Criteria**
- A consultant can use the workbench on real engagements outside a developer's machine.
- When something goes wrong, it can be seen and addressed before it harms client work.
- Client deliverables, engagement data, and the audit trail can be trusted to survive both normal operation and an incident.
- The access control established in Phase 3A remains intact and verified in the production environment.

---

## Cross-cutting Capabilities

These capabilities are **not phases**. They apply across multiple phases. The first group below applies wherever a phase introduces new AI-assisted functionality within an engagement; two further groups added in Revision 1.2 — **access control and workspace isolation** (from Phase 3A onward) and **language and localization readiness** (every phase with user-facing surface) — apply regardless of whether a phase is AI-assisted.

### AI cost tracking and observability

Delivered wherever a phase introduces new AI-assisted functionality within an engagement. They are built on **existing infrastructure that is reused and extended**, never rebuilt per phase. Any phase that adds engagement AI functionality (Phases 3, 6, 8, 9, 10, and any later AI-assisted engagement step) must satisfy every item below for that functionality; this obligation is stated here once rather than repeated in each phase.

**Cost tracking and observability are mandatory for every new AI-assisted engagement capability.** No phase may introduce engagement AI functionality without capturing the signals below; this is a non-negotiable acceptance criterion for Phases 3, 6, 8, 9, 10, and any later AI-assisted engagement step.

**The Technology Curator (Phase 5A) is a special case.** Its proposal-drafting may be AI-assisted, but it is a cross-engagement curation activity, not an engagement stage — so it does **not** produce an engagement-scoped Analysis Run. Its governance trail is the **Technology Update Proposal** (source, proposed change, human approval decision) and, for approved changes, the **Technology Update History**, rather than an Analysis Run. The Analysis Run below remains strictly engagement-scoped.

Every AI-assisted step in the product is represented as an **Analysis Run** — a record *about* the assistance, belonging to the engagement and associated with the stage or output it supported. The following are captured on that record and surfaced for governance and trust:

- **Cost tracking.** Every AI-assisted step records its cost so it can be reported at three levels:
  - **Cost per AI request** — the cost of an individual AI-assisted step.
  - **Cost per Engagement** — the aggregated cost of all AI assistance within one engagement.
  - **Lifetime total cost** — the cumulative cost across all engagements over the life of the product.
- **Provider used.** The AI provider behind each request is recorded, so cost and behavior can be attributed to the provider.
- **Model used.** The specific model behind each request is recorded, so outputs and costs can be attributed to the model.
- **Token usage.** Recorded per run to feed cost tracking and observability:
  - **Input tokens** — tokens sent to the model.
  - **Output tokens** — tokens returned by the model.
  - **Total tokens** — the combined token count for the run.
- **Latency.** The time taken by each AI-assisted step is recorded, so performance is visible and can be monitored over time.
- **Prompt version.** Each AI-assisted step records the version of the prompt used, so outputs can be attributed to a known prompt and prompts can evolve deliberately.
- **Prompt fingerprint.** Each run records a fingerprint of the exact prompt content used, so a run can be tied to precisely what was sent even as prompts change.
- **Analysis history.** Analysis Runs accumulate as the audit and governance trail of an engagement — what was run, on what, and with what quality/trust signals — enabling explainability, traceability, and the consultant's confidence in (or correction of) AI output. History is preserved as the engagement iterates and re-runs stages.
- **Langfuse observability.** Every AI-assisted step is traced in Langfuse, giving end-to-end observability over runs, cost, tokens, and latency across the whole product. A **Langfuse trace link or trace reference is recorded where available**, so a run can be opened directly in the observability tooling.

Because these capabilities already exist in the current foundation (engagement-scoped Analysis Run persistence, prompt version and fingerprint recording, and Langfuse tracing), each new AI-assisted phase **extends** them to its new functionality rather than introducing a separate mechanism. This keeps observability, cost accounting, and the audit trail consistent across every stage of the methodology.

**Phase 3A adds no AI functionality** and therefore records no Analysis Runs of its own. What it does add is a constraint on every AI-assisted capability that follows it: an Analysis Run belongs to an engagement, an engagement belongs to a workspace, and therefore **all AI assistance, its cost, and its history are workspace-scoped too**. Cost reporting at every level (per request, per engagement, lifetime) is read within the acting user's workspace and role, never across workspaces.

### Access control and workspace isolation (from Phase 3A onward)

From Phase 3A onward, the following applies to **every** phase that adds any capability, AI-assisted or not. It is stated here once rather than repeated per phase:

- **The Workspace is the ownership and isolation boundary.** Every engagement-side read, write, listing, aggregation, and export is scoped to the acting user's workspace.
- **Access is decided by role and ownership.** Administrators reach all engagements in their own workspace; Managers reach only the engagements they own; Clients reach only the Discovery form associated with their own self-registration.
- **Permissions are enforced server-side, on every request.** UI affordances may reflect permissions, but they never constitute them.
- **Access- and collaboration-relevant events are audited.** New capabilities that grant access, change ownership or roles, or move a client submission through the workflow append to the audit trail.
- **The three governance logs stay distinct.** The engagement-scoped **Analysis Run** (AI assistance), the **Technology Update History** (approved knowledge curation), and the **Audit Trail** (access and collaboration events) are separate records with separate purposes; no phase may merge them.

### Language and localization readiness (all phases with user-facing surface)

The MVP ships a **German-only** user interface, built on an **internationalization-ready** foundation from the start. This applies to every phase that adds user-facing surface, including the Phase 3A Client Portal:

- **User-facing strings are localizable, not hard-coded.** Every string a user reads — labels, help text, validation messages, notifications, emails, exported document headings — is authored so that adding a second language later is a translation task, not a rewrite.
- **Internal identifiers remain English.** Domain terms, entity and field names, enum and status values, stage and role names, event names, API contracts, and log/audit entries stay in English. The ubiquitous language of `domain-model.md` is English and is never translated in code or data.
- **Locale is presentation, not domain.** Nothing about the domain model, storage, or business rules changes with the display language. Client- and consultant-entered content is stored as entered and is never machine-translated.
- **Additional languages are deliberately deferred.** German-only is the MVP scope; readiness is required, a second language is not.

---

## MVP Boundary

The product is considered **functionally complete as an MVP after Phase 9**. By that point, the full consulting methodology is supported end to end — from discovery (including its value & measurement baseline) through assessment, prioritization, grounded recommendations (with technologies and models grounded in the Technology Knowledge Base), roadmap, and a versioned client-ready report, including the iterative feedback loop that lets an engagement evolve after delivery. The two curated knowledge bases (Consulting and Technology) that ground that methodology are in place by Phase 5 and its Phase 5A extension, and the multi-user, workspace-isolated foundation with client collaboration is in place from Phase 3A.

**Phase 3A is inside the MVP, deliberately.** Multi-user access, workspace isolation, and client-completed discovery are not deployment concerns — they change *what the consultant can do* (run engagements alongside colleagues, and have the client fill in discovery directly), and validating the methodology with real engagements means validating it with real users and real clients. Its inclusion does not move the MVP boundary, which remains after Phase 9.

The phases beyond the MVP are deliberately separated from that core:

- **Phase 10 (RAG Enhancement)** improves the *quality* of Consulting Knowledge Base retrieval, but adds no new business capability the consultant did not already have.
- **Phase 11 (Production Readiness)** prepares the product for real-world **deployment and operation** — deployment, monitoring, operational security, backup, recovery, and performance — rather than extending the methodology. Note that authentication and authorization are *not* deferred to this phase; they are delivered in Phase 3A, and Phase 11 operates and hardens them.

Drawing the MVP boundary here allows the consulting methodology to be **validated with real engagements before investing in advanced retrieval and production infrastructure**. If the methodology proves its value, RAG and production hardening are the natural next investments; if it needs adjustment, that is learned before those investments are made.

## Reference Solutions

The Workbench is intentionally designed as a **domain-independent consulting platform**. The consulting methodology, engagement lifecycle, knowledge architecture, AI governance, and collaboration model are reusable across industries.

After the MVP and Production Readiness phases, the platform is extended through **Reference Solutions** — curated domain packages that specialize the generic consulting workflow for specific industries without changing the core architecture.

Each Reference Solution may contribute:

- domain-specific Discovery templates;
- Assessment frameworks;
- Business Process taxonomy;
- AI Readiness criteria;
- Opportunity catalogues;
- AI Use Cases;
- Solution Patterns;
- Technology recommendations;
- ROI models;
- Risk models;
- Follow-up Question templates;
- Report templates;
- KPI libraries.

Reference Solutions remain reusable knowledge packages built on top of the common Consulting Knowledge Base and Technology Knowledge Base.

### Reference Solution 1 — Contact Center AI

The first official Reference Solution focuses on **AI-powered Contact Centers**, reflecting the primary consulting domain of the product.

It extends the platform with consulting assets specifically for Contact Center transformation, including:

- Contact Center Discovery templates.
- Call flow assessment.
- Customer service process analysis.
- Voicebot and Chatbot opportunity identification.
- Agent-assist opportunities.
- Quality assurance automation.
- AI call summarization.
- Knowledge Assistant use cases.
- Contact Center KPI library (AHT, FCR, CSAT, NPS, Containment Rate, Transfer Rate, Service Level, Occupancy, etc.).
- Contact Center implementation patterns.
- Voice AI implementation roadmaps.
- Contact Center report templates.

### Dialfire Integration

Dialfire is treated as a **reference implementation**, not as a platform dependency.

The Contact Center Reference Solution may integrate with Dialfire to support:

- importing call flows;
- importing queue and campaign configuration;
- importing operational metrics;
- analysing existing call-center configuration;
- generating AI transformation recommendations;
- producing migration and implementation roadmaps for AI-enabled contact centers.

The platform architecture remains vendor-neutral, allowing equivalent integrations with other contact-center platforms in the future.