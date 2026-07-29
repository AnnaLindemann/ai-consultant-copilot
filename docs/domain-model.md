# Domain Model — AI Consulting Workbench

Status: **Stable** · Version: 1.2 · Derived from [product-vision.md](./product-vision.md).

> **Revision 1.2 (approved).** Introduces the **access and collaboration side** of the domain and deepens Discovery:
> - **Workspace** becomes the **ownership and isolation boundary** for all engagement-side concepts. A **User** holds one of three roles — **Administrator** (all engagements in their workspace), **Manager** (only the engagements they own), **Client** (only the Discovery form associated with their own self-registration). **Engagement Ownership** is explicit: every engagement belongs to one workspace and has one owning Manager.
> - Adds **Discovery Access**, the **Client Discovery Portal** as a bounded client-facing surface, the discovery **Draft / Submit / Return** collaboration workflow, **Notification**, and an append-only **Audit Trail** — the third governance record, distinct from the engagement-scoped **Analysis Run** and the curation-scoped **Technology Update History**.
> - The **Discovery Profile** gains a **value & measurement baseline** (Business Impact; Error Frequency / Severity / Cost; Existing KPIs; Baseline Metrics; Target Success Metrics; Measurement Method; Data Sources), a **status** (draft / submitted / returned / accepted), and **provenance** (consultant-captured vs. client-provided).
> - Records that the **ubiquitous language is English and is never translated**, while user-facing presentation is localizable (German-only MVP).
>
> The knowledge side, the methodology, and every existing principle are unchanged. Roadmap phase numbers are unchanged; these capabilities are delivered by the Phase 2 Extension and Phase 3A.
>
> **Revision 1.1 (approved).** Splits the single Knowledge Base into a **Consulting Knowledge Base** and a separate, more frequently-updated **Technology Knowledge Base**, and adds the **Technology Curator** workflow that updates the latter under explicit human approval, recording each proposed change as a **Technology Update Proposal** and each approved, applied revision in an append-only **Technology Update History**. The Technology Knowledge Base is **hierarchical and category-based** (organizing **Technology Profiles** under **Technology Categories**), and updates reference explicit **Technology Sources** (official vendor origins) that the proposal cites and the history preserves. The engagement side and all existing principles are unchanged.

This document defines the **business domain** only. It is implementation-independent: it does not describe software architecture, database tables, API endpoints, frameworks, or any storage or transport detail. It should remain valid even if all technology choices change, and it is the conceptual foundation that `architecture.md` and `roadmap.md` will later follow.

Throughout, the domain has two clearly separated sides, plus the access boundary that contains one of them:

- **Engagement side** — client-specific, mutable state produced while a consultant works with one client.
- **Knowledge side** — reusable, curated knowledge shared across all engagements. The knowledge side comprises **two independent knowledge bases**: the **Consulting Knowledge Base** (stable consulting methodology knowledge) and the **Technology Knowledge Base** (fast-changing AI-technology knowledge). They are independent of each other as well as of any engagement.
- **Access and collaboration** (Revision 1.2) — the **Workspace** that owns and isolates the engagement side, the **Users** and **roles** that act within it, and the collaboration concepts through which a client contributes to Discovery. This is not a third body of content; it is the boundary and the authority model around the engagement side.

Engagement-side concepts *reference* knowledge-side concepts. Neither knowledge base ever depends on any engagement, nor on the other. **Every engagement-side concept belongs to exactly one Workspace**, and nothing on the engagement side is reachable outside its workspace.

---

## 1. Domain Overview

The product supports an **AI Consultant** who is engaged by client companies to identify and recommend AI opportunities in their operations. The domain models the reality of that consulting work.

The central relationships are:

- A **Consultant** performs consulting work using the workbench. The consultant is the actor and the decision-maker; the domain exists to support them, not to replace them. In the multi-user model (Revision 1.2), a consultant is a **User** holding the **Manager** role — or the **Administrator** role, which is a consultant with workspace-wide oversight. "Consultant" remains the domain word for the person doing the consulting work; Manager and Administrator describe the authority that person holds.
- A **Workspace** is the consulting organization's own boundary: it owns its users, its client organizations, and its engagements, and isolates them from every other workspace.
- An **Organization** is a client company the consultant works with.
- An **Engagement** is one complete piece of consulting work for an organization — from the first discovery conversation to the final report. One organization may have many engagements over time; each engagement is self-contained.
- The **Consulting Knowledge Base** is the consultant's accumulated, reusable expertise — use cases, patterns, taxonomies, guidance, and question templates. It is independent of any single client and grows in value across engagements.
- The **Technology Knowledge Base** is a separate, reusable body of knowledge about the AI technologies a solution might use (LLMs, embedding models, speech models, OCR, rerankers, vector databases, MCP servers, browser/computer-use frameworks, workflow engines, and the like). It is kept independent from the Consulting Knowledge Base because it changes far more frequently, and it is updated only through the human-approved **Technology Curator** workflow.

The consultant runs an engagement by moving through a consulting methodology (discovery, assessment, prioritization, solution matching, roadmap, report). At each step the engagement draws on the Consulting Knowledge Base for grounding, and — where a recommendation names concrete technologies or models — on the Technology Knowledge Base. Every AI-assisted step is recorded so its output can be trusted, explained, and revised.

The essential shape of the domain:

> **Consultant** works on an **Engagement** for an **Organization**, producing engagement-specific findings and a report, all **grounded in** the shared **Consulting Knowledge Base**, with concrete technology and model choices grounded in the shared **Technology Knowledge Base**.

---

## 2. Core Business Entities

Each entity below is described by its **purpose**, **main responsibilities**, and **relationships**. No fields or storage details are defined here.

### Workspace
- **Purpose.** The **ownership and isolation boundary** of the product. A Workspace represents one consulting practice or team working in the workbench.
- **Responsibilities.** Owns its **Users**, its client **Organizations**, and its **Engagements** together with all their state, and isolates them completely from every other workspace. It is the answer to "whose data is this, and who may see it at all?" — the outermost question asked before any role or ownership question. A workspace holds no methodology content of its own; it is a container and a boundary.
- **Relationships.** Has many **Users** (each holding a role within it), many **Organizations**, and many **Engagements**. Every engagement-side concept belongs, transitively, to exactly one workspace. Does **not** own the **Consulting Knowledge Base** or the **Technology Knowledge Base** — those remain product-level curated assets shared across workspaces and read-only from any engagement.

