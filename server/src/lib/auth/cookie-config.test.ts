import assert from "node:assert/strict"
import { test } from "node:test"

import {
  betterAuthAdvancedOptions,
  cookieReaches,
  expectedSessionCookieAttributes,
  resolveSessionCookieConfig,
} from "./cookie-config.js"

const deployed = (
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> => ({
  SERVER_BASE_URL: "https://api.example.com",
  CLIENT_ORIGIN: "https://app.example.com",
  AUTH_COOKIE_DOMAIN: ".example.com",
  ...overrides,
})

// --- The deployed arrangement -----------------------------------------------

test("a shared parent domain scopes the cookie to both subdomains", () => {
  const config = resolveSessionCookieConfig(deployed())
  const attributes = expectedSessionCookieAttributes(config)

  assert.deepEqual(attributes, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    domain: ".example.com",
  })
})

test("the frontend, the API, and the parent itself all receive the cookie", () => {
  const config = resolveSessionCookieConfig(deployed())

  // The three readers a host-only cookie leaves with an empty jar: the
  // browser's fetch to the API, the frontend's server components, and its
  // proxy.
  assert.equal(cookieReaches("api.example.com", config), true)
  assert.equal(cookieReaches("app.example.com", config), true)
  assert.equal(cookieReaches("example.com", config), true)
})

test("a neighbouring domain does not receive the cookie", () => {
  const config = resolveSessionCookieConfig(deployed())

  assert.equal(cookieReaches("notexample.com", config), false)
  assert.equal(cookieReaches("example.com.attacker.test", config), false)
  assert.equal(cookieReaches("app.other.example", config), false)
})

test("Better Auth is handed cross-subdomain cookies only when a domain is configured", () => {
  assert.deepEqual(betterAuthAdvancedOptions(resolveSessionCookieConfig(deployed())), {
    crossSubDomainCookies: { enabled: true, domain: ".example.com" },
  })
})

// --- Local development ------------------------------------------------------

test("no cross-domain cookie in local development", () => {
  // Both halves are already same-site on localhost. Adding a domain would
  // change behaviour a developer relies on, to solve a problem they do not
  // have.
  const config = resolveSessionCookieConfig({
    SERVER_BASE_URL: "http://localhost:8787",
    CLIENT_ORIGIN: "http://localhost:3000",
  })

  assert.equal(config.cookieDomain, null)
  assert.equal(config.secure, false)
  assert.deepEqual(betterAuthAdvancedOptions(config), {})
  assert.deepEqual(expectedSessionCookieAttributes(config), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
  })
  assert.equal(cookieReaches("localhost", config), false)
})

test("an empty or whitespace cookie domain is treated as unset", () => {
  for (const value of ["", "   "]) {
    assert.equal(
      resolveSessionCookieConfig(deployed({ AUTH_COOKIE_DOMAIN: value })).cookieDomain,
      null,
    )
  }
})

test("a domain written without the leading dot is normalized", () => {
  assert.equal(
    resolveSessionCookieConfig(deployed({ AUTH_COOKIE_DOMAIN: "Example.COM" }))
      .cookieDomain,
    ".example.com",
  )
})

// --- Trusted origins --------------------------------------------------------

test("trusted origins are exactly what was configured", () => {
  assert.deepEqual(resolveSessionCookieConfig(deployed()).trustedOrigins, [
    "https://app.example.com",
  ])
})

test("several origins may be named", () => {
  assert.deepEqual(
    resolveSessionCookieConfig(
      deployed({ CLIENT_ORIGIN: "https://app.example.com,https://staging.example.com" }),
    ).trustedOrigins,
    ["https://app.example.com", "https://staging.example.com"],
  )
})

test("a preview deployment is not trusted unless it is named", () => {
  // A Vercel preview gets a fresh hostname on every branch. Matching those by
  // pattern would let a half-finished frontend open a session against
  // production, so the list is exact and nothing else.
  const config = resolveSessionCookieConfig(deployed())

  assert.equal(
    config.trustedOrigins.includes("https://app-git-feature.vercel.app"),
    false,
  )
  for (const origin of config.trustedOrigins) {
    assert.equal(origin.includes("*"), false, "no wildcard may reach the trust list")
  }
})

// --- Secure flag ------------------------------------------------------------

test("the cookie is Secure exactly when the API is served over HTTPS", () => {
  assert.equal(resolveSessionCookieConfig(deployed()).secure, true)
  assert.equal(
    resolveSessionCookieConfig(deployed({ SERVER_BASE_URL: "http://api.example.com" }))
      .secure,
    false,
  )
})

test("SameSite stays Lax rather than being loosened to None", () => {
  // Under a shared parent the two halves are same-site, so Lax is both correct
  // and the stronger setting — it is what keeps a cross-site POST from carrying
  // the session. Loosening it would be a regression, not a fix.
  const attributes = expectedSessionCookieAttributes(
    resolveSessionCookieConfig(deployed()),
  )

  assert.equal(attributes.sameSite, "lax")
  assert.equal(attributes.httpOnly, true)
})
