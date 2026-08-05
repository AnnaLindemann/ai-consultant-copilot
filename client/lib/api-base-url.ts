// Where the frontend expects to reach the backend, and what makes that
// expectation trustworthy at build time.
//
// --- The problem this exists to prevent -------------------------------------
//
// `NEXT_PUBLIC_API_BASE_URL` is read in more than twenty places, each with a
// `?? "http://localhost:8787"` fallback. That fallback is right for a
// development checkout and quietly disastrous for a deployment: `NEXT_PUBLIC_*`
// values are **inlined at build time**, so a production build that ran without
// the variable ships a bundle hard-wired to a developer's laptop — and it fails
// in the browser, on the visitor's machine, long after anyone would think to
// look at the build log (audit blocker B4).
//
// The fallback stays, because removing it would break local development for no
// gain. What changes is that a *production* build now refuses to complete
// without a real value, so the mistake is caught where it is cheap.

export const DEVELOPMENT_API_BASE_URL = "http://localhost:8787"

export type ApiBaseUrlVerdict =
  | { valid: true; apiBaseUrl: string }
  | { valid: false; reason: ApiBaseUrlProblem }

export type ApiBaseUrlProblem =
  | "missing"
  | "malformed"
  | "not_https"
  | "localhost"
  | "not_an_origin"

// Judge the configured value for a production build. Pure, so the rule is
// testable without running a build.
//
// Development is deliberately unjudged: a developer running `next dev` against
// `http://localhost:8787`, or against a colleague's machine, is doing something
// legitimate that no rule here should obstruct.
export const validateApiBaseUrl = (
  raw: string | undefined,
  isProduction: boolean,
): ApiBaseUrlVerdict => {
  const value = raw?.trim()

  if (!value) {
    return isProduction
      ? { valid: false, reason: "missing" }
      : { valid: true, apiBaseUrl: DEVELOPMENT_API_BASE_URL }
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { valid: false, reason: "malformed" }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, reason: "malformed" }
  }

  // An origin, not a base path. A trailing slash or a path segment would be
  // concatenated into every request URL and produce a double slash or a wrong
  // path, silently.
  if (value.replace(/\/$/, "") !== `${url.protocol}//${url.host}`) {
    return { valid: false, reason: "not_an_origin" }
  }

  if (!isProduction) return { valid: true, apiBaseUrl: value }

  // The session cookie is `Secure`; over plain HTTP the browser would never
  // send it, so an `http://` backend in production is not a weaker deployment,
  // it is a broken one.
  if (url.protocol !== "https:") return { valid: false, reason: "not_https" }

  const host = url.hostname.toLowerCase()
  if (host === "localhost" || host === "::1" || host.startsWith("127.")) {
    return { valid: false, reason: "localhost" }
  }

  return { valid: true, apiBaseUrl: value }
}

// What the build prints when it refuses. One sentence of what is wrong, one of
// what to do — a build log is read in a hurry.
export const API_BASE_URL_MESSAGES: Record<ApiBaseUrlProblem, string> = {
  missing:
    "NEXT_PUBLIC_API_BASE_URL is not set. A production build inlines this value, so the deployed frontend would call http://localhost:8787 from the visitor's browser. Set it to the backend's origin (for example https://api.example.com) in the hosting project's environment variables, for every environment that is built.",
  malformed:
    "NEXT_PUBLIC_API_BASE_URL is not a valid http(s) URL. Set it to the backend's origin, for example https://api.example.com.",
  not_https:
    "NEXT_PUBLIC_API_BASE_URL must use https:// in a production build. The session cookie is Secure and a browser will not send it over plain HTTP.",
  localhost:
    "NEXT_PUBLIC_API_BASE_URL points at localhost in a production build. The value is inlined into the bundle, so it would resolve on each visitor's own machine.",
  not_an_origin:
    "NEXT_PUBLIC_API_BASE_URL must be an origin with no path — scheme, host and optional port only, for example https://api.example.com.",
}