### User
- **Purpose.** A person with an identity who acts in the product, so that every action is attributable to someone.
- **Responsibilities.** Carries an identity that can be authenticated, and exactly one **role** within exactly one workspace, from which all their permissions derive. A user acts; the domain records what they did. Authentication state, passwords, sessions, verification, resets, and invitation mechanics are handled outside the consulting domain and are not stored as consulting domain state.
- **Relationships.** Belongs to one **Workspace** and holds one **Role** (Administrator, Manager, or Client). A Manager **owns** engagements. A Client is reached only through **Discovery Access**. Actions by users appear in the **Audit Trail** and may raise **Notifications**.

### Role
- **Purpose.** The authority a user holds. Three roles exist, and they are deliberately few.
  - **Administrator** — accesses **all engagements in their own workspace**, and manages that workspace's users, roles, ownership, and invitations. Their reach stops at the workspace boundary.
  - **Manager** — the consultant role. Creates and runs engagements and accesses **only the engagements they own**. A Manager cannot reach a colleague's engagement.
  - **Client** — an external participant. Has **no workbench access at all**; reaches only the **Discovery form of the one engagement they are associated with through Discovery Access**, through the **Client Discovery Portal**.
- **Responsibilities.** Determines what a user may do, always in combination with the workspace boundary and — for Managers — engagement ownership. A role never grants reach across workspaces.
- **Relationships.** Held by a **User** within a **Workspace**. Evaluated against **Engagement Ownership** for Managers and against **Discovery Access** for Clients.

The role identifiers are `ADMIN`, `MANAGER`, and `CLIENT`; the human-readable names above describe their meaning in prose.

