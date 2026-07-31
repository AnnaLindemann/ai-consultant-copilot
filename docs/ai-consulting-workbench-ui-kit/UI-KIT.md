# AI Consulting Workbench — UI Kit

**Status:** Approved design source for frontend implementation  
**Version:** 1.0  
**Date:** 2026-07-31  
**Primary UI language:** German  
**Product terminology in code and domain contracts:** English  

---

## 1. Purpose

This UI kit defines the visual system, navigation, page inventory, interaction patterns, component states, permissions, and implementation constraints for the AI Consulting Workbench.

It is not a clickable prototype and does not replace the frozen product, domain, architecture, roadmap, coding, or workflow documents. It translates those documents into a coherent frontend system that implementation agents can follow without re-deciding the design on every phase.

The product must feel like a structured consulting workspace, not a generic CRM, document drive, or AI chat demo.

### 1.1 Product experience goals

The interface must:

1. Make the current engagement stage and next action immediately understandable.
2. Keep the consultant in control of all AI-assisted output.
3. Separate client-facing material from internal work.
4. Preserve workspace and engagement confidentiality.
5. Show uncertainty, missing information, and review state honestly.
6. Support iterative work rather than presenting the methodology as an irreversible wizard.
7. Remain calm, professional, and credible in front of a client.

### 1.2 Explicitly excluded

The UI kit does not define:

- a Figma file or clickable prototype;
- backend schema or API design;
- e-mail provider selection;
- PDF rendering technology;
- authentication provider;
- drag-and-drop dashboard customization;
- a general-purpose file drive;
- client editing of a published proposal;
- direct client access to assessment, recommendations, internal notes, AI runs, or knowledge bases.

---

## 2. Source alignment and approved extension

### 2.1 Existing source-of-truth rules retained

The UI follows the established concepts:

- **Workspace** is the isolation boundary.
- Roles are **Administrator**, **Manager**, and **Client**.
- **Engagement** is the primary unit of consulting work.
- A Manager sees only engagements they own.
- An Administrator sees all engagements in their workspace.
- Discovery supports draft, submitted, returned, and accepted states.
- AI output is editable and requires human review.
- Reports are client-ready and versioned.
- User-facing content is localized; domain identifiers stay in English.

### 2.2 Approved UI/product extension: Client Proposal Delivery

This UI kit records the approved product decision to extend the Client Portal with manager-published proposal delivery:

> After the Manager reviews and finalizes a proposal, the Manager may publish a specific report version to the associated Client. The Client receives an e-mail notification and may open and download the published PDF in the Client Portal. The Client cannot edit, replace, republish, or access internal source material.

This extension must later be reflected deliberately in Product Vision, Domain Model, Roadmap, Architecture, and authorization rules before implementation of the capability. Until then it is a **future approved requirement**, not an already implemented permission.

### 2.3 Publication rule

A generated report is never visible to the Client automatically.

```text
AI-assisted draft
→ Manager edits
→ Manager reviews
→ Manager approves a report version
→ Manager publishes that version
→ E-mail notification is sent
→ Client opens or downloads read-only PDF
```

The publication action and the e-mail notification are separate results. A failed e-mail must not unpublish the document or create a second publication.

---

## 3. Design direction

### 3.1 Visual character

The interface uses a restrained modern B2B SaaS aesthetic inspired by the clarity of Linear, Stripe, Notion, and Vercel, without copying any of them.

Key characteristics:

- light neutral background;
- white or subtly tinted surfaces;
- strong typographic hierarchy;
- minimal decoration;
- compact but not cramped information density;
- one blue primary accent;
- semantic colors used only for status and feedback;
- cards used for grouped meaning, not for every line of content;
- tables for comparison-heavy operational data;
- generous whitespace around decision points.

### 3.2 Design principles

#### Calm over impressive
The product handles business decisions. It must look trustworthy, not theatrical.

#### Process over database
Users should see what is happening next, not only rows and fields.

#### Evidence over decoration
Badges, scores, and charts appear only when backed by real data.

#### Internal and external surfaces are visually distinct
The Client Portal is simpler and warmer. Manager and Admin workspaces are denser and operational.

#### Accessibility is not optional
Color is never the only status indicator. Every icon has a label or accessible name. Keyboard focus is visible.

---

