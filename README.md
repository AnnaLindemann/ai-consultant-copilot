# AI Consulting Workbench

An AI-assisted workbench for a consultant who identifies and recommends AI
opportunities in a client's operations. Work is grouped by **Organization** (the
client company) and carried out one **Engagement** at a time: the consultant
opens an engagement for an organization, records where it stands, captures a
Discovery Profile — including the **value & measurement baseline** of what the
problem costs today and what success would measurably look like — moves that
discovery through a **draft / submitted / returned / accepted** review workflow,
generates an AI-assisted **Assessment** of the client across the six assessment
dimensions, derives and prioritizes the **Opportunities** that follow from it,
and reviews a structured consultant report — leaving and resuming
the engagement without losing state. Every AI-assisted step
is recorded
as an **Analysis Run** — with provider, model, prompt version, prompt
fingerprint, token usage, latency, and cost — and traced in Langfuse.

> **Terminology.** An **Organization** groups a client's engagements (identity
> and context only, not a CRM). An **Engagement** is the primary business entity
> and single source of truth for a client's work; it tracks its methodology
> `stage`. Recommendations are grounded in two separate, reusable knowledge
> bases: a **Consulting Knowledge Base** (stable consulting methodology
> knowledge) and a **Technology Knowledge Base** (fast-changing AI-technology
> knowledge, updated only through the human-approved **Technology Curator**).
> Both are documented in the domain model and roadmap and are delivered in later
> phases; they are not yet implemented. See
> [`docs/domain-model.md`](docs/domain-model.md) for the full ubiquitous
> language.

The project is a monorepo with two parts:

```
ai-consultant-copilot/
├── server/   ← Express + Prisma + Groq (backend API)
├── client/   ← Next.js (engagement workspace UI)
├── shared/   ← types & schemas shared by client and server
└── docs/     ← product vision, domain model, roadmap, architecture, standards
```

## Prerequisites

- **Node.js** 20+ and npm.
- **Docker** (for the local PostgreSQL database), or an existing PostgreSQL 16
  instance you point `DATABASE_URL` at.

## Setup

### 1. Environment files

Copy the example env files and adjust the values (in particular, add a real
`GROQ_API_KEY`, and set `BETTER_AUTH_SECRET` and `AUTH_BOOTSTRAP_SECRET`):

```bash
cp .env.example .env                       # Postgres credentials for docker-compose
cp server/.env.example server/.env         # API port, DATABASE_URL, LLM + Langfuse
cp client/.env.local.example client/.env.local   # backend base URL (optional)
```

The Postgres credentials in the root `.env` must match the `DATABASE_URL` in
`server/.env`.

### 2. Start PostgreSQL

```bash
docker compose up -d      # starts postgres on the port from .env (default 5432)
```

### 3. Install dependencies

```bash
npm install                 # root (shared deps)
npm install --prefix server
npm install --prefix client
```

### 4. Apply database migrations

```bash
cd server
npx prisma migrate deploy   # creates the tables from prisma/migrations
npx prisma generate         # (re)generate the Prisma client
cd ..
```

`prisma/migrations` is the whole story: a fresh environment runs exactly these
files, in this order, and nothing else. Phase 3A is one migration
(`20260730140000_phase3a_multi_user_collaboration`) and it is additive — it
creates the access tables and adds workspace/ownership columns, adopting
engagements from earlier phases into a seeded workspace. It opens with a guard
that **refuses to run, changing nothing, if a database still holds rows in the
superseded Phase 3A draft's hand-rolled auth tables** (`AuthCredential`,
`EmailVerificationToken`, `PasswordResetToken`, or an `AuthSession` with a
`tokenHash`). Those hold credentials, live sessions, and pending resets that the
Better Auth transition does not carry over, so they are never dropped on faith.
The refusal names the table and its row count; recover by exporting or deleting
those rows, running
`npx prisma migrate resolve --rolled-back 20260730140000_phase3a_multi_user_collaboration`,
and deploying again.

### 5. Run the apps

In two terminals:

```bash
# Terminal 1 — backend API (http://localhost:8787 by default)
npm run dev --prefix server

# Terminal 2 — frontend (http://localhost:3000)
npm run dev --prefix client
```

### 6. Create the first administrator

