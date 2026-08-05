import {
  isWithinCookieDomain,
  readClientOrigins,
  readServerBaseUrl,
  type EnvironmentSource,
} from "../../config/environment.js"

// How the session cookie is scoped, and which origins may ask for one.
//
// --- The problem this solves ------------------------------------------------
//
// The workbench is two deployed parts on two hosts: the consultant workspace on
// one and this API on another. A session established by the API has to be
// usable from three places, and the naive arrangement satisfies none of them:
//
//  1. The **browser's** `fetch` to the API. A `SameSite=Lax` cookie is not sent
//     on a cross-site request at all, so every authenticated call arrives
//     anonymous.
//  2. The frontend's **server components**, which read the cookies of the
//     request that reached *them* and forward them to this API. A cookie stored
//     against the API's host was never sent to the frontend's host, so there is
//     nothing to forward.
//  3. The frontend's **proxy**, which decides from the cookie's presence alone
//     whether anyone is signed in. It reads the same empty jar, so it redirects
//     a signed-in consultant back to the sign-in page — indefinitely.
//
// Loosening `SameSite` to `none` addresses (1) and neither (2) nor (3), and
// buys a third-party cookie that Safari's tracking prevention drops anyway. The
// arrangement that actually works is a **shared parent domain**: the frontend
// on `app.<parent>`, the API on `api.<parent>`, and the cookie scoped to
// `.<parent>` so all three see the same jar and `SameSite=Lax` stays correct —
// a stronger setting than `none`, not a weaker one.
//
// That parent domain has to be one the operator owns. It cannot be defaulted,
// guessed, or hard-coded, and `AUTH_COOKIE_DOMAIN` is deliberately unset in
// local development, where both halves are already same-site on `localhost`.
//
// --- What is deliberately *not* here ----------------------------------------
//
// **No wildcard trusted origin.** `trustedOrigins` is the exact list the
// deployment configured. A Vercel preview deployment gets a fresh hostname on
// every branch; matching those by pattern would mean any preview build — which
// is precisely where a half-finished frontend lives — could open a session
// against production. A preview origin is trusted only by being named.

export type SessionCookieConfig = {
  // The exact origins allowed to open a session and to make credentialed
  // calls. Shared with CORS so the two can never disagree.
  trustedOrigins: readonly string[]
  // The parent domain the cookie is scoped to, or null for a single-origin
  // deployment and for local development.
  cookieDomain: string | null
  // Whether the deployment serves cookies over TLS. Better Auth derives this
  // from `baseURL`; it is resolved here too so the expected attributes are
  // assertable without booting the library.
  secure: boolean
}

export const resolveSessionCookieConfig = (
  env: EnvironmentSource = process.env,
): SessionCookieConfig => {
  const serverBaseUrl = readServerBaseUrl(env)
  const trustedOrigins = readClientOrigins(env)
  const cookieDomain = normalizeCookieDomain(env.AUTH_COOKIE_DOMAIN)

  return {
    trustedOrigins,
    cookieDomain,
    secure: serverBaseUrl.startsWith("https://"),
  }
}

// The attributes the session cookie will actually carry.
//
// Better Auth composes these internally; this mirrors its rules so the
// deployment's cookie contract is a thing a test can assert rather than a thing
// someone reads out of a browser once and hopes stays true:
//
//  - `httpOnly` — always. A session token is never script-readable.
//  - `sameSite: "lax"` — always. With the shared parent domain the frontend and
//    the API are same-site, so `lax` is both correct and the stronger choice.
//    It is what keeps a cross-site POST from carrying the session.
//  - `secure` — whenever the API is served over HTTPS, which also gives the
//    cookie Better Auth's `__Secure-` name prefix.
//  - `domain` — only when a parent domain is configured. Absent, the cookie is
//    host-only, which is right for a single-origin deployment and for
//    development.
//  - `path: "/"` — the whole API.
export type SessionCookieAttributes = {
  httpOnly: true
  sameSite: "lax"
  path: "/"
  secure: boolean
  domain?: string
}

export const expectedSessionCookieAttributes = (
  config: SessionCookieConfig,
): SessionCookieAttributes => ({
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: config.secure,
  ...(config.cookieDomain === null ? {} : { domain: config.cookieDomain }),
})

// The `advanced` block handed to Better Auth. Returned as its own value so the
// wiring is inspectable in a test without constructing the auth instance, which
// would require a database adapter and a configured mail provider.
//
// When no parent domain is configured this is an empty object: today's
// behaviour exactly, so a development checkout is untouched.
export const betterAuthAdvancedOptions = (config: SessionCookieConfig) =>
  config.cookieDomain === null
    ? {}
    : {
        crossSubDomainCookies: {
          enabled: true,
          domain: config.cookieDomain,
        },
      }

// A parent domain as a cookie `Domain` attribute must be written: leading dot,
// at least two labels, lower-cased.
//
// Returns null rather than throwing on a malformed value. Startup validation
// (`config/environment.ts`) is what refuses a bad one, with a stable identifier
// and alongside every other configuration problem; a second, differently-shaped
// refusal here would just be a worse version of the same message.
const normalizeCookieDomain = (raw: string | undefined): string | null => {
  const value = raw?.trim().toLowerCase()
  if (!value) return null

  const withDot = value.startsWith(".") ? value : `.${value}`
  const labels = withDot.slice(1).split(".").filter(Boolean)

  return labels.length >= 2 ? withDot : null
}

// Whether a host would receive the session cookie. Exported for the tests that
// prove the app and api subdomains share it and that a neighbouring domain
// does not.
export const cookieReaches = (host: string, config: SessionCookieConfig) =>
  config.cookieDomain === null
    ? false
    : isWithinCookieDomain(host, config.cookieDomain)
