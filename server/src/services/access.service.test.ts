import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"

import { compliancePolicyRepositoryMock } from "../domain/compliance/compliance-policy.fixture.js"

import { notificationKindSchema } from "../../../shared/access.schema.js"

import type { ActingUser } from "../domain/access/access.js"
import type { NotificationKind, UserRole } from "../../../shared/access.schema.js"

// Granting Discovery Access, at the seam where the decision is actually made.
// The authentication provider, persistence, and mail are replaced; the rule is
// not (coding-standards.md §9).
//
// Two properties are pinned here:
//
//  - **Discovery Access names a Client.** It is the client grant, so an
//    Administrator's or Manager's address is refused even though that address
//    exists, is verified, and is in the consultant's own workspace — the state
//    in which a role check that is merely *implied* by "we only ever create
//    CLIENT rows" quietly stops holding, because the row already exists and is
//    reused rather than created.
//  - **The grant raises its own notification.** Borrowing the staff-invitation
//    identifiers would tell a client they had been invited into a workspace
//    with a role, and would make the stored rows unreadable to anyone later
//    asking which events were which.

const WORKSPACE = "ws_1"
const OTHER_WORKSPACE = "ws_2"

type IdentityRow = {
  authUserId: string
  email: string
  name: string
  emailVerified: boolean
}

type UserRow = {
  id: string
  workspaceId: string
  email: string
  displayName: string | null
  role: UserRole
  authUserId: string | null
}

// The registered authentication identities, by address.
let identities: Record<string, IdentityRow> = {}

// The consulting-domain memberships. One identity belongs to at most one
// workspace, exactly as `User.authUserId` being unique enforces in the schema.
let users: UserRow[] = []

let createdUsers: UserRow[] = []
let createdAccess: { engagementId: string; userId: string }[] = []
let notifications: {
  userId: string
  kind: NotificationKind
  engagementId?: string | null
}[] = []
let auditEntries: { eventType: string; payload: Record<string, unknown> }[] = []
let sentEmails: { to: string }[] = []

const unused = (names: readonly string[]) =>
  Object.fromEntries(
    names.map((name) => [
      name,
      async () => {
        throw new Error(`${name} was called by a Discovery Access flow`)
      },
    ]),
  )

mock.module("../lib/auth/authentication-provider.js", {
  namedExports: {
    authenticationProvider: {
      resolveIdentityByEmail: async (email: string) => identities[email] ?? null,
    },
  },
})

mock.module("../lib/email-delivery.js", {
  namedExports: {
    emailDelivery: {
      channel: "log",
      send: async (message: { to: string }) => {
        sentEmails.push({ to: message.to })
        return { delivered: false, channel: "log", reason: "logged_not_sent" }
      },
    },
  },
})

// Bootstrapping a workspace also creates its Workspace Compliance Policy, so
// that every engagement operates under an explicit one from the moment the
// workspace exists (roadmap Phase 10). Replaced at the storage seam like every
// other repository here.
mock.module("../repositories/compliance.repository.js", {
  namedExports: compliancePolicyRepositoryMock(),
})