The workbench requires a signed-in user, so create the first administrator once,
using the `AUTH_BOOTSTRAP_SECRET` from `server/.env`. Either open
<http://localhost:3000/auth> and use the **Erst-Administrator** tab, or:

```bash
curl -X POST http://localhost:8787/auth/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"secret":"<AUTH_BOOTSTRAP_SECRET>","workspaceName":"My Workspace",
       "administratorEmail":"you@example.com","administratorName":"You",
       "password":"a-password-of-12-plus-chars"}'
```

Then sign in at <http://localhost:3000/auth>.

### 7. Reading local mail (optional)

Without Resend configured nothing is sent, and **no link or token is ever
written to a log** — the console records only that a message was raised, for
whom, and how large it was. To walk the invitation, verification,
password-reset, or Discovery-Access flow locally, turn on the development
mailbox in `server/.env` and read the messages:

```bash
echo "EMAIL_DEV_MAILBOX=1" >> server/.env   # then restart the API
npm run mail:dev --prefix server            # newest first; add a number to limit
```

Messages are written as files under `server/tmp/dev-mailbox` (git-ignored, mode
`600`, only the most recent 50 kept). The mailbox is refused outright when
`NODE_ENV=production`, so real recipients' links can never be captured to a
server's disk instead of being delivered.

Once signed in, open <http://localhost:3000> to create an organization, open an
engagement for it, complete and revise its Customer Operations Discovery
Profile, generate and review the Assessment, and run an analysis, or
<http://localhost:3000/engagements> to list and resume existing engagements.
Discovery records both known facts and explicit missing information so a later
session resumes with the same profile and gaps.

**Discovery** additionally captures the engagement's **value & measurement
baseline**: business impact, error frequency/severity/cost, existing KPIs,
baseline metrics, and target success metrics. Every figure carries how it was
obtained — an estimate is never recorded as a measurement, and a measured figure
must state how it is measured and where it came from. What the client cannot
answer is recorded as a **measurement gap with its reason** rather than left
blank, and discovery cannot be submitted while a baseline subject is neither
answered nor explained.

Discovery is worked on as a **draft**, **submitted** when the contributor
considers it complete, and then **accepted**, **returned with notes**, or
**reopened** by the consultant. Every save records **who provided which
section** (consultant-captured vs. client-provided); client-provided content
keeps that attribution through later consultant edits and returns discovery to
draft, because it becomes accepted fact only by the consultant's review. No
transition touches discovery content. Discovery is consultant- or
client-authored, never AI-assisted, so it records no Analysis Run.

> From Phase 3A the contributor is an **authenticated** identity. A save made
> through the Client Discovery Portal is attributed to the client whatever the
> request claims, and only the consultant may accept, return, or reopen.

The **Assessment** is generated from the persisted Discovery Profile and covers
Business Process, Data, Technology, AI Readiness, Risks, and Opportunities. Each
finding states whether it is supported by discovery or rests on an assumption,
carries a confidence, and the Assessment lists what it could not determine. AI
output lands as an unreviewed draft the consultant edits, overrides, or accepts;
regenerating over an Assessment that already carries consultant edits requires
explicit confirmation.

**Opportunities** are derived from the persisted Assessment: each one carries the
problem it was carried forward from, an improvement candidate, the consultant's
view of its **value, effort, impact, and confidence**, and a qualification
against the Assessment's **AI Readiness** dimension — anything short of "ready"
names what stands in the way. Every Opportunity cites the assessment findings it
comes from, by dimension and title; a draft citing a finding the Assessment does
not contain is rejected outright and nothing is persisted. The set is
**prioritized**: ranks run 1..n without gaps or duplicates, the consultant
re-orders by hand, and re-running after the Assessment changes updates the
ordering without restarting the engagement. Like the Assessment, the AI draft is
the consultant's to edit or accept, and re-running over their edits requires
explicit confirmation.

**Recommendations** (Phase 6) connect the prioritized Opportunities to curated
knowledge. Each one carries its **approach, rationale, assumptions, confidence,
and expected value**, and its grounding is structural rather than asserted:

- **backward**, to the Opportunity it addresses — by the Opportunity's stable
  id, never by its title or its rank — and through that Opportunity's cited
  Assessment findings to the **Discovery Profile facts** behind them, resolved by
  the server from persisted state so nothing in the trace can be invented;
