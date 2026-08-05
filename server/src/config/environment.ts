import { defaultCompliancePolicy } from "../domain/compliance/compliance.js"

// The one place the deployment's configuration is judged (roadmap Phase 12
// "Production deployment … including environment configuration and secrets
// handling").
//
// **Why this module exists at all.** Before it, configuration was checked where
// it was consumed: `prisma.ts` threw on a missing `DATABASE_URL` at import,
// `better-auth.ts` threw on a missing secret, `email-delivery.ts` threw on
// missing Resend credentials. Each of those was correct, and together they were
// still the wrong shape for a deployment — the operator learned about one
// problem per deploy attempt, in whatever order the module graph happened to
// load, and learned nothing at all about the mistakes that do not throw: a
// `CLIENT_ORIGIN` still pointing at localhost, an `http://` base URL, a
// `REQUIRE_HTTPS` without the `TRUST_PROXY` that makes it answerable.
//
// So this runs **first**, before any module that touches infrastructure is
// imported, and reports **every** problem at once. The per-module checks stay
// exactly where they are: they are the last line, and a library that is
// imported some other way must still refuse.
//
// **Three rules hold throughout.**
//
//  1. **No value is ever returned in a failure, and no value is ever logged.**
//     A failure is a stable identifier and nothing else. Half of what is
//     validated here is a secret, and a validator that echoed "expected a URL,
//     got postgres://user:hunter2@…" would be the disclosure the rest of the
//     codebase is careful to prevent (coding-standards.md §6A).
//  2. **It is pure.** `validateEnvironment` takes an environment and returns a
//     verdict. No process exit, no logging, no I/O — so every rule below is
//     testable without a process to kill.
//  3. **Development is not production.** Almost every rule is conditional on
//     `NODE_ENV=production`. A developer running from a bare checkout must keep
//     working, which is what the existing dev-only fallbacks are for; the point
//     of this module is that those fallbacks can never survive into a
//     deployment.

export type EnvironmentMode = "development" | "test" | "production"

// A failure is one stable identifier. The shape is `env.<VARIABLE>.<problem>`
// so a deploy log can be grepped, an operator can search the environment
// documentation for the exact string, and a rename is a visible change rather
// than a silently different message.
export type EnvironmentFailureCode = string

export type EnvironmentFailure = {
  code: EnvironmentFailureCode
  // Which variable the failure is about. Names are public; values never appear.
  variable: string
}

// A problem that does not stop a deployment but that an operator should see.
export type EnvironmentWarning = EnvironmentFailure

export type ValidatedEnvironment = {
  mode: EnvironmentMode
  isProduction: boolean
  port: number
  // The exact origins that may call this API, in the order configured. Used for
  // both CORS and Better Auth's trusted origins, so the two can never disagree.
  clientOrigins: readonly string[]
  serverBaseUrl: string
  // The parent domain the session cookie is scoped to, or null for a
  // single-origin deployment and for local development.
  authCookieDomain: string | null
  trustProxy: boolean
  requireHttps: boolean
}

export type EnvironmentVerdict =
  | {
      valid: true
      environment: ValidatedEnvironment
      warnings: readonly EnvironmentWarning[]
    }
  | {
      valid: false
      failures: readonly EnvironmentFailure[]
      warnings: readonly EnvironmentWarning[]
    }

export type EnvironmentSource = Record<string, string | undefined>

// The provider set `llm-config.ts` accepts. Duplicated as a literal rather than
// imported so that this module depends on nothing that could itself fail to
// load while configuration is still unvalidated.
const SUPPORTED_LLM_PROVIDERS = ["groq", "openai", "anthropic"] as const

const MINIMUM_AUTH_SECRET_LENGTH = 32
const MINIMUM_BOOTSTRAP_SECRET_LENGTH = 16
const MINIMUM_DOCUMENT_KEY_LENGTH = 32

// A model identifier is public, but it arrives from the environment, so it is
// admitted by shape: identifier characters only, and short enough that no
// prose, URL, or key fits. Mirrors `scripts/test-llm.ts`.
const MODEL_SHAPE = /^[A-Za-z0-9._:/-]{1,64}$/

