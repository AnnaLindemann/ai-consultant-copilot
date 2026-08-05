import assert from "node:assert/strict"
import { test } from "node:test"

import { validateEnvironment } from "./environment.js"
import { reportEnvironmentVerdict, requireValidEnvironment } from "./startup.js"

// A production environment with nothing wrong with it. Every case below starts
// from this and breaks exactly one thing, so a failure names the rule it broke
// rather than whatever else happened to be missing.
const productionEnv = (
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:secret@db.internal:5432/app?sslmode=require",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  AUTH_BOOTSTRAP_SECRET: "0123456789abcdef",
  SERVER_BASE_URL: "https://api.example.com",
  CLIENT_ORIGIN: "https://app.example.com",
  AUTH_COOKIE_DOMAIN: ".example.com",
  TRUST_PROXY: "true",
  REQUIRE_HTTPS: "true",
  GROQ_API_KEY: "test-key",
  RESEND_API_KEY: "test-key",
  EMAIL_FROM: "Workbench <noreply@example.com>",
  DOCUMENT_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
  ...overrides,
})

const codes = (env: Record<string, string | undefined>): string[] => {
  const verdict = validateEnvironment(env)
  return verdict.valid ? [] : verdict.failures.map((failure) => failure.code)
}

// --- The happy paths --------------------------------------------------------

test("a complete production environment is accepted", () => {
  const verdict = validateEnvironment(productionEnv())

  assert.equal(verdict.valid, true)
  if (!verdict.valid) return

  assert.equal(verdict.environment.isProduction, true)
  assert.equal(verdict.environment.authCookieDomain, ".example.com")
  assert.equal(verdict.environment.trustProxy, true)
  assert.equal(verdict.environment.requireHttps, true)
  assert.deepEqual(verdict.environment.clientOrigins, ["https://app.example.com"])
})

test("a bare development checkout starts with almost nothing configured", () => {
  // The point of the mode split: a developer must not have to satisfy a
  // deployment's rules to run the application locally.
  const verdict = validateEnvironment({
    DATABASE_URL: "postgresql://ai_user:ai_password@localhost:5432/ai_consultant_db",
    GROQ_API_KEY: "test-key",
  })

  assert.equal(verdict.valid, true)
  if (!verdict.valid) return

  assert.equal(verdict.environment.mode, "development")
  assert.equal(verdict.environment.authCookieDomain, null)
  assert.deepEqual(verdict.environment.clientOrigins, ["http://localhost:3000"])
})

test("several origins may be named, and are kept in order", () => {
  const verdict = validateEnvironment(
    productionEnv({
      CLIENT_ORIGIN: "https://app.example.com, https://staging.example.com",
    }),
  )

  assert.equal(verdict.valid, true)
  if (!verdict.valid) return
  assert.deepEqual(verdict.environment.clientOrigins, [
    "https://app.example.com",
    "https://staging.example.com",
  ])
})

// --- Critical values --------------------------------------------------------

test("a missing DATABASE_URL stops startup in every mode", () => {
  assert.ok(codes({ GROQ_API_KEY: "k" }).includes("env.DATABASE_URL.missing"))
  assert.ok(
    codes(productionEnv({ DATABASE_URL: undefined })).includes(
      "env.DATABASE_URL.missing",
    ),
  )
})

test("a malformed DATABASE_URL stops startup", () => {
  assert.ok(
    codes(productionEnv({ DATABASE_URL: "not a url" })).includes(
      "env.DATABASE_URL.malformed",
    ),
  )
  // A MySQL URL is a well-formed URL and still the wrong database.
  assert.ok(
    codes(productionEnv({ DATABASE_URL: "mysql://u:p@h:3306/db" })).includes(
      "env.DATABASE_URL.malformed",
    ),
  )
})

test("production requires the authentication and bootstrap secrets", () => {
  const missing = codes(
    productionEnv({ BETTER_AUTH_SECRET: undefined, AUTH_BOOTSTRAP_SECRET: undefined }),
  )

  assert.ok(missing.includes("env.BETTER_AUTH_SECRET.missing"))
  assert.ok(missing.includes("env.AUTH_BOOTSTRAP_SECRET.missing"))
})

test("a short production secret is refused", () => {
  assert.ok(
    codes(productionEnv({ BETTER_AUTH_SECRET: "short" })).includes(
      "env.BETTER_AUTH_SECRET.too_short",
    ),
  )
})

