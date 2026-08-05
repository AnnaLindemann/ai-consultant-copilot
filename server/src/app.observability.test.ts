import assert from "node:assert/strict"
import { test } from "node:test"

import { REQUEST_ID_HEADER } from "./lib/application-logger.js"

test("the real app handles unmatched routes and favicon through observability middleware", async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test"
  const { default: app } = await import("./app.js")
  const server = app.listen(0)

  try {
    const address = server.address()
    assert.ok(address && typeof address === "object", "test server did not start")
    const baseUrl = `http://127.0.0.1:${address.port}`

    const unmatched = await fetch(`${baseUrl}/stale/client/path`)
    const favicon = await fetch(`${baseUrl}/favicon.ico`)

    assert.equal(unmatched.status, 404)
    assert.equal(favicon.status, 404)
    assert.ok(unmatched.headers.get(REQUEST_ID_HEADER)?.startsWith("req_"))
    assert.ok(favicon.headers.get(REQUEST_ID_HEADER)?.startsWith("req_"))
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
})
