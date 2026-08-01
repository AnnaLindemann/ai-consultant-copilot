import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

import { config as loadDotenv } from "dotenv"
import { Client } from "pg"

// Creating the first administrator on a database that already holds work.
//
// The Phase 3A migration gives every engagement carried over from an earlier
// phase a workspace and an owner by inserting a placeholder Administrator with
// **no authentication identity behind it** — a domain membership nobody can
// sign in as (`20260730140000_phase3a_multi_user_collaboration`). That is the
// state a real installation is in the moment the migration finishes, and it is
// the state `POST /auth/bootstrap` exists to resolve: it must *adopt* the
// placeholder, not create a second administrator beside it.
//
// `access.service.bootstrap.test.ts` pins that rule at the service seam, with
// the repository and the provider replaced. This suite pins the half that only
// a database can answer: that the migration chain really does produce a lone
// unlinked Administrator, that `findUnlinkedAdministrator` really finds it,
// that the adopted row keeps the identifier every `owningManagerId` names, and
// that the resulting account can actually sign in through Better Auth.
//
// Deterministic and isolated: it creates its own database, migrates it with the
// same chain a deployment runs, and drops it afterwards. It touches neither the
// development database nor any other suite's state.
//
// **This suite does not skip.** Like the session suite, it fails without a
// database rather than passing on nothing; `npm run test:integration:optional`
// is the named escape hatch for working offline.

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

const TEST_DATABASE_PREFIX = "phase3a_bootstrap_test_"

// The rows the Phase 3A migration inserts so carried-over engagements have an
// owner. Their identifiers are fixed by the migration, not chosen here.
const LEGACY_WORKSPACE = "legacy_workspace"
const LEGACY_ADMIN = "legacy_admin_user"

const ADMINISTRATOR = {
  email: "first.administrator@example.com",
  name: "First Administrator",
  password: "correct-horse-battery-staple",
}

const skippableWithoutDatabase = isEnabled(
  process.env.INTEGRATION_TESTS_OPTIONAL,
)

const environment = await prepareDatabase()

