# Environment Variables

Every variable the application reads, what it is for, and where it belongs.

This is the reference. [`deployment.md`](deployment.md) is the procedure,
[`operations.md`](operations.md) is what happens afterwards, and
[`smoke-tests.md`](smoke-tests.md) is how you check any of it worked.

> **Never paste a secret into a chat, an issue, a commit, or a screenshot.** The
> application is careful never to log one; that care is wasted if a value
> reaches a place the application does not control. Nothing in this document
> contains a real value.

## How configuration is judged

Configuration is validated **once, at startup, before anything else loads**
(`server/src/config/environment.ts`). Two consequences worth knowing:

- **Every problem is reported at once.** A deployment with four mistakes tells
  you about all four on the first attempt, rather than one per attempt.
- **Nothing about a value is ever reported.** A failure is a stable identifier
  of the form `env.<VARIABLE>.<problem>` — for example
  `env.CLIENT_ORIGIN.not_https`. Search this document for the variable name to
  find what it wants.

Most rules apply only when `NODE_ENV=production`. A development checkout starts
with almost nothing configured, and that is deliberate.

## Server (Render)

### Required in production

| Variable | Format | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Not optional. Almost every rule below keys on it, and the development fallbacks — a known signing key, a mail adapter that sends nothing — are only refused when it is set. |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?sslmode=require` | **Secret.** Use the hosting platform's *internal* connection string where one exists. Without `sslmode` the deployment starts and warns (`env.DATABASE_URL.sslmode_not_set`). |
| `BETTER_AUTH_SECRET` | ≥32 random characters | **Secret.** `openssl rand -base64 32`. Signs sessions. Changing it invalidates every session at once. |
| `AUTH_BOOTSTRAP_SECRET` | ≥16 random characters | **Secret.** The one-time key for creating the first Administrator. Generate it separately — never reuse another secret. |
| `SERVER_BASE_URL` | `https://api.example.com` | This API's public origin. Better Auth builds verification and password-reset links against it. Must be HTTPS and must not be localhost. |
| `CLIENT_ORIGIN` | `https://app.example.com` | The frontend's origin. Used for CORS, for Better Auth's trusted origins, and for the links in outgoing mail. Comma-separate to name more than one; there is no wildcard (see below). |
| `AUTH_COOKIE_DOMAIN` | `.example.com` | The parent domain the session cookie is scoped to. **Required whenever the frontend and the API are on different hosts** — see [Why the cookie domain is not optional](#why-the-cookie-domain-is-not-optional). |
| `TRUST_PROXY` | `true` or `false` | Must be stated explicitly in production. `true` behind any managed platform that terminates TLS. |
| `REQUIRE_HTTPS` | `true` | Refuses any request that did not arrive over TLS. Requires `TRUST_PROXY=true`, or it would refuse everything. |
| `GROQ_API_KEY` | provider key | **Secret.** Required whenever Groq is the provider, which is the default. |
| `RESEND_API_KEY` | provider key | **Secret.** Without it, production refuses to start rather than silently not sending invitation and verification mail. |
| `EMAIL_FROM` | `Name <noreply@example.com>` | The sender identity. The domain must be verified with the mail provider. |
| `DOCUMENT_ENCRYPTION_KEY` | ≥32 random characters | **Secret.** Required because the default Compliance Policy asks for encryption at rest. **Losing it makes every encrypted report PDF permanently unreadable** — store it somewhere you will still have in a year. |

### Optional

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8787` | Hosting platforms usually inject this. |
| `DOCUMENT_ACCESS_SECRET` | falls back to `BETTER_AUTH_SECRET` | **Secret.** Signs expiring document links. Set it only if the two should rotate independently. |
| `LLM_PROVIDER` | `groq` | Only `groq` is implemented. Configuring another is refused at startup. |
| `LLM_MODEL` | `openai/gpt-oss-120b` | **Changing this stops AI processing** until an Administrator approves the new provider/model pair. See [`operations.md`](operations.md#changing-the-ai-model). |
| `LLM_TIMEOUT_MS` | `120000` | Bounded 1 000–600 000. |
| `LLM_MAX_RETRIES` | `0` | Bounded 0–5. Retries only connection failures, 408, 429 and 5xx — but each one is a second charge. |
| `LLM_TEMPERATURE` | provider default | Not sent unless set. |
| `LLM_MAX_COMPLETION_TOKENS` | provider default | Not sent unless set. |
| `LLM_RESPONSE_FORMAT` | not sent | `json_object` to ask for structured output. **Verify the model supports it** with the benchmark first — an unsupported parameter fails every call. |
| `LLM_REASONING_FORMAT` | not sent | `hidden`, `parsed` or `raw`. Same caveat. |
| `LANGFUSE_ENABLED` | off | When `true`, both Langfuse keys become required. |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | — | **Secret** (the second one). |
| `LANGFUSE_BASE_URL` | SDK default | |

### Local development only — never in a deployment

| Variable | Notes |
|---|---|
| `EMAIL_DEV_MAILBOX` | Captures outgoing mail as files instead of sending it. **Refused outright in production**, both by startup validation and by the mail adapter. |
| `EMAIL_DEV_MAILBOX_DIR` | Where those files go. Git-ignored. |
| `SHADOW_DATABASE_URL` | A separate, empty, disposable database for Prisma's migration tooling. **Prisma drops and rebuilds its contents on every run — never point it at anything holding real data.** |
| `TEST_DATABASE_URL` | The *server* the integration suite creates its throwaway databases on. |
| `INTEGRATION_TESTS_OPTIONAL` | Makes the integration suite skip rather than fail when no database is reachable. Not the acceptance command. |
| `BENCHMARK_ITERATIONS` | How many times `npm run benchmark:llm` repeats the six stages. 1–20. |
| `SMOKE_PORT` | Port for `npm run smoke:production`. Defaults to 8799. |

## Client (Vercel)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | **Yes** | The backend's origin, e.g. `https://api.example.com`. **Public by design** — it is inlined into the JavaScript bundle. |

Three things follow from that inlining, and all three have caught people out:

1. **It must be set at build time**, not just at runtime. Set it for every
   environment the hosting platform builds, including Preview.
2. **Changing it requires a rebuild.** A redeploy of the same build keeps the
   old value.
3. **A production build now refuses to complete** if it is missing, not HTTPS,
   or pointing at localhost. That refusal is deliberate: before it, such a build
   succeeded and shipped a frontend that called `http://localhost:8787` from
   each visitor's own browser.

To run a production build locally, give it a value:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.example.test npm run build --prefix client
```

**No server secret belongs in the client project.** Only `NEXT_PUBLIC_*` is
read anywhere in `client/`, and anything with that prefix is public.

## Why the cookie domain is not optional

A frontend on `app-something.vercel.app` and an API on
`api-something.onrender.com` are, to a browser, two unrelated sites. The session
cookie the API sets is scoped to the API's host, and three separate things then
fail:

- the browser will not send a `SameSite=Lax` cookie on a cross-site request, so
  every authenticated call arrives anonymous;
- the frontend's **server components** read the cookies of the request that
  reached *them*, and a cookie stored against the API's host was never sent
  there, so there is nothing to forward;
- the frontend's **proxy** decides from the same empty jar whether anyone is
  signed in, so it redirects a signed-in consultant back to the sign-in page,
  indefinitely.

The symptom is a login that appears to succeed and then bounces straight back.
It reads as a bug and it is configuration.

The fix is a **parent domain you own**, with both halves under it:

```
app.example.com   → the frontend
api.example.com   → the API
AUTH_COOKIE_DOMAIN=.example.com
```

The cookie is then visible to all three readers, and `SameSite` stays `Lax` —
the stronger setting, not a loosened one. Startup validation refuses a
production deployment with split origins and no cookie domain, so this cannot
be discovered after the fact.

Two deployments do **not** need it: one where the frontend and API share a
single origin, and local development, where both halves are already on
`localhost`.

## Why there is no wildcard origin

`CLIENT_ORIGIN` is a list of exact origins. It is never a pattern, and it never
matches by suffix.

Preview deployments get a fresh hostname on every branch. Trusting them by
pattern would mean any preview build — which is exactly where half-finished
frontend code lives — could open a session against production and read real
engagement content. A preview origin is trusted only by being named on purpose,
and naming a preview origin that points at production data is a decision to make
deliberately or not at all.
