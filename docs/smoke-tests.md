# Smoke Tests

Checks that a deployment actually works, in the order that isolates failures.
Each one names what a failure means, so a red step points somewhere rather than
just being red.

Local verification is §1. Everything from §2 on is against a deployed
environment.

## 1. Before deploying — the local gate

Run from the repository root. Anything failing here fails in a deployment too,
only later and more expensively.

```bash
# Server
npm run typecheck        --prefix server   # types
npm run test:unit        --prefix server   # no database, no provider
npm run test:integration --prefix server   # requires PostgreSQL; fails rather than skips
npm run prisma:drift-check --prefix server # migrations still replay to schema.prisma
npm run build            --prefix server   # emits dist/
npm run smoke:production --prefix server   # starts the built artifact and stops it cleanly

# Client
npx tsc --noEmit --project client
npm run lint  --prefix client
npm run test  --prefix client
NEXT_PUBLIC_API_BASE_URL=https://api.example.test npm run build --prefix client
```

`smoke:production` is the one that matters most before a first deploy: it starts
`dist/server/src/server.js` exactly as the platform will, waits for readiness,
checks the probes, and sends SIGTERM to exercise the shutdown path. It needs a
reachable database and no provider key.

**Check the build refusal too.** A production client build with no
`NEXT_PUBLIC_API_BASE_URL` must fail:

```bash
env -u NEXT_PUBLIC_API_BASE_URL npx next build   # from client/, expect a non-zero exit
```

If that *succeeds*, the guard is not working and a deployment could ship a
frontend pointing at localhost.

## 2. Backend reachable

```bash
curl -i https://api.example.com/health/live
curl -i https://api.example.com/health/ready
```

| Result | Means |
|---|---|
| Both `200` | The process is running and the database answers. |
| `live` 200, `ready` 503 | The process is up; the database is not reachable. Check `DATABASE_URL` and the database's own status. |
| `403` | HTTPS enforcement refused the probe. `TRUST_PROXY` is probably not `true`. |
| Nothing | The service never started. Read the logs for `startup.environment_invalid`. |

Neither probe requires authentication, and neither discloses anything about the
database.

## 3. Transport and CORS

```bash
# HSTS present on a normal request
curl -sI https://api.example.com/health | grep -i strict-transport-security

# Preflight from the configured frontend origin
curl -i -X OPTIONS https://api.example.com/auth/login \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: POST'
```

The preflight must answer `204` with
`Access-Control-Allow-Origin: https://app.example.com` and
`Access-Control-Allow-Credentials: true`.

Then check an origin that is *not* configured:

```bash
curl -i -X OPTIONS https://api.example.com/auth/login \
  -H 'Origin: https://somewhere-else.example' \
  -H 'Access-Control-Request-Method: POST'
```

It must **not** echo that origin back. Anything else means the allow-list is not
doing its job.

## 4. Bootstrap and sign-in

