import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import { mock } from "node:test"

import type { UserRole } from "../../../shared/access.schema.js"

// The first administrator (roadmap Phase 3A "Authentication"; README §6).
//
// The property that actually matters here is the one a fresh installation never
// exercises: the Phase 3A migration gives every engagement carried over from an
// earlier phase a workspace and an owner by inserting a placeholder
// Administrator with **no authentication identity behind it**
// (`20260730140000_phase3a_multi_user_collaboration/migration.sql`). Bootstrap
// must *adopt* that row rather than create a second one — otherwise the first
// real administrator signs in to an empty workspace while six engagements sit
// behind a user nobody can be, which is a silent, plausible-looking data loss.
//
// So three things are pinned: adoption keeps the placeholder's identifier (and
// therefore every `owningManagerId` pointing at it), it creates no second
// workspace and no second user, and the whole operation is available exactly
// once.

const LEGACY_WORKSPACE = "legacy_workspace"
const LEGACY_ADMIN = "legacy_admin_user"

type UserRow = {
  id: string
  workspaceId: string
  email: string
  displayName: string | null
  role: UserRole
  authUserId: string | null
  emailVerifiedAt: Date | null
}

let workspaces: { id: string; name: string }[] = []
let users: UserRow[] = []
let identityCount = 0

let createdWorkspaces: string[] = []
let createdUsers: string[] = []
let confirmedIdentities: string[] = []
let auditEntries: { eventType: string; payload: Record<string, unknown> }[] = []

const unused = (names: readonly string[]) =>
  Object.fromEntries(
    names.map((name) => [
      name,
      async () => {
        throw new Error(`${name} was called by the bootstrap flow`)
      },
    ]),
  )

mock.module("../lib/auth/authentication-provider.js", {
  namedExports: {
    authenticationProvider: {
      countIdentities: async () => identityCount,

      registerIdentity: async (input: { email: string; name: string }) => {
        identityCount += 1
        return {
          success: true,
          authUserId: `auth_${input.email}`,
          setHeaders: [],
        }
      },

      confirmEmail: async ({ authUserId }: { authUserId: string }) => {
        confirmedIdentities.push(authUserId)
      },
    },
  },
})

mock.module("../repositories/access.repository.js", {
  namedExports: {
    countWorkspaces: async () => workspaces.length,

    findSingleWorkspaceForBootstrap: async () =>
      workspaces.length === 1 ? workspaces[0] : null,

    createWorkspace: async ({ name }: { name: string }) => {
      const workspace = { id: `ws_${workspaces.length + 1}`, name }
      workspaces.push(workspace)
      createdWorkspaces.push(workspace.id)
      return workspace
    },

    findUnlinkedAdministrator: async (scope: { workspaceId: string }) =>
      users.find(
        (user) =>
          user.workspaceId === scope.workspaceId &&
          user.role === "ADMIN" &&
          user.authUserId === null,
      ) ?? null,

    adoptUserAsFirstAdministrator: async (
      userId: string,
      input: { email: string; displayName: string; authUserId: string },
    ) => {
      const user = users.find((candidate) => candidate.id === userId)
      assert.ok(user, "bootstrap adopted a user that does not exist")

      user.email = input.email
      user.displayName = input.displayName
      user.authUserId = input.authUserId
      user.role = "ADMIN"
      user.emailVerifiedAt = new Date()

      return user
    },

    createUser: async (input: {
      workspaceId: string
      email: string
      displayName?: string | null
      role: UserRole
      authUserId: string
      emailVerifiedAt?: Date | null
    }) => {
      const user: UserRow = {
        id: `user_${users.length + 1}`,
        workspaceId: input.workspaceId,
        email: input.email,
        displayName: input.displayName ?? null,
        role: input.role,
        authUserId: input.authUserId,
        emailVerifiedAt: input.emailVerifiedAt ?? null,
      }

      users.push(user)
      createdUsers.push(user.id)
      return user
    },

    appendAuditTrail: async (entry: {
      eventType: string
      payload: Record<string, unknown>
    }) => {
      auditEntries.push(entry)
    },

    // Everything else the module exports. Named rather than omitted, so a
    // bootstrap that quietly started reading or writing somewhere else fails
    // here instead of passing against a repository that was never called.
    ...unused([
      "createDiscoveryAccess",
      "createInvitation",
      "createNotification",
      "getActiveDiscoveryAccessByEngagement",
      "getDiscoveryAccessForClient",
      "getEngagementOwnership",
      "getInvitationByTokenHash",
      "getUserByAuthUserId",
      "getUserByWorkspaceAndEmail",
      "getWorkspaceUserById",
      "listAuditTrailByWorkspace",
      "listDiscoveryAccessByWorkspace",
      "listInvitationsByWorkspace",
      "listNotificationsForUser",
      "listUsersByWorkspace",
      "markInvitationAccepted",
      "markInvitationExpired",
      "markInvitationRevoked",
      "markNotificationRead",
      "revokeDiscoveryAccess",
      "updateEngagementOwner",
      "updateUserRoleInWorkspace",
    ]),
  },
})