// A cookie parent domain, as it must be written for a cross-subdomain cookie:
// a leading dot, then at least two labels.
const COOKIE_DOMAIN_SHAPE = /^\.[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

export const validateEnvironment = (
  env: EnvironmentSource = process.env,
): EnvironmentVerdict => {
  const failures: EnvironmentFailure[] = []
  const warnings: EnvironmentWarning[] = []

  const fail = (variable: string, problem: string) =>
    failures.push({ variable, code: `env.${variable}.${problem}` })
  const warn = (variable: string, problem: string) =>
    warnings.push({ variable, code: `env.${variable}.${problem}` })

  // --- NODE_ENV ------------------------------------------------------------

  const rawMode = trimmed(env.NODE_ENV)
  if (rawMode !== null && !isMode(rawMode)) {
    fail("NODE_ENV", "unsupported")
  }
  const mode: EnvironmentMode = isMode(rawMode) ? rawMode : "development"
  const isProduction = mode === "production"

  // --- PORT ----------------------------------------------------------------

  const rawPort = trimmed(env.PORT)
  let port = DEFAULT_PORT
  if (rawPort !== null) {
    const parsed = Number(rawPort)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
      fail("PORT", "invalid")
    } else {
      port = parsed
    }
  }

  // --- DATABASE_URL --------------------------------------------------------

  const databaseUrl = trimmed(env.DATABASE_URL)
  if (databaseUrl === null) {
    fail("DATABASE_URL", "missing")
  } else {
    const parsed = parseUrl(databaseUrl)
    if (parsed === null || !isPostgresProtocol(parsed.protocol)) {
      fail("DATABASE_URL", "malformed")
    } else if (isProduction && !hasSslMode(databaseUrl)) {
      // Not fatal: a deployment may terminate TLS to the database some other
      // way, and refusing to start over a missing query parameter would be the
      // validator overreaching. It is worth an operator's attention.
      warn("DATABASE_URL", "sslmode_not_set")
    }
  }

  // --- Authentication secrets ---------------------------------------------

  const authSecret = trimmed(env.BETTER_AUTH_SECRET)
  if (authSecret === null) {
    if (isProduction) fail("BETTER_AUTH_SECRET", "missing")
  } else if (authSecret.length < MINIMUM_AUTH_SECRET_LENGTH) {
    // Length is the one property of a secret that can be checked without
    // learning anything about it.
    if (isProduction) fail("BETTER_AUTH_SECRET", "too_short")
    else warn("BETTER_AUTH_SECRET", "too_short")
  }

  const bootstrapSecret = trimmed(env.AUTH_BOOTSTRAP_SECRET)
  if (bootstrapSecret === null) {
    if (isProduction) fail("AUTH_BOOTSTRAP_SECRET", "missing")
  } else if (bootstrapSecret.length < MINIMUM_BOOTSTRAP_SECRET_LENGTH) {
    if (isProduction) fail("AUTH_BOOTSTRAP_SECRET", "too_short")
    else warn("AUTH_BOOTSTRAP_SECRET", "too_short")
  }

  // --- Origins -------------------------------------------------------------

  const serverBaseUrlRaw = trimmed(env.SERVER_BASE_URL)
  const serverBaseUrl = serverBaseUrlRaw ?? DEFAULT_SERVER_BASE_URL
  const serverUrl = parseUrl(serverBaseUrl)

  if (serverBaseUrlRaw === null && isProduction) {
    fail("SERVER_BASE_URL", "missing")
  } else if (serverUrl === null || !isHttpProtocol(serverUrl.protocol)) {
    fail("SERVER_BASE_URL", "malformed")
  } else if (isProduction) {
    if (serverUrl.protocol !== "https:") fail("SERVER_BASE_URL", "not_https")
    if (isLoopbackHost(serverUrl.hostname)) fail("SERVER_BASE_URL", "localhost")
  }

  const clientOriginRaw = trimmed(env.CLIENT_ORIGIN)
  if (clientOriginRaw === null && isProduction) {
    fail("CLIENT_ORIGIN", "missing")
  }

  // A comma-separated list, so a deployment can name a staging origin
  // deliberately. It is a list of *exact* origins and nothing else: no
  // wildcards, no suffix matching, no pattern. A Vercel preview deployment
  // therefore has to be named on purpose or it is not trusted, which is the
  // point — preview builds are the surface most likely to be pointed at
  // production data by accident (audit §16).
  const clientOrigins = splitList(clientOriginRaw ?? DEFAULT_CLIENT_ORIGIN)

  if (clientOrigins.length === 0) {
    fail("CLIENT_ORIGIN", "empty")
  }

  const parsedClientOrigins = clientOrigins.map(parseUrl)

  parsedClientOrigins.forEach((origin, index) => {
    if (origin === null || !isHttpProtocol(origin.protocol)) {
      fail("CLIENT_ORIGIN", "malformed")
      return
    }

    // An origin is scheme + host + port. A trailing path is a configuration
    // mistake that CORS would silently never match.
    if (clientOrigins[index] !== originOf(origin)) {
      fail("CLIENT_ORIGIN", "not_an_origin")
      return
    }

    if (!isProduction) return

    if (origin.protocol !== "https:") fail("CLIENT_ORIGIN", "not_https")
    if (isLoopbackHost(origin.hostname)) fail("CLIENT_ORIGIN", "localhost")
  })

  // --- Cookie domain -------------------------------------------------------
  //
  // The audit's headline deployment blocker: a Vercel frontend and a Render
  // backend on unrelated domains cannot share a session at all. The browser
  // will not send a `SameSite=Lax` cookie across sites, and — independently —
  // the Next.js server components and the proxy read cookies from the *frontend*
  // origin, where a cookie scoped to the API host has never been stored.
  //
  // The fix is a shared parent domain plus a cookie scoped to it. This
  // validator refuses a production deployment whose two origins differ without
  // one, because that deployment does not work and the symptom — a login that
  // succeeds and then bounces straight back to the sign-in page — reads as a
  // bug rather than as configuration.

  const cookieDomainRaw = trimmed(env.AUTH_COOKIE_DOMAIN)
  let authCookieDomain: string | null = null

  if (cookieDomainRaw !== null) {
    if (!COOKIE_DOMAIN_SHAPE.test(cookieDomainRaw)) {
      fail("AUTH_COOKIE_DOMAIN", "malformed")
    } else {
      authCookieDomain = cookieDomainRaw.toLowerCase()

      // A cookie domain that does not cover both ends grants nothing and
      // silently reintroduces the very failure it exists to prevent.
      const hosts = [
        serverUrl?.hostname,
        ...parsedClientOrigins.map((origin) => origin?.hostname),
      ].filter((host): host is string => typeof host === "string")

      if (!hosts.every((host) => isWithinCookieDomain(host, authCookieDomain!))) {
        fail("AUTH_COOKIE_DOMAIN", "does_not_cover_origins")
      }

      // A cookie on a public suffix is refused by every browser, and a cookie
      // on a bare TLD is a configuration accident.
      if (authCookieDomain.split(".").filter(Boolean).length < 2) {
        fail("AUTH_COOKIE_DOMAIN", "too_broad")
      }
    }
  }

  if (isProduction && authCookieDomain === null) {
    const apiHost = serverUrl?.hostname ?? null
    const frontendHosts = parsedClientOrigins
      .map((origin) => origin?.hostname ?? null)
      .filter((host): host is string => host !== null)

    const splitOrigins =
      apiHost !== null && frontendHosts.some((host) => host !== apiHost)

    if (splitOrigins) fail("AUTH_COOKIE_DOMAIN", "required_for_split_origins")
  }

  // --- Transport -----------------------------------------------------------

  const trustProxyRaw = trimmed(env.TRUST_PROXY)
  if (trustProxyRaw !== null && !isBooleanFlag(trustProxyRaw)) {
    fail("TRUST_PROXY", "invalid")
  }
  const trustProxy = isTrue(trustProxyRaw)

  const requireHttpsRaw = trimmed(env.REQUIRE_HTTPS)
  if (requireHttpsRaw !== null && !isBooleanFlag(requireHttpsRaw)) {
    fail("REQUIRE_HTTPS", "invalid")
  }
  const requireHttps = isTrue(requireHttpsRaw)

  if (isProduction && trustProxyRaw === null) {
    // Explicit, either way. A managed platform terminates TLS in front of the
    // process, and whether its forwarded headers may be believed is a decision
    // about the deployment topology — not something to infer.
    fail("TRUST_PROXY", "must_be_explicit_in_production")
  }

  if (requireHttps && !trustProxy) {
    // The exact trap the audit found: behind a TLS-terminating proxy the
    // process only ever sees plain HTTP, so `REQUIRE_HTTPS` without
    // `TRUST_PROXY` refuses every request — including the platform's own health
    // probe — and the deployment never becomes healthy.
    fail("REQUIRE_HTTPS", "requires_trust_proxy")
  }

  if (isProduction && !requireHttps) {
    warn("REQUIRE_HTTPS", "not_enabled_in_production")
  }

  // --- LLM -----------------------------------------------------------------

  const providerRaw = trimmed(env.LLM_PROVIDER)
  if (providerRaw !== null && !isSupportedProvider(providerRaw)) {
    fail("LLM_PROVIDER", "unsupported")
  }
  const provider = isSupportedProvider(providerRaw)
    ? providerRaw
    : DEFAULT_LLM_PROVIDER

  const modelRaw = trimmed(env.LLM_MODEL)
  if (modelRaw !== null && !MODEL_SHAPE.test(modelRaw)) {
    fail("LLM_MODEL", "malformed")
  }

  if (provider === "groq" && trimmed(env.GROQ_API_KEY) === null) {
    // Required whenever Groq is the configured provider, in every mode: the
    // alternative is a workbench whose six AI stages all fail at the first
    // click, which is not a state worth starting in.
    fail("GROQ_API_KEY", "missing")
  }

  if (provider !== "groq") {
    // `llm-client.ts` implements Groq only. The other two names are accepted by
    // the type so the seam stays honest about what is planned, but a deployment
    // configured for one would throw at the first AI stage.
    fail("LLM_PROVIDER", "not_implemented")
  }

  for (const numeric of NUMERIC_LLM_SETTINGS) {
    const value = trimmed(env[numeric.variable])
    if (value === null) continue
    const parsed = Number(value)
    if (
      !Number.isFinite(parsed) ||
      parsed < numeric.minimum ||
      parsed > numeric.maximum
    ) {
      fail(numeric.variable, "invalid")
    }
  }

  // --- Email ---------------------------------------------------------------

  const resendKey = trimmed(env.RESEND_API_KEY)
  const emailFrom = trimmed(env.EMAIL_FROM)

  if (isProduction) {
    if (resendKey === null) fail("RESEND_API_KEY", "missing")
    if (emailFrom === null) fail("EMAIL_FROM", "missing")
    else if (!looksLikeSenderAddress(emailFrom)) fail("EMAIL_FROM", "malformed")

    if (isTrue(trimmed(env.EMAIL_DEV_MAILBOX))) {
      // Also refused by `email-delivery.ts` at construction. Reported here as
      // well so it appears alongside every other configuration problem instead
      // of being the one that happens to throw first.
      fail("EMAIL_DEV_MAILBOX", "forbidden_in_production")
    }
  }

  // --- Documents -----------------------------------------------------------

  const documentKey = trimmed(env.DOCUMENT_ENCRYPTION_KEY)

  if (documentKey === null) {
    // The default Workspace Compliance Policy asks for encryption at rest. A
    // deployment with no key stores rendered report PDFs as plain bytes while
    // the policy says otherwise — the policy would be a label rather than a
    // control, which is the one failure mode Phase 10 exists to prevent.
    //
    // Read from the policy rather than hard-coded, so that changing the default
    // changes this rule with it.
    if (isProduction && defaultCompliancePolicy().encryptDocumentsAtRest) {
      fail("DOCUMENT_ENCRYPTION_KEY", "required_by_default_policy")
    }
  } else if (documentKey.length < MINIMUM_DOCUMENT_KEY_LENGTH) {
    if (isProduction) fail("DOCUMENT_ENCRYPTION_KEY", "too_short")
    else warn("DOCUMENT_ENCRYPTION_KEY", "too_short")
  }

  const documentAccessSecret = trimmed(env.DOCUMENT_ACCESS_SECRET)
  if (
    documentAccessSecret !== null &&
    documentAccessSecret.length < MINIMUM_AUTH_SECRET_LENGTH
  ) {
    if (isProduction) fail("DOCUMENT_ACCESS_SECRET", "too_short")
    else warn("DOCUMENT_ACCESS_SECRET", "too_short")
  }

  // --- Langfuse (optional) -------------------------------------------------

  const langfuseEnabledRaw = trimmed(env.LANGFUSE_ENABLED)
  if (langfuseEnabledRaw !== null && !isBooleanFlag(langfuseEnabledRaw)) {
    fail("LANGFUSE_ENABLED", "invalid")
  }

  if (isTrue(langfuseEnabledRaw)) {
    // Tracing is optional; tracing that is switched on and misconfigured is
    // not — it would degrade to a client that silently drops every span while
    // the deployment believes it is observed.
    if (trimmed(env.LANGFUSE_PUBLIC_KEY) === null) {
      fail("LANGFUSE_PUBLIC_KEY", "missing")
    }
    if (trimmed(env.LANGFUSE_SECRET_KEY) === null) {
      fail("LANGFUSE_SECRET_KEY", "missing")
    }
  }

  const langfuseBaseUrl = trimmed(env.LANGFUSE_BASE_URL)
  if (langfuseBaseUrl !== null) {
    const parsed = parseUrl(langfuseBaseUrl)
    if (parsed === null || !isHttpProtocol(parsed.protocol)) {
      fail("LANGFUSE_BASE_URL", "malformed")
    }
  }

  // --- Verdict -------------------------------------------------------------

  if (failures.length > 0) {
    return { valid: false, failures: dedupe(failures), warnings: dedupe(warnings) }
  }

  return {
    valid: true,
    warnings: dedupe(warnings),
    environment: {
      mode,
      isProduction,
      port,
      clientOrigins,
      serverBaseUrl,
      authCookieDomain,
      trustProxy,
      requireHttps,
    },
  }
}