## 4. Design tokens

The canonical machine-readable values are in `design-tokens.json`.

### 4.1 Color palette

| Token | Value | Usage |
|---|---:|---|
| `color.background.canvas` | `#F7F8FA` | Application background |
| `color.background.surface` | `#FFFFFF` | Main cards, panels, menus |
| `color.background.subtle` | `#F1F3F6` | Secondary panels, disabled areas |
| `color.background.inverse` | `#172033` | Dark high-emphasis surface |
| `color.text.primary` | `#172033` | Primary text |
| `color.text.secondary` | `#667085` | Supporting text |
| `color.text.muted` | `#98A2B3` | Metadata and placeholders |
| `color.text.inverse` | `#FFFFFF` | Text on inverse surfaces |
| `color.border.default` | `#E4E7EC` | Standard borders |
| `color.border.strong` | `#D0D5DD` | Strong separators and input hover |
| `color.primary.600` | `#315EFB` | Primary action |
| `color.primary.700` | `#2448D8` | Primary hover |
| `color.primary.050` | `#EEF2FF` | Selected item and primary tint |
| `color.success.600` | `#16845B` | Completed, accepted |
| `color.success.050` | `#ECFDF3` | Success background |
| `color.warning.600` | `#B54708` | Waiting, returned, caution |
| `color.warning.050` | `#FFFAEB` | Warning background |
| `color.danger.600` | `#D92D20` | Destructive and failed |
| `color.danger.050` | `#FEF3F2` | Error background |
| `color.info.600` | `#175CD3` | Informational status |
| `color.info.050` | `#EFF8FF` | Info background |

Do not introduce additional brand colors per feature. A rainbow dashboard is not a design system; it is a status-light accident.

### 4.2 Typography

Preferred font stack:

```css
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", sans-serif
```

| Style | Size / Line | Weight | Usage |
|---|---|---:|---|
| Display | 32 / 40 | 650 | Rare landing or major empty state |
| H1 | 28 / 36 | 650 | Page title |
| H2 | 22 / 30 | 650 | Section title |
| H3 | 18 / 26 | 600 | Card title |
| Body | 14 / 21 | 400 | Default UI copy |
| Body strong | 14 / 21 | 600 | Labels and emphasized values |
| Small | 12 / 18 | 400 | Metadata |
| Small strong | 12 / 18 | 600 | Compact badge text |

Use sentence case in navigation and buttons. Avoid title case in German.

### 4.3 Spacing

Base unit: `4px`.

Core spacing scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

Default page padding:

- desktop: `32px`;
- tablet: `24px`;
- mobile: `16px`.

### 4.4 Radius and elevation

- Small controls: `8px`.
- Cards and panels: `12px`.
- Modal/dialog: `16px`.
- Pill badges: `999px`.
- Default cards use border before shadow.
- Shadow is reserved for floating elements: dropdown, dialog, toast, command menu.

### 4.5 Layout grid

- Desktop content max width: `1440px`.
- Navigation sidebar: `248px` expanded, `72px` collapsed.
- Right contextual rail: `320px` where used.
- Main content minimum readable width: `640px`.
- Forms: maximum field column width `760px`.

---

## 5. Responsive strategy

### Desktop, 1280px and above
Full sidebar, page header, content area, optional contextual right rail.

### Tablet, 768–1279px
Collapsible sidebar. Two-column forms become one column. Dense tables may keep horizontal scrolling.

### Mobile, below 768px
Primary support is required for the Client Portal. Manager and Admin surfaces remain usable for review and simple actions but are not optimized for complex report editing.

Client mobile requirements:

- Discovery sections shown as a step list or accordion.
- Save state always visible.
- Published proposal card supports opening and downloading.
- PDF opens in browser-native viewer or dedicated safe viewer.
- No horizontal scrolling for standard content.

### 5.1 Mandatory responsive implementation

Every new screen and reusable component must be designed and implemented for Desktop, Tablet, and Mobile from the beginning, not adapted later.

- Responsive layout is required for every new screen.
- No feature parity loss on mobile unless explicitly documented.
- Minimum touch target size is `44×44 px`.
- No horizontal scrolling except intentionally scrollable data tables.
- Every frontend PR must be verified on desktop, tablet, and mobile breakpoints.

---

## 6. Global application shell

