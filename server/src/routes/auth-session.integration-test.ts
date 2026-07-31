import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

import { config as loadDotenv } from "dotenv"
import { Client } from "pg"

// The one path nothing else covers: a **real** Better Auth session, resolved by
// the **real** `AuthenticationProvider`, joined to a **real** consulting-domain
// User, reaching a **real** authorized route over **real** Prisma-backed data.
//
// Every other access test replaces the provider and the database at their
// module seams, which is right for proving the rules but leaves the seams
// themselves unproven: whether Better Auth's session cookie survives the header
// translation, whether `resolveWorkspaceMembership` actually joins `AuthUser` to
// `User` through `authUserId`, whether the schema the provider expects is the
// schema the migrations produce. Those are exactly the things that break
// silently in a mocked suite and loudly in production.
//
// Deterministic and isolated: the test creates its own database, migrates it
// with the same migration chain a deployment runs, uses fixed credentials, and
// drops the database afterwards. It touches neither the development database
// nor any other test's state.
//
// **This suite does not skip.** It is run by `npm run test:integration`, which
// is part of the acceptance path, and a suite that quietly passes because
// PostgreSQL was unreachable proves nothing while looking like proof. Without a
// database it fails, naming what is missing. `npm run test:integration:optional`
// is the explicitly-named local escape hatch for working offline; it is not the
// acceptance command.
//
// It is deliberately *not* matched by the unit-test glob (`*.test.ts`): the unit
// suites must stay runnable with no database at all.

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

// Every throwaway database this suite has ever made carries this prefix, so a
// run that was killed mid-way can be cleaned up by the next one.
const TEST_DATABASE_PREFIX = "phase3a_auth_flow_test_"

// Set by `test:integration:optional`. Absent — which is the acceptance path and
// the default — a missing database is a failure.
const skippableWithoutDatabase = isEnabled(
  process.env.INTEGRATION_TESTS_OPTIONAL,
)

const environment = await prepareDatabase()