- **outward**, to the **Consulting Knowledge Base** entries that justify the
  approach, of which at least one must be an **AI Use Case** or a **Solution
  Pattern**, each carrying the reasoning copied into the engagement's own
  content;
- **outward**, to the **Technology Knowledge Base** for any implementation
  technology or AI model named — technologies are modelled as coded citations
  with an explanation of *why they fit*, so a recommendation cannot name one
  without a Technology Profile behind it. Naming none is valid; naming an
  uncurated one is not.

A citation that resolves to nothing is fabricated grounding: the draft is
refused, the fabricated ids and codes are named back to the consultant, the run
is recorded as invalid, and no version is created. The model may cite only what
was **retrieved for it**; the consultant, reviewing that draft, may re-ground a
proposal in any active curated entry. The AI never supplies a figure — baselines
and targets belong to the Opportunity's success criteria and the client's own
numbers. Expected value is qualitative.

Like the Opportunities, Recommendations are **versioned**: a new run supersedes
rather than overwrites, edits are autosaved into the active version under an
optimistic-concurrency revision, and re-prioritizing marks the active version
**stale** — a recommendation to re-run, never an automatic rewrite. Each matching
run is recorded as an Analysis Run carrying the codes from **both** knowledge
bases (`knowledgeEntryCodes` and `technologyProfileCodes`, kept separate because
the two subsystems are independent).

## Curated Consulting Knowledge Base (Phase 5)

The **Consulting Knowledge Base** is the reusable, engagement-independent
knowledge that grounds the methodology. It holds the approved kinds of
consulting knowledge — business domains, processes and problems, the Customer
Operations taxonomy, discovery questions, assessment frameworks, AI-readiness
criteria, AI use cases, solution and implementation patterns, ROI and risk
models, best practices, and follow-up templates — scoped to the Customer
Operations domain. (Technology Profiles are **not** here; they belong to the
separate Technology Knowledge Base in Phase 5A.)

It is **strictly separate from engagement state**: its table group carries no
workspace and no engagement reference, engagements reference an entry by its
stable `code`, and there is no code path from running an engagement to a
knowledge write. It is a **product-level asset shared across workspaces** — it
holds no client-specific content, so it sits deliberately outside the Phase 3A
isolation boundary.

**Retrieval is deterministic and structural.** For a given engagement and
consulting stage it runs:

```
engagement context
  → the stage's required knowledge kinds
  → structured filter (domain + active + kind + stage scope)
  → anchor resolution: the engagement's own words are resolved through each
    entry's curated match vocabulary into taxonomy codes, then into the
    processes, problems, and use cases those codes are curated against
  → traversal of the explicit curated relationships to those anchors
  → deterministic ranking (integer weights over typed relationships;
    ties broken by curator sort order, then by code)
  → a limited package (at most 4 per kind, 12 in total)
  → the prompt
```

Identical inputs against an unchanged knowledge base always produce identical,
identically ordered results. The LLM never searches the knowledge base — it
receives only the selected package, and the codes it was grounded in are
recorded on the Analysis Run as `knowledgeEntryCodes`. Three stages retrieve
today: **Discovery** (questions, taxonomy, processes, problems, follow-up
templates), **Assessment** (frameworks, AI-readiness criteria, problems, use
cases, risk models, best practices), and **Solution Matching** (AI Use Cases and
Solution Patterns — exactly what Phase 6 grounds a recommendation in). **Tags are a weak
additional signal and can never select an entry on their own**; stable codes,
the taxonomy, and explicit relationships are what retrieval runs on. Embeddings,
vector search, and RAG remain out of scope until Phase 10.

**Curation is a deliberate, separate activity.** An Administrator creates,
edits, and deactivates entries; a Manager reads; a Client reaches nothing.
Writes are revision-checked, so a stale edit is refused rather than silently
overwriting another curator's change, and a curated relationship that points at
an unknown code — or at the wrong kind of entry — is rejected before it is
persisted. Deactivation retires an entry from retrieval without deleting it or
invalidating the codes an earlier Analysis Run recorded.

**The shipped Customer Operations content is a starting point, not a fixture.**
It is seeded only into an empty knowledge base: once the base holds a single
row, restarting the application never writes to it again, so an administrator's
curated changes are safe across restarts.

**Nothing from the knowledge base reaches a client.** The Client Portal's
responses carry no knowledge package, no guidance, and no internal frameworks
or AI-readiness criteria; the portal has no knowledge route at all.

