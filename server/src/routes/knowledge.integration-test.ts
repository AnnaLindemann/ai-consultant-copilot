import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

import { config as loadDotenv } from "dotenv"
import { Client } from "pg"

import type {
  ConsultingKnowledgeEntry,
  ConsultingKnowledgeSearchResult,
  KnowledgePackage,
} from "../../../shared/consulting-knowledge.schema.js"

// The curated Consulting Knowledge Base against **real** storage: the migration
// chain a deployment applies, the real Prisma-backed knowledge tables, the real
// shipped seed, the real deterministic retrieval, and the real routes behind a
// real Better Auth session.
//
// The domain suite proves the retrieval rules without a database, which is
// right for the rules but leaves the seams unproven: whether the seed reaches
// storage and survives the Json round-trip, whether an administrator's curated
// change survives a restart, whether the reach the AccessPolicy grants is the
// reach the routes actually enforce, whether a Manager is refused a curation
// they can see the button for, whether a Client is refused entirely, and
// whether the Client Portal's own response really carries no internal
// knowledge.
//
// No AI provider is involved: every route exercised here is refused or answered
// before an LLM would be called.
//
// Deterministic and isolated in the same way as the other integration suites:
// its own throwaway database, migrated with the deployment chain and dropped
// afterwards. It touches neither the development database nor any other test's
// state, and **it does not skip** — `npm run test:integration` is part of the
// acceptance path.

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

const TEST_DATABASE_PREFIX = "phase5_knowledge_test_"

const skippableWithoutDatabase = isEnabled(
  process.env.INTEGRATION_TESTS_OPTIONAL,
)

const environment = await prepareDatabase()