1. Create the first Administrator (see
   [`deployment.md`](deployment.md#6-first-run)). Expect `201`. A second attempt
   must be refused — bootstrap works once.
2. Sign in at `https://app.example.com/auth`.

## 5. The cookie check — the one that catches the classic failure

**After signing in, hard-refresh a deep page**, for example
`https://app.example.com/engagements`.

| Result | Means |
|---|---|
| The page renders | The cookie is visible to the browser, the server components, and the proxy. Correct. |
| It bounces back to `/auth` | The frontend cannot see the session cookie. Check `AUTH_COOKIE_DOMAIN` first — it must be the shared parent, written with a leading dot. |

Confirm it directly in the browser's developer tools → Application → Cookies:

| Attribute | Expected |
|---|---|
| Name | `__Secure-better-auth.session_token` |
| Domain | `.example.com` — the parent, **not** `api.example.com` |
| Secure | ✓ |
| HttpOnly | ✓ |
| SameSite | `Lax` |

A `Domain` of `api.example.com` is the failure this check exists for: everything
looks fine until the first page reload.

## 6. Email

Issue a staff invitation, or register a client, and confirm the message arrives
at a **real external inbox** — not the account owner's own address, which some
free tiers are restricted to.

| Result | Means |
|---|---|
| Mail arrives, link works | Working. |
| Nothing arrives, logs show `EMAIL_SEND_REJECTED` | The provider refused. The `vendorError` field names why. |
| Nothing arrives, logs show `EMAIL_NOT_SENT_LOGGED_LOCALLY` | The application is **not** in production mode — the non-sending adapter is active. Check `NODE_ENV`. |

No log line will ever contain the link or the token. That is deliberate: read
the recipient's inbox, not the logs.

## 7. AI processing

Open an engagement and run a stage.

| Result | Means |
|---|---|
| It produces a draft | Working. |
| Refused, naming `provider_model_not_approved` | Expected on a fresh deployment. An Administrator must approve the exact provider/model pair. This is deny-by-default, not a fault. |
| Refused for a legal basis or DPIA reason | Also the gate working. The engagement's compliance state needs completing. |
| A generic `500` | Check the logs for `llm.model_mismatch`, a timeout, or a provider rate limit. |

Then open the engagement's Analysis Runs and confirm the run records the
provider and **the model that actually answered**. Cost is blank for a model
whose rate has not been confirmed in `llm-rates.ts` — that is correct, not
missing data.

## 8. Documents

Approve and publish a report version, then download the PDF from the Client
Portal. Check the German umlauts render, and that the file opens.

If `DOCUMENT_ENCRYPTION_KEY` is set, the stored bytes are ciphertext and a
successful download proves the decrypt path works end to end. A download that
fails after a key change is the rotation limitation described in
[`operations.md`](operations.md#the-document-encryption-key-cannot-be-rotated-today).

## 9. Shutdown behaviour

Redeploy and watch the logs of the outgoing instance. Expect
`server.shutdown_started` followed by `server.shutdown_complete`.

`server.shutdown_timed_out` means a request was still running after the grace
period. Occasional during a long report generation; persistent means something
is not finishing.

## 10. End-to-end acceptance checklist

The full walk, in order. Each line is a thing a person does, not a route that
exists.

**Administrator**
- [ ] Bootstrap the first Administrator
- [ ] Sign in, and stay signed in across a hard refresh
- [ ] Configure the Workspace Compliance Policy
- [ ] Record the workspace DPIA position
- [ ] Approve the provider/model pair
- [ ] Invite a Manager, and confirm the invitation email arrives
- [ ] Read the Audit Trail

**Manager**
- [ ] Accept the invitation and set a password
- [ ] Create an Organization and open an Engagement
- [ ] Record the engagement's classification, purpose and legal basis
- [ ] Grant a client Discovery Access, and confirm the email arrives
- [ ] Complete or review Discovery
- [ ] Generate and review: Assessment → Opportunities → Recommendations →
      Roadmap → Consultant Report
- [ ] Use the explicit AI-output review action at each stage that requires it
- [ ] Approve a report version
- [ ] Publish it, and confirm the client notification arrives
- [ ] Classify the client's feedback and open a re-entry
- [ ] Complete the re-entry
- [ ] Sign out

**Client**
- [ ] Receive the Discovery-Access email
- [ ] Self-register and verify the address
- [ ] Complete and submit Discovery through the portal
- [ ] Receive the publication notification
- [ ] Open the Client Portal, read the report, download the PDF
- [ ] Submit feedback
- [ ] Confirm that nothing outside their own engagement's Discovery and
      published documents is reachable

> **Some of these steps have no user interface yet.** Issuing a staff
> invitation, granting Discovery Access, signing out, and the Administrator's
> workspace and retention screens are backend routes with no frontend. Until
> those exist, the corresponding lines can only be walked with `curl`, and the
> end-to-end acceptance this checklist describes is not complete.
