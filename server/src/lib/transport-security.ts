import type { NextFunction, Request, Response } from "express"

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
//     and the request body over the clear channel.
//  2. **Tell the browser never to try plain HTTP again**, with HSTS.
//
// Both are off by default, because a development machine is served over HTTP
// and a middleware that broke it would be worse than no middleware. Operating
// and hardening the deployed environment — certificates, proxies, database
// `sslmode` — remains Phase 12; this is the application's half of the contract.

const ONE_YEAR_SECONDS = 31_536_000

export const isHttpsRequired = (): boolean =>
  process.env.REQUIRE_HTTPS === "true"

export const transportSecurity = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!isHttpsRequired()) return next()

  res.setHeader(
    "strict-transport-security",
    `max-age=${ONE_YEAR_SECONDS}; includeSubDomains`,
  )

  if (isSecure(req)) return next()

  return res.status(403).json({
    status: false,
    message: "compliance.error.insecure_transport",
  })
}

// Whether the request reached the deployment over TLS. Behind a proxy that is
// what `x-forwarded-proto` says; Express only trusts that header when the
// deployment has told it to (`TRUST_PROXY`), so a client cannot claim to be
// secure by setting a header itself.
const isSecure = (req: Request): boolean =>
  req.secure || req.protocol === "https"
