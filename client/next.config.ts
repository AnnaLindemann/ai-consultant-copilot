import path from "node:path"
import { PHASE_PRODUCTION_BUILD } from "next/constants"
import type { NextConfig } from "next"

import { API_BASE_URL_MESSAGES, validateApiBaseUrl } from "./lib/api-base-url"

// A production build refuses to complete without a usable backend origin.
//
// `NEXT_PUBLIC_*` values are inlined into the bundle at build time — the
// environment-variables guide is explicit that after a build the app "will no
// longer respond to changes to these environment variables". So a build that
// ran without `NEXT_PUBLIC_API_BASE_URL` ships a frontend hard-wired to
// `http://localhost:8787`, which then fails in each visitor's own browser, far
// from anyone who could connect it to a missing variable (audit blocker B4).
// Failing the build is the cheapest place to catch that.
//
// The check is keyed on the **build phase** rather than on `NODE_ENV`. Next
// assigns `NODE_ENV` itself, and keying on the phase says exactly what is meant
// — "this is the artifact that gets deployed" — without depending on when that
// assignment happens relative to this file being loaded. `next dev` and every
// other phase are untouched, so a development checkout still needs no variable
// at all.
const config = (phase: string): NextConfig => {
  const verdict = validateApiBaseUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL,
    phase === PHASE_PRODUCTION_BUILD,
  )

  if (!verdict.valid) {
    // Thrown rather than logged: a warning in a build log is a warning nobody
    // reads until the deployment is already broken.
    throw new Error(`Refusing to build: ${API_BASE_URL_MESSAGES[verdict.reason]}`)
  }

  return {
    turbopack: {
      root: path.resolve(__dirname),
    },
  }
}

export default config