### 6.1 Manager/Admin shell

```text
┌────────────────────────────────────────────────────────────────────┐
│ Sidebar │ Page header: title, breadcrumbs, actions, user menu      │
│         ├──────────────────────────────────────────────────────────┤
│         │ Main content                              │ Context rail │
└────────────────────────────────────────────────────────────────────┘
```

Sidebar regions:

1. Product/workspace identity.
2. Primary navigation.
3. Secondary navigation.
4. Help and user account.

Header contains:

- breadcrumbs where depth > 1;
- page title and supporting description;
- status where page represents an Engagement;
- one primary action maximum;
- overflow menu for secondary actions.

### 6.2 Client Portal shell

The Client Portal is intentionally simpler:

```text
┌────────────────────────────────────────────────────────────┐
│ Logo / Engagement name                  Profile / Abmelden │
├────────────────────────────────────────────────────────────┤
│ Übersicht | Discovery | Dokumente                         │
├────────────────────────────────────────────────────────────┤
│ Centered content, max width 960px                          │
└────────────────────────────────────────────────────────────┘
```

No workbench sidebar, AI terminology, internal stage controls, or workspace administration appears in the Client Portal.

---

## 7. Role navigation

## 7.1 Client navigation

German labels:

```text
Übersicht
Discovery
Dokumente
Profil
```

Client sees only:

- their associated Engagement summary;
- their Discovery form and its review status;
- proposals explicitly published to them;
- their own account/profile controls.

Client never sees:

- assessment;
- AI readiness details;
- opportunities;
- recommendations;
- internal roadmap editor;
- internal notes;
- prompt or model information;
- analysis runs;
- cost logs;
- knowledge bases;
- other users or engagements;
- report drafts or unpublished versions.

## 7.2 Manager navigation

```text
Übersicht
Engagements
Aufgaben
Wissensbasis
Berichte
Einstellungen
```

Within an Engagement:

```text
Überblick
Discovery
Assessment
Probleme
Empfehlungen
Roadmap
Bericht
Verlauf
```

The exact stage tabs may be introduced progressively by roadmap phase. Hidden unavailable stages should not appear as fake disabled product features unless a specific onboarding message is useful.

## 7.3 Administrator navigation

```text
Übersicht
Engagements
Organisationen
Manager
Benutzer & Zugänge
Wissensbasis
Technologien
Aktualisierungen
Audit
System
Einstellungen
```

Administrator does not receive a second, contradictory consulting experience. Opening an Engagement uses the same detail layout as Manager, with an administrator context badge and ownership controls.

---

## 8. Shared status language

All status identifiers are stable English domain values. The UI displays German labels.

### 8.1 Engagement stage status

| Identifier | German label | Meaning |
|---|---|---|
| `NOT_STARTED` | Nicht begonnen | No meaningful work exists |
| `IN_PROGRESS` | In Bearbeitung | Work is underway |
| `WAITING_FOR_CLIENT` | Wartet auf Kunde | Client input is required |
| `REVIEW_REQUIRED` | Prüfung erforderlich | Manager action required |
| `COMPLETED` | Abgeschlossen | Stage accepted for now |
| `BLOCKED` | Blockiert | Explicit blocker exists |

### 8.2 Discovery status

| Identifier | German label | Actor/action |
|---|---|---|
| `DRAFT` | Entwurf | Contributor may edit |
| `SUBMITTED` | Eingereicht | Client/Manager cannot silently alter submitted snapshot |
| `RETURNED` | Zur Überarbeitung | Contributor may edit with Manager feedback |
| `ACCEPTED` | Akzeptiert | Manager accepted as engagement input |

### 8.3 Report status

| Identifier | German label | Client visibility |
|---|---|---|
| `DRAFT` | Entwurf | No |
| `IN_REVIEW` | In Prüfung | No |
| `APPROVED` | Freigegeben | No, until published |
| `PUBLISHED` | Veröffentlicht | Yes, associated Client only |
| `WITHDRAWN` | Zurückgezogen | No new access; audit retained |
| `SUPERSEDED` | Durch neue Version ersetzt | Optional historical client access according to policy |

### 8.4 Notification status

| Identifier | German label |
|---|---|
| `QUEUED` | Wird versendet |
| `SENT` | Versendet |
| `DELIVERED` | Zugestellt |
| `FAILED` | Versand fehlgeschlagen |

