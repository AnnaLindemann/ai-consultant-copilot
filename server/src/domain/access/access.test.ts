import assert from "node:assert/strict"
import { test } from "node:test"

import {
  canOwnEngagement,
  canReceiveDiscoveryAccess,
  decideAccess,
  deniedOutOfReach,
  engagementReach,
  isStaffRole,
  type AccessAction,
  type AccessTarget,
  type ActingUser,
  type DiscoveryAccessFacts,
} from "./access.js"

// The access rules, tested where they live: pure, without a database, a web
// server, or an LLM (coding-standards.md §9). Every test here proves a
// *denial* — the permitted path is the easy half, and isolation breaks on the
// half nobody checked (coding-standards.md §9 "Test isolation negatively").

const administrator: ActingUser = {
  id: "user_admin",
  workspaceId: "ws_1",
  role: "ADMIN",
  email: "admin@example.com",
  displayName: "Admin",
}

const owningManager: ActingUser = {
  id: "user_owner",
  workspaceId: "ws_1",
  role: "MANAGER",
  email: "owner@example.com",
  displayName: "Owner",
}

const colleagueManager: ActingUser = {
  id: "user_colleague",
  workspaceId: "ws_1",
  role: "MANAGER",
  email: "colleague@example.com",
  displayName: "Colleague",
}

const otherWorkspaceAdministrator: ActingUser = {
  id: "user_other_admin",
  workspaceId: "ws_2",
  role: "ADMIN",
  email: "admin@other.example.com",
  displayName: "Other Admin",
}

const client: ActingUser = {
  id: "user_client",
  workspaceId: "ws_1",
  role: "CLIENT",
  email: "client@example.com",
  displayName: "Client",
}

const ownedEngagement: AccessTarget = {
  kind: "engagement",
  workspaceId: "ws_1",
  owningManagerId: owningManager.id,
}

const activeAccess: DiscoveryAccessFacts = {
  workspaceId: "ws_1",
  engagementId: "eng_1",
  userId: client.id,
  status: "active",
  expiresAt: null,
}

const discoveryTarget = (
  discoveryAccess: DiscoveryAccessFacts | null,
  engagementId = "eng_1",
): AccessTarget => ({
  kind: "discovery",
  engagementId,
  workspaceId: "ws_1",
  discoveryAccess,
})

// --- Unauthenticated -------------------------------------------------------

test("an unauthenticated caller is refused as unauthenticated, on every action", () => {
  const actions: AccessAction[] = [
    "engagement.read",
    "engagement.list",
    "engagement.generate",
    "workspace.manage",
    "portal.discovery.read",
  ]

  for (const action of actions) {
    const decision = decideAccess(null, action, ownedEngagement)

    assert.equal(decision.permitted, false, `${action} was permitted`)
    assert.equal(decision.permitted === false && decision.reason, "not_authenticated")
    assert.equal(
      decision.permitted === false && decision.disclosure,
      "unauthenticated",
      "an unauthenticated request must be distinguishable from a forbidden one",
    )
  }
})

// --- Cross-workspace -------------------------------------------------------

test("an Administrator reaches every engagement in their own workspace", () => {
  assert.equal(
    decideAccess(administrator, "engagement.read", ownedEngagement).permitted,
    true,
  )
})

test("an Administrator cannot reach an engagement in another workspace", () => {
  const decision = decideAccess(
    otherWorkspaceAdministrator,
    "engagement.read",
    ownedEngagement,
  )

  assert.equal(decision.permitted, false)
  assert.equal(decision.permitted === false && decision.reason, "outside_workspace")
})

test("the workspace boundary is asked about before the role", () => {
  // A Client from another workspace fails on the boundary, not on the role, so
  // no answer can be assembled from which step refused.
  const decision = decideAccess(
    { ...client, workspaceId: "ws_2" },
    "portal.discovery.read",
    discoveryTarget(activeAccess),
  )

  assert.equal(decision.permitted === false && decision.reason, "outside_workspace")
})

test("no workspace-crossing action is permitted, whatever the role", () => {
  const roles: ActingUser[] = [
    { ...administrator, workspaceId: "ws_2" },
    { ...owningManager, workspaceId: "ws_2" },
    { ...client, workspaceId: "ws_2" },
  ]

  for (const actingUser of roles) {
    assert.equal(
      decideAccess(actingUser, "engagement.read", ownedEngagement).permitted,
      false,
      `${actingUser.role} crossed a workspace boundary`,
    )
  }
})

// --- Cross-owner -----------------------------------------------------------

test("a Manager reaches an engagement they own", () => {
  assert.equal(
    decideAccess(owningManager, "engagement.read", ownedEngagement).permitted,
    true,
  )
})

test("a Manager cannot reach a colleague's engagement in the same workspace", () => {
  const decision = decideAccess(
    colleagueManager,
    "engagement.read",
    ownedEngagement,
  )

  assert.equal(decision.permitted, false)
  assert.equal(
    decision.permitted === false && decision.reason,
    "not_engagement_owner",
  )
})

