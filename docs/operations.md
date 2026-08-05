# Operations

Running the workbench once it is deployed: backup, restore, rollback, model
changes, secret rotation, and what to look at when something goes wrong.

[`deployment.md`](deployment.md) is how it got there.
[`environment.md`](environment.md) is the variable reference.
[`smoke-tests.md`](smoke-tests.md) is how to check it still works.

## What is implemented, and what is you

The application emits sanitized JSON logs to stdout and stderr, and that is the
whole of its operational observability. **Centralized log storage, alerting,
dashboards, uptime monitoring, and automated backup verification are not
implemented.** Everything in this document that resembles monitoring is
something a person does, on a schedule they keep.

Saying so plainly matters more than a runbook that implies otherwise.

## Reading the logs

One JSON object per line. `debug` and `info` to stdout; `warn` and `error` to
stderr. The full policy is in [`application-logging.md`](application-logging.md).

Lines worth knowing by name:

| Event | Means |
|---|---|
| `startup.environment_invalid` | A configuration problem. One line per problem, each with a `reasonCode` — look it up in [`environment.md`](environment.md). The process then exits. |
| `startup.environment_warning` | Something worth attention that did not stop startup, e.g. a database URL without `sslmode`. |
| `database.connected` | A `SELECT 1` actually succeeded. It is emitted only after a real query, never merely after a connection object was created. |
| `DATABASE_CONNECTION_FAILED` | Startup could not reach the database. Carries the error's class and machine code, never the connection string. |
| `server.started` | Listening. Always after `database.connected`. |
| `server.shutdown_started` / `server.shutdown_complete` | A signal was received and the drain finished. |
| `server.shutdown_timed_out` | The grace period expired with requests still in flight; remaining sockets were closed and the process exited non-zero. |
| `http.payload_too_large` | A request body exceeded the 1 MB limit. |
| `llm.model_mismatch` | The provider answered naming a different model than was requested. Not a fallback — nothing was retried — but worth investigating, because the Workspace approval was checked against the configured pair. |
| `EMAIL_SEND_REJECTED` / `EMAIL_SEND_FAILED` | Mail did not go out. Carries a vendor error name from a fixed allow-list and nothing else. |

**Logs may still constitute personal data** through workspace, engagement and
actor identifiers. Restrict who can read the platform's log stream.

## Backup and restore

**Nothing here is automated. If you do not set this up, there are no backups.**

### What has to survive

One PostgreSQL database holds all of it: engagements, discovery, every stage
version, the rendered report PDFs, the client feedback, the append-only Audit
Trail, and both knowledge bases. There is no second store and nothing on disk.

### Taking a backup

Use the platform's managed backups where the plan includes them. Where it does
not — which includes every free tier — take them yourself:

```bash
pg_dump --format=custom --no-owner --no-privileges \
  "$DATABASE_URL" > backup-$(date +%Y%m%d-%H%M%S).dump
```

**A dump is a complete copy of every client's data.** Encrypt it at rest, store
it somewhere access-controlled, and never commit one — the repository ignores
`*.dump` for exactly this reason.

Decide and write down: how often, how many you keep, and where. A backup
schedule nobody chose is a backup schedule nobody follows.

### Restoring — and testing that you can

A backup nobody has restored is a hypothesis. Test it against a **scratch**
database, never the live one:

```bash
createdb workbench_restore_test
pg_restore --no-owner --no-privileges -d workbench_restore_test backup-….dump

# The restored database must agree with the migration chain.
DATABASE_URL=postgresql://…/workbench_restore_test \
  npx prisma migrate status --prefix server
```

`migrate status` reporting *"Database schema is up to date"* is what makes the
restore verified rather than merely completed.

Do this **before** real client data exists, and again whenever the schema
changes materially. Phase 12 is not complete until a restore has actually been
performed.

### Free-tier database expiry

A free database may be **deleted on a fixed schedule**. Check the current policy
with the platform. If one applies, either take your own backups on a calendar
reminder or accept that the data is disposable — but decide which, rather than
finding out.

## Recovering from a bad migration

Migrations run in the Pre-Deploy Command, so a failed one leaves the previous
build serving and no traffic affected. Fix it and deploy again.

A migration that **succeeded** and should not have is different, and rolling the
code back does not undo it:

1. **Stop deploying.** A second deploy on top makes the state harder to reason
   about.
2. **Take a dump immediately**, before anything else touches the database.
3. Decide between forward-fixing with a new migration and restoring from
   backup. Forward-fixing is almost always right; restoring loses everything
   written since the backup.