mock.module("../repositories/access.repository.js", {
  namedExports: {
    getUserByWorkspaceAndEmail: async (
      scope: { workspaceId: string },
      email: string,
    ) =>
      users.find(
        (user) => user.workspaceId === scope.workspaceId && user.email === email,
      ) ?? null,

    getUserByAuthUserId: async (authUserId: string) =>
      users.find((user) => user.authUserId === authUserId) ?? null,

    createUser: async (input: {
      workspaceId: string
      email: string
      displayName?: string | null
      role: UserRole
      authUserId: string
    }) => {
      // The unique constraint the schema declares, enforced here too: a test
      // that silently created a second membership for one identity would prove
      // nothing about the real database.
      assert.equal(
        users.some((user) => user.authUserId === input.authUserId),
        false,
        "a second workspace membership was created for one identity",
      )

      const row: UserRow = {
        id: `user_new_${createdUsers.length + 1}`,
        workspaceId: input.workspaceId,
        email: input.email,
        displayName: input.displayName ?? null,
        role: input.role,
        authUserId: input.authUserId,
      }

      users.push(row)
      createdUsers.push(row)
      return row
    },

    createDiscoveryAccess: async (input: {
      engagementId: string
      userId: string
    }) => {
      createdAccess.push({
        engagementId: input.engagementId,
        userId: input.userId,
      })
      return { id: `access_${createdAccess.length}`, ...input }
    },

    revokeDiscoveryAccess: async () => ({
      id: "access_1",
      engagementId: "eng_1",
      userId: "user_client",
    }),

    createNotification: async (input: {
      userId: string
      kind: NotificationKind
      engagementId?: string | null
    }) => {
      notifications.push(input)
      return input
    },

    appendAuditTrail: async (entry: {
      eventType: string
      payload: Record<string, unknown>
    }) => {
      auditEntries.push(entry)
      return entry
    },

    getActiveDiscoveryAccessByEngagement: async () => null,

    // The rest of the repository's surface. Replacing a module replaces all of
    // it, so every export the service imports has to exist — and each one that
    // this file's flows must never touch refuses instead of returning
    // something, so a rule quietly taking a different path shows up as a
    // failure rather than as a passing test about the wrong thing.
    ...unused([
      "adoptUserAsFirstAdministrator",
      "countWorkspaces",
      "createInvitation",
      "createWorkspace",
      "findSingleWorkspaceForBootstrap",
      "findUnlinkedAdministrator",
      "getInvitationByTokenHash",
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
      "updateEngagementOwner",
      "updateUserRoleInWorkspace",
    ]),
  },
})

const { grantDiscoveryAccess, revokeDiscoveryAccessById } = await import(
  "./access.service.js"
)

const consultant: ActingUser = {
  id: "user_owner",
  workspaceId: WORKSPACE,
  role: "MANAGER",
  email: "owner@example.com",
  displayName: "Owner",
}

const ENGAGEMENT = "eng_1"

beforeEach(() => {
  createdUsers = []
  createdAccess = []
  notifications = []
  auditEntries = []
  sentEmails = []

  identities = {
    "client@example.com": {
      authUserId: "auth_client",
      email: "client@example.com",
      name: "Client",
      emailVerified: true,
    },
    "unverified@example.com": {
      authUserId: "auth_unverified",
      email: "unverified@example.com",
      name: "Unverified",
      emailVerified: false,
    },
    "admin@example.com": {
      authUserId: "auth_admin",
      email: "admin@example.com",
      name: "Admin",
      emailVerified: true,
    },
    "owner@example.com": {
      authUserId: "auth_owner",
      email: "owner@example.com",
      name: "Owner",
      emailVerified: true,
    },
    "other-client@example.com": {
      authUserId: "auth_other_client",
      email: "other-client@example.com",
      name: "Other Client",
      emailVerified: true,
    },
  }

  users = [
    {
      id: "user_admin",
      workspaceId: WORKSPACE,
      email: "admin@example.com",
      displayName: "Admin",
      role: "ADMIN",
      authUserId: "auth_admin",
    },
    {
      id: "user_owner",
      workspaceId: WORKSPACE,
      email: "owner@example.com",
      displayName: "Owner",
      role: "MANAGER",
      authUserId: "auth_owner",
    },
    {
      id: "user_other_client",
      workspaceId: OTHER_WORKSPACE,
      email: "other-client@example.com",
      displayName: "Other Client",
      role: "CLIENT",
      authUserId: "auth_other_client",
    },
  ]
})

const grant = (email: string) =>
  grantDiscoveryAccess(consultant, ENGAGEMENT, { email })

const assertRefused = (
  result: Awaited<ReturnType<typeof grant>>,
  failure: string,
) => {
  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, failure)
  assert.deepEqual(createdAccess, [], "a refused grant still created access")
  assert.deepEqual(createdUsers, [], "a refused grant still created a user")
  assert.deepEqual(sentEmails, [], "a refused grant still sent mail")
}

// --- Who may receive Discovery Access --------------------------------------

test("a registered, verified client receives access", async () => {
  const result = await grant("client@example.com")

  assert.equal(result.success, true)
  assert.equal(createdAccess.length, 1)
  assert.equal(createdAccess[0]!.engagementId, ENGAGEMENT)

  // The association is what puts a self-registered client into the workspace.
  assert.equal(createdUsers.length, 1)
  assert.equal(createdUsers[0]!.role, "CLIENT")
  assert.equal(createdUsers[0]!.workspaceId, WORKSPACE)
  assert.equal(sentEmails.length, 1)
})