Do not claim `DELIVERED` unless the provider supplies a trustworthy delivery event. Otherwise show `SENT`.

---

## 9. Core components

Each component needs default, hover, focus, disabled, loading, error, and where relevant destructive states.

### 9.1 Buttons

Variants:

- `PrimaryButton`
- `SecondaryButton`
- `TertiaryButton`
- `DangerButton`
- `IconButton`

Rules:

- One primary action per page region.
- Destructive actions require explicit confirmation when data/access changes.
- Loading buttons retain width and replace icon with spinner.
- Button labels describe the result: `Bericht veröffentlichen`, not `Weiter`.

### 9.2 Form controls

- Text input
- Textarea
- Number input
- Currency input
- Percentage input
- Date input
- Select
- Multi-select
- Radio group
- Checkbox
- File upload
- Metric editor
- Source/evidence field

Every field supports:

- label;
- optional/required indication;
- helper text;
- validation error;
- provenance where meaningful;
- disabled/read-only distinction.

Read-only fields must look like information, not disabled controls.

### 9.3 Status badge

Contains icon + label. Color alone is insufficient.

Examples:

- check icon + `Akzeptiert`;
- clock icon + `Wartet auf Kunde`;
- alert icon + `Prüfung erforderlich`.

### 9.4 Stage tracker

Horizontal on desktop, compact vertical on mobile.

Shows stage, status, and optionally next action. It must not imply that prior stages are permanently locked.

Manager example:

```text
Discovery ✓  Assessment ●  Priorisierung ○  Empfehlungen ○  Bericht ○
```

Client example is reduced:

```text
Informationen eingereicht ✓  Prüfung läuft ●  Angebot ○
```

The client-facing labels describe service progress without exposing internal analysis.

### 9.5 Data table

Used for:

- engagements;
- users;
- audit events;
- technology update proposals;
- report versions.

Features introduced only when needed:

- sorting;
- filters;
- pagination;
- column visibility;
- bulk actions only for safe and genuinely repeated operations.

### 9.6 Cards

Canonical card types:

- KPI card;
- Engagement summary card;
- Next-action card;
- Finding card;
- Recommendation card;
- Published document card;
- Empty-state card.

### 9.7 Dialogs

Use for bounded decisions, not long forms.

Required dialogs:

- publish report;
- withdraw report;
- return Discovery;
- transfer Engagement ownership;
- revoke Client access;
- confirm destructive actions.

### 9.8 Toast and inline feedback

- Toast: confirms completed non-critical action.
- Inline alert: persistent state or problem requiring attention.
- Field error: local validation.
- Page error: failed content loading with retry.

Never use a green success toast before the server confirms success.

### 9.9 Empty, loading, and error states

Every major page defines:

- first-use empty state;
- filtered-no-results state;
- skeleton/loading state;
- access denied state;
- recoverable error state;
- not found state.

---

## 10. Client Portal screens

## C01 — Registration

Purpose: allow the invited/associated Client to self-register.

Content:

- engagement/organization context;
- name;
- e-mail address confirmation where pre-associated;
- password creation;
- terms/privacy acknowledgement;
- submit button.

Security copy must not reveal whether unrelated e-mail addresses exist.

## C02 — E-mail confirmation

States:

- confirmation required;
- confirmation successful;
- link expired;
- resend available;
- resend throttled.

## C03 — Client overview

Primary goal: explain current status and next action.

Layout:

```text
Willkommen, [Name]
[Organization] · [Engagement title]

[Simple progress tracker]

Next action card
Discovery weiter ausfüllen / Rückmeldung prüfen / Angebot ansehen

Recent document card, only when published
```

Do not show invented percentages unless completion can be calculated deterministically from the form contract.

## C04 — Discovery form

Desktop layout:

- left section navigation;
- central form;
- sticky save/status area.

Suggested German sections:

1. Unternehmen
2. Kundenprozesse
3. Aktuelle Probleme
4. Fehler und Auswirkungen
5. Systeme und Daten
6. Kennzahlen und Ausgangslage
7. Erfolgsziele
8. Einschränkungen
9. Zusammenfassung

Actions:

- `Entwurf speichern`
- `Zur Prüfung einreichen`