### Discovery Access
- **Purpose.** A deliberate, bounded grant of access allowing one self-registered client to complete the Discovery form of **one specific engagement**.
- **Responsibilities.** Names the association between a self-registered client and one engagement's discovery, by whom, and until when; carries its own state (issued, accepted, revoked, expired). It is the **only** way a Client role obtains any access, and it grants nothing beyond that one engagement's Discovery. Revoking it ends the access immediately; it does not remove the content the client already contributed.
- **Relationships.** Issued by a **Manager** (the engagement's owner) or an **Administrator**, for one **Engagement**, to one **Client** user. Its issuance, acceptance, revocation, and expiry are recorded in the **Audit Trail** and may raise **Notifications**.

### Organization
- **Purpose.** Represents a client company the consultant is engaged with.
- **Responsibilities.** Holds the identity and context of the client at a company level; groups all engagements conducted for that client.
- **Relationships.** Belongs to one **Workspace**. Has many **Engagements**. Does not itself hold methodology state — that lives in the engagement.

### Engagement
- **Purpose.** The primary business entity. Represents one complete consulting engagement for an organization, from discovery through the final report.
- **Responsibilities.** Acts as the container and single source of truth for all client-specific work produced during the methodology. Tracks where the engagement stands and allows the consultant to open, save, resume, and revisit it. It is the unit of work.
- **Relationships.** Belongs to one **Organization** and, through it, to exactly one **Workspace**. Has exactly one **owning Manager** (**Engagement Ownership**); ownership may be transferred by an Administrator and is what a Manager's access is measured against. Owns a **Discovery Profile**, an **Assessment**, its **Opportunities**, **Recommendations**, an **Implementation Roadmap**, and one or more **Consultant Report** versions. References the **Consulting Knowledge Base** and the **Technology Knowledge Base**. Its AI-assisted steps produce **Analysis Runs**; actions upon it appear in the **Audit Trail**.

### Discovery Profile
- **Purpose.** Captures the structured information gathered about the client's situation, operations, problems, current process, tools, data, constraints, and goals — **and what that situation costs the business today, against what success would measurably look like**.
- **Responsibilities.** Serves as the factual input for all later stages. Records not only what is known but what is still missing, so gaps are visible to the consultant and can be filled by follow-up. It is revisable as understanding improves.

  It carries, in addition to the qualitative picture, the engagement's **value & measurement baseline** (Revision 1.2):
  - **Business Impact** — what the problem costs the business in operational terms.
  - **Error Frequency / Severity / Cost** — how often things go wrong, how serious each occurrence is, and what it costs.
  - **Existing KPIs** — what the client already measures for the affected operations.
  - **Baseline Metrics** — the current measured values of those indicators.
  - **Target Success Metrics** — what the client would consider success, in the same terms as the baseline.
  - **Measurement Method** — how each figure is or would be measured, so it can be trusted and re-measured.
  - **Data Sources** — where each figure came from, so its reliability is visible.

  Two rules govern this baseline. **An absent baseline is a finding, not an empty field** — "the client does not measure this" is knowledge the assessment and the follow-up questions must carry forward. And **an estimate is never presented as a measurement**; how a figure was obtained travels with the figure.

  The Discovery Profile also carries its **status** in the review workflow (draft → submitted → returned → accepted; see §3A) and the **provenance** of its content — whether it was **consultant-captured** or **client-provided**. Client-provided content is a reviewed draft in exactly the sense AI-assisted output is: it enters later stages as accepted fact only after the consultant has reviewed it.
- **Relationships.** Belongs to one **Engagement**. Is shaped by the discovery questions and taxonomy of the engagement's business domain (from the **Consulting Knowledge Base**). May be completed by a self-registered **Client** through the **Client Discovery Portal** under **Discovery Access**, and is reviewed by the engagement's owning **Manager**. Feeds the **Assessment**, **AI Readiness**, and **Opportunities**; its value & measurement baseline is the factual ground for expected value, ROI framing, and the report's success criteria.

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
- **Responsibilities.** Connects a client-specific opportunity to reusable knowledge, carrying the rationale, assumptions, confidence, and expected value behind the proposal. This is where explainability and traceability concentrate: a recommendation should be traceable to the discovery facts that motivate it, to the Consulting Knowledge Base entries that justify its approach, and — where it names concrete implementation technologies or AI models — to the Technology Knowledge Base entries behind them. Must be editable and overridable by the consultant.
- **Relationships.** Belongs to one **Engagement**. Addresses an **Opportunity**. Is grounded in reusable **Consulting Knowledge Base** knowledge — typically an **AI Use Case** and its **Solution Pattern**. May reference **Technology Knowledge Base** entries to recommend implementation technologies and suitable AI models, with explanations. Contributes to the **Implementation Roadmap** and the **Consultant Report**.

### Implementation Roadmap
- **Purpose.** A sequenced plan for realizing the accepted recommendations.
- **Responsibilities.** Organizes recommendations into an ordered set of phases or steps with goals and dependencies, giving the client a practical path forward. Reflects readiness and prioritization.
- **Relationships.** Belongs to one **Engagement**. Is assembled from accepted **Recommendations**. May draw on **Implementation Patterns** from the **Knowledge Base**. Is presented within the **Consultant Report**.

### Consultant Report
- **Purpose.** The professional, client-ready deliverable produced by the engagement.
- **Responsibilities.** Assembles discovery, assessment, prioritized problems, grounded recommendations, roadmap, and follow-up questions into a coherent document a consultant can place in front of a client. Is editable by the consultant and versioned, preserving exactly what was reviewed and delivered at each iteration.
- **Relationships.** Belongs to one **Engagement**. Draws its content from the engagement's other entities. Exists as one or more versions over the life of the engagement.

### Consulting Knowledge Base
- **Purpose.** The reusable, curated body of consulting knowledge that grounds engagement work across all engagements. A core product capability, not a document library.
- **Responsibilities.** Holds and organizes the many specific kinds of reusable consulting knowledge the workbench relies on — business domains and taxonomy, business processes and problems, discovery questions, assessment frameworks and AI-readiness criteria, AI use cases, solution and implementation patterns, ROI and risk models, best practices, and follow-up templates (the full catalog is described in §4.1). Remains a shared, engagement-independent asset that compounds in value as it grows. It changes slowly and deliberately, through human curation.
- **Relationships.** Is a collection of reusable consulting knowledge. Is *referenced by* engagement-side entities (especially **Recommendations**, **Discovery Profiles**, and **Assessments**) but is never modified by them. Its **Solution Patterns** refer to **Technology Profiles** in the separate Technology Knowledge Base; it does not contain them.

The most prominent kinds of knowledge are described below; §4.1 gives the complete picture. An implementation may share a common "knowledge item" abstraction across these kinds, but that is an implementation convenience, not the core domain concept: the domain is defined by the *specific* kinds of consulting knowledge, not by a generic container.

### Technology Knowledge Base
- **Purpose.** The reusable, curated body of knowledge about the AI technologies a solution might use — a separate core capability, kept apart from the Consulting Knowledge Base because it changes far more frequently.
- **Responsibilities.** Organizes **Technology Profiles** **hierarchically, under technology categories** — it is a category-based body of knowledge, not a flat list of profiles. Each **Technology Category** (AI Models, AI Providers, Embedding Models, Speech, OCR, Vector Databases, Rerankers, MCP Servers, Browser / Computer Use, Workflow Engines, Evaluation Frameworks, Monitoring, Deployment Patterns; the full picture is in §4.2) groups the Technology Profiles of that kind. Each profile describes a technology's role, strengths, limitations, and suitability so that technologies and models named in recommendations are grounded, not invented. Remains a shared, engagement-independent asset. It is updated **only** through the human-approved **Technology Curator** workflow (§4.3), attributing every change to explicit **Technology Sources**; nothing writes to it as a side effect of running an engagement, and no AI writes to it autonomously.
- **Relationships.** Is a category-organized collection of reusable technology knowledge. Organizes **Technology Profiles** under **Technology Categories**. Is *referenced by* engagement-side **Recommendations** (to recommend implementation technologies and suitable AI models, with explanations) and by the Consulting Knowledge Base's **Solution Patterns**, but is never modified by them. Is updated by the **Technology Curator** through approved **Technology Update Proposals**, each attributed to one or more **Technology Sources**.

### Technology Category
- **Purpose.** The top-level organizing concept of the Technology Knowledge Base — the kind of technology a Technology Profile describes (AI Models, AI Providers, Embedding Models, Speech, OCR, Vector Databases, Rerankers, MCP Servers, Browser / Computer Use, Workflow Engines, Evaluation Frameworks, Monitoring, Deployment Patterns).
- **Responsibilities.** Classifies Technology Profiles so the subsystem is navigable and hierarchical rather than flat, and so retrieval can scope to a kind of technology (e.g., "vector databases" or "speech"). Categories may nest into sub-categories where useful, and new categories can be added as the technology landscape grows without disturbing existing ones.
- **Relationships.** Belongs to the **Technology Knowledge Base**. Groups many **Technology Profiles**. Does not belong to any engagement.

### Technology Source
- **Purpose.** Represents the **official origin of technology information** — the vendor or official channel an update legitimately comes from (for example OpenAI, Anthropic, Google, Meta, Groq, Mistral). It is the provenance concept that makes Technology Knowledge Base updates auditable.
- **Responsibilities.** Identifies a trusted official origin (its name and official channel — announcement feed, model cards, documentation). It exists so that every proposed and applied change can be attributed to *where* the information officially came from. It is engagement-independent and is not itself a Technology Profile; it is a curated registry of trusted origins.
- **Relationships.** Belongs to the **Technology Knowledge Base** subsystem. Is *referenced by* one or more **Technology Update Proposals** and preserved on the resulting **Technology Update History** entries. A Technology Source often corresponds to a vendor also profiled under the **AI Providers** Technology Category, but the two play different roles — the Source is curation *provenance*; the AI Providers profile is curated *content* used in recommendations. Does not belong to any engagement.

### Technology Update Proposal
- **Purpose.** A structured, human-reviewable proposal to change the Technology Knowledge Base, produced by the Technology Curator when a candidate update is detected from one or more trusted **Technology Sources**.
- **Responsibilities.** Describes a proposed change (new, revised, or deprecated technology/model information), records its provenance by **referencing one or more Technology Sources** it derives from, and carries an explicit approval decision. It is the governance record of a *proposed* curation change — whether ultimately approved or rejected — and the change it describes takes effect **only** after explicit human approval. It is a record *about* a curation change, not engagement deliverable content, and it does not belong to any engagement.
- **Relationships.** Targets the **Technology Knowledge Base** (a specific Technology Profile within a Technology Category). **References one or more Technology Sources.** Is produced and approved (or rejected) through the **Technology Curator** workflow; an approved proposal, once applied, produces a **Technology Update History** entry that preserves those source references. Is *not* part of an **Engagement** and is *not* an **Analysis Run** (which is engagement-scoped).

### Technology Update History
- **Purpose.** The append-only audit log of **approved** changes actually applied to the Technology Knowledge Base — the record of how the Technology Knowledge Base came to hold the content it holds today.
- **Responsibilities.** Records **approved KB revisions only**: for each applied change, what changed (which Technology Profile, in which Technology Category), the approved Technology Update Proposal behind it, **the Technology Source(s) it derived from (preserved for auditability)**, who approved it, and when. It is append-only — entries are never rewritten or deleted (mirroring append-only Consultant Report versions) — and it does **not** record proposals that were rejected. It is distinct from the **Technology Update Proposal** (which covers a single proposed change and its decision) and from the **Analysis Run** (which is engagement-scoped AI assistance). It is a record *about* curation and belongs to no engagement.
- **Relationships.** Belongs to the **Technology Knowledge Base** subsystem. Each entry originates from exactly one approved, applied **Technology Update Proposal** and **preserves that proposal's Technology Source references**. Is *not* part of an **Engagement** and is *not* an **Analysis Run**; together with the proposals it is the Technology Knowledge Base's own governance trail.

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
- **Purpose.** A reusable description of a single AI technology, tool, or model relevant to solutions — for example an LLM, embedding model, speech model, OCR, reranker, vector database, MCP server, browser/computer-use framework, or workflow engine.
- **Responsibilities.** Provides curated, engagement-independent information about a technology's role, strengths, limitations, and suitability, so that technology and model suggestions in recommendations are grounded rather than invented. Because this information changes frequently, it is maintained only through the human-approved **Technology Curator** workflow.
- **Relationships.** The unit of knowledge held by the **Technology Knowledge Base** (not the Consulting Knowledge Base), **classified under exactly one Technology Category**. Referenced by the Consulting Knowledge Base's **Solution Patterns** and directly by engagement-side **Recommendations**. Updated only via an approved **Technology Update Proposal**.

### Analysis Run
- **Purpose.** A record of a single AI-assisted step performed during an engagement.
- **Responsibilities.** Provides the audit and governance trail behind AI-assisted output: what was run, on what, and with what quality/trust signals. Enables explainability, traceability, and the consultant's confidence in (or correction of) AI-produced content. It is a record *about* the assistance, not a piece of client deliverable content.
- **Relationships.** Belongs to one **Engagement** — and therefore, transitively, to one **Workspace** — and is associated with the stage/output it supported (e.g., an **Assessment** or a set of **Recommendations**). Does not belong to either knowledge base. Distinct from the **Audit Trail** (access and collaboration events) and the **Technology Update History** (approved knowledge revisions).

### Notification
- **Purpose.** Tells a user that something happened which needs their attention.
- **Responsibilities.** Informs — it never acts. A notification is raised for the events that move collaboration forward or change access: an invitation issued, a discovery submitted, a discovery returned with notes, an invitation revoked or expired. It carries what happened, on which engagement, and when, and it respects the recipient's role: a Client is never told anything about the engagement beyond their own discovery form.
- **Relationships.** Addressed to one **User**, raised by an event on an **Engagement** (typically **Discovery Access** or a Discovery Profile workflow transition). Never grants access; a recipient who lacks permission to see a thing is not given it by being notified.

### Audit Trail
- **Purpose.** The append-only record of **access- and collaboration-relevant events** — who did what, to which engagement, and when.
- **Responsibilities.** Records sign-in, invitation issued/accepted/revoked/expired, discovery submission, return, acceptance, engagement ownership transfer, role change, and **denied permission attempts**. Entries are never rewritten or deleted (append-only, as Consultant Report versions and the Technology Update History are). It exists so that access to client data can be reconstructed and accounted for afterwards.
- **Relationships.** Belongs to a **Workspace** and, where the event concerns one, references an **Engagement** and the acting **User**. It is the **third governance record** and is deliberately distinct from the other two: the **Analysis Run** records engagement AI assistance, the **Technology Update History** records approved knowledge curation, and the **Audit Trail** records access and collaboration. None is written by another's path, and none may be merged into another.

---

## 3. Engagement Lifecycle

An engagement evolves from the first customer meeting to the final consultant report. Conceptually it passes through:

1. **Discovery** — the consultant gathers structured information about the client, building the **Discovery Profile** and noting what is still unknown.
2. **Assessment** — the client's business and operational processes are evaluated, producing findings, bottlenecks, and prioritized problems, together with an **AI Readiness** view.
3. **Problem Prioritization** — problems are weighed and ordered so effort focuses where value is highest, yielding candidate **Opportunities**.
4. **Knowledge grounding and solution matching** — opportunities are matched against the **Consulting Knowledge Base** (AI Use Cases, Solution Patterns) to form grounded **Recommendations**, each carrying rationale, assumptions, and confidence; where a recommendation names concrete implementation technologies or AI models, those are drawn from the **Technology Knowledge Base** (Technology Profiles) with explanations of why they fit.
5. **Roadmap** — accepted recommendations are sequenced into an **Implementation Roadmap**.
6. **Report and follow-up** — the engagement's content is assembled into a versioned **Consultant Report**, and outstanding gaps become **follow-up questions** back to the client.
7. **Feedback and evolution** — sharing a report does not necessarily end the engagement. **Client Feedback** on the report or its recommendations can trigger a **Discovery Update** (new information comes to light), an **Assessment Update** (findings are revised), and **Recommendation Revision** (proposals are adjusted or re-grounded) — leading to a new report version.

**The lifecycle is iterative and spans multiple workshops.** A real engagement rarely completes in a single pass. It typically evolves across several client workshops and working sessions, with the consultant returning to earlier stages many times: discovery is revised after assessment reveals a gap; prioritization changes once knowledge retrieval surfaces a cheap, high-value pattern; recommendations are re-formed after a corrected assumption or client feedback; the report is re-versioned. Each stage operates on the persisted engagement state and can be re-entered and re-run without restarting the engagement. The methodology describes the consultant's thinking; it does not impose a one-directional sequence, and it does not assume the engagement ends when the first report is delivered.

Because the consultant remains in control throughout, movement between stages is driven by the consultant's judgment, and AI-assisted output at any stage is a reviewed draft that the consultant may accept, edit, or override.

---

## 3A. Access and Collaboration Model

*(Revision 1.2. Numbered as a lettered insertion so the existing section numbering is preserved.)*

The methodology above describes *what* work happens. This section describes *who may do it, on which data*, and how a client takes part in Discovery without taking part in anything else. It is domain-level: it states the rules, not how they are implemented.

### 3A.1 The Workspace is the ownership boundary

- **Every engagement-side concept belongs to exactly one Workspace** — organizations, engagements, and everything an engagement owns (discovery, assessment, opportunities, recommendations, roadmap, report versions, analysis runs, invitations, notifications, audit entries).
- **Nothing crosses a workspace boundary.** Data from one workspace can never be read, listed, counted, aggregated, referenced, exported, or inferred from another. This holds for aggregate and cost views as much as for individual records: lifetime cost, engagement counts, and search results are all workspace-scoped.
- **The knowledge side sits outside the boundary.** The **Consulting Knowledge Base** and **Technology Knowledge Base** remain product-level curated assets shared across workspaces, referenced read-only by engagements. They contain no client-specific content, so sharing them leaks nothing; workspace isolation protects engagement-side data, which is where client confidentiality lives.
- **Authentication data sits outside consulting domain state.** Passwords, sessions, email verification, password reset, and invitation-link mechanics belong to the authentication boundary, not to the engagement or knowledge model. The domain knows users, roles, invitations, and access; it does not know permanent passwords.
- **The boundary is asked about first.** Access is decided in order: *is this data in my workspace?* → *does my role reach it?* → *for a Manager, do I own it?* / *for a Client, is the client associated with it through Discovery Access?* A failure at any step is a denial.

### 3A.2 Role reach

| Role | Reach |
|---|---|
| **Administrator** | Every engagement **in their own workspace**, plus management of that workspace's users, roles, ownership, and invitations. No reach into any other workspace. |
| **Manager** | Only the engagements **they own**, in their own workspace. A colleague's engagement is not reachable, by any route. |
| **Client** | Only the **Discovery form of the one engagement they are associated with through Discovery Access**, through the Client Discovery Portal. No assessment, opportunities, recommendations, roadmap, report, cost data, other engagement, or other client. |

- **Engagement Ownership** is a first-class relationship: exactly one owning Manager per engagement, transferable by an Administrator, and the thing a Manager's access is measured against.
- **Permission is decided where the data is, not where the interface is.** A role restriction that exists only in the user interface is not a restriction. This is a domain rule because the confidentiality it protects is a domain concern, not a presentation concern.
- **Least authority.** Roles are deliberately few and grant the least reach that lets each person do their work. New capabilities inherit the existing roles rather than inventing new ones.

### 3A.3 The Client Discovery Portal and the Draft / Submit / Return workflow

A client contributes to Discovery — and only to Discovery — through a bounded, self-registration-scoped surface, the **Client Discovery Portal**.

Authentication is separate from this portal. Clients self-register, confirm their email, and set their own password. Managers and additional administrators are created by an administrator and receive an invitation link to set their own password. The first administrator is created through secure bootstrap. Administrators never create, know, store, or view users' permanent passwords.

The Discovery Profile moves through a small, explicit workflow:

1. **Draft** — the contributor (client or consultant) is working on it. Content is saved freely; nothing downstream treats it as accepted.
2. **Submitted** — the contributor considers it complete and hands it to the consultant for review. Submission is a checkpoint, not a lock.
3. **Returned** — the consultant sends it back with notes, for completion or correction. It returns to draft for the contributor, and the cycle may repeat.
4. **Accepted** — the consultant has reviewed it and takes it as the engagement's factual basis. Discovery remains re-entrant: acceptance never ends the ability to revise it later as understanding improves.

Rules that hold across the workflow:

- **No transition loses content.** A return never discards what the client wrote; an acceptance never discards what the consultant edited.
- **Provenance survives the workflow.** What the client provided stays attributed to the client even after the consultant edits or accepts it, so the engagement's record stays honest about where a fact came from.
- **Consultant review is mandatory before client-provided content counts.** Client-provided discovery is a reviewed draft, exactly like AI-assisted output (§5 Human-in-the-loop). It does not become accepted fact by being submitted; it becomes accepted fact by being reviewed.
- **The consultant holds the review authority.** Accepting, returning, and re-opening are consultant actions. The client contributes and submits; the client does not decide what the engagement treats as true.
- **Events are notified and audited.** Submission, return, acceptance, and the discovery-access lifecycle raise **Notifications** to the people who need them and append to the **Audit Trail**.

### 3A.4 Language of the domain

The **ubiquitous language of this document is English and is never translated**. Entity names, role names, status values, event names, and every internal identifier stay English wherever they appear — in code, in data, in the audit trail, in contracts.

What a user *reads* is a separate, presentational matter. The MVP presents a **German-only** interface — including the Client Discovery Portal — built so that additional languages are a translation task rather than a redesign. Client- and consultant-entered content is stored as entered and is never machine-translated; a fact's wording belongs to whoever wrote it.

---

## 4. Knowledge Model

The knowledge side is made of **two independent knowledge bases**. The **Consulting Knowledge Base** (§4.1) holds stable consulting methodology knowledge; the **Technology Knowledge Base** (§4.2) holds fast-changing AI-technology knowledge and is maintained through the **Technology Curator** workflow (§4.3). They are kept separate because they change at very different rates, and neither depends on the other or on any engagement.

### 4.1 Consulting Knowledge Base Model

The Consulting Knowledge Base is a curated **collection of reusable consulting knowledge**, scoped by business domain. Its purpose is to ground engagement work — discovery, assessment, and especially recommendations — in consistent, reusable expertise. It is best understood not as a container of undifferentiated items but as a set of specific, named kinds of consulting knowledge:

- **Business Domains** — the top-level scoping concept (Customer Operations first; others later). Every piece of knowledge belongs to one or more domains, which is what lets new domains be added alongside existing ones.
- **Business Processes** — reusable descriptions of common operational processes within a domain, used to recognize and frame how a client works.
- **Business Problems** — reusable descriptions of recurring problems and bottlenecks a client may exhibit, used to recognize and name what is going wrong.
- **Customer Operations Taxonomy** — the structured vocabulary of the first domain (its functions and channels: email support, customer service, call centers, live chat, help desk, CRM, ticket management, booking & reservations, guest communication, sales support). The taxonomy classifies knowledge and shapes discovery and assessment for that domain.
- **Discovery Questions** — reusable question sets that drive the **Discovery Profile** for a domain.
- **Assessment Frameworks** — reusable frameworks that structure the **Assessment** and its dimensions.
- **AI Readiness Criteria** — reusable criteria for evaluating how prepared a client is to adopt AI, feeding the AI Readiness dimension of the Assessment.
- **AI Use Cases** — recurring, solvable problems and the value of addressing them.
- **Solution Patterns** — reusable approaches that realize use cases; they refer to **Technology Profiles** in the Technology Knowledge Base rather than containing technology detail themselves.
- **Implementation Patterns** — reusable guidance on how solutions are implemented in practice.
- **ROI Models** — reusable guidance and models for estimating and framing business value.
- **Risk Models** — reusable guidance and models for common risks and their mitigation.
- **Best Practices** — curated recommendations distilled from prior work.
- **Follow-up Templates** — reusable templates for the follow-up questions returned to clients.

### 4.2 Technology Knowledge Base Model

The Technology Knowledge Base is a curated body of **Technology Profiles organized hierarchically under Technology Categories** — it is category-based, **not a flat list**. Each profile is a reusable, engagement-independent description of one AI technology or model; each category groups the profiles of one kind. It is separate from the Consulting Knowledge Base because AI technologies and models are released, revised, repriced, and deprecated far faster than consulting methodology knowledge changes; keeping them apart lets each be curated on its own cadence.

**Technology Categories** (extensible; the initial set):

- **AI Models** — the models themselves (e.g., LLMs) and their capabilities, context limits, and cost.
- **AI Providers** — the vendors/platforms that serve models and their offerings, APIs, and terms.
- **Embedding Models** — models for semantic representation.
- **Speech** — speech-to-text and text-to-speech technologies.
- **OCR** — optical character recognition and document-understanding technologies.
- **Vector Databases** — vector/retrieval stores.
- **Rerankers** — models that improve retrieval quality.
- **MCP Servers** — Model Context Protocol servers and tool-integration surfaces.
- **Browser / Computer Use** — browser and computer-use frameworks for agentic automation.
- **Workflow Engines** — orchestration engines.
- **Evaluation Frameworks** — frameworks for evaluating AI systems and outputs.
- **Monitoring** — observability and monitoring technologies for AI systems.
- **Deployment Patterns** — reusable patterns for deploying and operating AI solutions.

Each **Technology Profile** sits under exactly one category and describes the technology's role, strengths, limitations, and suitability. The Technology Knowledge Base grounds the *technology and model* content of recommendations: when a recommendation names an implementation technology or a suitable AI model, that choice is drawn from a Technology Profile (found via its category) and explained, never invented. Every profile's content is kept current only through the Technology Curator (§4.3), and each change is attributed to the **Technology Source(s)** it came from.

### 4.3 The Technology Curator workflow

Because technology knowledge changes constantly, the Technology Knowledge Base supports **dynamic updates from trusted official sources** — modeled explicitly as **Technology Sources** — but **never autonomous ones**. All updates flow through the **Technology Curator**, a human-in-the-loop curation workflow with four steps:

1. **Detect** a candidate update from one or more trusted **Technology Sources** (official announcements, model cards, documentation from origins such as OpenAI, Anthropic, Google, Meta, Groq, Mistral).
2. **Generate a structured update proposal** — a **Technology Update Proposal** describing the change (to a Technology Profile within a Technology Category) and **referencing the Technology Source(s)** it derives from. AI may assist in drafting the proposal, but drafting is all it does.
3. **Require explicit human approval.** A human curator reviews the proposal and explicitly approves or rejects it. Nothing changes without this decision.
4. **Update** the Technology Knowledge Base — and only then — applying the approved change, and **record it in the Technology Update History** as an append-only entry **that preserves the Technology Source references**.

This gives the Technology Knowledge Base two governance records, both distinct from the engagement-scoped Analysis Run: the **Technology Update Proposal** (one per proposed change, approved or rejected, referencing its Technology Sources) and the append-only **Technology Update History** (approved, applied revisions only, preserving those source references). There is **no path** by which AI, or the act of running an engagement, writes to the Technology Knowledge Base; curation is always a separate, deliberate, human-approved activity, and every applied change leaves a permanent history entry attributed to its official origin.

### 4.4 How engagement data references knowledge without modifying it

Engagement-side entities *point to* knowledge entries in **either** knowledge base and *copy the reasoning into* their own client-specific content, but they never alter the knowledge itself. A **Recommendation** references an **AI Use Case** and **Solution Pattern** (Consulting Knowledge Base) to justify its approach, and may reference **Technology Profiles** (Technology Knowledge Base) for the implementation technologies and models it names; a **Discovery Profile** is shaped by a domain's **Discovery Questions**; an **Assessment** applies **Assessment Frameworks** and **AI Readiness Criteria**. Improving either knowledge base is a separate, deliberate curation activity — not a side effect of running an engagement. This one-directional reference (engagement → knowledge) keeps both knowledge bases stable, shareable, and reusable, and keeps each engagement's record faithful to the knowledge as it stood when the work was done.

---

## 5. Product Principles Reflected in the Domain

The domain model is shaped to support the vision's principles:

- **Consultant-first.** The consultant is the actor; entities represent the consultant's work products, and every AI-assisted output is a draft they own. The domain has no concept of the system acting on its own.
- **Human-in-the-loop.** **Recommendations** are editable, **Consultant Reports** are versioned, and the **Assessment** (including its AI Readiness dimension) and **Recommendations** carry assumptions and confidence — the domain treats human review and override as first-class. **Client-provided Discovery is held to the same standard**: it is a reviewed draft, accepted only by the consultant's review, never by its submission.
- **Isolation by ownership.** The **Workspace** is the ownership boundary; a **Manager** reaches only the engagements they own, an **Administrator** only their own workspace, and a **Client** only the Discovery form they are associated with through self-registration. Confidentiality is a domain property enforced where the data is, not an interface behavior.
- **Authentication stays out of consulting state.** Passwords, sessions, verification, resets, and invitation mechanics are infrastructure concerns. The domain models users, roles, workspace membership, and invitations, but never permanent passwords.
- **Bounded client participation.** A client contributes to the engagement at exactly one point — Discovery — through an explicit, revocable invitation and a bounded portal. Participation never becomes visibility into the consultant's analysis, recommendations, or deliverable.
- **Accountability.** Access- and collaboration-relevant events are recorded in the append-only **Audit Trail**, so who reached which client's data, and what they did with it, can be reconstructed. It stands alongside — never merged with — the **Analysis Run** and the **Technology Update History**.
- **Measured value.** Discovery captures not only what is wrong but **what it costs and what success would measurably look like** (business impact, error frequency/severity/cost, existing KPIs, baseline and target metrics, measurement method, data sources) — and records the absence of a baseline as a finding rather than as an empty field, so expected value and ROI stay grounded in the client's own numbers.
- **Explainability.** Recommendations carry rationale and confidence, and the **Assessment** exposes assumptions across its dimensions, so every proposal can be explained rather than merely asserted.
- **Traceability.** A recommendation is traceable *backward* to the **Discovery Profile** facts that motivate it, to the **Consulting Knowledge Base** knowledge that justifies its approach, and to the **Technology Knowledge Base** entries behind any technologies or models it names; **Analysis Runs** trace the AI assistance behind each stage.
- **Reusability.** Knowledge lives once — in the **Consulting Knowledge Base** or the **Technology Knowledge Base** — and is referenced by many engagements; it is never duplicated or mutated per client.
- **Domain extensibility.** **Business Domain** scoping and per-domain taxonomy, discovery questions, and criteria mean a new domain is added as new knowledge, not as a change to the core entities.
- **Knowledge-driven recommendations.** The path from problem to proposal runs **Opportunity → Recommendation → Consulting Knowledge Base knowledge** (with technology and model choices grounded in the **Technology Knowledge Base**), so recommendations are grounded in curated knowledge by construction rather than produced free-form.
- **Human-curated technology knowledge.** The Technology Knowledge Base — organized hierarchically by **Technology Category** — changes only through the **Technology Curator** — detect, propose, human-approve, update — so its currency never comes at the cost of autonomous AI writes. The **Technology Update Proposal** records how and from which **Technology Source(s)** each change was proposed and decided, and the append-only **Technology Update History** records every approved revision that was actually applied, preserving those source references for auditability.

---

## 6. Product Boundaries — What This Is Not

Defining the domain also means stating what is deliberately outside it:

- **Not a CRM.** It does not manage customer records, contacts, deals, or ongoing customer relationships. **Organization** exists only to group consulting engagements, not to run the client's sales or support operations.
- **Not an autonomous consultant.** It does not make decisions or deliver recommendations on its own. It assists a human consultant, who reviews, edits, and owns every output.
- **Not a workflow automation platform.** It does not execute, orchestrate, or automate the client's business processes. It *analyzes* processes to recommend improvements; it does not run them.
- **Not a PromptOps or AI-engineering platform.** The Technology Knowledge Base curates *knowledge about* AI technologies and models to inform grounded recommendations. The workbench does not build, benchmark, evaluate, deploy, or operate those technologies, and it does not update that knowledge autonomously — the **Technology Curator** requires human approval for every change.
- **Not a generic chatbot.** It is not an open-ended conversational assistant. It is a structured workbench organized around engagements, a defined methodology, and a curated knowledge base.
- **Not a data platform or BI tool.** It does not ingest, store, or analyze the client's operational datasets; discovery captures structured *descriptions* of the situation, not the client's raw data. The value & measurement baseline records the client's *stated figures and where they came from*; it does not connect to the client's systems to measure them.
- **Not a general client portal or collaboration platform.** The **Client Discovery Portal** exists for one purpose: a self-registered client completing the Discovery form of one engagement. It is not a client-facing dashboard, deliverable-sharing space, messaging system, or project portal, and client participation never extends to the assessment, recommendations, roadmap, or report.
- **Not a general identity-management product.** **Workspace**, **User**, and **Role** exist to isolate and attribute the consultant's work, with deliberately few roles. The domain does not model organizational hierarchies, permission matrices, group management, identity federation, sessions, or password storage.

These boundaries keep the product focused on supporting the consultant's judgment rather than expanding into adjacent systems.

---

## 7. Future Extensibility

The domain is designed so that additional business domains — HR, Finance, Legal, Manufacturing, and others — can be added **without redesigning the core**.

- The **core engagement entities** (Organization, Engagement, Discovery Profile, Assessment, Opportunity, Recommendation, Implementation Roadmap, Consultant Report, Analysis Run) are **domain-agnostic**. They describe the *shape* of consulting work, not the specifics of any one domain, and do not change when a new domain is introduced.
- The **access and collaboration concepts** (Workspace, User, Role, Discovery Access, Notification, Audit Trail) are equally domain-agnostic and *stage-agnostic*. Adding a business domain, a methodology stage, or a knowledge source does not change who may see what; new capability inherits the existing boundary and the existing three roles rather than adding roles or a permission framework of its own.
- **Localization is additive.** Because the ubiquitous language is English and only presentation is localized, adding a language adds translations — it does not touch entities, statuses, events, or rules.
- What varies per domain lives in the **Consulting Knowledge Base**, scoped by **Business Domain**: its taxonomy, discovery questions, assessment criteria, AI use cases, solution patterns, and guidance. Adding a domain means **adding a new body of curated knowledge**, not altering the entities.
- The **Technology Knowledge Base** is cross-domain: AI technologies and models are relevant regardless of business domain, so its Technology Profiles are shared rather than duplicated per domain. Adding a business domain does not require changing it, and its own growth happens by adding Technology Profiles — or new **Technology Categories** — without touching the domain-agnostic engagement entities.
- Because engagement data only *references* knowledge, existing engagements and existing domains are unaffected when a new domain — or a Technology Knowledge Base update — is introduced.

Customer Operations is implemented concretely first. The general multi-domain capability is expressed here as a modeling principle — domain-agnostic core plus domain-scoped knowledge — and is only exercised further when a second domain is actually introduced, in keeping with the vision's decision not to build the multi-domain abstraction ahead of need.

---

## 8. Ubiquitous Language

These are the core business terms and their agreed meanings. They form the common vocabulary for all future documentation and implementation; the same word should mean the same thing everywhere. **This vocabulary is English and is never translated** (§3A.4); only what a user reads is localized.

- **Workspace** — the ownership and isolation boundary: one consulting practice's users, client organizations, and engagements. Nothing on the engagement side crosses it. The knowledge bases sit outside it, shared across workspaces.
- **User** — a person with an authenticated identity who acts in the product, belonging to one workspace and holding one role.
- **Role** — the authority a user holds: **Administrator** (all engagements in their own workspace, plus workspace user/role/ownership/invitation management), **Manager** (only the engagements they own — the consultant role), **Client** (only the Discovery form of the one engagement they are associated with through Discovery Access).
- **Engagement Ownership** — the relationship naming the single **Manager** who owns an engagement; transferable by an Administrator, and the basis on which a Manager's access is decided.
- **Discovery Access** — an explicit, time-bounded, revocable grant allowing one self-registered client to complete the Discovery form of one specific engagement. The only route by which a Client obtains any access.
- **Client Discovery Portal** — the bounded, self-registration-scoped, client-facing surface where a self-registered client completes that Discovery form and nothing else.
- **Draft / Submit / Return** — the Discovery review workflow: worked on as a **draft**, **submitted** for review, **returned** with the consultant's notes if incomplete or wrong, and **accepted** once the consultant has reviewed it. Content is never lost on a transition, and submission alone never makes content accepted fact.
- **Notification** — a message telling a user about an event that needs their attention (invitation, submission, return, revocation). It informs; it never acts and never grants access.
- **Audit Trail** — the append-only record of access- and collaboration-relevant events (sign-in, discovery-access lifecycle, submission/return/acceptance, ownership transfer, role change, denied attempts): who did what, to which engagement, when. The third governance record, distinct from the Analysis Run and the Technology Update History.
- **Organization** — a client company the consultant works with. Groups all engagements conducted for that client; it is not a customer-relationship record. Belongs to one workspace.
- **Engagement** — one complete consulting engagement for an organization, from discovery through the final report and any later revisions. The primary business entity and the unit of work. Belongs to one workspace and has one owning Manager.
- **Discovery** — the activity of gathering structured information about the client's situation, and the resulting **Discovery Profile** that captures what is known, what it costs, what success would look like, and what is still missing. It may be completed by the consultant or by a self-registered client, and carries a status and the provenance of its content.
- **Value & measurement baseline** — the quantitative part of the Discovery Profile: **Business Impact**, **Error Frequency / Severity / Cost**, **Existing KPIs**, **Baseline Metrics**, **Target Success Metrics**, **Measurement Method**, and **Data Sources**. A missing baseline is recorded as a finding, and an estimate is never presented as a measurement.
- **Assessment** — the structured evaluation of the client across several dimensions (business process, data, technology, **AI Readiness**, risks, opportunities). AI Readiness is a dimension of the Assessment, not a separate entity.
- **Opportunity** — a candidate area, derived from an identified problem or bottleneck, where AI or other improvement could deliver business value.
- **Recommendation** — a grounded, editable proposal that addresses an opportunity, carrying rationale, assumptions, and confidence, and traceable to discovery facts, to Consulting Knowledge Base knowledge, and to any Technology Knowledge Base entries behind the technologies or models it names.
- **Consulting Knowledge Base** — the reusable, curated, engagement-independent collection of consulting knowledge (use cases, patterns, taxonomy, guidance, questions, templates) that grounds engagement work. Changes slowly through human curation. Referenced by engagements, never modified by them.
- **Technology Knowledge Base** — a separate, reusable, engagement-independent body of **Technology Profiles** organized **hierarchically under Technology Categories** (not a flat list) describing AI technologies and models. Kept independent of the Consulting Knowledge Base because it changes far more frequently, and updated only through the Technology Curator. Referenced by engagements, never modified by them.
- **Technology Category** — the top-level organizing concept of the Technology Knowledge Base (AI Models, AI Providers, Embedding Models, Speech, OCR, Vector Databases, Rerankers, MCP Servers, Browser / Computer Use, Workflow Engines, Evaluation Frameworks, Monitoring, Deployment Patterns). Extensible; may nest. Each Technology Profile is classified under exactly one category.
- **Technology Profile** — a curated, engagement-independent description of one AI technology or model (its role, strengths, limitations, suitability), held in the Technology Knowledge Base under a Technology Category and used to ground the technologies and models named in recommendations.
- **Technology Source** — the official origin of technology information (a vendor or official channel, e.g., OpenAI, Anthropic, Google, Meta, Groq, Mistral). A curated registry of trusted origins; referenced by Technology Update Proposals and preserved on Technology Update History entries for auditability. Distinct from the AI Providers category (which is curated content, not provenance).
- **Technology Curator** — the human-in-the-loop workflow that updates the Technology Knowledge Base: detect a candidate update from one or more Technology Sources, generate a Technology Update Proposal, obtain explicit human approval, then update. AI never updates the Technology Knowledge Base autonomously.
- **Technology Update Proposal** — a structured, human-reviewable proposal to change the Technology Knowledge Base, recording the change and **referencing one or more Technology Sources**; it takes effect only after explicit human approval, covers a single proposed change (approved or rejected), and is not an engagement Analysis Run.
- **Technology Update History** — the append-only audit log of approved changes actually applied to the Technology Knowledge Base (what changed, the approving proposal, **the Technology Source(s) preserved for auditability**, approver, and timestamp). Records approved KB revisions only; distinct from the Technology Update Proposal and from the Analysis Run.
- **AI Use Case** — a reusable description of a recurring problem AI can address and the value of doing so; grounds recommendations and is realized by solution patterns.
- **Solution Pattern** — a reusable, proven approach for realizing an AI use case, with its trade-offs and applicability conditions; refers to Technology Profiles for the technologies it involves.
- **Consultant Report** — the professional, client-ready, editable, versioned deliverable produced by an engagement.
- **Analysis Run** — a record of a single AI-assisted step within an engagement, providing the audit and trust trail (what was run, on what, with what quality signals) behind AI-assisted output.

---

This document is implementation-independent and intended to remain stable across changes in technology, storage, APIs, and frameworks. It is the conceptual foundation for `architecture.md` and `roadmap.md`.
