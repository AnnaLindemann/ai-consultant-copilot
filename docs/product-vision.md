# Product Vision — AI Consulting Workbench

Status: **Frozen** · Version: 1.0 · This document defines the product vision only. It does not define software architecture, roadmap, or implementation details.

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

## 6. Knowledge Base

The **Knowledge Base is a core product capability**, not a document library and not a side feature. It is the reusable, cross-engagement asset that makes the product compound in value: every engagement can draw on it, and it improves over time.

It stores **structured, reusable consulting knowledge**, including:

- AI use cases
- Solution patterns
- Implementation patterns
- Technology profiles
- Customer Operations taxonomy
- Best practices
- Risks
- ROI guidance
- Discovery questions
- Assessment criteria
- Follow-up question templates

**Grounding.** Recommendations must ultimately be grounded in the Knowledge Base rather than produced as free-form model output. A recommendation should be traceable to the knowledge that justifies it.

**Separation.** The Knowledge Base is reusable and independent of any single engagement. Engagement state references knowledge; the Knowledge Base never depends on a specific engagement.

**Retrieval approach.** The first implementation uses a **curated, structured knowledge base** with deterministic retrieval and matching. **RAG is not part of the initial implementation.** RAG (embeddings and semantic retrieval) will be introduced later as an enhancement, once the curated knowledge base has meaningful content.

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
4. **Grounded recommendations.** Recommendations are grounded in a curated Knowledge Base; RAG comes later.
5. **Knowledge Base as core asset.** Kept strictly separate from engagement data and reusable across engagements.
6. **Human-in-the-loop.** Editable recommendations, versioned reports, and always-visible assumptions, confidence, and gaps.
7. **Domain-first, extensible.** Customer Operations is implemented concretely first; additional domains can be added without redesign.

---

## 10. Explicitly out of scope for the initial vision

To keep the vision stable and focused, the following are deliberately deferred (not rejected):

- RAG / semantic retrieval over the Knowledge Base.
- Additional business domains beyond Customer Operations.
- A general multi-domain plugin framework built ahead of the second domain.

These may be revisited once the core workbench and Customer Operations domain are established.
