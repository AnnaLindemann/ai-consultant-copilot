import assert from "node:assert/strict"
import { test } from "node:test"

import {
  INTERNAL_ROLES,
  NAV_GROUPS,
  isNavItemActive,
  visibleNavGroups,
} from "./app-navigation.ts"

// The two questions the sidebar has to answer, tested as behaviour rather than
// as text in a component: which entry is current, and which entries this role
// may use.

const allItems = () => NAV_GROUPS.flatMap((group) => group.items)

const itemFor = (href: string) => {
  const item = allItems().find((candidate) => candidate.href === href)
  assert.ok(item, `no navigation entry for ${href}`)
  return item
}

test("the navigation names exactly the routes the application implements", () => {
  // Held against the route inventory deliberately: adding a page without a way
  // to reach it, or advertising a page that does not exist, both fail here.
  assert.deepEqual(
    allItems()
      .map((item) => item.href)
      .sort(),
    ["/", "/engagements", "/knowledge"],
  )
})

test("the current page's entry is the active one, and only that one", () => {
  const cases: [string, string][] = [
    ["/", "/"],
    ["/engagements", "/engagements"],
    ["/engagements/abc", "/engagements"],
    ["/engagements/abc/discovery", "/engagements"],
    ["/knowledge", "/knowledge"],
  ]

  for (const [pathname, expectedHref] of cases) {
    const active = allItems().filter((item) => isNavItemActive(item, pathname))

    assert.equal(active.length, 1, `${pathname} lit ${active.length} entries`)
    assert.equal(active[0].href, expectedHref, `${pathname} lit the wrong entry`)
  }
})

test("the root entry does not match every path", () => {
  // Every path begins with "/", so a prefix test here would mark the root entry
  // current on every page in the product.
  for (const pathname of ["/engagements", "/knowledge", "/engagements/abc"]) {
    assert.equal(isNavItemActive(itemFor("/"), pathname), false)
  }
})

test("a path that merely starts with the same characters is not the section", () => {
  assert.equal(isNavItemActive(itemFor("/engagements"), "/engagements-archive"), false)
})

test("a Manager and an Administrator see the internal navigation", () => {
  for (const role of INTERNAL_ROLES) {
    const groups = visibleNavGroups(role)

    assert.deepEqual(
      groups.flatMap((group) => group.items).map((item) => item.href).sort(),
      ["/", "/engagements", "/knowledge"],
      `${role} does not see the workbench navigation`,
    )
  }
})

test("a Client is offered no internal route at all", () => {
  // Their surface is the Client Portal. Every route here is refused for them by
  // the server's access policy, so offering one would be a dead end.
  assert.deepEqual(visibleNavGroups("CLIENT"), [])
})

test("an empty group disappears rather than showing an empty heading", () => {
  for (const group of visibleNavGroups("MANAGER")) {
    assert.ok(group.items.length > 0, `${group.labelKey} is an empty heading`)
  }
})

test("the navigation is shown while the acting role is still unknown", () => {
  // `/auth/me` answers after the first paint. A sidebar that appeared a moment
  // late would flicker on every page, and this shell only renders on routes a
  // Client cannot load in the first place.
  assert.deepEqual(visibleNavGroups(null), NAV_GROUPS)
})

test("no navigation entry is disabled or points at an unbuilt page", () => {
  for (const item of allItems()) {
    assert.match(item.href, /^\/[a-z-]*$/, `${item.href} is not a real route`)
    assert.ok(
      item.roles.length > 0,
      `${item.href} is reachable by nobody, so it should not be listed`,
    )
  }
})
