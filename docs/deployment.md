# Deployment

How to get the AI Consulting Workbench running outside a developer's machine:
the backend on Render, the frontend on Vercel, both under a domain you own.

[`environment.md`](environment.md) is the variable reference,
[`operations.md`](operations.md) is what to do once it is running, and
[`smoke-tests.md`](smoke-tests.md) is how to check each step worked.

> **Free-tier resources are for testing, not for production.** A free backend
> sleeps, a free database expires, and neither is backed up. §8 says what that
> means in practice. Do not put a real client's engagement on free
> infrastructure.

## 0. What you need first

**A domain you own.** This is not optional and it is not a preference. The
frontend and the backend must sit under a shared parent domain, or the session
cookie is invisible to the frontend and nobody can stay signed in —
[`environment.md`](environment.md#why-the-cookie-domain-is-not-optional)
explains why in full. Budget for this before anything else; the rest of the
deployment cannot be completed without it.

Then: a Render account, a Vercel account, a Groq account, and an email provider.

### Choosing an email provider

The application implements **Resend** and nothing else. Swapping providers is a
code change, not a configuration change.

Before committing to it, check three things against the provider's current
documentation — none of them are stable enough to state here:

1. **Can you send to arbitrary external recipients on the plan you intend to
   use?** Several free tiers restrict delivery to the account owner's own
   address. That single restriction makes the client flow untestable, because a
   client cannot verify an address that never receives mail.
2. **What are the current send limits**, daily and monthly?
3. **Is a verified sending domain required**, and what DNS records does it need?

If Resend's terms do not fit, the alternatives worth comparing are Brevo,
Mailgun, Postmark and Amazon SES — but implementing any of them is development
work, not setup.

**Email is not optional for the client flow.** Client self-registration requires
email verification, so without working mail no client can ever sign in. An
Administrator can bootstrap and work without it; a client cannot.

## 1. DNS

Point two subdomains at the two platforms:

```
app.example.com   → Vercel
api.example.com   → Render
```

Add both as custom domains in the respective projects and wait for certificates
before continuing. A deployment against the platforms' own hostnames will start
and will not work.

## 2. Generate the secrets

Three separate values. Generate each independently — reusing one for two
purposes means rotating one forces rotating the other:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # AUTH_BOOTSTRAP_SECRET
openssl rand -base64 32   # DOCUMENT_ENCRYPTION_KEY
```

**Store `DOCUMENT_ENCRYPTION_KEY` where you will still have it in a year.**
Every report PDF encrypted with it becomes permanently unreadable if it is lost.
There is no recovery path and no re-derivation.

## 3. The database

Create a Render PostgreSQL instance in the same region as the web service, and
take its **internal** connection string. Append `?sslmode=require`.

Nothing needs to be created inside it: the migration chain builds the schema
from empty.

## 4. The backend on Render

**Service settings**

| Setting | Value |
|---|---|
| Type | Web Service |
| Root Directory | **blank — the repository root.** Not `server`; see below |
| Runtime | Node |
| Node version | 24 (set `NODE_VERSION=24`) |
| Build Command | `npm ci --include=dev && npm run build:server` |
| Pre-Deploy Command | `npm run migrate:deploy` |
| Start Command | `node server/dist/server/src/server.js` |
| Health Check Path | `/health/ready` |
| Build Filters | ignored path `client/**` — see below |
| Instances | **1** — see §7 |

### Why the root directory is the repository, not `server`

The backend is not the `server/` directory. It is `server/` **plus** `shared/`:
`server/tsconfig.json` sets `rootDir: ".."`, so `tsc` compiles both and emits
`dist/server/` and `dist/shared/` side by side. The unit that gets built is the
repository, and the root directory has to say so.

Setting it to `server` breaks the build in a way that is worth recognising,
because the error messages point everywhere except the cause:

- **`shared/` cannot resolve `zod`.** A bare import in `shared/*.schema.ts` is
  resolved from `shared/`, walking up to the repository root — never into
  `server/node_modules`. With the root directory set to `server`, nothing ever
  installs at the repository root, so every schema fails with `TS2307 Cannot
  find module 'zod'`.
- **Hundreds of `TS7006` / `TS18046` errors follow.** They are not real. Each
  one is a parameter whose type came from a schema that failed to load. Fix the
  resolution and they all disappear at once; annotating them would bury the
  actual fault under several hundred casts.

Render also states that files outside the root directory are not available to
the service, at build time or at runtime. The repository root is the only
setting under which `shared/` is unambiguously part of the service.

**Build Filters keep autodeploy sane.** A root directory of `server` used to
mean "only redeploy the API when the API changes". Now that the root directory
is the repository, add an ignored path of `client/**` to get that back —
filter paths are relative to the repository root regardless of root directory.

### Why the build command says `--include=dev`

`NODE_ENV=production` is in the environment (it has to be — §*Environment
variables* below), and npm reads it: with `NODE_ENV=production`, `npm ci`
defaults to omitting `devDependencies`. That silently removes the compiler's
own toolchain, and the failure is deeply misleading:

- `@types/express` and `@types/cors` are gone, so every route file reports
  `TS7016 Could not find a declaration file for module 'express'`;
- but `typescript` *survives*, because it happens to be a transitive dependency
  of a runtime package. So `tsc` runs and produces several hundred type errors
  instead of an honest "the compiler is not installed".

`--include=dev` is therefore load-bearing, not a convenience. It changes nothing
about what is deployed: the running service only ever executes `dist/`, and the
build-time packages are absent from it either way.

**Do not "fix" this by moving `@types/*` into `dependencies`.** That ships type
packages into the production install to work around a build flag, and it leaves
the next build-only tool to fail the same way.

### Verifying before you deploy

`npm run verify:production-build` reproduces all of the above locally: it copies
the committed tree into a temporary directory with no `node_modules` and no
`dist`, sets `NODE_ENV=production`, and runs the exact install and build
commands from the table. Run it before any deploy that touches dependencies,
the build, or this file. A developer machine cannot catch these faults
otherwise — it always has a populated `node_modules` from an earlier install.

The start command runs `node` directly rather than `npm start`, so Render's
`SIGTERM` reaches the process and the graceful-shutdown path actually runs.
`npm run smoke:production --prefix server` is what proves that, against a
database.

Use `/health/ready` rather than `/health`: readiness runs a real query, so the
platform stops routing traffic to an instance whose database is unreachable.
`/health/live` answers without touching the database and is the right choice for
a restart-on-failure probe, if you configure one separately.

**Environment variables** — the full list is in
[`environment.md`](environment.md). At minimum:

```
NODE_ENV=production
DATABASE_URL=<internal connection string>?sslmode=require
BETTER_AUTH_SECRET=<generated>
AUTH_BOOTSTRAP_SECRET=<generated>
DOCUMENT_ENCRYPTION_KEY=<generated>
SERVER_BASE_URL=https://api.example.com
CLIENT_ORIGIN=https://app.example.com
AUTH_COOKIE_DOMAIN=.example.com
TRUST_PROXY=true
REQUIRE_HTTPS=true
GROQ_API_KEY=<from the Groq console>
RESEND_API_KEY=<from the mail provider>
EMAIL_FROM=AI Consulting Workbench <noreply@example.com>
```

`TRUST_PROXY=true` is what lets the application read `x-forwarded-proto` behind
Render's TLS termination. `REQUIRE_HTTPS=true` without it would refuse every
request, so startup validation rejects that combination outright rather than
letting you discover it as a dead deployment.

**Deploy, then read the logs.** A configuration problem appears as one
`startup.environment_invalid` line per problem, each carrying a
`reasonCode` you can look up in [`environment.md`](environment.md). A successful
start logs `database.connected` and then `server.started` — in that order, and
`database.connected` only ever appears after a query has actually succeeded.

## 5. The frontend on Vercel

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Framework | Next.js (detected) |
| Install / Build Command | defaults |
| **Include files outside root directory** | **on** — the client imports `../shared` |
| Deployment Protection | **on for Preview** — see below |

> **Known defect: this build currently fails, for the same reason the Render
> build did.** It has been reproduced, not predicted: a clean client-only
> install (`npm ci` in `client/`, nothing installed at the repository root)
> compiles, then fails type checking with errors like `Argument of type
> `feedback.status.${z.infer<any>}` is not assignable to…`.
>
> The `z.infer<any>` is the symptom. A bare `zod` import inside
> `shared/*.schema.ts` resolves from `shared/` upward to the repository root —
> never into `client/node_modules` — so with the root directory set to `client`,
> nothing installs where `shared/` can see it and every schema degrades to
> `any`. Turbopack bundles anyway; `tsc` does not.
>
> The backend fix was to make the repository root the unit that gets built
> (§4). The frontend needs the equivalent, and it is **not yet done** — this is
> the only part of Phase 12 deployment left open. The two candidate fixes are to
> add `client` to the root npm workspace and point Vercel's root directory at
> the repository, or to keep the root directory at `client` and give it both an
> explicit `zod` dependency and a `paths` entry resolving `zod` to
> `./node_modules/zod`. The first matches what §4 does and leaves one zod in the
> tree; the second is smaller but keeps two.

**Environment variable**, for Production, Preview *and* Development:

```
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
```

It is inlined at build time, so changing it needs a rebuild rather than a
redeploy. A production build without it now fails with an explicit message
rather than silently shipping a frontend that calls localhost.

**Preview deployments cannot reach the production API**, by design: `CLIENT_ORIGIN`
lists exact origins and a preview gets a fresh hostname per branch. That is the
safe default. Turn on Deployment Protection so preview URLs are not publicly
reachable, and do not add a preview origin to `CLIENT_ORIGIN` unless you have
decided that build may read production data.

## 6. First run

1. **Check readiness**: `curl https://api.example.com/health/ready` → `200
   {"status":true,"message":"health.ready"}`.
2. **Create the first Administrator** — once, using `AUTH_BOOTSTRAP_SECRET`.
   Either the *Erst-Administrator* tab at `https://app.example.com/auth`, or:

   ```bash
   curl -X POST https://api.example.com/auth/bootstrap \
     -H 'Content-Type: application/json' \
     -d '{"secret":"<AUTH_BOOTSTRAP_SECRET>","workspaceName":"…",
          "administratorEmail":"you@example.com","administratorName":"…",
          "password":"a-password-of-12-plus-chars"}'
   ```

   Bootstrap is refused once any account exists. The address is confirmed
   without an email round-trip, because the deployment secret already
   established control.
3. **Sign in**, then hard-refresh a deep page such as `/engagements`. If it
   renders, the cookie domain is right. If it bounces to `/auth`, it is not —
   check `AUTH_COOKIE_DOMAIN` before anything else.
4. **Approve the AI model.** Open Compliance → AI model approvals and approve
   the exact provider/model pair the deployment is configured with (`groq` /
   `openai/gpt-oss-120b` by default). **Until you do, every AI-assisted stage is
   refused** — deny-by-default is working as designed, and the first symptom is
   otherwise "the AI does not work".
5. Walk [`smoke-tests.md`](smoke-tests.md).

## 7. Constraints worth knowing before you scale

- **One instance.** Migrations run in the Pre-Deploy Command, which runs once
  per deploy, so a single instance is safe. Running several has not been
  designed for and would need the migration story revisited first.
- **Nothing is written to disk.** Report PDFs are rendered in memory and stored
  in the database, so an ephemeral filesystem costs nothing.
- **Long requests.** A six-stage report generation is a long HTTP request. The
  LLM call has a 120 s timeout by default; if your platform's request timeout is
  shorter, lower `LLM_TIMEOUT_MS` so the failure is recorded by the application
  rather than cut off by the platform.
- **Cold starts.** A sleeping free instance takes tens of seconds to answer its
  first request, which reads to a user as a broken page.

## 8. Free-tier reality

Suitable for private technical testing and, with patience, a demonstration.
**Not suitable for a client pilot or for production.**

Verify each of these against the platforms' current documentation before
relying on any of them — they change, and a figure written here would go stale:

- whether and when a free web service sleeps, and how long a cold start takes;
- whether a free database **expires**, and after how long — expiry means total
  data loss;
- the platform request timeout;
- whether custom domains are available on the plan you are using (**the
  deployment does not work without one**);
- Vercel's plan terms — the Hobby plan is non-commercial, which matters the
  moment this supports real client work;
- Groq's rate limits, and its current per-token pricing;
- your mail provider's send limits and recipient restrictions;
- log retention on both platforms.

No free tier here includes backups. §*Backup and restore* in
[`operations.md`](operations.md) is not optional before real client data exists.

## 9. Rollback

A deploy that starts and misbehaves: redeploy the previous build from the
platform's dashboard. Application code carries no state.

A deploy that fails in the Pre-Deploy Command has **not** started — the
migration failed, the service kept running the old build, and no traffic was
affected. Fix the migration and deploy again.

A migration that succeeded and should not have is a different problem, and
rolling code back does not undo it. See
[`operations.md`](operations.md#recovering-from-a-bad-migration) before
touching anything.