if (!environment) {
  test(
    "the first-administrator path needs PostgreSQL",
    { skip: "INTEGRATION_TESTS_OPTIONAL is set and no database was reachable" },
    () => {},
  )
} else {
  const { databaseUrl, adminUrl, databaseName } = environment

  process.env.DATABASE_URL = databaseUrl
  process.env.BETTER_AUTH_SECRET = "bootstrap-integration-secret-not-used-elsewhere"
  process.env.AUTH_BOOTSTRAP_SECRET = "bootstrap-integration-only"
  process.env.CLIENT_ORIGIN = "http://localhost:3000"
  process.env.SERVER_BASE_URL = "http://localhost:8787"
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM

  const { prisma } = await import("../lib/prisma.js")
  const { default: express } = await import("express")
  const { default: authRouter } = await import("./auth.js")
  const { default: engagementsRouter } = await import("./engagements.js")

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

  // --- The work that was already there -------------------------------------
  //
  // An engagement owned by the placeholder, exactly as the migration leaves the
  // ones carried over from earlier phases. If bootstrap creates a second
  // administrator instead of adopting this one, this engagement becomes
  // unreachable — which is the failure this suite exists to catch.

  const organization = await prisma.organization.create({
    data: { workspaceId: LEGACY_WORKSPACE, name: "Seaside Hotels" },
  })

  const carriedOverEngagement = await prisma.engagement.create({
    data: {
      workspaceId: LEGACY_WORKSPACE,
      organizationId: organization.id,
      owningManagerId: LEGACY_ADMIN,
      title: "Guest communication",
    },
  })

  const post = (routePath: string, body: unknown) =>
    fetch(`${baseUrl}${routePath}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (response) => ({
      status: response.status,
      setCookie: response.headers.getSetCookie(),
      body: (await response.json()) as {
        status: boolean
        message?: string
        data?: Record<string, unknown>
      },
    }))

  const bootstrapBody = {
    secret: process.env.AUTH_BOOTSTRAP_SECRET,
    workspaceName: "Legacy Workspace",
    administratorEmail: ADMINISTRATOR.email,
    administratorName: ADMINISTRATOR.name,
    password: ADMINISTRATOR.password,
  }

  // --- What the path must do -----------------------------------------------

  test("the migration chain leaves exactly one Administrator nobody can sign in as", async () => {
    const [workspaces, placeholders, identities] = await Promise.all([
      prisma.workspace.count(),
      prisma.user.findMany({ where: { authUserId: null } }),
      prisma.authUser.count(),
    ])

    assert.equal(workspaces, 1, "the migration produced more than one workspace")
    assert.equal(identities, 0, "the migration produced an authentication identity")
    assert.equal(placeholders.length, 1)
    assert.equal(placeholders[0].id, LEGACY_ADMIN)
    assert.equal(placeholders[0].role, "ADMIN")
  })

  test("the wrong bootstrap secret creates nothing", async () => {
    const refused = await post("/auth/bootstrap", {
      ...bootstrapBody,
      secret: "not-the-secret",
    })

    assert.equal(refused.status, 403)
    assert.equal(refused.body.message, "auth.error.forbidden")
    assert.equal(await prisma.authUser.count(), 0)
  })

  test("bootstrap adopts the placeholder rather than creating a second administrator", async () => {
    const created = await post("/auth/bootstrap", bootstrapBody)

    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.message, "auth.message.bootstrap_complete")

    const administrator = created.body.data?.administrator as { id: string }
    const workspace = created.body.data?.workspace as { id: string }

    assert.equal(administrator.id, LEGACY_ADMIN, "a new administrator row was created")
    assert.equal(workspace.id, LEGACY_WORKSPACE, "a second workspace was created")

    assert.equal(await prisma.user.count(), 1)
    assert.equal(await prisma.workspace.count(), 1)

    const adopted = await prisma.user.findUniqueOrThrow({
      where: { id: LEGACY_ADMIN },
    })

    assert.equal(adopted.email, ADMINISTRATOR.email)
    assert.equal(adopted.role, "ADMIN")
    assert.notEqual(adopted.authUserId, null)
    assert.notEqual(adopted.emailVerifiedAt, null)
  })

  test("the engagement that was already there is still owned by that administrator", async () => {
    const engagement = await prisma.engagement.findUniqueOrThrow({
      where: { id: carriedOverEngagement.id },
    })

    assert.equal(engagement.owningManagerId, LEGACY_ADMIN)
    assert.equal(engagement.workspaceId, LEGACY_WORKSPACE)
  })

  test("the first administrator can sign in and reach the work", async () => {
    const signedIn = await post("/auth/login", {
      email: ADMINISTRATOR.email,
      password: ADMINISTRATOR.password,
    })

    assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body))

    const cookie = signedIn.setCookie.map((value) => value.split(";")[0]).join("; ")
    assert.notEqual(cookie, "", "sign-in returned no session cookie")

    const listed = await fetch(`${baseUrl}/engagements`, { headers: { cookie } })
    const body = (await listed.json()) as { data?: { id: string }[] }

    assert.equal(listed.status, 200)
    assert.deepEqual(
      body.data?.map((engagement) => engagement.id),
      [carriedOverEngagement.id],
      "the carried-over engagement is not reachable by the first administrator",
    )
  })

  test("bootstrapping a second time is refused and changes nothing", async () => {
    const refused = await post("/auth/bootstrap", {
      ...bootstrapBody,
      administratorEmail: "second.administrator@example.com",
      workspaceName: "Another Workspace",
    })

    assert.equal(refused.status, 409)
    assert.equal(refused.body.message, "auth.error.bootstrap_unavailable")

    assert.equal(await prisma.user.count(), 1)
    assert.equal(await prisma.workspace.count(), 1)
    assert.equal(await prisma.authUser.count(), 1)

    const administrator = await prisma.user.findUniqueOrThrow({
      where: { id: LEGACY_ADMIN },
    })
    assert.equal(administrator.email, ADMINISTRATOR.email)
  })

  test("an unauthenticated request still reaches nothing", async () => {
    const response = await fetch(`${baseUrl}/engagements`)
    const body = (await response.json()) as { message?: string }

    assert.equal(response.status, 401)
    assert.equal(body.message, "auth.error.unauthenticated")
  })
}

// --- Building and dropping the test database -------------------------------

async function prepareDatabase() {
  loadDotenv({ path: path.join(serverRoot, ".env") })

  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!configured) {
    return unavailable(
      "Neither TEST_DATABASE_URL nor DATABASE_URL is set, so there is no PostgreSQL to create the test database on.",
    )
  }

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
    await dropStaleDatabases(admin)
    await admin.query(`CREATE DATABASE "${databaseName}"`)
  } finally {
    await admin.end()
  }

  url.pathname = `/${databaseName}`
  const databaseUrl = url.toString()

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
    await dropDatabase(adminUrl.toString(), databaseName)
    throw new Error(
      `The Prisma migration chain failed to apply to a fresh database: ${failureCode(error)}`,
    )
  }

  return { databaseUrl, adminUrl: adminUrl.toString(), databaseName }
}

function unavailable(reason: string): null {
  if (skippableWithoutDatabase) {
    console.warn(`Skipping the first-administrator integration suite: ${reason}`)
    return null
  }

  throw new Error(
    `The first-administrator integration suite requires PostgreSQL. ${reason}\n` +
      "Run it with `npm run test:integration` once a database is reachable, " +
      "or `npm run test:integration:optional` to skip it while working offline.",
  )
}

async function dropStaleDatabases(admin: Client) {
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
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}

function isEnabled(value: string | undefined): boolean {
  const flag = value?.trim().toLowerCase()
  return flag === "1" || flag === "true" || flag === "yes"
}

function failureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code)
  }

  return error instanceof Error ? error.name : "unknown error"
}
