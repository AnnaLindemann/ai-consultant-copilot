# Domain Model — AI Consulting Workbench

Status: **Stable** · Version: 1.0 · Derived from [product-vision.md](./product-vision.md).

This document defines the **business domain** only. It is implementation-independent: it does not describe software architecture, database tables, API endpoints, frameworks, or any storage or transport detail. It should remain valid even if all technology choices change, and it is the conceptual foundation that `architecture.md` and `roadmap.md` will later follow.

Throughout, the domain has two clearly separated sides:

- **Engagement side** — client-specific, mutable state produced while a consultant works with one client.
- **Knowledge side** — reusable, curated consulting knowledge that is shared across all engagements.

Engagement-side concepts *reference* knowledge-side concepts. Knowledge never depends on any engagement.

---

## 1. Domain Overview

The product supports an **AI Consultant** who is engaged by client companies to identify and recommend AI opportunities in their operations. The domain models the reality of that consulting work.

The central relationships are:

- A **Consultant** performs consulting work using the workbench. The consultant is the actor and the decision-maker; the domain exists to support them, not to replace them.
- An **Organization** is a client company the consultant works with.
- An **Engagement** is one complete piece of consulting work for an organization — from the first discovery conversation to the final report. One organization may have many engagements over time; each engagement is self-contained.
- The **Knowledge Base** is the consultant's accumulated, reusable expertise — use cases, patterns, taxonomies, guidance, and question templates. It is independent of any single client and grows in value across engagements.

The consultant runs an engagement by moving through a consulting methodology (discovery, assessment, prioritization, solution matching, roadmap, report). At each step the engagement draws on the Knowledge Base for grounding, and every AI-assisted step is recorded so its output can be trusted, explained, and revised.

The essential shape of the domain:

> **Consultant** works on an **Engagement** for an **Organization**, producing engagement-specific findings and a report, all **grounded in** the shared **Knowledge Base**.

---

## 2. Core Business Entities

Each entity below is described by its **purpose**, **main responsibilities**, and **relationships**. No fields or storage details are defined here.

### Organization
- **Purpose.** Represents a client company the consultant is engaged with.
- **Responsibilities.** Holds the identity and context of the client at a company level; groups all engagements conducted for that client.
- **Relationships.** Has many **Engagements**. Does not itself hold methodology state — that lives in the engagement.

### Engagement
- **Purpose.** The primary business entity. Represents one complete consulting engagement for an organization, from discovery through the final report.
- **Responsibilities.** Acts as the container and single source of truth for all client-specific work produced during the methodology. Tracks where the engagement stands and allows the consultant to open, save, resume, and revisit it. It is the unit of work.
- **Relationships.** Belongs to one **Organization**. Owns a **Discovery Profile**, an **Assessment**, its **Opportunities**, **Recommendations**, an **Implementation Roadmap**, and one or more **Consultant Report** versions. References the **Knowledge Base**. Its AI-assisted steps produce **Analysis Runs**.

### Discovery Profile
- **Purpose.** Captures the structured information gathered about the client's situation, operations, problems, current process, tools, data, constraints, and goals.
- **Responsibilities.** Serves as the factual input for all later stages. Records not only what is known but what is still missing, so gaps are visible to the consultant and can be filled by follow-up. It is revisable as understanding improves.
- **Relationships.** Belongs to one **Engagement**. Is shaped by the discovery questions and taxonomy of the engagement's business domain (from the **Knowledge Base**). Feeds the **Assessment**, **AI Readiness**, and **Opportunities**.

### Assessment
- **Purpose.** The consultant's structured evaluation of the client's business situation and operational processes — identifying bottlenecks, inefficiencies, areas of concern, and how prepared the client is to adopt AI.
- **Responsibilities.** Interprets the Discovery Profile against domain assessment frameworks to produce findings across several **assessment dimensions**. These dimensions are perspectives on the same evaluation, for example:
  - **Business Process Assessment** — how the client's operational processes work and where they break down.
  - **Data Assessment** — availability, quality, and accessibility of relevant data.
  - **Technology Assessment** — current tooling, systems, and integration constraints.
  - **AI Readiness** — how prepared the client is to adopt AI, given the above.
  - **Risks** — concerns and obstacles that could undermine adoption or value.
  - **Opportunities** — areas where improvement or AI could deliver value (carried forward as **Opportunity** entities).

  The Assessment makes explicit which findings are supported by discovery data and which rest on assumptions. **AI Readiness is one dimension of the Assessment, not a separate business entity** (the implementation may represent these dimensions however it chooses).
