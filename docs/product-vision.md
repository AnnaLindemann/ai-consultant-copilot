# Product Vision — AI Consulting Workbench

Status: **Frozen** · Version: 1.1 · This document defines the product vision only. It does not define software architecture, roadmap, or implementation details.

> **Revision 1.1 (approved).** Introduces a separate **Technology Knowledge Base** alongside the existing **Consulting Knowledge Base**, and the **Technology Curator** workflow that updates it under explicit human approval, keeping an audit history of approved updates. The Technology Knowledge Base is **hierarchical and category-based**, and updates are attributed to explicit **Technology Sources** (official vendor origins). No other part of the vision, and no existing principle, is changed.

---

## 1. What we are building

An **AI Consulting Workbench**: a real working tool that an AI Consultant uses *during* customer engagements.

This is **not** an AI-engineering demonstration. Success is measured by whether a consultant can run a real engagement faster and produce a more defensible deliverable — not by how many AI techniques are showcased. Every capability exists to support the consultant's real work.

The workbench assists the consultant through a structured consulting methodology, grounds its recommendations in a reusable knowledge base, and produces a professional, client-ready report.

---

## 2. Who it is for

The primary user is an **AI Consultant** engaged by a client to identify and recommend AI opportunities in the client's operations. The consultant remains the expert and the decision-maker at all times; the tool accelerates and structures their work, it does not replace their judgment.

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

## 9. Principles (stable commitments)

These commitments are frozen and serve as the foundation for all future documentation:

1. **A real tool, not a demo.** Value is measured by usefulness in a real engagement.
2. **Engagement-centric and iterative.** The engagement is the unit of work; stages are re-runnable, not a linear one-shot pipeline.
3. **Methodology ≠ architecture.** The nine-step workflow guides the consultant; it does not dictate the internal software structure.
4. **Grounded recommendations.** Recommendations are grounded in the curated Consulting Knowledge Base, and any concrete technologies or AI models they name are grounded in the Technology Knowledge Base; RAG comes later.
5. **Two knowledge bases as core assets.** A Consulting Knowledge Base and a separate, more frequently-updated Technology Knowledge Base — both kept strictly separate from engagement data and from each other, and reusable across engagements.
6. **Human-curated technology knowledge.** The Technology Knowledge Base is updated only through the Technology Curator workflow — detect, propose, human-approve, then update — never autonomously by AI.
7. **Human-in-the-loop.** Editable recommendations, versioned reports, and always-visible assumptions, confidence, and gaps.
8. **Domain-first, extensible.** Customer Operations is implemented concretely first; additional domains can be added without redesign.

---

## 10. Explicitly out of scope for the initial vision

To keep the vision stable and focused, the following are deliberately deferred (not rejected):

- RAG / semantic retrieval over the Consulting Knowledge Base.
- Additional business domains beyond Customer Operations.
- A general multi-domain plugin framework built ahead of the second domain.
- **Autonomous updates to the Technology Knowledge Base.** Every change requires explicit human approval through the Technology Curator; there is no self-updating knowledge.
- **Any PromptOps or AI-engineering platform capability.** The workbench curates *knowledge about* technologies to inform recommendations; it does not build, benchmark, deploy, evaluate, or operate them.

These may be revisited once the core workbench and Customer Operations domain are established.
