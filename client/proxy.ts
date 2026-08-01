import { NextResponse, type NextRequest } from "next/server"

// The consultant workspace's front door (Next.js 16 Proxy — the file convention
// formerly called Middleware; see `node_modules/next/dist/docs/01-app/
// 01-getting-started/16-proxy.md`).
//
// It answers one question, from the cookie alone: *is anybody signed in?* A
// visitor with no session is sent to `/auth` carrying the page they wanted, so
// the sign-in surface — including the Erst-Administrator tab that creates the
// first administrator — is reachable from wherever they landed, instead of a
// page rendering the server's `auth.error.unauthenticated` identifier at them.
//
// It is an **optimistic check** and nothing more, exactly as the Next.js
// authentication guide prescribes: presence of a cookie, no database read, no
// session validation. Whether that cookie names a real, unexpired session, and
// what its holder may actually see, is decided by the server on every single
// request (architecture.md §7A.2). A page that is reached with a stale cookie
// still gets 401 from the API and redirects for itself.
//
// The Client Portal (`/portal/...`) is deliberately **not** matched. Its
// unavailable state is one uniform, non-revealing message whether the access
// was revoked, expired, never granted, or the caller is not signed in — a
// redirect would turn that into a signal (architecture.md §7A.4).

// Better Auth's session cookie, under any of the prefixes it may carry: it
// becomes `__Secure-`-prefixed once the deployment serves cookies over HTTPS.
const SESSION_COOKIE = "better-auth.session_token"

const isSessionCookie = (name: string) =>
  name.replace(/^__(Secure|Host)-/, "") === SESSION_COOKIE

export function proxy(request: NextRequest) {
  const signedIn = request.cookies
    .getAll()
    .some(({ name, value }) => isSessionCookie(name) && value !== "")

  if (signedIn) return NextResponse.next()

  const { pathname, search } = request.nextUrl
  const signIn = new URL("/auth", request.nextUrl)

  // Where to come back to. The sign-in page validates this before following it
  // (`lib/auth-redirect.ts`); the home page needs no parameter at all.
  if (pathname !== "/") signIn.searchParams.set("redirect", `${pathname}${search}`)

  return NextResponse.redirect(signIn)
}

// The consultant workspace, named explicitly. Listing the protected surfaces
// rather than excluding the public ones keeps the default closed: a new public
// route is reachable, and a new protected one has to be added here on purpose.
export const config = {
  matcher: ["/", "/engagements/:path*", "/knowledge/:path*"],
}