- **Relationships.** Belongs to one **Engagement**. Draws on the **Discovery Profile** and on assessment frameworks and AI-readiness criteria from the **Knowledge Base**. Informs **Problem Prioritization** and the resulting **Opportunities**.

### Opportunity
- **Purpose.** A candidate area where AI (or non-AI improvement) could deliver business value, derived from an identified problem or bottleneck.
- **Responsibilities.** Frames a problem as an actionable improvement candidate and carries the consultant's view of its value, effort, impact, and confidence, so opportunities can be prioritized against one another.
- **Relationships.** Belongs to one **Engagement**. Originates from the **Assessment** (and its problems). Is qualified by the Assessment's **AI Readiness** dimension. May lead to one or more **Recommendations**.

### Recommendation
- **Purpose.** A grounded proposal for how to address an opportunity, including which solution to pursue and, critically, *why it fits*.
- **Responsibilities.** Connects a client-specific opportunity to reusable knowledge, carrying the rationale, assumptions, confidence, and expected value behind the proposal. This is where explainability and traceability concentrate: a recommendation should be traceable both to the discovery facts that motivate it and to the Knowledge Base entries that justify it. Must be editable and overridable by the consultant.
- **Relationships.** Belongs to one **Engagement**. Addresses an **Opportunity**. Is grounded in reusable **Knowledge Base** knowledge — typically an **AI Use Case** and its **Solution Pattern**. Contributes to the **Implementation Roadmap** and the **Consultant Report**.

### Implementation Roadmap
- **Purpose.** A sequenced plan for realizing the accepted recommendations.
- **Responsibilities.** Organizes recommendations into an ordered set of phases or steps with goals and dependencies, giving the client a practical path forward. Reflects readiness and prioritization.
- **Relationships.** Belongs to one **Engagement**. Is assembled from accepted **Recommendations**. May draw on **Implementation Patterns** from the **Knowledge Base**. Is presented within the **Consultant Report**.

### Consultant Report
- **Purpose.** The professional, client-ready deliverable produced by the engagement.
- **Responsibilities.** Assembles discovery, assessment, prioritized problems, grounded recommendations, roadmap, and follow-up questions into a coherent document a consultant can place in front of a client. Is editable by the consultant and versioned, preserving exactly what was reviewed and delivered at each iteration.
- **Relationships.** Belongs to one **Engagement**. Draws its content from the engagement's other entities. Exists as one or more versions over the life of the engagement.

### Knowledge Base
- **Purpose.** The reusable, curated body of consulting knowledge that grounds engagement work across all engagements. A core product capability, not a document library.
- **Responsibilities.** Holds and organizes the many specific kinds of reusable consulting knowledge the workbench relies on — business domains and taxonomy, business processes and problems, discovery questions, assessment frameworks and AI-readiness criteria, AI use cases, solution and implementation patterns, technology profiles, ROI and risk models, best practices, and follow-up templates (the full catalog is described in §4). Remains a shared, engagement-independent asset that compounds in value as it grows.
- **Relationships.** Is a collection of reusable consulting knowledge. Is *referenced by* engagement-side entities (especially **Recommendations**, **Discovery Profiles**, and **Assessments**) but is never modified by them.

The most prominent kinds of knowledge are described below; §4 gives the complete picture. An implementation may share a common "knowledge item" abstraction across these kinds, but that is an implementation convenience, not the core domain concept: the domain is defined by the *specific* kinds of consulting knowledge, not by a generic container.