Autosave may be added, but the UI must still show last saved time and unsaved changes.

## C05 — Discovery submitted

Shows:

- submission confirmation;
- submission timestamp;
- read-only submitted answers;
- next step `Prüfung durch Ihre Ansprechperson`;
- no edit action unless returned.

## C06 — Discovery returned

Shows Manager feedback prominently before the form.

Content:

- reason/notes;
- affected sections where available;
- returned timestamp;
- action `Discovery überarbeiten`.

## C07 — Discovery accepted

Shows accepted status and date. The Client may view submitted information but cannot change the accepted snapshot.

## C08 — Documents list

German page title: `Dokumente`.

Only published client-visible documents are listed.

Document card fields:

- document title;
- type (`Lösungsvorschlag`, later other approved types);
- version label;
- publication date;
- short Manager message;
- file type and size;
- `Öffnen`;
- `PDF herunterladen`;
- `Neu` badge until opened.

No upload, edit, delete, version selection, or sharing controls for Client.

## C09 — Proposal detail

Layout:

```text
Lösungsvorschlag
Version 1 · Veröffentlicht am 31.07.2026
Von [Manager name]

[Manager message]

[PDF preview / open action]
[PDF herunterladen]
```

Optional metadata:

- download timestamp;
- checksum not exposed unless business need exists;
- previous published versions only if policy explicitly permits them.

## C10 — No documents state

Copy:

```text
Noch keine Dokumente verfügbar
Sobald Ihre Ansprechperson ein Angebot für Sie freigibt, erscheint es hier.
```

## C11 — Access expired/revoked

Explain that access is unavailable and provide a safe contact path. Do not expose internal revocation details.

## C12 — Profile and security

Client may:

- update display name where permitted;
- change password;
- sign out;
- view e-mail address;
- view privacy/legal links.

Client cannot change associated Engagement or Organization.

---

## 11. Manager screens

## M01 — Dashboard

Purpose: show owned work and immediate actions.

KPI cards:

- Aktive Engagements
- Discovery zur Prüfung
- Offene Rückfragen
- Berichte in Prüfung

Sections:

- next actions;
- recently updated Engagements;
- activity relevant to owned Engagements;
- quick action `Engagement anlegen` where current phase permits.

Avoid vanity metrics such as average AI score unless defined, trustworthy, and actionable.

## M02 — Engagement list

Default desktop representation: table, not cards, because Managers compare multiple records.

Columns:

- Organization
- Engagement
- Stage
- Status
- Next action
- Last updated

Filters:

- stage;
- status;
- organization;
- updated date.

Only owned Engagements appear.

## M03 — Engagement overview

Header:

- Organization;
- Engagement title;
- owner;
- current stage/status;
- last updated;
- primary next action.

Content:

- stage tracker;
- engagement summary;
- open questions;
- latest activity;
- contextual right rail with next action and risks.

## M04 — Discovery review

Two modes:

1. Manager-authored Discovery editing.
2. Client-submitted Discovery review.

Client-submitted review shows:

- contributor identity;
- submitted timestamp;
- changed sections;
- provenance per important fact;
- missing data;
- Manager notes.

Actions:

- `Discovery akzeptieren`
- `Zur Überarbeitung zurückgeben`

Return requires a meaningful note.

## M05 — Assessment workspace

Sections:

- business process;
- data;
- technology;
- AI readiness dimension;
- risks;
- opportunities;
- assumptions and unknowns.

AI suggestions are visually marked as drafts and remain editable.

## M06 — Problem prioritization

Table or matrix based on real dimensions:

- problem;
- business impact;
- frequency;
- severity;
- estimated cost;
- confidence;
- priority;
- evidence.

No unlabeled star score.

## M07 — Recommendations

Recommendation card:

- title;
- problem addressed;
- rationale;
- expected value;
- effort;
- confidence;
- assumptions;
- supporting Discovery facts;
- linked Consulting KB entries;
- linked Technology Profiles;
- edit/review status.

## M08 — Roadmap editor

Supports ordered phases with:

- objective;
- scope;
- dependencies;
- expected result;
- estimate/range when supported;
- risk;
- owner/responsibility.

Do not make drag-and-drop mandatory; provide accessible move controls.

## M09 — Report workspace

Purpose: assemble and edit the client-ready report.

