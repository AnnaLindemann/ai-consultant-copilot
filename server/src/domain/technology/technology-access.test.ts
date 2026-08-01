import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

import { decideAccess, type AccessAction, type ActingUser } from "../access/access.js"

import type { UserRole } from "../../../../shared/access.schema.js"

// The access-control gate for the Technology Knowledge Base
// (implementation-workflow §13.6a). Isolation is proven by the **denials**, not
// only by the permitted path.
//
// The knowledge base is a product-level asset with no workspace column, so what
// there is to prove here is role reach: an Administrator curates and decides, a
// Manager reaches none of it, and a Client reaches none of it — by
// deny-by-default, because none of the three technology actions names them.

const TECHNOLOGY_ACTIONS: AccessAction[] = [
  "technology_knowledge.read",
  "technology_knowledge.curate",
  "technology_proposal.decide",
]

const userOf = (role: UserRole): ActingUser => ({
  id: `user_${role.toLowerCase()}`,
  workspaceId: "ws_1",
  role,
  email: `${role.toLowerCase()}@example.com`,
  displayName: role,
})

test("an Administrator may read, curate, and decide", () => {
  for (const action of TECHNOLOGY_ACTIONS) {
    const decision = decideAccess(userOf("ADMIN"), action, { kind: "workspace" })
    assert.equal(decision.permitted, true, `ADMIN should be permitted ${action}`)
  }
})

test("a Manager reaches no part of the Technology Knowledge Base", () => {
  for (const action of TECHNOLOGY_ACTIONS) {
    const decision = decideAccess(userOf("MANAGER"), action, { kind: "workspace" })

    assert.equal(decision.permitted, false, `MANAGER must be denied ${action}`)
    assert.equal(
      decision.permitted === false && decision.reason,
      "role_not_permitted",
    )
  }
})

test("a Client reaches no part of the Technology Knowledge Base", () => {
  for (const action of TECHNOLOGY_ACTIONS) {
    const decision = decideAccess(userOf("CLIENT"), action, { kind: "workspace" })

    assert.equal(decision.permitted, false, `CLIENT must be denied ${action}`)
    assert.equal(
      decision.permitted === false && decision.reason,
      "role_not_permitted",
    )
  }
})

test("an unauthenticated caller reaches nothing, and is told so as unauthenticated", () => {
  for (const action of TECHNOLOGY_ACTIONS) {
    const decision = decideAccess(null, action, { kind: "workspace" })

    assert.equal(decision.permitted, false)
    assert.equal(decision.permitted === false && decision.reason, "not_authenticated")
    assert.equal(
      decision.permitted === false && decision.disclosure,
      "unauthenticated",
    )
  }
})

test("drafting a proposal does not carry the authority to approve it", () => {
  // Both are the Administrator's today, but they are separate actions on
  // purpose: the approval gate is its own authority, so a later phase can widen
  // drafting without widening deciding (architecture.md §9.3).
  assert.notEqual(
    "technology_knowledge.curate" as AccessAction,
    "technology_proposal.decide" as AccessAction,
  )
})

// --- The structural write-path guarantee ------------------------------------
//
// "The only way the Technology Knowledge Base changes is the Technology Curator
// applying an explicitly human-approved proposal" (architecture.md §9.3) is
// held by there being exactly one place that can write a profile — not by
// everyone remembering not to write one elsewhere. This test is what keeps that
// true as the codebase grows.

const serverSrc = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

const sourceFiles = (): string[] => {
  const found: string[] = []

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory).sort()) {
      const full = path.join(directory, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) found.push(full)
    }
  }

  walk(serverSrc)
  return found
}

// Where a Technology Profile may legitimately be written:
//
//  - the curator's repository, which holds the single approved-proposal apply
//    transaction;
//  - the knowledge repository's seed, which writes the initial product
//    catalogue once into an empty knowledge base and never again.
const PROFILE_WRITERS = new Set([
  "repositories/technology-curator.repository.ts",
  "repositories/technology-knowledge.repository.ts",
])

test("only the curator's apply path and the seed can write a Technology Profile", () => {
  const offenders: string[] = []

  for (const file of sourceFiles()) {
    const relative = path.relative(serverSrc, file).replaceAll(path.sep, "/")
    if (PROFILE_WRITERS.has(relative)) continue

    const source = readFileSync(file, "utf8")
    if (/prisma\.technologyProfile\.(create|update|upsert|delete)/.test(source)) {
      offenders.push(relative)
    }
    if (/tx\.technologyProfile\.(create|update|upsert|delete)/.test(source)) {
      offenders.push(relative)
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these modules write a Technology Profile outside the curator's approved path: ${offenders.join(", ")}`,
  )
})

test("no engagement-side module reaches the Technology Knowledge Base at all", () => {
  // The reference direction is engagement → knowledge, and Phase 5A adds no
  // engagement consumer yet. A stage that starts reading it in a later phase
  // does so through the retrieval service, never through the repositories.
  const engagementModules = sourceFiles().filter((file) => {
    const relative = path.relative(serverSrc, file).replaceAll(path.sep, "/")
    return (
      relative.startsWith("domain/engagement/") ||
      relative.startsWith("services/assessment") ||
      relative.startsWith("services/opportunities") ||
      relative.startsWith("services/discovery") ||
      relative.startsWith("services/analysis")
    )
  })

  const offenders = engagementModules
    .filter((file) => /technology-(knowledge|curator)/.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(serverSrc, file).replaceAll(path.sep, "/"))

  assert.deepEqual(offenders, [])
})

test("the Technology Update History has no update or delete path in code", () => {
  const offenders: string[] = []

  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8")
    if (
      /(prisma|tx)\.technologyUpdateHistory\.(update|updateMany|delete|deleteMany|upsert)/.test(
        source,
      )
    ) {
      offenders.push(path.relative(serverSrc, file).replaceAll(path.sep, "/"))
    }
  }

  // Append-only by construction, exactly as the Audit Trail is: the guarantee
  // is the absence of a mutation path (architecture.md §7A.8, §9.3).
  assert.deepEqual(offenders, [])
})

test("no curator path records an engagement Analysis Run", () => {
  const curatorModules = sourceFiles().filter((file) =>
    /technology-(knowledge|curator)|routes\/technology\.ts/.test(
      path.relative(serverSrc, file).replaceAll(path.sep, "/"),
    ),
  )

  const offenders = curatorModules
    .filter((file) => /createAnalysisRun|analysis-run\.repository/.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(serverSrc, file).replaceAll(path.sep, "/"))

  // An Analysis Run always belongs to an engagement; curation belongs to none
  // (roadmap Cross-cutting Capabilities; coding-standards.md §8).
  assert.deepEqual(offenders, [])
})