test("production requires a real email provider", () => {
  const missing = codes(
    productionEnv({ RESEND_API_KEY: undefined, EMAIL_FROM: undefined }),
  )

  assert.ok(missing.includes("env.RESEND_API_KEY.missing"))
  assert.ok(missing.includes("env.EMAIL_FROM.missing"))
})

test("the development mailbox is refused in production", () => {
  assert.ok(
    codes(productionEnv({ EMAIL_DEV_MAILBOX: "1" })).includes(
      "env.EMAIL_DEV_MAILBOX.forbidden_in_production",
    ),
  )
})

test("the Groq key is required whenever Groq is the provider", () => {
  assert.ok(
    codes(productionEnv({ GROQ_API_KEY: undefined })).includes(
      "env.GROQ_API_KEY.missing",
    ),
  )
})

test("an unsupported or unimplemented provider is refused", () => {
  assert.ok(
    codes(productionEnv({ LLM_PROVIDER: "cohere" })).includes(
      "env.LLM_PROVIDER.unsupported",
    ),
  )
  // Accepted by the type, not implemented by the client.
  assert.ok(
    codes(productionEnv({ LLM_PROVIDER: "anthropic" })).includes(
      "env.LLM_PROVIDER.not_implemented",
    ),
  )
})

test("a model identifier that is not identifier-shaped is refused", () => {
  assert.ok(
    codes(productionEnv({ LLM_MODEL: "a model with spaces and prose" })).includes(
      "env.LLM_MODEL.malformed",
    ),
  )
})

test("the document encryption key is required when the default policy asks for encryption", () => {
  // The rule is read from the policy, not hard-coded, so it follows the policy
  // if that default ever changes.
  assert.ok(
    codes(productionEnv({ DOCUMENT_ENCRYPTION_KEY: undefined })).includes(
      "env.DOCUMENT_ENCRYPTION_KEY.required_by_default_policy",
    ),
  )
})

// --- URLs and localhost -----------------------------------------------------

test("production URLs must be HTTPS", () => {
  const insecure = codes(
    productionEnv({
      SERVER_BASE_URL: "http://api.example.com",
      CLIENT_ORIGIN: "http://app.example.com",
    }),
  )

  assert.ok(insecure.includes("env.SERVER_BASE_URL.not_https"))
  assert.ok(insecure.includes("env.CLIENT_ORIGIN.not_https"))
})

test("production URLs must not be localhost", () => {
  const local = codes(
    productionEnv({
      SERVER_BASE_URL: "https://localhost:8787",
      CLIENT_ORIGIN: "https://127.0.0.1:3000",
      AUTH_COOKIE_DOMAIN: undefined,
    }),
  )

  assert.ok(local.includes("env.SERVER_BASE_URL.localhost"))
  assert.ok(local.includes("env.CLIENT_ORIGIN.localhost"))
})

test("a client origin carrying a path is refused", () => {
  // CORS compares origins. A trailing path would simply never match, silently.
  assert.ok(
    codes(productionEnv({ CLIENT_ORIGIN: "https://app.example.com/app" })).includes(
      "env.CLIENT_ORIGIN.not_an_origin",
    ),
  )
})

// --- The cross-subdomain cookie ---------------------------------------------

test("split production origins require a cookie parent domain", () => {
  // The audit's headline blocker. Without the parent domain the deployment
  // starts and does not work: login succeeds, and every page bounces back to
  // the sign-in screen.
  assert.ok(
    codes(productionEnv({ AUTH_COOKIE_DOMAIN: undefined })).includes(
      "env.AUTH_COOKIE_DOMAIN.required_for_split_origins",
    ),
  )
})

test("a single-origin production deployment needs no cookie domain", () => {
  const verdict = validateEnvironment(
    productionEnv({
      SERVER_BASE_URL: "https://workbench.example.com",
      CLIENT_ORIGIN: "https://workbench.example.com",
      AUTH_COOKIE_DOMAIN: undefined,
    }),
  )

  assert.equal(verdict.valid, true)
})

test("a cookie domain that does not cover both origins is refused", () => {
  assert.ok(
    codes(productionEnv({ AUTH_COOKIE_DOMAIN: ".other.example" })).includes(
      "env.AUTH_COOKIE_DOMAIN.does_not_cover_origins",
    ),
  )
})