Layout:

- left report outline;
- central editable section;
- right evidence/review rail.

Top actions:

- save draft;
- preview PDF;
- request/mark review;
- approve version;
- publish to Client.

Internal AI generation metadata is accessible through a secondary details view, not printed into the client report.

## M10 — Report versions

Columns:

- version;
- status;
- created by;
- created at;
- approved by/at;
- published at;
- client opened/downloaded where tracked.

Actions depend on state. Published versions are immutable; corrections create a new version.

## M11 — Publish report dialog

Required fields:

- approved report version;
- client-facing title;
- short message;
- confirm associated Client;
- e-mail notification checkbox, enabled by default;
- confirmation of PDF preview.

Primary action: `Bericht veröffentlichen`.

Confirmation text explains:

- Client receives read-only access;
- published version cannot be edited;
- corrections require a new version;
- e-mail failure does not revoke portal access.

## M12 — Publication result

Shows two independent outcomes:

```text
Bericht veröffentlicht ✓
E-Mail versendet ✓ / Versand fehlgeschlagen
```

When e-mail fails:

- keep report published;
- show retry notification action;
- do not republish the report;
- record both events in audit/history.

## M13 — Published proposal view

Manager sees exactly what the Client sees, plus internal metadata in a separate panel.

Action:

- `Kundenansicht öffnen`.

This prevents accidental mismatch between internal preview and client delivery.

## M14 — Engagement history

Timeline of meaningful events:

- Discovery saved/submitted/returned/accepted;
- analysis/review milestones;
- report version created/approved/published/withdrawn;
- notification sent/failed;
- client opened/downloaded, if tracked;
- access denied/revoked where relevant.

Do not mix low-level technical logs into this business timeline.

## M15 — Knowledge Base search

Search and filter Consulting Knowledge Base entries relevant to the current stage. Results show applicability and source, not merely a document title.

## M16 — Reports overview

Lists reports across owned Engagements by status and next action.

---

## 12. Administrator screens

## A01 — Admin dashboard

Operational metrics:

- active Managers;
- active Engagements;
- unassigned Engagements;
- pending invitations;
- client access issues;
- failed notifications;
- pending Technology Update Proposals.

Metrics are workspace-scoped.

## A02 — All Engagements

Same table language as Manager, with additional columns:

- owner;
- access/client association state.

Administrator may transfer ownership.

## A03 — Organizations

Organization list and details. This is not a sales CRM: no lead pipeline, marketing automation, or speculative contact enrichment.

## A04 — Managers

List:

- name;
- e-mail;
- status;
- owned Engagement count;
- invitation state;
- last sign-in where allowed.

Actions:

- invite;
- deactivate;
- review owned Engagements before deactivation.

## A05 — Users and access

Separate tabs:

- Administrators
- Managers
- Clients
- Invitations
- Client access

Permissions must be described in plain language before changes.

## A06 — Engagement ownership transfer

Dialog shows current and new Manager plus affected Engagement. Transfer requires confirmation and audit event.

## A07 — Client access administration

Shows:

- associated Client;
- Engagement;
- registration status;
- verification status;
- access expiry;
- revoked state;
- latest notification state.

Actions:

- resend registration link;
- revoke access;
- extend access if product policy permits;
- never view or set permanent password.

## A08 — Audit

Filters:

- actor;
- event type;
- Engagement;
- date range;
- outcome.

Audit entries are append-only and read-only.

## A09 — Consulting Knowledge Base

Curated authoring and review surface according to the relevant phase. Do not model it as folders only; use structured entities and taxonomy.

## A10 — Technology Knowledge Base

Hierarchy:

- Technology Categories;
- Technology Profiles;
- official Technology Sources;
- update status.

## A11 — Technology Update Proposals

Review screen contains:

- proposed change;
- affected profile;
- official sources;
- diff;
- assumptions/gaps;
- approve/reject actions.

## A12 — Technology Update History

Append-only approved changes with source and approver.

## A13 — Notification operations

Shows failed or pending messages without exposing message bodies unnecessarily.

Actions:

- retry safe notification;
- inspect provider-neutral error category;
- no manual editing of system-generated security links.

## A14 — System settings

Only configuration actually supported belongs here. Avoid a decorative settings graveyard.

---

## 13. Proposal delivery experience