test("an existing client of the workspace is reused rather than duplicated", async () => {
  users.push({
    id: "user_client",
    workspaceId: WORKSPACE,
    email: "client@example.com",
    displayName: "Client",
    role: "CLIENT",
    authUserId: "auth_client",
  })

  const result = await grant("client@example.com")

  assert.equal(result.success, true)
  assert.deepEqual(createdUsers, [], "a second membership was created")
  assert.equal(createdAccess[0]!.userId, "user_client")
})

test("an Administrator of the same workspace is refused", async () => {
  // The address exists, is verified, and is in the consultant's own workspace —
  // everything the pre-role checks ask about — and is still not a client.
  assertRefused(await grant("admin@example.com"), "not_a_client")
})

test("a Manager of the same workspace is refused", async () => {
  // Including, as here, the consultant issuing the grant: an engagement's owner
  // reaches its Discovery through the workbench, never as its own client.
  assertRefused(await grant("owner@example.com"), "not_a_client")
})

test("an address nobody has registered is refused", async () => {
  // Discovery Access associates an existing account; it never creates one, which
  // is what keeps the Client lifecycle self-registration-only.
  assertRefused(await grant("stranger@example.com"), "client_not_registered")
})

test("an identity that has not confirmed its address is refused", async () => {
  assertRefused(await grant("unverified@example.com"), "client_email_unverified")
})

test("a client of another workspace is refused", async () => {
  // One identity belongs to at most one workspace. Without this check the grant
  // would reach `createUser` and surface as a unique-constraint crash rather
  // than a decision — and a 500 is not a denial.
  assertRefused(await grant("other-client@example.com"), "not_a_client")
})

test("a membership row that belongs to a different identity is refused", async () => {
  // Same address, different account behind it. Reusing the row would attach the
  // engagement's Discovery to whoever holds the *other* identity.
  users.push({
    id: "user_stale",
    workspaceId: WORKSPACE,
    email: "client@example.com",
    displayName: "Stale",
    role: "CLIENT",
    authUserId: "auth_someone_else",
  })

  assertRefused(await grant("client@example.com"), "not_a_client")
})

test("every refusal is reported with one identifier, whatever the reason", async () => {
  // A response that distinguished "is an administrator here" from "is a client
  // of another workspace" would map roles and workspace membership by address
  // (architecture.md §7A.4: denials do not leak existence).
  const staff = await grant("admin@example.com")
  const elsewhere = await grant("other-client@example.com")

  assert.equal(
    staff.success === false && staff.failure,
    elsewhere.success === false && elsewhere.failure,
  )
})

// --- Which notification the lifecycle raises -------------------------------

test("a grant notifies the client that Discovery Access was granted", async () => {
  await grant("client@example.com")

  assert.equal(notifications.length, 1)
  assert.equal(notifications[0]!.kind, "discovery_access_granted")
  assert.equal(notifications[0]!.engagementId, ENGAGEMENT)

  // Not the staff-invitation identifier: a client is never invited into a
  // workspace with a role (domain-model.md §3A.3).
  assert.notEqual(notifications[0]!.kind, "invitation_issued")
})

test("a revocation notifies the client that Discovery Access was revoked", async () => {
  const result = await revokeDiscoveryAccessById(consultant, "access_1")

  assert.equal(result.success, true)
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0]!.kind, "discovery_access_revoked")
  assert.notEqual(notifications[0]!.kind, "invitation_revoked")
})

test("the discovery-access notification kinds are in the catalogue", () => {
  // They are part of the API contract, so they exist as declared identifiers
  // rather than as strings a service happened to pass through.
  for (const kind of ["discovery_access_granted", "discovery_access_revoked"]) {
    assert.equal(
      notificationKindSchema.safeParse(kind).success,
      true,
      `${kind} is not a declared notification kind`,
    )
  }
})

test("the audit trail keeps its own event names", async () => {
  await grant("client@example.com")
  assert.equal(auditEntries.at(-1)?.eventType, "discovery_access_granted")

  await revokeDiscoveryAccessById(consultant, "access_1")
  assert.equal(auditEntries.at(-1)?.eventType, "discovery_access_revoked")
})
