# EU AI Act Readiness

Status: **Draft product-governance assessment**.

This document is not legal advice. It records the product's current governance
position so SVNTN can review it with qualified counsel, customers, and provider
contracts before making legal or commercial commitments.

## Provisional role assessment

SVNTN may act as the **provider** of the AI Consulting Workbench when it places
the product on the market or supplies it to customers under its own name.

SVNTN may act as a **deployer** when it uses the workbench internally to support
its own consulting work.

That assessment can change if commercial or contractual facts change, including:
white-labelling, customer-specific model control, customer-controlled intended
purpose, resale or distribution by another party, custom model training,
provider-of-record terms, or contracts that assign AI-system obligations
differently.

## Intended purpose

The current intended purpose is AI-assisted consulting for organizational
Customer Operations and Contact Center transformation.

AI output remains a draft. An authorized human reviews it before it can become
accepted engagement content. The system does not make autonomous decisions about
natural persons.

## Excluded current uses

The current product is not intended for:

- recruitment or employee selection;
- individual employee-performance decisions;
- creditworthiness decisions;
- insurance eligibility decisions;
- biometric identification or categorization;
- emotion inference;
- access to essential private or public services;
- law-enforcement decisions;
- sole-basis automated decisions about individuals.

## Human responsibility

The application does not make final legal determinations. Legal basis, consent,
DPIA need and outcome, provider approval, and customer-specific use approval
remain human decisions.

AI output may be incomplete, outdated, fabricated, or wrong. The consultant
remains responsible for reviewing drafts, correcting them, refusing unsafe
outputs, and deciding what is shared with a client.

## AI literacy guidance

Managers and Administrators should follow these operating rules:

- Enter only engagement data needed for the consulting purpose.
- Do not enter special-category personal data, credentials, secrets, or
  unnecessary natural-person identifiers.
- Record the engagement's processing purpose, legal basis, consent where
  consent is the basis, and DPIA screening before processing personal data.
- Treat `strictly_confidential` as potentially containing personal data unless a
  separate reviewed record establishes otherwise.
- Review every AI draft for hallucinations, unsupported assumptions,
  fabricated citations, outdated technology claims, and missing uncertainty.
- Use the explicit human-review action when the policy requires it; ordinary
  draft save is not human review.
- Expect AI processing to be refused when policy, legal basis, consent, DPIA, or
  provider/model approval is missing or no longer valid.
- Understand that provider/model approval governs availability: a model marked
  `needs_review` or `revoked` cannot be used until an Administrator resolves it.
- Interpret compliance messages as operational controls, not legal advice.

## Limitations

The workbench currently provides no high-risk classification engine, no legal
case-management system, no certification claim, no guarantee of GDPR compliance,
and no guarantee that all personal identifiers can be detected.

Detection of compliance-relevant changes in approved technology facts is
likewise partial. A provider's lifecycle and deprecation status is a typed field
and is compared structurally; processing regions, retention, training/input use,
subprocessors, DPA status, and international transfers have no dedicated fields
yet and are currently detected by conservative keyword matching over curated
Technology Profile content. That may re-open approvals for editorial edits, and
it may miss a change expressed without a recognized term. It is a prompt for
human re-review, not an assurance: the enforcement control is the
Administrator's explicit re-approval of a provider/model, and a future
structured Technology Knowledge Base schema is expected to replace the
heuristic.

It does not perform autonomous natural-person decision-making.
