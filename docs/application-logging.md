# Application Logging

The server uses one shared JSON logger in
`server/src/lib/application-logger.ts`. Each log event is one JSON object on one
line. `debug` and `info` go to stdout; `warn` and `error` go to stderr.

Allowed fields are intentionally narrow:

- `timestamp`, `level`, `event`
- `requestId`
- `method`, `route`, `httpStatus`, `latencyMs`
- `workspaceId`, `engagementId`, `actorId`, `userId`
- `provider`, `model`, `stage`, `action`, `eventType`
- `errorName`, `errorCode`, `reasonCode`, `outcome`, `count`, `category`, `port`
- current operational identifiers already used by runtime call sites, such as
  `kind`, `failure`, `publicationId`, `reportVersionId`, `vendorError`, and
  `afterRetry`

Unknown metadata keys are dropped. String fields are trimmed and capped at 128
characters, except `route` at 256 characters. Event names that do not match the
accepted shape are dropped rather than truncated. Arrays, arbitrary objects,
buffers, bytes, `BigInt`, recursive values, and throwing getters are not
serialized. Unknown metadata fields are dropped, while an `Error` value may be
reduced through `failureIdentity` to safe `errorName`/`errorCode`; raw messages
and stacks are never logged.

Request IDs are server-owned. The server always generates the canonical
`req_...` ID used in logs, error responses, and Audit Trail payloads. Inbound
`x-request-id` values are not promoted to the internal governance identifier and
are not echoed as the canonical response ID. Request IDs are correlation values,
not credentials.

Never log raw request or business content, including `message`, `errorMessage`,
`detail`, `content`, `prompt`, `completion`, `response`, `body`, `query`,
`email`, `phone`, `address`, `subjectName`, `consentText`, `token`, `cookie`,
`password`, `secret`, `apiKey`, `databaseUrl`, `signedUrl`, `encryptionKey`, or
`providerResponse`.

HTTP observability logs normalized route templates where Express has one. For
unmatched paths it excludes query strings and replaces long, token-like,
email-like, encoded, or identifier-like path segments with placeholders.
Headers-sent failures are logged and the response is destroyed safely; those
requests may not emit `http.request_completed`.

Local developers can read logs directly from the server process output, for
example with `npm run dev` in `server/`. Phase 12 production observability
remains out of scope here: hosted error tracking, centralized log storage,
alerting, dashboards, log shipping, and retention policy for production logs are
not implemented.

## Deployed Log Access

The application currently emits sanitized JSON to stdout and stderr. In a
deployment, those logs are read through the hosting platform, container runtime,
or process supervisor log stream. Centralized aggregation, alerting,
dashboarding, incident response, and application-managed retention are not
implemented yet; they remain Phase 12. Deployment log access must be restricted
because technical logs may still constitute personal data through approved
identifiers.

## Audit Trail Distinction

Application Logs diagnose technical execution and failures. Audit Trail records
governance-relevant user and compliance actions. Audit Trail is not a technical
error log, and Application Logs are not a replacement for Audit Trail. A
server-owned request ID may correlate the two, but their purpose, lifecycle, and
data rules remain separate.

## Analysis Run Request IDs

Analysis Run does not persist request ID in the database. AI execution and
compliance metadata remains in Analysis Run. When an HTTP request exists, the
request ID is propagated to Langfuse trace metadata, so Application Logs and
Langfuse may be correlated through request ID. Background or non-HTTP AI work
may have no request ID.
