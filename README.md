# AI Consulting Workbench

An AI-assisted workbench for a consultant who identifies and recommends AI
opportunities in a client's operations. Work is grouped by **Organization** (the
client company) and carried out one **Engagement** at a time: the consultant
opens an engagement for an organization, records where it stands, runs an
AI-assisted analysis, and reviews a structured consultant report — leaving and
resuming the engagement without losing state. Every AI-assisted step is recorded
as an **Analysis Run** — with provider, model, prompt version, prompt
fingerprint, token usage, latency, and cost — and traced in Langfuse.

> **Terminology.** An **Organization** groups a client's engagements (identity
> and context only, not a CRM). An **Engagement** is the primary business entity
> and single source of truth for a client's work; it tracks its methodology
> `stage`. See [`docs/domain-model.md`](docs/domain-model.md) for the full
> ubiquitous language.

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
`GROQ_API_KEY`):

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

### 5. Run the apps

In two terminals:

```bash
# Terminal 1 — backend API (http://localhost:8787 by default)
npm run dev --prefix server

# Terminal 2 — frontend (http://localhost:3000)
npm run dev --prefix client
```

Open <http://localhost:3000> to create an organization, open an engagement for
it, and run an analysis, or <http://localhost:3000/engagements> to list and
resume existing engagements.

## Backend API

Base URL: `http://localhost:8787`

| Method | Path                              | Purpose                                        |
|--------|-----------------------------------|------------------------------------------------|
| GET    | `/health`                         | Liveness check.                                |
| GET    | `/organizations`                  | List organizations.                            |
| POST   | `/organizations`                  | Create an organization.                        |
| GET    | `/organizations/:id`              | Get one organization.                          |
| GET    | `/organizations/:id/engagements`  | List an organization's engagements.            |
| GET    | `/engagements`                    | List engagements (with organization + stage).  |
| POST   | `/engagements`                    | Open an engagement under an organization.      |
| GET    | `/engagements/:id`                | Get one engagement (resume its state).         |
| PATCH  | `/engagements/:id`                | Save an engagement (edit content and/or stage).|
| POST   | `/engagements/:id/analyze`        | Run the AI analysis for an engagement.         |
| GET    | `/engagements/:id/analysis-runs`  | List the engagement's Analysis Runs.           |

## Scripts

Run from the `server/` directory:

```bash
npm run dev         # start the API with hot reload (tsx watch)
npm test            # run the unit tests (parse/validation/cost — no DB or LLM needed)
npm run typecheck   # tsc --noEmit
npm run llm:test    # smoke-test the configured LLM provider connection
```

From `client/`: `npm run dev`, `npm run build`, `npm run lint`.

## Testing

Backend unit tests use Node's built-in test runner (via `tsx`) and cover the
critical trust paths — parsing/validating the LLM's consultant report, validating
engagement input, and cost calculation. They are deterministic and need no
database or live model:

```bash
npm test --prefix server
```

## Notes

- **No fake quality scores.** Analysis Runs record only objective signals (JSON
  parse success, schema validity, tokens, latency, cost). Subjective quality
  scores are not produced until a genuine evaluator exists — no placeholder score
  is presented as a real evaluation.
- **Observability is optional.** Langfuse tracing activates only when configured;
  the app runs normally without it.
- The `docs/` directory holds the frozen product, domain, roadmap, architecture,
  and standards documents that govern implementation.