test("a malformed or over-broad cookie domain is refused", () => {
  assert.ok(
    codes(productionEnv({ AUTH_COOKIE_DOMAIN: "example" })).includes(
      "env.AUTH_COOKIE_DOMAIN.malformed",
    ),
  )
  assert.ok(
    codes(productionEnv({ AUTH_COOKIE_DOMAIN: ".com" })).includes(
      "env.AUTH_COOKIE_DOMAIN.malformed",
    ),
  )
})

// --- Transport --------------------------------------------------------------

test("HTTPS enforcement without a trusted proxy is refused", () => {
  // The exact trap that stopped a deployment becoming healthy: behind a
  // TLS-terminating proxy the process only ever sees plain HTTP.
  assert.ok(
    codes(productionEnv({ TRUST_PROXY: "false" })).includes(
      "env.REQUIRE_HTTPS.requires_trust_proxy",
    ),
  )
})

test("production must state its proxy trust explicitly", () => {
  assert.ok(
    codes(productionEnv({ TRUST_PROXY: undefined, REQUIRE_HTTPS: "false" })).includes(
      "env.TRUST_PROXY.must_be_explicit_in_production",
    ),
  )
})

test("a non-boolean flag is refused rather than read as false", () => {
  assert.ok(
    codes(productionEnv({ REQUIRE_HTTPS: "yes please" })).includes(
      "env.REQUIRE_HTTPS.invalid",
    ),
  )
})

// --- Optional observability -------------------------------------------------

test("Langfuse switched on without keys is refused", () => {
  const missing = codes(productionEnv({ LANGFUSE_ENABLED: "true" }))

  assert.ok(missing.includes("env.LANGFUSE_PUBLIC_KEY.missing"))
  assert.ok(missing.includes("env.LANGFUSE_SECRET_KEY.missing"))
})

test("Langfuse switched off needs nothing", () => {
  assert.equal(validateEnvironment(productionEnv({ LANGFUSE_ENABLED: "false" })).valid, true)
})

// --- Warnings ---------------------------------------------------------------

test("a production database without sslmode warns but does not stop startup", () => {
  const verdict = validateEnvironment(
    productionEnv({ DATABASE_URL: "postgresql://u:p@db.internal:5432/app" }),
  )

  assert.equal(verdict.valid, true)
  assert.ok(
    verdict.warnings.some((w) => w.code === "env.DATABASE_URL.sslmode_not_set"),
  )
})

// --- Reporting --------------------------------------------------------------

test("every problem is reported at once, not one per deploy attempt", () => {
  const verdict = validateEnvironment({ NODE_ENV: "production" })

  assert.equal(verdict.valid, false)
  if (verdict.valid) return

  // The whole reason the validator is centralized.
  assert.ok(
    verdict.failures.length >= 6,
    `expected many failures, got ${verdict.failures.length}`,
  )
})

test("no failure carries the value of the variable it is about", () => {
  const secret = "super-secret-value-that-must-never-be-reported"
  const verdict = validateEnvironment(
    productionEnv({
      DATABASE_URL: `postgresql://user:${secret}@localhost:1/db`,
      BETTER_AUTH_SECRET: secret,
      SERVER_BASE_URL: `http://${secret}.example.com`,
    }),
  )

  assert.equal(verdict.valid, false)
  if (verdict.valid) return

  const serialized = JSON.stringify(verdict.failures)
  assert.equal(serialized.includes(secret), false)
  // Identifiers only: the variable's name and the problem.
  for (const failure of verdict.failures) {
    assert.match(failure.code, /^env\.[A-Z0-9_]+\.[a-z0-9_]+$/)
  }
})

test("a refusal stops the process, and a valid environment does not", () => {
  const exits: number[] = []
  const terminate = (code: number) => {
    exits.push(code)
  }

  assert.equal(
    requireValidEnvironment({ NODE_ENV: "production" }, terminate),
    null,
  )
  assert.deepEqual(exits, [1])

  const accepted = requireValidEnvironment(productionEnv(), terminate)
  assert.ok(accepted)
  assert.equal(accepted.isProduction, true)
  // No second exit.
  assert.deepEqual(exits, [1])
})

test("reporting a verdict never throws", () => {
  // Reporting runs on the failure path, where nothing else is working.
  assert.doesNotThrow(() =>
    reportEnvironmentVerdict(validateEnvironment({ NODE_ENV: "production" })),
  )
  assert.doesNotThrow(() =>
    reportEnvironmentVerdict(validateEnvironment(productionEnv())),
  )
})