### AI Use Case
- **Purpose.** A reusable description of a recurring problem that AI can address and the value of doing so.
- **Responsibilities.** Captures the problem it solves, when it applies (applicability conditions), typical data needs, expected benefits, and associated risks and ROI considerations — independent of any single client.
- **Relationships.** A kind of reusable consulting knowledge, scoped to a **Business Domain** and its taxonomy. Grounds **Recommendations**. Is realized by one or more **Solution Patterns**.

### Solution Pattern
- **Purpose.** A reusable, proven way of solving the problem described by an AI Use Case.
- **Responsibilities.** Describes the recommended approach and shape of a solution at a conceptual level, along with its trade-offs, risks, and the conditions under which it is appropriate.
- **Relationships.** A kind of reusable consulting knowledge. Realizes one or more **AI Use Cases**. Refers to relevant **Technology Profiles** and **Implementation Patterns**. Grounds **Recommendations**.

### Implementation Pattern
- **Purpose.** Reusable guidance on *how* to implement a solution in practice.
- **Responsibilities.** Captures common implementation approaches, sequencing, and practical considerations that inform realistic roadmaps and effort expectations.
- **Relationships.** A kind of reusable consulting knowledge. Associated with **Solution Patterns**. Informs the **Implementation Roadmap**.

### Technology Profile
- **Purpose.** A reusable description of a technology, tool, or category of tooling relevant to solutions.
- **Responsibilities.** Provides curated, engagement-independent information about a technology's role, strengths, limitations, and suitability, so that tool suggestions in recommendations are grounded rather than invented.
- **Relationships.** A kind of reusable consulting knowledge. Referenced by **Solution Patterns** and, through them, by **Recommendations**.

### Analysis Run
- **Purpose.** A record of a single AI-assisted step performed during an engagement.
- **Responsibilities.** Provides the audit and governance trail behind AI-assisted output: what was run, on what, and with what quality/trust signals. Enables explainability, traceability, and the consultant's confidence in (or correction of) AI-produced content. It is a record *about* the assistance, not a piece of client deliverable content.
- **Relationships.** Belongs to one **Engagement** and is associated with the stage/output it supported (e.g., an **Assessment** or a set of **Recommendations**). Does not belong to the Knowledge Base.

---

## 3. Engagement Lifecycle

An engagement evolves from the first customer meeting to the final consultant report. Conceptually it passes through:

1. **Discovery** — the consultant gathers structured information about the client, building the **Discovery Profile** and noting what is still unknown.
2. **Assessment** — the client's business and operational processes are evaluated, producing findings, bottlenecks, and prioritized problems, together with an **AI Readiness** view.
3. **Problem Prioritization** — problems are weighed and ordered so effort focuses where value is highest, yielding candidate **Opportunities**.
4. **Knowledge grounding and solution matching** — opportunities are matched against the **Knowledge Base** (AI Use Cases, Solution Patterns, Technology Profiles) to form grounded **Recommendations**, each carrying rationale, assumptions, and confidence.
5. **Roadmap** — accepted recommendations are sequenced into an **Implementation Roadmap**.
6. **Report and follow-up** — the engagement's content is assembled into a versioned **Consultant Report**, and outstanding gaps become **follow-up questions** back to the client.
7. **Feedback and evolution** — sharing a report does not necessarily end the engagement. **Client Feedback** on the report or its recommendations can trigger a **Discovery Update** (new information comes to light), an **Assessment Update** (findings are revised), and **Recommendation Revision** (proposals are adjusted or re-grounded) — leading to a new report version.

**The lifecycle is iterative and spans multiple workshops.** A real engagement rarely completes in a single pass. It typically evolves across several client workshops and working sessions, with the consultant returning to earlier stages many times: discovery is revised after assessment reveals a gap; prioritization changes once knowledge retrieval surfaces a cheap, high-value pattern; recommendations are re-formed after a corrected assumption or client feedback; the report is re-versioned. Each stage operates on the persisted engagement state and can be re-entered and re-run without restarting the engagement. The methodology describes the consultant's thinking; it does not impose a one-directional sequence, and it does not assume the engagement ends when the first report is delivered.