## Curated Technology Knowledge Base (Phase 5A)

The **Technology Knowledge Base** is the second curated asset: reusable,
engagement-independent knowledge about the AI technologies and models a solution
might use. It is kept separate from the Consulting Knowledge Base because
technologies churn far faster than consulting methodology, and it is
**product-level and shared across workspaces** for the same reason the
Consulting Knowledge Base is — its five tables carry no workspace column and no
engagement reference.

It holds four record kinds:

- **Technology Categories** — the 13 approved categories (AI Models, AI
  Providers, Embedding Models, Speech, OCR, Vector Databases, Rerankers, MCP
  Servers, Browser / Computer Use, Workflow Engines, Evaluation Frameworks,
  Monitoring, Deployment Patterns), held as curated data rather than hard-coded
  types. Flat: nesting arrives only if a real second level does.
- **Technology Profiles** — one AI technology or model each, classified under
  **exactly one** category (a documented invariant, enforced by a `NOT NULL`
  foreign key), describing its **role, strengths, limitations, and suitability**.
- **Technology Sources** — the registry of trusted official origins a proposal
  may cite.
- **Technology Update Proposals** and the append-only **Technology Update
  History** — the subsystem's two governance records.

### Governance: what the approval gate covers, and what it does not

**No Technology *Profile* changes without an approved proposal.** The flow is
detect → propose → **explicit human approval** → apply → append history, and the
profile write, the proposal decision, and the history entry land in one
transaction or not at all. There is no route that writes a profile directly, no
engagement-reachable path, and no autonomous path. Detection is manual in this
phase: there is no vendor watcher, no scheduled fetch, and no crawling.

**Technology Categories and Technology Sources are curated registries** and are
maintained directly by an Administrator, with revision checks and audit entries
but without a proposal. This is a deliberate, reviewed interpretation, recorded
because the documentation can bear two readings:

- The gate as written is broad — *"every update to the Technology Knowledge Base
  flows through a Technology Update Proposal"* (roadmap Phase 5A).