test("ownership is enforced on writing and generating, not only on reading", () => {
  const actions: AccessAction[] = [
    "engagement.update",
    "engagement.generate",
    "discovery.save",
    "discovery.review",
    "analysis_run.read",
    "discovery_access.grant",
  ]

  for (const action of actions) {
    assert.equal(
      decideAccess(colleagueManager, action, ownedEngagement).permitted,
      false,
      `${action} reached a colleague's engagement`,
    )
  }
})

test("a Manager cannot administer the workspace or widen their own reach", () => {
  const actions: AccessAction[] = [
    "workspace.manage",
    "invitation.issue",
    "invitation.revoke",
    "role.change",
  ]

  for (const action of actions) {
    const decision = decideAccess(owningManager, action, { kind: "workspace" })

    assert.equal(decision.permitted, false, `${action} was permitted`)
    assert.equal(
      decision.permitted === false && decision.reason,
      "role_not_permitted",
    )
  }
})

test("only an Administrator transfers engagement ownership", () => {
  assert.equal(
    decideAccess(owningManager, "ownership.transfer", ownedEngagement).permitted,
    false,
    "a Manager transferred ownership of their own engagement",
  )
  assert.equal(
    decideAccess(administrator, "ownership.transfer", ownedEngagement).permitted,
    true,
  )
})

// --- Client portal isolation ------------------------------------------------

test("a Client reaches their own engagement's discovery through the portal", () => {
  assert.equal(
    decideAccess(client, "portal.discovery.read", discoveryTarget(activeAccess))
      .permitted,
    true,
  )
})

test("a Client reaches nothing in the consultant workbench", () => {
  const actions: AccessAction[] = [
    "engagement.list",
    "engagement.read",
    "engagement.create",
    "engagement.update",
    "engagement.generate",
    "discovery.save",
    "discovery.submit",
    "discovery.review",
    "analysis_run.read",
    "feedback.read",
    "feedback.classify",
    "feedback.reentry",
    "organization.read",
    "organization.create",
  ]

  for (const action of actions) {
    const decision = decideAccess(client, action, ownedEngagement)

    assert.equal(decision.permitted, false, `a Client reached ${action}`)
    assert.equal(
      decision.permitted === false && decision.reason,
      "role_not_permitted",
    )
  }
})

test("Client Feedback is submitted by Clients and controlled by the Manager", () => {
  assert.equal(
    decideAccess(client, "portal.feedback.submit", discoveryTarget(activeAccess))
      .permitted,
    true,
  )

  for (const action of ["feedback.read", "feedback.classify", "feedback.reentry"] as const) {
    assert.equal(
      decideAccess(owningManager, action, ownedEngagement).permitted,
      true,
      `${action} was not available to the owning Manager`,
    )
  }

  assert.equal(
    decideAccess(client, "feedback.classify", ownedEngagement).permitted,
    false,
    "a Client classified feedback in the consultant workbench",
  )
  assert.equal(
    decideAccess(owningManager, "portal.feedback.submit", discoveryTarget(activeAccess))
      .permitted,
    false,
    "a Manager submitted feedback through the client portal",
  )
})

test("a Client cannot reach the discovery of an engagement they are not associated with", () => {
  // Valid access to eng_1 does not carry over to eng_2.
  const decision = decideAccess(
    client,
    "portal.discovery.read",
    discoveryTarget(activeAccess, "eng_2"),
  )

  assert.equal(decision.permitted, false)
  assert.equal(
    decision.permitted === false && decision.reason,
    "no_active_discovery_access",
  )
})

test("a Client cannot use another client's Discovery Access", () => {
  const decision = decideAccess(
    client,
    "portal.discovery.read",
    discoveryTarget({ ...activeAccess, userId: "user_other_client" }),
  )

  assert.equal(
    decision.permitted === false && decision.reason,
    "no_active_discovery_access",
  )
})

test("a Client with no Discovery Access at all reaches nothing", () => {
  assert.equal(
    decideAccess(client, "portal.discovery.read", discoveryTarget(null)).permitted,
    false,
  )
})

test("a consultant cannot act through the client portal", () => {
  for (const actingUser of [administrator, owningManager]) {
    const decision = decideAccess(
      actingUser,
      "portal.discovery.submit",
      discoveryTarget(activeAccess),
    )

    assert.equal(
      decision.permitted,
      false,
      `${actingUser.role} acted through the client portal`,
    )
  }
})

// --- Revoked and expired access --------------------------------------------

test("revoked Discovery Access ends the client's reach immediately", () => {
  const decision = decideAccess(
    client,
    "portal.discovery.read",
    discoveryTarget({ ...activeAccess, status: "revoked" }),
  )

  assert.equal(decision.permitted, false)
  assert.equal(
    decision.permitted === false && decision.reason,
    "no_active_discovery_access",
  )
})

test("revocation ends reading and writing alike", () => {
  const actions: AccessAction[] = [
    "portal.discovery.read",
    "portal.discovery.save",
    "portal.discovery.submit",
  ]

  for (const action of actions) {
    assert.equal(
      decideAccess(
        client,
        action,
        discoveryTarget({ ...activeAccess, status: "revoked" }),
      ).permitted,
      false,
      `${action} survived revocation`,
    )
  }
})