if (!environment) {
  test(
    "the real session path needs PostgreSQL",
    { skip: "INTEGRATION_TESTS_OPTIONAL is set and no database was reachable" },
    () => {},
  )
} else {
  const { databaseUrl, adminUrl, databaseName } = environment

  // Everything the imported modules read at import time. Set before the first
  // dynamic import below, which is what makes them bind to the test database
  // and to the log-only mail adapter rather than to the developer's own.
  process.env.DATABASE_URL = databaseUrl
  process.env.BETTER_AUTH_SECRET = "integration-test-secret-not-used-elsewhere"
  process.env.CLIENT_ORIGIN = "http://localhost:3000"
  process.env.SERVER_BASE_URL = "http://localhost:8787"
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM

  const { prisma } = await import("../lib/prisma.js")
  const { authenticationProvider } = await import(
    "../lib/auth/authentication-provider.js"
  )
  const { default: express } = await import("express")
  const { default: engagementsRouter } = await import("./engagements.js")
  const { default: authRouter } = await import("./auth.js")

  const app = express()
  app.use(express.json())
  app.use("/auth", authRouter)
  app.use("/engagements", engagementsRouter)

  const server = app.listen(0)
  const address = server.address()
  assert.ok(address && typeof address === "object", "test server did not start")
  const baseUrl = `http://127.0.0.1:${address.port}`

  after(async () => {
    server.close()
    await prisma.$disconnect()
    await dropDatabase(adminUrl, databaseName)
  })

  // --- The world the routes read from --------------------------------------
  //
  // Two workspaces, so "this consultant sees their own engagement" is a claim
  // about scope rather than about there being only one row.

  const workspace = await prisma.workspace.create({ data: { name: "Acme Consulting" } })
  const otherWorkspace = await prisma.workspace.create({ data: { name: "Rival Consulting" } })

  // The identity, created the way the application creates one: through the
  // provider, which hashes the password inside its own boundary.
  const identity = await authenticationProvider.registerIdentity({
    email: "manager@example.com",
    name: "Real Manager",
    password: "correct-horse-battery-staple",
  })

  assert.equal(identity.success, true, "Better Auth refused to create the identity")
  const authUserId = identity.success ? identity.authUserId : ""

  // Sign-in requires a confirmed address, and the provider owns that fact.
  await authenticationProvider.confirmEmail({ authUserId })

  const manager = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "manager@example.com",
      displayName: "Real Manager",
      role: "MANAGER",
      authUserId,
      emailVerifiedAt: new Date(),
    },
  })

  const otherManager = await prisma.user.create({
    data: {
      workspaceId: otherWorkspace.id,
      email: "rival@example.com",
      displayName: "Rival Manager",
      role: "MANAGER",
    },
  })

  const organization = await prisma.organization.create({
    data: { workspaceId: workspace.id, name: "Client GmbH" },
  })

  const ownEngagement = await prisma.engagement.create({
    data: {
      workspaceId: workspace.id,
      organizationId: organization.id,
      owningManagerId: manager.id,
      title: "Customer Operations Discovery",
    },
  })

  const foreignOrganization = await prisma.organization.create({
    data: { workspaceId: otherWorkspace.id, name: "Someone Else AG" },
  })

  const foreignEngagement = await prisma.engagement.create({
    data: {
      workspaceId: otherWorkspace.id,
      organizationId: foreignOrganization.id,
      owningManagerId: otherManager.id,
      title: "Not Yours",
    },
  })

  // --- The session ---------------------------------------------------------

  const session = await authenticationProvider.startSession({
    email: "manager@example.com",
    password: "correct-horse-battery-staple",
  })

  assert.equal(session.success, true, "Better Auth refused a correct password")

  const cookie = session.success
    ? session.setHeaders
        .filter(([name]) => name === "set-cookie")
        .map(([, value]) => value.split(";")[0])
        .join("; ")
    : ""

  const request = (routePath: string, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${routePath}`, { headers }).then(async (response) => ({
      status: response.status,
      body: (await response.json()) as {
        status: boolean
        message?: string
        data?: unknown
      },
    }))

  // --- What the path must do -----------------------------------------------

  test("Better Auth issues a session cookie the provider can resolve", async () => {
    assert.notEqual(cookie, "", "sign-in returned no session cookie")

    const resolved = await authenticationProvider.resolveIdentity({
      headers: { cookie },
    })

    assert.ok(resolved, "the provider did not recognize its own session")
    assert.equal(resolved.authUserId, authUserId)
    assert.equal(resolved.emailVerified, true)

    // The join the whole access model rests on: an authentication identity
    // carries no role and no workspace, and the domain User supplies both.
    assert.ok(resolved.actingUser, "the session resolved to no workspace membership")
    assert.equal(resolved.actingUser.id, manager.id)
    assert.equal(resolved.actingUser.workspaceId, workspace.id)
    assert.equal(resolved.actingUser.role, "MANAGER")
  })

  test("a real session reaches an authorized route", async () => {
    const response = await request("/auth/me", { cookie })

    assert.equal(response.status, 200)
    assert.deepEqual(response.body.data, {
      id: manager.id,
      workspaceId: workspace.id,
      role: "MANAGER",
      email: "manager@example.com",
      displayName: "Real Manager",
    })
  })

  test("the route returns the acting user's own workspace data", async () => {
    const response = await request("/engagements", { cookie })

    assert.equal(response.status, 200)

    const engagements = response.body.data as { id: string }[]
    const ids = engagements.map((engagement) => engagement.id)

    assert.deepEqual(ids, [ownEngagement.id])
    assert.equal(
      ids.includes(foreignEngagement.id),
      false,
      "another workspace's engagement was returned",
    )
  })

  test("the same route names a foreign engagement as not found", async () => {
    // Through the real scoped repository against real rows: the engagement
    // exists, and the response is indistinguishable from one that does not.
    const foreign = await request(`/engagements/${foreignEngagement.id}`, { cookie })
    const absent = await request("/engagements/eng_does_not_exist", { cookie })

    assert.equal(foreign.status, 404)
    assert.deepEqual(foreign.body, absent.body)
  })

  test("no session reaches nothing", async () => {
    const response = await request("/engagements")

    assert.equal(response.status, 401)
    assert.equal(response.body.message, "auth.error.unauthenticated")
  })

  test("a forged cookie reaches nothing", async () => {
    // The session token is signed by the provider, so a plausible-looking value
    // is not a session — proven here rather than assumed, because this is the
    // one test where a real signature is actually being checked.
    const response = await request("/engagements", {
      cookie: cookie.replace(/=.*$/, "=forged-session-token"),
    })

    assert.equal(response.status, 401)
  })

  test("signing out ends the session for the routes too", async () => {
    const signedOut = await authenticationProvider.startSession({
      email: "manager@example.com",
      password: "correct-horse-battery-staple",
    })

    assert.equal(signedOut.success, true)

    const disposable = signedOut.success
      ? signedOut.setHeaders
          .filter(([name]) => name === "set-cookie")
          .map(([, value]) => value.split(";")[0])
          .join("; ")
      : ""

    assert.equal((await request("/auth/me", { cookie: disposable })).status, 200)

    await authenticationProvider.endSession({ headers: { cookie: disposable } })

    // Revocation takes effect on the next request, against the provider's own
    // storage rather than against an in-process cache.
    assert.equal((await request("/auth/me", { cookie: disposable })).status, 401)
  })

  test("the wrong password starts no session", async () => {
    const refused = await authenticationProvider.startSession({
      email: "manager@example.com",
      password: "not-the-password-at-all",
    })

    assert.equal(refused.success, false)
    assert.equal(refused.success === false && refused.error, "invalid_credentials")
  })
}

// --- Building and dropping the test database -------------------------------

async function prepareDatabase() {
  // Which PostgreSQL to build the throwaway database on. `TEST_DATABASE_URL`
  // lets CI point somewhere else; otherwise the developer's own connection is
  // used — only ever as the *server* to create a fresh database on, never as
  // the database under test.
  loadDotenv({ path: path.join(serverRoot, ".env") })

  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!configured) {
    return unavailable(
      "Neither TEST_DATABASE_URL nor DATABASE_URL is set, so there is no PostgreSQL to create the test database on.",
    )
  }

  // A unique name per run, so two runs — or a run alongside the development
  // server — never share state.
  const databaseName = `${TEST_DATABASE_PREFIX}${process.pid}_${Date.now()}`
  const url = new URL(configured)
  const adminUrl = new URL(configured)
  adminUrl.pathname = "/postgres"

  const admin = new Client({ connectionString: adminUrl.toString() })

  try {
    await admin.connect()
  } catch (error) {
    return unavailable(
      `Cannot reach PostgreSQL at ${adminUrl.host} (${failureCode(error)}). ` +
        "Start it with `docker compose up -d`.",
    )
  }

  try {
    // Deterministic cleanup has two halves: this suite drops its own database
    // when it finishes, and sweeps any left behind by a run that did not.
    await dropStaleDatabases(admin)
    await admin.query(`CREATE DATABASE "${databaseName}"`)
  } finally {
    await admin.end()
  }

  url.pathname = `/${databaseName}`
  const databaseUrl = url.toString()

  // The same migration chain a deployment applies — so this test also fails if
  // the chain stops producing the schema the provider and the repositories
  // expect.
  const prismaBin = path.join(
    serverRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma",
  )

  try {
    execFileSync(prismaBin, ["migrate", "deploy"], {
      cwd: serverRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
      timeout: 180_000,
    })
  } catch (error) {
    // A migration chain that will not apply is a failure of the thing under
    // test, never a reason to skip — so this is thrown even in optional mode,
    // after taking the empty database back out.
    await dropDatabase(adminUrl.toString(), databaseName)
    throw new Error(
      `The Prisma migration chain failed to apply to a fresh database: ${failureCode(error)}`,
    )
  }

  return { databaseUrl, adminUrl: adminUrl.toString(), databaseName }
}

// No database. In the acceptance path that is the failure; only an explicit
// opt-out turns it into a skip.
function unavailable(reason: string): null {
  if (skippableWithoutDatabase) {
    console.warn(`Skipping the Better Auth integration suite: ${reason}`)
    return null
  }

  throw new Error(
    `The Better Auth integration suite requires PostgreSQL. ${reason}\n` +
      "Run it with `npm run test:integration` once a database is reachable, " +
      "or `npm run test:integration:optional` to skip it while working offline.",
  )
}

async function dropStaleDatabases(admin: Client) {
  // Only databases nothing is connected to, so a suite running in parallel —
  // another developer, another CI job on a shared server — is never swept out
  // from under itself.
  const { rows } = await admin.query<{ datname: string }>(
    `SELECT datname
       FROM pg_database
      WHERE datname LIKE $1
        AND NOT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE pg_stat_activity.datname = pg_database.datname
        )`,
    [`${TEST_DATABASE_PREFIX}%`],
  )

  for (const { datname } of rows) {
    await admin.query(`DROP DATABASE IF EXISTS "${datname}"`)
  }
}

async function dropDatabase(adminUrl: string, databaseName: string) {
  const admin = new Client({ connectionString: adminUrl })
  await admin.connect()

  try {
    await admin.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    )
  } finally {
    await admin.end()
  }
}

function isEnabled(value: string | undefined): boolean {
  const flag = value?.trim().toLowerCase()
  return flag === "1" || flag === "true" || flag === "yes"
}

// Enough to tell a stopped container from a wrong password, and no more: the
// connection string this failed on carries the database password.
function failureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code)
  }

  return error instanceof Error ? error.name : "unknown error"
}