- It is applied to Profiles only because **a proposal can structurally target
  nothing else** (`domain-model.md` §2 defines a proposal as targeting *"a
  specific Technology Profile within a Technology Category"*), because the
  documentation calls these two **curated registries** maintained *"through
  curation"* (`architecture.md` Assumptions; `domain-model.md` §2), and because
  **the gate could not bootstrap otherwise**: every proposal must cite an
  existing source, so a proposal that adds one could never satisfy its own
  precondition.

Extending the gate to the registries would need new proposal semantics and a new
exemption for source bootstrapping — a documentation decision, not an
implementation choice. See the note at the head of
`server/src/repositories/technology-knowledge.repository.ts`.

### Provenance: origin metadata is not approval history

Two separate records, deliberately never merged:

- **Technology Update History** — append-only, and reserved **exclusively** for
  approved curator changes. It records what changed, the approving proposal, the
  Technology Sources preserved for auditability, the approver, and when. It has
  no `updatedAt` column and no update or delete path in code.
- **Origin metadata on the profile** (`origin`, `originSourceCodes`) — the
  product's own declaration about content it shipped. A seeded profile reports
  `origin: product_seed` with its official source, and an explicitly `null`
  proposal and applied-at, so it states where the information came from without
  ever implying that a human approved it.

The two are mutually exclusive: the first approved change sets `origin` to
`curator` and clears the declaration, so the history becomes the single source
of truth and the two can never disagree. **The seed writes no history entry.**

Retrieval is deterministic and category-scoped, excludes deprecated profiles,
returns stable profile codes with their provenance, and is exercised through an
Administrator preview endpoint. From Phase 6 it also grounds the technologies and
models a **Recommendation** names.

**The registry itself is Administrator-only.** A Manager and a Client are refused
every `/technology` route by deny-by-default, and every denial is audited. What a
Manager does meet is the small package deterministically retrieved *for their own
engagement*, carried inside the recommendation stage's state and authorized as a
read of that engagement — the curated grounding behind a proposal they are
reviewing, not the registry to browse.

## Access control (Phase 3A)

The workbench is multi-user and partitioned by **Workspace**. Every
engagement-side read, write, listing, aggregate, and export is scoped to the
acting user's workspace, and **every request is authorized on the server** —
what the UI hides is a convenience, never the control.

| Role | Reach |
|---|---|
| **Administrator** (`ADMIN`) | Every engagement in their own workspace, plus that workspace's users, roles, ownership, and invitations. No reach into any other workspace. |
| **Manager** (`MANAGER`) | Only the engagements they own, in their own workspace. |
| **Client** (`CLIENT`) | Only the Discovery form of the one engagement named by valid Discovery Access, through the Client Discovery Portal. |

Every access question goes through one decision point — the **AccessPolicy** in
`server/src/domain/access/access.ts` — in the fixed order **workspace scope →
role → engagement ownership (Manager) / discovery access (Client)**. Denials are
deny-by-default and **non-revealing**: a request for an engagement in another
workspace, for a colleague's engagement, and for an engagement that does not
exist all return the same `404` body. Every denial appends a
`denied_permission` entry to the append-only **Audit Trail**.

**How accounts come into existence:**

- **The first administrator** is created once per installation via
  `POST /auth/bootstrap`, guarded by `AUTH_BOOTSTRAP_SECRET`. It adopts the
  existing workspace and the placeholder owner created by the Phase 3A
  migration, so engagements from earlier phases stay owned and reachable.
  Bootstrap is refused once any account exists.
- **Managers and further administrators** are invited by an administrator and
  set their own password from an emailed link. An administrator never creates,
  sees, or stores anyone's password.
- **Clients self-register** at `POST /auth/register`, confirm their email, and
  choose their own password. A consultant then associates the confirmed account
  with **one** engagement's Discovery. Clients are never invited into a
  workspace — a `CLIENT` role is rejected by the invitation endpoint.

Authentication runs on **Better Auth** behind the `AuthenticationProvider` port,
with its own table group (`AuthUser`, `AuthSession`, `AuthAccount`,
`AuthVerification`) kept separate from consulting-domain state; the domain holds
role and workspace membership and never a password. Its own endpoints — email
verification, password reset — are mounted at `/api/auth/*`. Email is delivered
by **Resend** behind the `EmailDeliveryProvider` port. Without `RESEND_API_KEY`
and `EMAIL_FROM`, **production refuses to start**, so an invitation link can
never silently go nowhere; development records the message's metadata only, and
optionally captures the message itself to the local development mailbox.

**Nothing secret-bearing reaches a log.** Message bodies, links, invitation,
verification, reset, session, and API-key values are never logged, and neither
is a provider's error object or response body: a delivery failure is reported as
this codebase's own identifier plus an allow-listed vendor error name
(`lib/failure-identity.ts`, `lib/email-delivery.ts`). Vendors that echo the
rejected request back — with the link, the `Authorization` header, or the
cookie — therefore have no channel into the logs, which
`lib/email-delivery.test.ts` proves for each of those shapes.

## Backend API

Base URL: `http://localhost:8787`. Every path below except `/health` and the
account-lifecycle endpoints requires an authenticated session cookie.

| Method | Path                              | Purpose                                        |
|--------|-----------------------------------|------------------------------------------------|
| GET    | `/health`                         | Liveness check.                                |
| ALL    | `/api/auth/*`                     | Better Auth's own endpoints (email verification, password reset). |
| POST   | `/auth/bootstrap`                 | Create the first administrator (secret-guarded, once). |
| POST   | `/auth/register`                  | Client self-registration; sends a verification email. |
| POST   | `/auth/verification/resend`       | Re-send the verification email.                |
| POST   | `/auth/login`                     | Sign in.                                       |
| POST   | `/auth/logout`                    | Sign out.                                      |
| GET    | `/auth/me`                        | The acting user (identity, workspace, role).   |
| POST   | `/auth/invitations`               | Invite a Manager or Administrator (`ADMIN` only; `CLIENT` is rejected). |
| POST   | `/auth/invitations/accept`        | Accept an invitation and set your own password.|
| POST   | `/auth/invitations/revoke`        | Revoke a pending invitation (`ADMIN`).         |
| POST   | `/auth/engagements/:id/discovery-access` | Associate a self-registered client with this engagement's Discovery. |
| POST   | `/auth/discovery-access/:id/revoke` | End a client's Discovery Access immediately. |
| GET    | `/auth/workspace/users`           | The workspace's users (`ADMIN`).               |
| GET    | `/auth/workspace/invitations`     | The workspace's invitations (`ADMIN`).         |
| GET    | `/auth/workspace/discovery-access`| The workspace's Discovery Access records (`ADMIN`). |
| GET    | `/auth/workspace/audit`           | The workspace's append-only Audit Trail (`ADMIN`). |
| PATCH  | `/auth/users/:id/role`            | Change a user's role (`ADMIN`).                |
| PATCH  | `/auth/engagements/:id/ownership` | Transfer engagement ownership (`ADMIN`).       |
| GET    | `/auth/notifications`             | The acting user's own notifications.           |
| POST   | `/auth/notifications/read`        | Mark one of your notifications read.           |
| GET    | `/portal/engagements/:id/discovery` | Client Discovery Portal: read your own Discovery. |
| PATCH  | `/portal/engagements/:id/discovery` | Client Discovery Portal: save your own Discovery. |
| POST   | `/portal/engagements/:id/discovery/submit` | Client Discovery Portal: submit for review. |
| POST   | `/portal/engagements/:id/feedback` | Client Portal: submit feedback on a published report version. |
| GET    | `/portal/engagements/:id/feedback` | Client Portal: your own submitted feedback, client-safe fields only. |
| GET    | `/organizations`                  | List organizations.                            |
| POST   | `/organizations`                  | Create an organization.                        |
| GET    | `/organizations/:id`              | Get one organization.                          |
| GET    | `/organizations/:id/engagements`  | List an organization's engagements.            |
| GET    | `/engagements`                    | List engagements (with organization + stage).  |
| POST   | `/engagements`                    | Open an engagement under an organization.      |
| GET    | `/engagements/:id`                | Get one engagement (resume its state).         |
| PATCH  | `/engagements/:id`                | Save an engagement (edit content and/or stage).|
| PATCH  | `/engagements/:id/discovery`      | Save the complete, revisable Discovery Profile (`{ contributor, profile }`).|
| POST   | `/engagements/:id/discovery/submit`| Submit discovery for the consultant's review.  |
| POST   | `/engagements/:id/discovery/accept`| Accept the reviewed discovery (consultant).   |
| POST   | `/engagements/:id/discovery/return`| Return discovery with notes (consultant).     |
| POST   | `/engagements/:id/discovery/reopen`| Reopen discovery for revision (consultant).   |
| POST   | `/engagements/:id/assessment`     | Generate the AI Assessment draft from discovery.|
| PATCH  | `/engagements/:id/assessment`     | Save the consultant's reviewed Assessment.     |
| POST   | `/engagements/:id/opportunities`  | Derive and prioritize the Opportunities from the Assessment. |
| PATCH  | `/engagements/:id/opportunities`  | Save the consultant's reviewed, re-ordered Opportunities. |
| GET    | `/engagements/:id/opportunities/versions` | The engagement's Opportunity version history. |
| GET    | `/engagements/:id/opportunities/versions/:versionId` | One preserved Opportunity version. |
| POST   | `/engagements/:id/recommendations`| Match the prioritized Opportunities against both knowledge bases. |
| PATCH  | `/engagements/:id/recommendations`| Save the consultant's reviewed, re-grounded Recommendations. |
| GET    | `/engagements/:id/recommendations/versions` | The engagement's Recommendation version history. |
| GET    | `/engagements/:id/recommendations/versions/:versionId` | One preserved Recommendation version. |
| GET    | `/engagements/:id/feedback`       | Client Feedback and open re-entries for this engagement (`ADMIN`, `MANAGER`). |
| PATCH  | `/engagements/:id/feedback/:feedbackId/classification` | Classify feedback and declare the impacted stages (revision-checked). |
| PATCH  | `/engagements/:id/feedback/:feedbackId/close-no-action` | Close feedback without re-entry, with a required reason. |
| POST   | `/engagements/:id/feedback/reentries` | Open a re-entry for classified feedback, recording the source versions. |
| POST   | `/engagements/:id/feedback/reentries/:reentryId/complete` | Record an outcome per impacted stage and complete the re-entry. |
| POST   | `/engagements/:id/analyze`        | Run the AI analysis for an engagement.         |
| GET    | `/engagements/:id/analysis-runs`  | List the engagement's Analysis Runs.           |
| GET    | `/knowledge`                      | Browse the curated Consulting Knowledge Base (`ADMIN`, `MANAGER`). |
| GET    | `/knowledge/entries/:code`        | Read one curated entry (`ADMIN`, `MANAGER`).   |
| POST   | `/knowledge/entries`              | Create a curated entry (`ADMIN`).              |
| PATCH  | `/knowledge/entries/:code`        | Edit or deactivate a curated entry (`ADMIN`, revision-checked). |
| GET    | `/knowledge/engagements/:id/discovery-package` | The knowledge package retrieved for this engagement's Discovery. |
| GET    | `/knowledge/engagements/:id/assessment-package` | The knowledge package retrieved for this engagement's Assessment. |

## Client Feedback & Engagement Evolution (Phase 9)

An engagement does not end with the first delivered report. A Client can leave
feedback on a report version they actually received, and the owning Manager
turns that into a controlled re-entry into earlier stages.

**Nothing in Phase 9 changes an accepted artifact.** Submitting, classifying,
declaring impacted stages, opening a re-entry and recording outcomes all write
only feedback and re-entry records. Revising Discovery, the Assessment, the
Opportunities, the Recommendations, the Roadmap or the Report still happens
through those stages' own workflows, produces new versions, and requires the
same explicit approval and publication as before. No Phase 9 action generates,
accepts, approves or publishes anything, and none of them records an Analysis
Run — they are deterministic, not AI-assisted.

### Lifecycle

```text
submitted → classified → reentry_open → resolved
submitted | classified → closed_no_action
```

`resolved` and `closed_no_action` are terminal; reopening is not a supported
operation and is refused. Every transition is revision-checked, so two Managers
acting at once cannot produce conflicting state, and each one appends its audit
event in the same transaction as the state change.

### What binds a Feedback

A submission is accepted only when the server can prove the whole chain: an
authenticated Client, an active Discovery Access, the same workspace and
engagement, an **active** (non-revoked) `DocumentPublication` published to
**that exact Client**, referencing an **approved** `ConsultantReportVersion`.
The report version, its number and the publication timestamp are read from the
publication — a Client supplies only the publication id, a retry key and the
text.

Retries are idempotent per `(publication, submitter, retry key)`, so a resent
request returns the same Feedback instead of creating a second one. Reusing a
key with different text is refused rather than silently answered with the
earlier record. Two deliberate submissions with the same text under different
keys are two separate, immutable records; a correction is a new Feedback, never
an edit of the original.

### What the Client Portal returns

The portal answers with a narrow client-safe payload — id, lifecycle status,
the submitted text, the submission date, the publication id and the report
version number. Classification, declared impacted stages, Manager summary and
decision, close-no-action reason, reviewer identity, artifact identifiers,
source fingerprints, revision counters, technical staleness and re-entry
records are never included, on first submission or on an idempotent replay of
an already-classified Feedback.

### Declared impact, technical staleness and the source report

The Manager view separates three answers that are easy to confuse:

- **Declared impacted stages** — what the Manager decided must be reviewed.
- **Technical staleness** — whether a stage's recorded source has actually
  moved on, taken from the same per-stage predicates the Opportunity,
  Recommendation, Roadmap and Report panels already use. Each reason names the
  artifact that changed, not the stage that went stale.
- **Source report state** — whether the published version the Client commented
  on has been superseded, or its sources have since changed.

Declaring a stage impacted never makes anything technically stale.

### Completing a re-entry

Every declared stage needs an explicit outcome: `completed`, `waived` or
`no_change_confirmed`, the last two with a Manager-authored reason. A completed
stage references the version the engagement actually holds — the active,
accepted (approved, for a report) version, selected from options the server
supplies. Discovery and the Assessment carry no separate version record, so
their result identity (content fingerprint, and the Assessment revision) is
derived server-side from accepted engagement state; no identifier is typed by
hand. Completion is refused when a stage has no outcome, when the result is not
accepted, when it is the same version the re-entry started from, when it belongs
to another engagement or workspace, or when it does not exist.


## Scripts

Run from the `server/` directory:

```bash
npm run dev                       # start the API with hot reload (tsx watch)
npm test                          # unit tests (alias of test:unit — no DB or LLM needed)
npm run test:unit                 # unit tests only
npm run test:integration          # PostgreSQL-backed integration tests (REQUIRES a database)
npm run test:integration:optional # the same suite, skipped when no database is reachable
npm run test:all                  # unit + integration — the acceptance command
npm run typecheck                 # tsc --noEmit
npm run llm:test                  # smoke-test the configured LLM provider connection
npm run mail:dev                  # read the local development mailbox
```

From `client/`: `npm run dev`, `npm run build`, `npm run lint`.

## Testing

Backend unit tests use Node's built-in test runner (via `tsx`) and cover the
critical trust paths — parsing/validating the LLM's consultant report and
Assessment, the Discovery Profile contract (including the value & measurement
baseline's measured-vs-estimated rules and its explicit gaps), the Discovery
review workflow and content provenance (a client cannot accept their own
submission, no transition rewrites content, client-provided content keeps its
attribution), the Assessment stage's rules and orchestration (a failed AI step
never mutates engagement state and is still recorded as an Analysis Run;
consultant edits are not silently regenerated over), the Consulting Knowledge
Base's deterministic retrieval (the same inputs always produce the same ordered
codes, a typed curated relationship always outranks a tag match, only a stage's
required kinds are retrieved, inactive entries are excluded, the package is
capped, and every shipped relationship resolves to a real entry of the right
kind), the Opportunity contract and
the prioritization stage (an opportunity must cite a finding the Assessment
actually contains, a qualification short of "ready" must name a blocker, a
ranking must be a real ordering, and output citing an invented finding is
refused without mutating state), the solution-matching stage's grounding
invariant (a recommendation must address an Opportunity that exists, cite
curated knowledge that was actually retrieved, name only curated Technology
Profiles, and rest on at least one AI Use Case or Solution Pattern — each
failure named separately and none of them mutating state), validating engagement
input, and cost calculation.