test("expired Discovery Access ends the client's reach", () => {
  const expired = discoveryTarget({
    ...activeAccess,
    expiresAt: new Date("2020-01-01T00:00:00.000Z"),
  })

  assert.equal(decideAccess(client, "portal.discovery.read", expired).permitted, false)
})

test("access that has not yet been accepted is not access", () => {
  assert.equal(
    decideAccess(
      client,
      "portal.discovery.read",
      discoveryTarget({ ...activeAccess, status: "pending" }),
    ).permitted,
    false,
  )
})

// --- Non-revealing denials --------------------------------------------------

test("a refusal about a named resource is disclosed as a missing resource", () => {
  // Cross-workspace, cross-owner, and wrong-role refusals about a named
  // engagement must all look the same, so a response cannot be used to
  // establish that the engagement exists or who owns it.
  const disclosures = [
    decideAccess(otherWorkspaceAdministrator, "engagement.read", ownedEngagement),
    decideAccess(colleagueManager, "engagement.read", ownedEngagement),
    decideAccess(client, "engagement.read", ownedEngagement),
  ].map((decision) => decision.permitted === false && decision.disclosure)

  assert.deepEqual(disclosures, ["not_found", "not_found", "not_found"])
})

test("a portal refusal is disclosed as a missing resource too", () => {
  const disclosures = [
    discoveryTarget(null),
    discoveryTarget({ ...activeAccess, status: "revoked" }),
    discoveryTarget(activeAccess, "eng_2"),
  ].map((target) => {
    const decision = decideAccess(client, "portal.discovery.read", target)
    return decision.permitted === false && decision.disclosure
  })

  assert.deepEqual(disclosures, ["not_found", "not_found", "not_found"])
})

test("the out-of-reach denial always carries a disclosure", () => {
  // A denial without a disclosure cannot be reported, and an unreportable
  // refusal is how a request ends up answered by nothing at all.
  const decision = deniedOutOfReach()

  assert.equal(decision.permitted, false)
  assert.equal(decision.permitted === false && decision.reason, "out_of_reach")
  assert.equal(decision.permitted === false && decision.disclosure, "not_found")
})

test("a workspace-capability refusal is forbidden, not a missing resource", () => {
  // Refusing a Manager the workspace administration surface reveals nothing
  // they did not already know about their own role.
  const decision = decideAccess(owningManager, "workspace.manage", {
    kind: "workspace",
  })

  assert.equal(decision.permitted === false && decision.disclosure, "forbidden")
})

// --- Repository reach ------------------------------------------------------

test("the reach a query is given matches the reach the policy grants", () => {
  assert.deepEqual(
    engagementReach({ workspaceId: "ws_1", userId: administrator.id, role: "ADMIN" }),
    { kind: "whole_workspace", workspaceId: "ws_1" },
  )

  assert.deepEqual(
    engagementReach({
      workspaceId: "ws_1",
      userId: owningManager.id,
      role: "MANAGER",
    }),
    {
      kind: "owned_engagements",
      workspaceId: "ws_1",
      owningManagerId: owningManager.id,
    },
  )

  // A Client's engagement-side reach is their own Discovery Access and nothing
  // wider — never the whole workspace.
  assert.deepEqual(
    engagementReach({ workspaceId: "ws_1", userId: client.id, role: "CLIENT" }),
    { kind: "granted_discovery", workspaceId: "ws_1", clientUserId: client.id },
  )
})

// --- The Client lifecycle --------------------------------------------------

test("a Client is never a role a staff invitation can create", () => {
  assert.equal(isStaffRole("ADMIN"), true)
  assert.equal(isStaffRole("MANAGER"), true)
  assert.equal(
    isStaffRole("CLIENT"),
    false,
    "clients self-register; they are not invited into a workspace",
  )
})

test("an engagement can never be transferred to a Client", () => {
  // An engagement owned by someone with no reach to it would be unreachable by
  // its own owner.
  assert.equal(canOwnEngagement("ADMIN"), true)
  assert.equal(canOwnEngagement("MANAGER"), true)
  assert.equal(canOwnEngagement("CLIENT"), false)
})

test("Discovery Access is granted to a Client and to nobody else", () => {
  // The mirror image of the rule above. Discovery Access exists to give one
  // client one engagement's Discovery form through the portal, and the portal's
  // actions are permitted to CLIENT alone — so a staff account in a workspace's
  // Discovery Access register would be a record of something that cannot
  // happen (domain-model.md §3A.2, §3A.3).
  assert.equal(canReceiveDiscoveryAccess("CLIENT"), true)
  assert.equal(canReceiveDiscoveryAccess("ADMIN"), false)
  assert.equal(canReceiveDiscoveryAccess("MANAGER"), false)
})

test("the two grants are not interchangeable", () => {
  // Stated as its own property because the two rules are one word apart and a
  // copy-paste between them would pass every test above.
  for (const role of ["ADMIN", "MANAGER", "CLIENT"] as const) {
    assert.notEqual(
      canOwnEngagement(role),
      canReceiveDiscoveryAccess(role),
      `${role} was allowed both to own engagements and to receive Discovery Access`,
    )
  }
})
