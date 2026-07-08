# Roadmap — AI Consulting Workbench

Status: **Stable** · Version: 1.0 · Derived from [product-vision.md](./product-vision.md) and [domain-model.md](./domain-model.md).

This roadmap is **implementation-independent**. It defines *what business capability* each phase delivers and *when*, in an order that respects the agreed product direction. It does not prescribe software architecture, frameworks, storage, APIs, or technology choices — those belong to `architecture.md`.

## How to read this roadmap

- The phases follow the **consulting methodology** as agreed in the product vision, delivered one complete capability at a time.
- **Each phase leaves the application in a fully working state.** A phase is never a partial slice that requires a later phase to become usable; the consultant gains a real, usable capability at the end of every phase.
- **Each phase delivers one complete business capability** from the domain model, not a technical layer.
- **The methodology is iterative, not a one-directional pipeline.** Later phases add re-entry and revision capability to stages delivered earlier; they do not replace them.
- **Existing infrastructure is reused wherever possible.** Engagement persistence, analysis-run recording, prompt versioning/fingerprinting, and Langfuse tracing already exist and are extended by each phase rather than rebuilt. These are described in [Cross-cutting Capabilities](#cross-cutting-capabilities).
- **Grounding order is fixed.** Recommendations are grounded in the curated Knowledge Base, so the curated Knowledge Base phase precedes solution matching. **RAG remains after the curated Knowledge Base phase**, as an enhancement over meaningful curated content — never as the initial retrieval mechanism.
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

**Goal.** Let the consultant capture structured information about the client's situation and make explicit what is still unknown.

**Business capability.** Build and revise the **Discovery Profile** for an engagement.

**Scope.**
- Capture the client's situation, operations, problems, current process, tools, data, constraints, and goals as structured discovery content.
- Record not only what is known but **what is still missing**, so gaps are visible to the consultant.
- Allow the Discovery Profile to be revised as understanding improves; it is re-entrant.
- Shape discovery around the Customer Operations domain (its discovery questions and taxonomy are supplied by the Knowledge Base once curated in Phase 5; until then, discovery uses the agreed Customer Operations structure).

**Definition of Done.**
- A consultant can enter, save, and revise a Discovery Profile on an engagement.
- Known information and missing information are both represented and visible.
- The Discovery Profile persists as engagement state and is available as factual input to later stages.

**Success Criteria**
- Discovery can be completed end-to-end.
- Missing information is clearly identified.
- Discovery can be resumed later.

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

## Phase 5 — Curated Knowledge Base

**Goal.** Establish the reusable, engagement-independent consulting knowledge that grounds recommendations, with deterministic retrieval.

**Business capability.** Curate and retrieve the **Knowledge Base**, scoped to the Customer Operations business domain.

**Scope.**
- Hold the agreed kinds of reusable knowledge: **Business Domains**, **Business Processes**, **Business Problems**, **Customer Operations Taxonomy**, **Discovery Questions**, **Assessment Frameworks**, **AI Readiness Criteria**, **AI Use Cases**, **Solution Patterns**, **Implementation Patterns**, **Technology Profiles**, **ROI Models**, **Risk Models**, **Best Practices**, and **Follow-up Templates**.
- Keep the Knowledge Base **strictly separate** from engagement state: engagements reference knowledge; knowledge never depends on an engagement.
- Provide **curated, structured, deterministic retrieval and matching** — no embeddings, no semantic retrieval at this phase.
- Curation is a deliberate activity, separate from running an engagement.
- Feed earlier stages that reference knowledge (discovery questions shape Discovery; frameworks and AI-readiness criteria shape Assessment).

**Definition of Done.**
- The Knowledge Base exists as a reusable asset with Customer Operations content, independent of any engagement.
- Deterministic retrieval returns relevant knowledge for a given engagement context.
- Discovery and Assessment can draw on Knowledge Base questions, frameworks, and criteria.
- **RAG is explicitly out of scope here and follows in Phase 10.**

**Success Criteria**
- Relevant knowledge can be found deterministically.
- Knowledge is reusable across engagements.

---

## Phase 6 — Solution Matching & Grounded Recommendations

**Goal.** Connect prioritized opportunities to reusable knowledge to produce grounded, explainable, editable recommendations.

**Business capability.** Produce **Recommendations** grounded in the Knowledge Base.

**Scope.**
- Match Opportunities against the Knowledge Base (**AI Use Cases**, **Solution Patterns**, **Technology Profiles**) using the curated retrieval from Phase 5.
- Each Recommendation carries **rationale, assumptions, confidence, and expected value**, and is **traceable** both backward to Discovery Profile facts and to the Knowledge Base entries that justify it.
- Recommendations copy the reasoning into engagement-specific content but never modify the Knowledge Base (one-directional reference).
- Recommendations are **editable and overridable** by the consultant.
- AI-assisted matching runs are recorded and observed per [Cross-cutting Capabilities](#cross-cutting-capabilities).

**Definition of Done.**
- A consultant can generate, review, edit, and accept Recommendations for prioritized Opportunities.
- Every Recommendation is traceable to the discovery facts and Knowledge Base knowledge that ground it, and grounding is visible.
- Assumptions and confidence are surfaced; the consultant can override any recommendation.
- Each matching run is recorded as an Analysis Run and traced in Langfuse.

**Success Criteria**
- Every recommendation references the Knowledge Base.
- Every recommendation contains rationale.
- Every recommendation contains confidence.

---

## Phase 7 — Implementation Roadmap

**Goal.** Sequence accepted recommendations into a practical path forward for the client.

**Business capability.** Assemble the **Implementation Roadmap** for an engagement.

**Scope.**
- Organize accepted **Recommendations** into an ordered set of phases or steps with goals and dependencies.
- Reflect the engagement's prioritization and the client's readiness.
- Draw on **Implementation Patterns** from the Knowledge Base to inform realistic sequencing and effort expectations.
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

**Business capability.** Produce a **versioned Consultant Report** and **Follow-up Questions**.

**Scope.**
- Assemble discovery, assessment, prioritized problems, grounded recommendations, roadmap, and follow-up questions into one coherent, client-ready document.
- The report is **editable** by the consultant and **versioned**, preserving exactly what was reviewed and delivered at each iteration.
- Turn outstanding gaps and missing information into **Follow-up Questions** for the client, using the Knowledge Base's follow-up templates.
- Any AI-assisted assembly or drafting runs are recorded and observed per [Cross-cutting Capabilities](#cross-cutting-capabilities).

**Definition of Done.**
- A consultant can generate, edit, and save a Consultant Report version and place it in front of a client.
- Each delivered version is preserved and retrievable.
- Follow-up questions covering the engagement's gaps are produced and included.

**Success Criteria**
- Report is client-ready.
- Report is editable.
- Report is versioned.

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

## Phase 10 — RAG Enhancement over the Knowledge Base

**Goal.** Enhance grounding with semantic retrieval once the curated Knowledge Base holds meaningful content.

**Business capability.** Add **semantic (RAG) retrieval** as an enhancement to Knowledge Base grounding, alongside the existing curated retrieval.

**Scope.**
- Introduce embeddings and semantic retrieval over the curated Knowledge Base to improve matching in discovery grounding, assessment, and solution matching.
- **RAG complements the curated Knowledge Base; it does not replace it.** The curated, structured knowledge and the traceability of grounding remain intact.
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

## Phase 11 — Production Readiness

**Goal.** Prepare the workbench for real-world use beyond local development.

**Business capability.** A deployable, secure, monitorable, production-ready consulting platform.

**Scope.**
- Authentication / access control.
- Production deployment.
- Environment configuration.
- Security hardening.
- Monitoring.
- Error handling.
- Export improvements.
- Performance review.
- Backup / recovery considerations.
- Operational documentation.

**Definition of Done.**
- The application can be deployed and operated safely.
- Access is controlled.
- Environment setup is documented.
- Errors and operational issues are observable.
- Reports and engagement data can be handled reliably.

**Success Criteria**
- A consultant can use the workbench on real engagements outside a developer's machine.
- Only authorized people can reach engagement and client data.
- When something goes wrong, it can be seen and addressed before it harms client work.
- Client deliverables and engagement data can be trusted to survive normal operation.

---

## Cross-cutting Capabilities

These capabilities are **not phases**. They apply across multiple phases and are delivered wherever a phase introduces new AI-assisted functionality. They are built on **existing infrastructure that is reused and extended**, never rebuilt per phase. Any phase that adds AI functionality (Phases 3, 6, 8, 9, 10, and any later AI-assisted step) must satisfy every item below for that functionality; this obligation is stated here once rather than repeated in each phase.

**Cost tracking and observability are mandatory for every new AI-assisted capability.** No phase may introduce AI functionality without capturing the signals below; this is a non-negotiable acceptance criterion for Phases 3, 6, 8, 9, 10, and any later AI-assisted step.

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

---

## MVP Boundary

The product is considered **functionally complete as an MVP after Phase 9**. By that point, the full consulting methodology is supported end to end — from discovery through assessment, prioritization, grounded recommendations, roadmap, and a versioned client-ready report, including the iterative feedback loop that lets an engagement evolve after delivery.

The phases beyond the MVP are deliberately separated from that core:

- **Phase 10 (RAG Enhancement)** improves the *quality* of knowledge retrieval, but adds no new business capability the consultant did not already have.
- **Phase 11 (Production Readiness)** prepares the product for real-world deployment and operation, rather than extending the methodology.

Drawing the MVP boundary here allows the consulting methodology to be **validated with real engagements before investing in advanced retrieval and production infrastructure**. If the methodology proves its value, RAG and production hardening are the natural next investments; if it needs adjustment, that is learned before those investments are made.
