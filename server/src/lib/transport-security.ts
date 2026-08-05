import type { NextFunction, Request, RequestHandler, Response } from "express"

// Encryption in transit (roadmap Phase 10: "Support encryption of engagement
// data and uploaded documents both at rest and in transit").
//
// The workbench does not terminate TLS itself — a proxy or platform does — so
// what the application can honestly do is two things, and it does exactly those
// two rather than claiming more:
//
//  1. **Refuse to answer over plain HTTP** when the deployment says it is
//     served over HTTPS. A request that arrives unencrypted is refused rather
//     than redirected: a redirect would already have carried the session cookie
//     and the request body over the clear channel, and a redirect issued behind
//     a TLS-terminating proxy that forwards the redirected request back as
//     plain HTTP is an infinite loop.
//  2. **Tell the browser never to try plain HTTP again**, with HSTS.
//
// Both are off by default, because a development machine is served over HTTP
// and a middleware that broke it would be worse than no middleware.
//
// --- What Phase 12 changed, and why -----------------------------------------
//
// The behaviour above was already right. Two things about it were implicit, and
// implicit is not good enough for a control whose failure mode is "the
// deployment never becomes healthy":
//
//  - **Whether a forwarded header may be believed** was left to Express's
//    `trust proxy` setting, read indirectly through `req.protocol`. It is now
//    stated here as a parameter. Behind an untrusted hop `x-forwarded-proto` is
//    ignored on purpose and visibly, and there is a test that forges the header
//    and proves it buys nothing.
//  - **The health probes were subject to it.** A platform probe arriving over
//    plain HTTP inside the provider's private network was refused with 403, so
//    a correctly-configured deployment could never report healthy (audit
//    blocker B3). `app.ts` now mounts the probes ahead of this middleware, and
//    this module additionally refuses to break them if that order ever changes.
//
// The pairing of the two flags is enforced at startup rather than here:
// `REQUIRE_HTTPS` without `TRUST_PROXY` behind a proxy refuses everything, so
// `config/environment.ts` treats that combination as a configuration failure.

const ONE_YEAR_SECONDS = 31_536_000

export type TransportSecurityOptions = {
  // Whether this deployment is served over TLS and should refuse anything else.
  requireHttps: boolean
  // Whether a forwarded-protocol header comes from a hop we control.
  trustProxy: boolean
}

export const isHttpsRequired = (
  env: Record<string, string | undefined> = process.env,
): boolean => env.REQUIRE_HTTPS === "true"

export const isProxyTrusted = (
  env: Record<string, string | undefined> = process.env,
): boolean => env.TRUST_PROXY === "true"

// A request as this module needs to see it. Narrow on purpose: everything below
// is testable with a plain object, no Express instance required.
export type TransportRequest = {
  secure?: boolean
  protocol?: string
  headers?: Record<string, string | string[] | undefined>
  // A TLS socket carries `encrypted`; a plain one does not. Typed as unknown
  // because Express hands over a `net.Socket`, whose TLS-only fields are absent
  // from the base type, while a test supplies a bare object — and the check
  // below only ever asks whether one optional flag is exactly `true`.
  socket?: unknown
}

// Whether a request reached the deployment over TLS.
//
// Explicit about the one thing that matters: `x-forwarded-proto` is a claim
// made by whoever sent the request. It is evidence only when the hop that set
// it is trusted. Otherwise the only evidence is the socket itself.
export const isSecureRequest = (
  request: TransportRequest,
  trustProxy: boolean,
): boolean => {
  if ((request.socket as { encrypted?: unknown } | undefined)?.encrypted === true) {
    return true
  }

  if (trustProxy) {
    const forwarded = forwardedProtocol(request.headers)
    if (forwarded !== null) return forwarded === "https"
  }

  // Express's own view. With `trust proxy` disabled this is the socket's
  // protocol and nothing else, so a forged header cannot reach it.
  return request.secure === true || request.protocol === "https"
}

// The first hop's claim. A forwarded chain is comma-separated and the left-most
// entry is the original client; anything after it is a later hop's view.
const forwardedProtocol = (
  headers: TransportRequest["headers"],
): string | null => {
  const raw = headers?.["x-forwarded-proto"]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== "string") return null

  const first = value.split(",")[0]?.trim().toLowerCase()
  return first === undefined || first === "" ? null : first
}

// Paths answered whatever the transport is.
//
// A platform's health probe is not a client request: it originates inside the
// provider's network, carries no session and no body, and refusing it prevents
// the deployment from ever reporting healthy. A prefix match, so `/health`,
// `/health/live` and `/health/ready` are all covered.
export const isTransportExemptPath = (path: string): boolean =>
  path === "/health" || path.startsWith("/health/")

export const createTransportSecurity = (
  options: TransportSecurityOptions,
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!options.requireHttps) return next()

    res.setHeader(
      "strict-transport-security",
      `max-age=${ONE_YEAR_SECONDS}; includeSubDomains`,
    )

    if (isTransportExemptPath(req.path)) return next()

    if (isSecureRequest(req, options.trustProxy)) return next()

    return res.status(403).json({
      status: false,
      message: "compliance.error.insecure_transport",
    })
  }
}

// The process-wide middleware, configured from the environment. Kept as a named
// export so `app.ts` reads as it did before; the factory above is what the
// tests drive.
export const transportSecurity: RequestHandler = (req, res, next) =>
  createTransportSecurity({
    requireHttps: isHttpsRequired(),
    trustProxy: isProxyTrusted(),
  })(req, res, next)