From Phase 3A they also cover **access control, tested negatively** — the
denials, not only the permitted paths: unauthenticated access, cross-workspace
access, a Manager reaching a colleague's engagement, Client portal isolation,
revoked and expired Discovery Access, and that denial responses are uniform and
non-revealing. `src/domain/access/access.test.ts` tests the AccessPolicy as pure
domain logic; `src/routes/authorization.test.ts` drives the real routes and the
real policy through the HTTP boundary and asserts each denial is recorded as a
`denied_permission` audit entry.

The unit suites are deterministic and need no database or live model (the
Assessment orchestration and authorization tests replace the provider, the
authentication provider, and the repositories at their module seams, which is
why the test script enables Node's `--experimental-test-module-mocks`):

```bash
npm test --prefix server
```

Replacing the infrastructure at its seams is right for proving the rules, but it
leaves the seams themselves unproven. Four suites therefore use the real thing
end to end — a real Better Auth session → the real `AuthenticationProvider` →
the domain `User` → the `AccessPolicy` → the Prisma repositories → the Express
routes; the prioritization stage's own storage path (a prioritization survives
the Json round-trip with its citations and ranks intact, and the new routes are
workspace-scoped like every other engagement route); the solution-matching stage
(the seeded knowledge bases really do ground a Customer Operations engagement,
retrieval repeats identically, a recommendation's whole grounding survives the
round-trip, the database itself refuses two active versions, and a preserved
version is never rewritten); and the Consulting
Knowledge Base (an Administrator curates and a Manager cannot, a Client reaches
nothing, the portal leaks nothing, repeated retrieval is identical, a
deactivated entry disappears, an invalid relationship is refused, and a restart
never overwrites a curated change) — each against a
**uniquely named throwaway PostgreSQL database it creates, migrates with the
real Prisma migration chain, and drops afterwards**:

```bash
npm run test:integration --prefix server
```

**This command fails, rather than skips, when PostgreSQL is unreachable** — a
suite that quietly passes because there was no database proves nothing while
looking like proof — and it is therefore part of the acceptance path
(`npm run test:all --prefix server`). It uses `TEST_DATABASE_URL` if set and
`DATABASE_URL` otherwise, only ever as the *server* to create its own database
on. `npm run test:integration:optional` is the explicitly-named local variant
that skips when offline; it is not the acceptance command.

## Notes

- **No fake quality scores.** Analysis Runs record only objective signals (JSON
  parse success, schema validity, tokens, latency, cost). Subjective quality
  scores are not produced until a genuine evaluator exists — no placeholder score
  is presented as a real evaluation.
- **Observability is optional.** Langfuse tracing activates only when configured;
  the app runs normally without it.
- The `docs/` directory holds the frozen product, domain, roadmap, architecture,
  and standards documents that govern implementation.