const { bootstrapFirstAdministrator } = await import("./access.service.js")

const input = {
  secret: "not-checked-here",
  workspaceName: "Legacy Workspace",
  administratorEmail: "admin@example.com",
  administratorName: "First Administrator",
  password: "correct-horse-battery-staple",
}

beforeEach(() => {
  workspaces = []
  users = []
  identityCount = 0
  createdWorkspaces = []
  createdUsers = []
  confirmedIdentities = []
  auditEntries = []
})

// The state a development or production database is actually in the moment
// after the Phase 3A migration runs against existing data.
const migratedInstallation = () => {
  workspaces = [{ id: LEGACY_WORKSPACE, name: "Legacy Workspace" }]
  users = [
    {
      id: LEGACY_ADMIN,
      workspaceId: LEGACY_WORKSPACE,
      email: "bootstrap@local",
      displayName: "Bootstrap Admin",
      role: "ADMIN",
      authUserId: null,
      emailVerifiedAt: null,
    },
  ]
}

test("the first administrator adopts the migration's placeholder owner", async () => {
  migratedInstallation()

  const result = await bootstrapFirstAdministrator(input)

  assert.equal(result.success, true)
  assert.ok(result.success)

  // The identifier every carried-over engagement's `owningManagerId` names.
  // A new row here would orphan them all.
  assert.equal(result.administrator.id, LEGACY_ADMIN)
  assert.equal(result.workspace.id, LEGACY_WORKSPACE)
  assert.equal(result.administrator.email, input.administratorEmail)
  assert.equal(result.administrator.role, "ADMIN")

  assert.deepEqual(createdUsers, [], "a second membership was created")
  assert.deepEqual(createdWorkspaces, [], "a second workspace was created")
  assert.equal(users.length, 1)
  assert.equal(workspaces.length, 1)
})

test("the adopted administrator carries a real, confirmed identity", async () => {
  migratedInstallation()

  await bootstrapFirstAdministrator(input)

  const [administrator] = users
  assert.equal(administrator.authUserId, `auth_${input.administratorEmail}`)
  assert.notEqual(administrator.emailVerifiedAt, null)

  // The bootstrap secret already proves control of this deployment, so the
  // address is confirmed without a round-trip — but it is confirmed through the
  // provider, never by writing an auth table from the consulting side.
  assert.deepEqual(confirmedIdentities, [`auth_${input.administratorEmail}`])
})

test("a fresh installation gets its own workspace and administrator", async () => {
  const result = await bootstrapFirstAdministrator(input)

  assert.ok(result.success)
  assert.equal(createdWorkspaces.length, 1)
  assert.equal(createdUsers.length, 1)
  assert.equal(result.administrator.role, "ADMIN")
})

test("bootstrap is refused once any identity can sign in", async () => {
  migratedInstallation()

  const first = await bootstrapFirstAdministrator(input)
  assert.ok(first.success)

  const again = await bootstrapFirstAdministrator({
    ...input,
    administratorEmail: "second@example.com",
    workspaceName: "Another Workspace",
  })

  assert.equal(again.success, false)
  assert.equal(again.success === false && again.failure, "bootstrap_unavailable")

  // Nothing of the refused attempt reached the database.
  assert.equal(users.length, 1)
  assert.equal(workspaces.length, 1)
  assert.equal(users[0].email, input.administratorEmail)
})

test("bootstrap is refused where more than one workspace already exists", async () => {
  // More than one workspace means this installation has been in use, whatever
  // the auth tables happen to say — adopting "the" workspace would be a guess.
  workspaces = [
    { id: "ws_a", name: "One" },
    { id: "ws_b", name: "Two" },
  ]

  const result = await bootstrapFirstAdministrator(input)

  assert.equal(result.success, false)
  assert.equal(
    result.success === false && result.failure,
    "bootstrap_unavailable",
  )
})

test("the adoption is recorded in the Audit Trail", async () => {
  migratedInstallation()

  await bootstrapFirstAdministrator(input)

  assert.deepEqual(auditEntries, [
    { workspaceId: LEGACY_WORKSPACE, userId: LEGACY_ADMIN, eventType: "sign_in", payload: { bootstrap: true } },
  ])
})