### 13.1 Manager flow

1. Open Engagement.
2. Open `Bericht`.
3. Review or edit draft.
4. Generate/preview PDF.
5. Approve immutable report version.
6. Select `An Kunden veröffentlichen`.
7. Confirm Client, title, message, and e-mail notification.
8. Publish.
9. Receive separate report-publication and e-mail results.

### 13.2 Client e-mail

Recommended German subject:

```text
Ihr Lösungsvorschlag ist verfügbar
```

E-mail content requirements:

- identify the consulting organization/workspace brand;
- identify the relevant Engagement in non-sensitive language;
- state that a document is available;
- include one secure portal action;
- never attach the PDF by default;
- never include internal analysis details;
- avoid exposing whether the account exists in error responses.

Primary CTA:

```text
Lösungsvorschlag öffnen
```

The e-mail is a notification, not an authorization mechanism. Access is checked after sign-in.

### 13.3 Client portal behavior

- Client signs in.
- Portal opens the associated Engagement.
- New document is marked `Neu`.
- Client may open PDF.
- Client may download PDF.
- Client may not edit, annotate, delete, upload, replace, or republish.
- Opening/downloading may create an audit/activity event if legally and product-wise approved.

### 13.4 Version behavior

- Published version is immutable.
- Revised content creates a new report version.
- New version requires approval and publication.
- Older version is either retained for Client or marked superseded according to one explicit policy; do not improvise per Engagement.
- Withdrawal removes client access but preserves audit records.

### 13.5 Failure states

#### PDF generation fails
Report remains in its prior state; publication is unavailable.

#### Publication succeeds, e-mail fails
Client access exists. Manager sees `E-Mail-Versand fehlgeschlagen` and may retry only notification.

#### E-mail succeeds, portal access fails
Treat as a security/access incident. Do not send a second generic invitation without diagnosing association/access state.

#### Client access revoked after publication
Client cannot open/download. Published artifact and history remain preserved internally.

---

## 14. Permissions matrix

See `role-permissions.csv` for the machine-readable table.

High-level rules:

| Capability | Client | Manager | Administrator |
|---|---:|---:|---:|
| View own associated Engagement summary | Yes | N/A | Yes |
| Edit own Discovery draft/returned form | Yes | Own Engagements | All workspace Engagements |
| Submit Discovery | Yes | Own Engagements | All workspace Engagements |
| Accept/return Discovery | No | Own Engagements | All workspace Engagements |
| View internal assessment/recommendations | No | Own Engagements | All workspace Engagements |
| Edit report draft | No | Own Engagements | All workspace Engagements |
| Approve report version | No | Own Engagements, subject to review policy | Yes |
| Publish approved report to Client | No | Own Engagements | All workspace Engagements |
| Open/download published report | Own associated Engagement only | Yes | Yes |
| Edit published report | No | No | No |
| Manage users/roles/ownership | No | No | Yes |
| View audit trail | No | Own relevant history view only | Workspace audit |

Every permission is enforced server-side. UI visibility mirrors permission; it does not create permission.

---

## 15. Content and localization

### 15.1 Language

Initial user-facing language is German.

Stable code/domain identifiers remain English:

```text
Engagement
DiscoveryProfile
ConsultantReport
ReportVersion
Notification
Workspace
```

Visible copy is translated through message identifiers, never hard-coded server prose.

### 15.2 Tone

German UI copy should be:

- professional;
- direct;
- respectful;
- specific about outcomes;
- free from AI hype.

Prefer:

```text
Discovery wurde eingereicht.
```

Avoid:

```text
Super! Unsere magische KI beginnt jetzt mit der Analyse!
```

### 15.3 Dates and numbers

Use German locale formatting:

- `31.07.2026`
- `18.500 €`
- `12,5 %`

Do not localize stable identifiers in API payloads.

---

## 16. Accessibility requirements

Target WCAG 2.2 AA.

Minimum requirements:

- keyboard operation for all actions;
- visible focus ring;
- semantic headings;
- explicit form labels;
- error summary for long forms;
- status icon + text;
- minimum 4.5:1 contrast for normal text;
- no hover-only information;
- dialogs trap focus and restore it on close;
- tables have headers and accessible names;
- PDF action has accessible file information;
- motion respects reduced-motion preference.

---