4. **Never edit a migration that has been applied anywhere.** The drift check
   compares the migration chain to the schema, and an edited migration makes
   every environment's history a different history.

`npm run prisma:drift-check --prefix server` replays the chain into a disposable
shadow database and diffs it against `schema.prisma`. It never touches the
application database. Run it after any schema change; treat a non-zero exit as a
finding, not a formality.

## Changing the AI model

`LLM_MODEL` is a deployment variable, and changing it has one consequence people
reliably forget:

> **Every Workspace's AI processing stops until an Administrator approves the
> new provider/model pair.**

That is the compliance gate working correctly. The Workspace approval names an
exact pair, `decideAiProcessing` denies by default, and a model nobody approved
is a model nobody assessed for data region, retention, or training use. The
first symptom is otherwise "the AI stopped working" with no obvious cause.

The order that avoids downtime:

1. **Benchmark the candidate first**, against the synthetic fixtures:

   ```bash
   LLM_MODEL=<candidate> npm run benchmark:llm --prefix server
   ```

   It calls the live provider and costs money. It touches no database and no
   client data. Read the manual checklist in its report — German quality and
   groundedness are what a model is adopted on, not the pass/fail columns.

2. **Confirm the pricing** and record it in
   `server/src/evaluation/llm-rates.ts`. Until you do, runs on that model record
   tokens and latency and **no cost** — deliberately, because a guessed figure
   in an Analysis Run is worse than an absent one.

3. **Verify the provider parameters** the benchmark surfaced. Whether the model
   supports `response_format: json_object`, and what it does with reasoning
   output, are per-model facts. Set `LLM_RESPONSE_FORMAT` and
   `LLM_REASONING_FORMAT` only once you have seen the live behaviour.

4. **Have an Administrator approve the new pair** in Compliance → AI model
   approvals, ideally before changing the variable.

5. **Change `LLM_MODEL` and redeploy.**

Rolling back is the same sequence in reverse, and the old pair's approval is
still there.

## Secret rotation, and its limits

| Secret | Rotatable | What happens |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | Every session is invalidated. Everyone signs in again. Pending password-reset and verification links stop working. |
| `AUTH_BOOTSTRAP_SECRET` | Yes, freely | Only used before the first Administrator exists. |
| `GROQ_API_KEY` | Yes | Rotate at the provider, update, redeploy. |
| `RESEND_API_KEY` | Yes | Same. |
| `DOCUMENT_ACCESS_SECRET` | Yes | Outstanding download links stop working. They are short-lived by design. |
| `DOCUMENT_ENCRYPTION_KEY` | **Not really** | See below. |

### The document encryption key cannot be rotated today

Every stored report PDF is encrypted with the key that was configured when it
was written, and the artifact records *which* key by a non-reversible
identifier. **There is no re-encryption command.** Changing the key means new
artifacts are written under the new one and old artifacts can no longer be read
at all.

So, concretely:

- **Losing this key is permanent data loss.** No recovery, no re-derivation.
- **Rotating it is a project**, needing a re-wrap tool that does not exist.
- Treat it as a long-lived secret and back it up separately from the database —
  a backup of the ciphertext and its key in the same place protects nothing.

This limitation is honest rather than comfortable, and it is the reason
[`deployment.md`](deployment.md) says to store the key somewhere you will still
have in a year.

## Data-protection operations

These are Administrator actions in the application, not database work — and
today they are API-only, with no frontend:

- **Export one engagement's client data** — `POST /compliance/engagements/:id/export`
- **Erase one engagement permanently** — `POST /compliance/engagements/:id/erasure`.
  Refused while a legal hold is set. The Audit Trail survives the erasure by
  design: a log that could be emptied by deleting what it accounts for would
  account for nothing.
- **Preview and execute retention** — `GET /compliance/retention/preview`,
  `POST /compliance/retention/execute`. Retention **never runs automatically**
  and never runs at startup; it is always an explicit, authorized action.

## Incidents

There is no on-call rotation and no alerting. What exists:

1. **Detection** is manual — a user reports it, or someone reads the logs.
   `/health/ready` is what an uptime checker should watch if you add one.
2. **Triage**: is the database reachable (`/health/ready`), is the process
   running (`/health/live`), what do the last `error` lines say?
3. **Client data first.** If an incident could have destroyed data, take a dump
   before attempting a fix.
4. **Write down who to contact** — for the platforms, for the domain, and inside
   your own organization — and put it somewhere that does not require the
   deployment to be up in order to read it.
5. **Record what happened** in a place that outlives the ticket. The Audit Trail
   records governance actions; it does not record incidents.