export const DEFAULT_PORT = 8787
export const DEFAULT_SERVER_BASE_URL = "http://localhost:8787"
export const DEFAULT_CLIENT_ORIGIN = "http://localhost:3000"
const DEFAULT_LLM_PROVIDER = "groq"

// The numeric provider settings, validated by range so a typo cannot become a
// twelve-hour timeout or a negative token budget.
const NUMERIC_LLM_SETTINGS = [
  { variable: "LLM_TIMEOUT_MS", minimum: 1_000, maximum: 600_000 },
  { variable: "LLM_MAX_RETRIES", minimum: 0, maximum: 5 },
  { variable: "LLM_TEMPERATURE", minimum: 0, maximum: 2 },
  { variable: "LLM_MAX_COMPLETION_TOKENS", minimum: 1, maximum: 200_000 },
] as const

// --- The origins a deployment trusts, shared by CORS and Better Auth --------

// Exported so `app.ts` and `better-auth.ts` read the same list from the same
// parser. Two independently-parsed lists is how a deployment ends up accepting
// an origin for CORS that the authentication provider then rejects for CSRF.
export const readClientOrigins = (
  env: EnvironmentSource = process.env,
): readonly string[] => {
  const configured = splitList(trimmed(env.CLIENT_ORIGIN) ?? "")
  return configured.length > 0 ? configured : [DEFAULT_CLIENT_ORIGIN]
}