## 17. Security and privacy presentation rules

- Do not reveal records outside authorization scope, even in counts or autocomplete.
- Do not include sensitive Discovery data in e-mail subject or preview text.
- Do not expose provider stack traces or raw backend errors.
- Do not let Client guess other Engagement identifiers through URLs.
- Download links must be authorization checked and time-safe; a copied URL is not permanent permission.
- Do not show permanent passwords to Administrators.
- Destructive access changes require confirmation.
- Audit events show necessary business metadata, not secrets.

---

## 18. Recommended component naming

Illustrative frontend names:

```text
AppShell
WorkspaceSidebar
PageHeader
EngagementHeader
StageTracker
StatusBadge
NextActionCard
DiscoverySectionNav
DiscoveryFormSection
MetricEditor
EvidenceList
RecommendationCard
ReportOutline
ReportSectionEditor
ReportVersionTable
PublishReportDialog
PublishedDocumentCard
ClientPortalShell
NotificationStatus
AuditEventTable
EmptyState
InlineAlert
```

Names may adapt to the existing repository, but one concept should have one name.

---

## 19. Implementation rules for coding agents

When implementing from this UI kit:

1. Read the frozen project documents first.
2. Implement only the current roadmap phase and the screens/components needed by it.
3. Do not build all listed screens at once.
4. Reuse shared components and tokens; do not duplicate visual values in pages.
5. Preserve server-side authorization.
6. Do not invent backend data to make a dashboard look complete.
7. Add realistic empty/loading/error states.
8. Use stable message identifiers for user-facing outcomes.
9. Keep Client Portal components separate from internal workbench components where density and permissions differ.
10. Test permission-driven rendering and critical actions.
11. Treat report publication and notification delivery as separate operations/results.
12. Published report versions are immutable in the UI.

---

## 20. Screen implementation priority

This is a design priority, not a replacement roadmap.

### Foundation

- global tokens;
- buttons, inputs, badges, alerts;
- AppShell;
- ClientPortalShell;
- loading/error/empty states.

### Discovery experience

- Client overview;
- Discovery form;
- submitted/returned/accepted states;
- Manager Discovery review.

### Multi-user operations

- role navigation;
- Engagement list filtering;
- access administration;
- audit timeline.

### Consulting workbench

- Engagement overview;
- assessment;
- prioritization;
- recommendations;
- roadmap.

### Report delivery

- report workspace;
- version table;
- PDF preview;
- publish dialog;
- notification result;
- Client documents list and proposal detail.

### Knowledge administration

- Consulting KB;
- Technology KB;
- update proposals and history.

---

## 21. Acceptance checklist for frontend work

A screen is not complete until:

- role and authorization assumptions are explicit;
- German labels are sourced through localization identifiers;
- responsive behavior is defined;
- loading, empty, error, and access-denied states exist;
- keyboard navigation works;
- focus behavior is correct;
- no unsupported metric or fake score is displayed;
- business status maps to a stable identifier;
- actions have clear success/failure feedback;
- destructive actions are confirmed;
- audit-relevant actions produce the required backend event when that capability exists;
- responsive behavior is verified at desktop, tablet, and mobile breakpoints;
- tests cover critical rendering and interaction paths;
- the implementation does not expand beyond the active roadmap phase.

---

## 22. Open decisions that must be resolved before proposal delivery implementation

The UI kit deliberately does not invent these product policies:

1. Whether a Client may retain access to superseded proposal versions.
2. Whether report opening and downloading are recorded and shown to the Manager.
3. Whether report approval requires a second person or may be self-approved by the owning Manager.
4. How long Client Portal access remains valid after the Engagement is closed.
5. Whether PDF is the only client-visible document type in the first implementation.
6. Whether the Manager can withdraw a published report and under which conditions.

Default implementation must not silently choose these. They belong in the deliberate documentation update for the proposal-delivery capability.

---

## 23. Final design decision

The AI Consulting Workbench uses one shared visual system with two distinct experiences:

- an operational, evidence-oriented internal workbench for Managers and Administrators;
- a bounded, simple Client Portal for Discovery and published read-only proposals.

The central UX concept is not “manage records.” It is:

> Move one Engagement through a transparent, reviewable consulting process while keeping the consultant in control and giving the Client only the information and documents deliberately released to them.
