# AI Consulting Workbench

An AI-assisted workbench for a consultant who identifies and recommends AI
opportunities in a client's operations. Work is grouped by **Organization** (the
client company) and carried out one **Engagement** at a time: the consultant
opens an engagement for an organization, records where it stands, captures a
Discovery Profile — including the **value & measurement baseline** of what the
problem costs today and what success would measurably look like — moves that
discovery through a **draft / submitted / returned / accepted** review workflow,
generates an AI-assisted **Assessment** of the client across the six assessment
dimensions, and reviews a structured consultant report — leaving and resuming
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
| POST   | `/engagements/:id/analyze`        | Run the AI analysis for an engagement.         |
| GET    | `/engagements/:id/analysis-runs`  | List the engagement's Analysis Runs.           |

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
consultant edits are not silently regenerated over), validating engagement
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
leaves the seams themselves unproven. One suite therefore uses the real thing
end to end — a real Better Auth session → the real `AuthenticationProvider` →
the domain `User` → the `AccessPolicy` → the Prisma repositories → the Express
routes — against a **uniquely named throwaway PostgreSQL database it creates,
migrates with the real Prisma migration chain, and drops afterwards**:

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