if (!environment) {
  test(
    "the Consulting Knowledge Base storage path needs PostgreSQL",
    { skip: "INTEGRATION_TESTS_OPTIONAL is set and no database was reachable" },
    () => {},
  )
} else {
  const { databaseUrl, adminUrl, databaseName } = environment

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
  const { default: knowledgeRouter } = await import("./knowledge.js")
  const { default: portalRouter } = await import("./portal.js")

  const app = express()
  app.use(express.json())
  app.use("/knowledge", knowledgeRouter)
  app.use("/portal", portalRouter)

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

  const workspace = await prisma.workspace.create({ data: { name: "Acme Consulting" } })

  const admin = await signedInUser({
    email: "admin@example.com",
    displayName: "Real Administrator",
    role: "ADMIN",
    workspaceId: workspace.id,
  })

  const manager = await signedInUser({
    email: "manager@example.com",
    displayName: "Real Manager",
    role: "MANAGER",
    workspaceId: workspace.id,
  })

  const client = await signedInUser({
    email: "client@example.com",
    displayName: "Real Client",
    role: "CLIENT",
    workspaceId: workspace.id,
  })

  const organization = await prisma.organization.create({
    data: { workspaceId: workspace.id, name: "Client GmbH", industry: "Reise" },
  })

  const engagement = await prisma.engagement.create({
    data: {
      workspaceId: workspace.id,
      organizationId: organization.id,
      owningManagerId: manager.user.id,
      title: "Customer Operations review",
      statedProblem:
        "Der Posteingang läuft über und Reklamationen bleiben liegen.",
      currentProcess: "Anfragen werden manuell im Ticketsystem verteilt.",
    },
  })

  // A second engagement owned by nobody the Manager is, so the engagement-scoped
  // knowledge routes can be tested for the reach they must *not* have.
  const foreignManager = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "colleague@example.com",
      displayName: "Colleague",
      role: "MANAGER",
    },
  })

  const colleaguesEngagement = await prisma.engagement.create({
    data: {
      workspaceId: workspace.id,
      organizationId: organization.id,
      owningManagerId: foreignManager.id,
      title: "Not the Manager's",
    },
  })

  // --- Reach ---------------------------------------------------------------

  test("an unauthenticated caller reaches no part of the knowledge base", async () => {
    const browse = await request("/knowledge")
    assert.equal(browse.status, 401)
    assert.equal(browse.body.data, undefined)

    const curate = await request("/knowledge/entries", {
      method: "POST",
      body: {},
    })
    assert.equal(curate.status, 401)
  })

  test("an ADMIN can read the curated knowledge base", async () => {
    const response = await request("/knowledge", { cookie: admin.cookie })

    assert.equal(response.status, 200)
    const results = response.body.data?.results as ConsultingKnowledgeSearchResult[]
    assert.ok(results.length > 0, "the shipped content did not reach storage")
  })

  test("a MANAGER can read the curated knowledge base", async () => {
    const response = await request("/knowledge", { cookie: manager.cookie })

    assert.equal(response.status, 200)
    const results = response.body.data?.results as ConsultingKnowledgeSearchResult[]
    assert.ok(results.length > 0)
  })

  test("a MANAGER cannot curate, however the interface presents it", async () => {
    const created = await request("/knowledge/entries", {
      method: "POST",
      cookie: manager.cookie,
      body: entryDraft({ code: "manager-should-not-create" }),
    })
    assert.equal(created.status, 403)

    const updated = await request(
      "/knowledge/entries/customer-operations-readiness-framework",
      {
        method: "PATCH",
        cookie: manager.cookie,
        body: entryDraft({ code: "customer-operations-readiness-framework" }),
      },
    )
    assert.equal(updated.status, 403)

    const survived = await prisma.consultingKnowledgeEntry.findUnique({
      where: { code: "manager-should-not-create" },
    })
    assert.equal(survived, null, "a refused create still wrote a row")
  })

  test("a CLIENT reaches no part of the knowledge base at all", async () => {
    for (const routePath of [
      "/knowledge",
      "/knowledge/entries/customer-operations-readiness-framework",
      `/knowledge/engagements/${engagement.id}/discovery-package`,
      `/knowledge/engagements/${engagement.id}/assessment-package`,
    ]) {
      const response = await request(routePath, { cookie: client.cookie })

      assert.ok(
        response.status === 403 || response.status === 404,
        `${routePath} answered a CLIENT with ${response.status}`,
      )
      assert.equal(response.body.data, undefined, `${routePath} leaked data`)
    }
  })

  test("a denied attempt is recorded in the append-only Audit Trail", async () => {
    const before = await prisma.auditTrail.count({
      where: { eventType: "denied_permission" },
    })

    await request("/knowledge", { cookie: client.cookie })

    const after = await prisma.auditTrail.count({
      where: { eventType: "denied_permission" },
    })
    assert.ok(after > before, "a knowledge denial was not audited")
  })

  test("a Manager cannot reach a colleague's engagement through the knowledge routes", async () => {
    const response = await request(
      `/knowledge/engagements/${colleaguesEngagement.id}/discovery-package`,
      { cookie: manager.cookie },
    )

    assert.equal(response.status, 404)
    assert.equal(response.body.data, undefined)
  })

  // --- The Client Portal ---------------------------------------------------

  test("the Client Portal response carries no internal knowledge", async () => {
    // The portal refuses this client outright (they hold no Discovery Access),
    // but the assertion that matters is the shape: no knowledge key exists on
    // the portal contract at all, refused or answered.
    const response = await request(
      `/portal/engagements/${engagement.id}/discovery`,
      { cookie: client.cookie },
    )

    const serialized = JSON.stringify(response.body)
    for (const forbidden of [
      "knowledgePackage",
      "knowledgeGuidance",
      "assessment_framework",
      "ai_readiness_criterion",
    ]) {
      assert.equal(
        serialized.includes(forbidden),
        false,
        `the portal response mentioned ${forbidden}`,
      )
    }
  })

  test("the portal router exposes no knowledge route", async () => {
    const response = await request(
      `/portal/engagements/${engagement.id}/knowledge`,
      { cookie: client.cookie },
    )

    assert.equal(response.status, 404)
  })

  // --- Retrieval -----------------------------------------------------------

  test("repeated retrieval returns identical, identically ordered results", async () => {
    const first = await packageFor("discovery-package")
    const second = await packageFor("discovery-package")
    const third = await packageFor("discovery-package")

    assert.ok(first.codes.length > 0, "nothing was retrieved for a real engagement")
    assert.deepEqual(first.codes, second.codes)
    assert.deepEqual(first.codes, third.codes)
  })

  test("the package handed to a stage is limited, not the whole knowledge base", async () => {
    const total = await prisma.consultingKnowledgeEntry.count()
    const retrieved = await packageFor("assessment-package")

    assert.ok(total > 20, "the shipped content is too small to prove a limit")
    assert.ok(
      retrieved.codes.length <= 12,
      `the package held ${retrieved.codes.length} entries`,
    )
    assert.ok(retrieved.codes.length < total)
  })

  test("retrieval anchors on the engagement rather than returning everything", async () => {
    const retrieved = await packageFor("discovery-package")

    assert.equal(retrieved.fallback, false, "no anchor resolved from real content")
    assert.ok(
      retrieved.anchors.processCodes.length > 0,
      "the engagement's own words resolved to no process",
    )
  })

  // --- Curation ------------------------------------------------------------

  test("an ADMIN can create, edit, and deactivate a curated entry", async () => {
    const created = await request("/knowledge/entries", {
      method: "POST",
      cookie: admin.cookie,
      body: entryDraft({
        code: "curated-by-admin",
        title: "Vom Administrator kuratiert",
        processCodes: ["customer-inbound-support"],
      }),
    })

    assert.equal(created.status, 201)
    const entry = created.body.data?.entry as ConsultingKnowledgeEntry
    assert.equal(entry.revision, 0)

    const edited = await request("/knowledge/entries/curated-by-admin", {
      method: "PATCH",
      cookie: admin.cookie,
      body: {
        ...entryDraft({
          code: "curated-by-admin",
          title: "Nachgeschärft",
          processCodes: ["customer-inbound-support"],
        }),
        revision: 0,
      },
    })

    assert.equal(edited.status, 200)
    const updated = edited.body.data?.entry as ConsultingKnowledgeEntry
    assert.equal(updated.title, "Nachgeschärft")
    assert.equal(updated.revision, 1)

    // Deactivation is the same write, and it retires the entry from retrieval
    // without deleting the curated work.
    const retired = await request("/knowledge/entries/curated-by-admin", {
      method: "PATCH",
      cookie: admin.cookie,
      body: {
        ...entryDraft({
          code: "curated-by-admin",
          title: "Nachgeschärft",
          processCodes: ["customer-inbound-support"],
          active: false,
        }),
        revision: 1,
      },
    })

    assert.equal(retired.status, 200)
    assert.equal((retired.body.data?.entry as ConsultingKnowledgeEntry).active, false)
  })

  test("a deactivated entry disappears from browsing and from retrieval", async () => {
    const browsed = await request("/knowledge", { cookie: admin.cookie })
    const codes = (browsed.body.data?.results as ConsultingKnowledgeSearchResult[]).map(
      (result) => result.entry.code,
    )
    assert.equal(codes.includes("curated-by-admin"), false)

    const withInactive = await request("/knowledge?includeInactive=true", {
      cookie: admin.cookie,
    })
    const allCodes = (
      withInactive.body.data?.results as ConsultingKnowledgeSearchResult[]
    ).map((result) => result.entry.code)
    assert.equal(allCodes.includes("curated-by-admin"), true)

    const retrieved = await packageFor("discovery-package")
    assert.equal(retrieved.codes.includes("curated-by-admin"), false)
  })

  test("a curated relationship pointing at nothing is refused", async () => {
    const response = await request("/knowledge/entries", {
      method: "POST",
      cookie: admin.cookie,
      body: entryDraft({
        code: "broken-relationship",
        processCodes: ["no-such-process"],
      }),
    })

    assert.equal(response.status, 400)
    assert.equal(response.body.message, "knowledge.error.invalid_relationship")

    const written = await prisma.consultingKnowledgeEntry.findUnique({
      where: { code: "broken-relationship" },
    })
    assert.equal(written, null, "an invalid entry was persisted anyway")
  })

  test("a curated relationship pointing at the wrong kind is refused", async () => {
    const response = await request("/knowledge/entries", {
      method: "POST",
      cookie: admin.cookie,
      body: entryDraft({
        code: "wrong-kind-relationship",
        // A taxonomy node is not a process.
        processCodes: ["email-support"],
      }),
    })

    assert.equal(response.status, 400)
    assert.equal(response.body.message, "knowledge.error.invalid_relationship")
  })

  test("a write against a stale revision is refused with the current one", async () => {
    const response = await request(
      "/knowledge/entries/customer-operations-readiness-framework",
      {
        method: "PATCH",
        cookie: admin.cookie,
        body: {
          ...entryDraft({ code: "customer-operations-readiness-framework" }),
          revision: 99,
        },
      },
    )

    assert.equal(response.status, 409)
    assert.equal(response.body.message, "knowledge.error.conflict")
    assert.equal(response.body.data?.currentRevision, 0)
  })

  test("a duplicate code is refused rather than overwriting a curated entry", async () => {
    const response = await request("/knowledge/entries", {
      method: "POST",
      cookie: admin.cookie,
      body: entryDraft({ code: "customer-operations-readiness-framework" }),
    })

    assert.equal(response.status, 409)
    assert.equal(response.body.message, "knowledge.error.duplicate_code")
  })

  // --- Seeding -------------------------------------------------------------

  test("restarting the application never overwrites a curated change", async () => {
    // Curate over a shipped entry, exactly as an administrator would.
    const edited = await request(
      "/knowledge/entries/customer-operations-readiness-framework",
      {
        method: "PATCH",
        cookie: admin.cookie,
        body: {
          ...entryDraft({
            code: "customer-operations-readiness-framework",
            title: "Vom Administrator überarbeitet",
            kind: "assessment_framework",
          }),
          revision: 0,
        },
      },
    )
    assert.equal(edited.status, 200)

    const countBefore = await prisma.consultingKnowledgeEntry.count()

    // A fresh module instance is what a restart actually is: the seed's
    // once-per-process memo is gone and the seed decision is taken again. The
    // specifier is held in a variable so the query string that busts the module
    // cache is not resolved as a static import path.
    const restartSpecifier: string =
      "../repositories/consulting-knowledge.repository.js?restart=1"
    const restarted = (await import(restartSpecifier)) as {
      ensureConsultingKnowledgeSeeded: () => Promise<void>
    }
    await restarted.ensureConsultingKnowledgeSeeded()

    const after = await prisma.consultingKnowledgeEntry.findUniqueOrThrow({
      where: { code: "customer-operations-readiness-framework" },
    })

    assert.equal(after.title, "Vom Administrator überarbeitet")
    assert.equal(after.revision, 1)
    assert.equal(await prisma.consultingKnowledgeEntry.count(), countBefore)
  })

  test("the knowledge base carries no workspace column to leak across", async () => {
    // Both knowledge bases are product-level, shared assets outside the Phase 3A
    // isolation boundary (architecture.md §9). Its absence is the guarantee.
    const { rows } = await rawQuery<{ column_name: string }>(
      databaseUrl,
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ConsultingKnowledgeEntry'`,
    )

    const columns = rows.map((row) => row.column_name)
    assert.equal(columns.includes("workspaceId"), false)
    assert.equal(columns.includes("engagementId"), false)
  })

  // --- Helpers -------------------------------------------------------------

  async function packageFor(segment: string): Promise<KnowledgePackage> {
    const response = await request(
      `/knowledge/engagements/${engagement.id}/${segment}`,
      { cookie: manager.cookie },
    )

    assert.equal(response.status, 200, `${segment} was refused`)
    return response.body.data?.knowledgePackage as KnowledgePackage
  }

  async function signedInUser(input: {
    email: string
    displayName: string
    role: "ADMIN" | "MANAGER" | "CLIENT"
    workspaceId: string
  }) {
    const password = "correct-horse-battery-staple"
    const identity = await authenticationProvider.registerIdentity({
      email: input.email,
      name: input.displayName,
      password,
    })
    assert.equal(identity.success, true, "Better Auth refused to create an identity")
    const authUserId = identity.success ? identity.authUserId : ""
    await authenticationProvider.confirmEmail({ authUserId })

    const user = await prisma.user.create({
      data: {
        workspaceId: input.workspaceId,
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        authUserId,
        emailVerifiedAt: new Date(),
      },
    })

    const session = await authenticationProvider.startSession({
      email: input.email,
      password,
    })
    assert.equal(session.success, true, "Better Auth refused a correct password")

    const cookie = session.success
      ? session.setHeaders
          .filter(([name]) => name === "set-cookie")
          .map(([, value]) => value.split(";")[0])
          .join("; ")
      : ""

    return { user, cookie }
  }

  function request(
    routePath: string,
    init: { method?: string; body?: unknown; cookie?: string } = {},
  ) {
    return fetch(`${baseUrl}${routePath}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }).then(async (response) => ({
      status: response.status,
      body: (await response.json().catch(() => ({}))) as {
        status?: boolean
        message?: string
        data?: Record<string, unknown>
      },
    }))
  }
}

function entryDraft(overrides: Record<string, unknown>) {
  return {
    kind: "best_practice",
    domainCode: "customer-operations",
    title: "Ein kuratierter Eintrag",
    summary: "Eine kuratierte Zusammenfassung.",
    tags: [],
    matchTerms: [],
    stageScopes: ["assessment"],
    taxonomyCodes: [],
    processCodes: [],
    problemCodes: [],
    useCaseCodes: [],
    relatedCodes: [],
    details: {
      objective: null,
      applicability: [],
      questions: [],
      criteria: [],
      signals: [],
      steps: [],
      risks: [],
      mitigations: [],
      roiDrivers: [],
      bestPractices: [],
      notes: [],
    },
    sortOrder: 20,
    active: true,
    ...overrides,
  }
}

async function rawQuery<T extends Record<string, unknown>>(
  connectionString: string,
  sql: string,
) {
  const client = new Client({ connectionString })
  await client.connect()

  try {
    return await client.query<T>(sql)
  } finally {
    await client.end()
  }
}

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
    console.warn(`Skipping the Consulting Knowledge Base integration suite: ${reason}`)
    return null
  }

  throw new Error(
    `The Consulting Knowledge Base integration suite requires PostgreSQL. ${reason}\n` +
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

// Enough to tell a stopped container from a wrong password, and no more: the
// connection string this failed on carries the database password.
function failureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code)
  }

  return error instanceof Error ? error.name : "unknown error"
}