Because the consultant remains in control throughout, movement between stages is driven by the consultant's judgment, and AI-assisted output at any stage is a reviewed draft that the consultant may accept, edit, or override.

---

## 4. Knowledge Base Model

The Knowledge Base is a curated **collection of reusable consulting knowledge**, scoped by business domain. Its purpose is to ground engagement work — discovery, assessment, and especially recommendations — in consistent, reusable expertise. It is best understood not as a container of undifferentiated items but as a set of specific, named kinds of consulting knowledge:

- **Business Domains** — the top-level scoping concept (Customer Operations first; others later). Every piece of knowledge belongs to one or more domains, which is what lets new domains be added alongside existing ones.
- **Business Processes** — reusable descriptions of common operational processes within a domain, used to recognize and frame how a client works.
- **Business Problems** — reusable descriptions of recurring problems and bottlenecks a client may exhibit, used to recognize and name what is going wrong.
- **Customer Operations Taxonomy** — the structured vocabulary of the first domain (its functions and channels: email support, customer service, call centers, live chat, help desk, CRM, ticket management, booking & reservations, guest communication, sales support). The taxonomy classifies knowledge and shapes discovery and assessment for that domain.
- **Discovery Questions** — reusable question sets that drive the **Discovery Profile** for a domain.
- **Assessment Frameworks** — reusable frameworks that structure the **Assessment** and its dimensions.
- **AI Readiness Criteria** — reusable criteria for evaluating how prepared a client is to adopt AI, feeding the AI Readiness dimension of the Assessment.
- **AI Use Cases** — recurring, solvable problems and the value of addressing them.
- **Solution Patterns** — reusable approaches that realize use cases.
- **Implementation Patterns** — reusable guidance on how solutions are implemented in practice.
- **Technology Profiles** — curated descriptions of relevant tools and technologies.
- **ROI Models** — reusable guidance and models for estimating and framing business value.
- **Risk Models** — reusable guidance and models for common risks and their mitigation.
- **Best Practices** — curated recommendations distilled from prior work.
- **Follow-up Templates** — reusable templates for the follow-up questions returned to clients.

**How engagement data references knowledge without modifying it.** Engagement-side entities *point to* knowledge entries and *copy the reasoning into* their own client-specific content, but they never alter the knowledge itself. A **Recommendation** references an **AI Use Case** and **Solution Pattern** to justify itself; a **Discovery Profile** is shaped by a domain's **Discovery Questions**; an **Assessment** applies **Assessment Frameworks** and **AI Readiness Criteria**. Improving the Knowledge Base is a separate, deliberate curation activity — not a side effect of running an engagement. This one-directional reference (engagement → knowledge) keeps the Knowledge Base stable, shareable, and reusable, and keeps each engagement's record faithful to the knowledge as it stood when the work was done.

---

## 5. Product Principles Reflected in the Domain

The domain model is shaped to support the vision's principles:

- **Consultant-first.** The consultant is the actor; entities represent the consultant's work products, and every AI-assisted output is a draft they own. The domain has no concept of the system acting on its own.
- **Human-in-the-loop.** **Recommendations** are editable, **Consultant Reports** are versioned, and the **Assessment** (including its AI Readiness dimension) and **Recommendations** carry assumptions and confidence — the domain treats human review and override as first-class.
- **Explainability.** Recommendations carry rationale and confidence, and the **Assessment** exposes assumptions across its dimensions, so every proposal can be explained rather than merely asserted.
- **Traceability.** A recommendation is traceable *backward* to the **Discovery Profile** facts that motivate it and to the **Knowledge Base** knowledge that justifies it, and **Analysis Runs** trace the AI assistance behind each stage.
- **Reusability.** Knowledge lives once in the **Knowledge Base** and is referenced by many engagements; it is never duplicated or mutated per client.
- **Domain extensibility.** **Business Domain** scoping and per-domain taxonomy, discovery questions, and criteria mean a new domain is added as new knowledge, not as a change to the core entities.
- **Knowledge-driven recommendations.** The path from problem to proposal runs **Opportunity → Recommendation → Knowledge Base knowledge**, so recommendations are grounded in curated knowledge by construction rather than produced free-form.