export const readServerBaseUrl = (
  env: EnvironmentSource = process.env,
): string => trimmed(env.SERVER_BASE_URL) ?? DEFAULT_SERVER_BASE_URL

// --- Helpers ---------------------------------------------------------------

const trimmed = (value: string | undefined): string | null => {
  if (typeof value !== "string") return null
  const result = value.trim()
  return result === "" ? null : result
}

const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

const originOf = (url: URL): string => `${url.protocol}//${url.host}`

const isHttpProtocol = (protocol: string) =>
  protocol === "http:" || protocol === "https:"

const isPostgresProtocol = (protocol: string) =>
  protocol === "postgres:" || protocol === "postgresql:"

const hasSslMode = (url: string) => /[?&]sslmode=/i.test(url)

const isLoopbackHost = (hostname: string) => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.startsWith("127.")
  )
}

// Whether a host is covered by a cookie domain. `.example.com` covers
// `example.com` and `app.example.com`, and does not cover `notexample.com`.
export const isWithinCookieDomain = (host: string, cookieDomain: string) => {
  const domain = cookieDomain.toLowerCase().replace(/^\./, "")
  const candidate = host.toLowerCase()
  return candidate === domain || candidate.endsWith(`.${domain}`)
}

const isMode = (value: string | null): value is EnvironmentMode =>
  value === "development" || value === "test" || value === "production"

const isSupportedProvider = (
  value: string | null,
): value is (typeof SUPPORTED_LLM_PROVIDERS)[number] =>
  value !== null &&
  (SUPPORTED_LLM_PROVIDERS as readonly string[]).includes(value)

const isBooleanFlag = (value: string) =>
  ["true", "false", "1", "0", "yes", "no"].includes(value.toLowerCase())

const isTrue = (value: string | null) =>
  value !== null && ["true", "1", "yes"].includes(value.toLowerCase())

// `Name <local@domain>` or a bare `local@domain`. Deliberately loose: the
// vendor is the authority on what it will accept, and a validator that rejected
// a legitimate sender identity would be worse than one that lets the vendor say
// so.
const looksLikeSenderAddress = (value: string) =>
  /^[^<>]*<[^@<>\s]+@[^@<>\s]+\.[^@<>\s]+>$/.test(value) ||
  /^[^@<>\s]+@[^@<>\s]+\.[^@<>\s]+$/.test(value)

const dedupe = (entries: readonly EnvironmentFailure[]) => {
  const seen = new Set<string>()
  return entries.filter(({ code }) => {
    if (seen.has(code)) return false
    seen.add(code)
    return true
  })
}
