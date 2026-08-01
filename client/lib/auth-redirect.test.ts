import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

import {
  HOME_PATH,
  SIGN_IN_PATH,
  safeReturnPath,
  signInPath,
} from "./auth-redirect.ts"

// Where an unauthenticated visitor is sent, and — the part worth pinning — what
// the sign-in page is allowed to send them back to.
//
// The return path arrives in a URL the visitor controls. Treating it as trusted
// state is how a sign-in page becomes a redirector to somebody else's, so the
// refusals are tested rather than the happy path alone.

const clientDir = path.dirname(fileURLToPath(import.meta.url))

test("the sign-in link carries the page the visitor wanted", () => {
  assert.equal(signInPath("/engagements"), `${SIGN_IN_PATH}?redirect=%2Fengagements`)
  assert.equal(
    signInPath("/engagements/abc123"),
    `${SIGN_IN_PATH}?redirect=%2Fengagements%2Fabc123`,
  )
  assert.equal(signInPath("/knowledge"), `${SIGN_IN_PATH}?redirect=%2Fknowledge`)
})

test("the home page needs no return parameter", () => {
  assert.equal(signInPath(HOME_PATH), SIGN_IN_PATH)
})

test("a path inside this application is followed", () => {
  assert.equal(safeReturnPath("/engagements"), "/engagements")
  assert.equal(safeReturnPath("/engagements/abc123"), "/engagements/abc123")
  assert.equal(safeReturnPath("/knowledge?stage=assessment"), "/knowledge?stage=assessment")
})

test("nothing that leaves this origin is followed", () => {
  // Absolute, protocol-relative, backslash-protocol-relative, and scheme
  // payloads all fall back to the workspace home rather than being followed.
  for (const hostile of [
    "https://evil.example/login",
    "http://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.example",
  ]) {
    assert.equal(safeReturnPath(hostile), HOME_PATH, `${hostile} was followed`)
  }
})

test("a control character never survives into the redirect", () => {
  assert.equal(safeReturnPath("/engagements\nLocation: https://evil.example"), HOME_PATH)
  assert.equal(safeReturnPath("/engagements\r\n"), HOME_PATH)
  assert.equal(safeReturnPath("/engagements\u0000"), HOME_PATH)
  assert.equal(safeReturnPath("/engagements\tmore"), HOME_PATH)
})

test("a missing or empty return path is the workspace home", () => {
  assert.equal(safeReturnPath(null), HOME_PATH)
  assert.equal(safeReturnPath(undefined), HOME_PATH)
  assert.equal(safeReturnPath(""), HOME_PATH)
})

test("the sign-in page never returns to itself", () => {
  // Otherwise a visitor whose session expired on `/auth` would sign in and be
  // handed the sign-in page again.
  assert.equal(safeReturnPath(SIGN_IN_PATH), HOME_PATH)
  assert.equal(safeReturnPath(`${SIGN_IN_PATH}?redirect=%2Fauth`), HOME_PATH)
  assert.equal(safeReturnPath(`${SIGN_IN_PATH}/anything`), HOME_PATH)
})

test("the proxy protects the consultant surfaces and leaves the portal alone", () => {
  // The matcher is the whole of the optimistic check's reach, and the Client
  // Portal must stay out of it: its unavailable state is one uniform,
  // non-revealing message whatever the reason, and a redirect would turn that
  // into a signal (architecture.md §7A.4).
  const source = readFileSync(path.join(clientDir, "..", "proxy.ts"), "utf8")
  const matcher = source.slice(source.indexOf("matcher:"))

  for (const surface of ['"/"', '"/engagements/:path*"', '"/knowledge/:path*"']) {
    assert.ok(matcher.includes(surface), `${surface} is not protected`)
  }

  assert.equal(matcher.includes("/portal"), false, "the portal was matched")
  assert.equal(matcher.includes('"/auth'), false, "the sign-in page was matched")
})