---

## 6. Product Boundaries — What This Is Not

Defining the domain also means stating what is deliberately outside it:

- **Not a CRM.** It does not manage customer records, contacts, deals, or ongoing customer relationships. **Organization** exists only to group consulting engagements, not to run the client's sales or support operations.
- **Not an autonomous consultant.** It does not make decisions or deliver recommendations on its own. It assists a human consultant, who reviews, edits, and owns every output.
- **Not a workflow automation platform.** It does not execute, orchestrate, or automate the client's business processes. It *analyzes* processes to recommend improvements; it does not run them.
- **Not a generic chatbot.** It is not an open-ended conversational assistant. It is a structured workbench organized around engagements, a defined methodology, and a curated knowledge base.
- **Not a data platform or BI tool.** It does not ingest, store, or analyze the client's operational datasets; discovery captures structured *descriptions* of the situation, not the client's raw data.

These boundaries keep the product focused on supporting the consultant's judgment rather than expanding into adjacent systems.

---

## 7. Future Extensibility

The domain is designed so that additional business domains — HR, Finance, Legal, Manufacturing, and others — can be added **without redesigning the core**.

- The **core engagement entities** (Organization, Engagement, Discovery Profile, Assessment, Opportunity, Recommendation, Implementation Roadmap, Consultant Report, Analysis Run) are **domain-agnostic**. They describe the *shape* of consulting work, not the specifics of any one domain, and do not change when a new domain is introduced.
- What varies per domain lives in the **Knowledge Base**, scoped by **Business Domain**: its taxonomy, discovery questions, assessment criteria, AI use cases, solution patterns, technology profiles, and guidance. Adding a domain means **adding a new body of curated knowledge**, not altering the entities.
- Because engagement data only *references* knowledge, existing engagements and existing domains are unaffected when a new domain is added.

Customer Operations is implemented concretely first. The general multi-domain capability is expressed here as a modeling principle — domain-agnostic core plus domain-scoped knowledge — and is only exercised further when a second domain is actually introduced, in keeping with the vision's decision not to build the multi-domain abstraction ahead of need.

---

## 8. Ubiquitous Language

These are the core business terms and their agreed meanings. They form the common vocabulary for all future documentation and implementation; the same word should mean the same thing everywhere.

- **Organization** — a client company the consultant works with. Groups all engagements conducted for that client; it is not a customer-relationship record.
- **Engagement** — one complete consulting engagement for an organization, from discovery through the final report and any later revisions. The primary business entity and the unit of work.
- **Discovery** — the activity of gathering structured information about the client's situation, and the resulting **Discovery Profile** that captures what is known and what is still missing.
- **Assessment** — the structured evaluation of the client across several dimensions (business process, data, technology, **AI Readiness**, risks, opportunities). AI Readiness is a dimension of the Assessment, not a separate entity.
- **Opportunity** — a candidate area, derived from an identified problem or bottleneck, where AI or other improvement could deliver business value.
- **Recommendation** — a grounded, editable proposal that addresses an opportunity, carrying rationale, assumptions, and confidence, and traceable to both discovery facts and Knowledge Base knowledge.
- **Knowledge Base** — the reusable, curated, engagement-independent collection of consulting knowledge (use cases, patterns, technology profiles, taxonomy, guidance, questions, templates) that grounds engagement work. Referenced by engagements, never modified by them.
- **AI Use Case** — a reusable description of a recurring problem AI can address and the value of doing so; grounds recommendations and is realized by solution patterns.
- **Solution Pattern** — a reusable, proven approach for realizing an AI use case, with its trade-offs and applicability conditions.
- **Consultant Report** — the professional, client-ready, editable, versioned deliverable produced by an engagement.
- **Analysis Run** — a record of a single AI-assisted step within an engagement, providing the audit and trust trail (what was run, on what, with what quality signals) behind AI-assisted output.

---

This document is implementation-independent and intended to remain stable across changes in technology, storage, APIs, and frameworks. It is the conceptual foundation for `architecture.md` and `roadmap.md`.
