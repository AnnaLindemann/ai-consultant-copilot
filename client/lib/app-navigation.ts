import type { MessageKey } from "../i18n/de"

// The internal workbench's route model.
//
// It lists exactly the routes this application implements. A roadmap surface
// that does not exist yet is deliberately absent rather than present-and-
// disabled: a navigation entry is a promise that something is there.
//
// It lives in `lib/` rather than inside the shell so the two questions the
// navigation has to answer — *which entry is current?* and *which entries may
// this role use?* — are pure functions with tests of their own, instead of
// behaviour buried in a component.

export type NavIconKind =
  | "engagements"
  | "new"
  | "knowledge"
  | "technology"
  | "updates"

export type NavItem = {
  href: string
  labelKey: MessageKey
  icon: NavIconKind
  // Extra path prefixes that count as this entry. `/engagements/x/discovery`
  // is still the Engagements section.
  matches?: readonly string[]
  // Which roles the server lets through. Hiding an entry is a courtesy only —
  // the server refuses regardless of what the sidebar shows (architecture.md
  // §7A.2) — but offering a link that will be refused is a dead end.
  roles: readonly string[]
}

export type NavGroup = {
  labelKey: MessageKey
  items: readonly NavItem[]
}

// The consultant workbench is reached by an Administrator or a Manager. A
// Client's surface is the Client Portal; every internal action here is refused
// for them by `decideAccess`, so none of it is offered.
export const INTERNAL_ROLES = ["ADMIN", "MANAGER"] as const

// The Technology Knowledge Base is administered by an Administrator alone: the
// approved screen inventory has no Manager technology surface, and the server
// refuses a Manager every technology action. A Manager meets curated technology
// knowledge indirectly, as grounding carried inside a Recommendation.
export const ADMIN_ONLY = ["ADMIN"] as const

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    labelKey: "shell.group.work",
    items: [
      {
        href: "/engagements",
        labelKey: "shell.nav.engagements",
        icon: "engagements",
        matches: ["/engagements"],
        roles: INTERNAL_ROLES,
      },
      {
        // The root route is where an engagement is opened, not a dashboard —
        // so it is named for what it does.
        href: "/",
        labelKey: "shell.nav.new_engagement",
        icon: "new",
        roles: INTERNAL_ROLES,
      },
    ],
  },
  {
    labelKey: "shell.group.knowledge",
    items: [
      {
        href: "/knowledge",
        labelKey: "shell.nav.knowledge_base",
        icon: "knowledge",
        matches: ["/knowledge"],
        roles: INTERNAL_ROLES,
      },
      {
        href: "/technology",
        labelKey: "shell.nav.technology",
        icon: "technology",
        // The library alone: the curator's own surfaces are their own entry
        // below, so "where the knowledge is" and "what is changing about it"
        // do not light up as one section.
        roles: ADMIN_ONLY,
      },
      {
        href: "/technology/proposals",
        labelKey: "shell.nav.technology_updates",
        icon: "updates",
        matches: ["/technology/proposals", "/technology/history"],
        roles: ADMIN_ONLY,
      },
    ],
  },
]

// Is this the entry the current page belongs to?
//
// The root is matched exactly: every path starts with "/", so a prefix test
// would light up the whole sidebar on every page.
export const isNavItemActive = (item: NavItem, pathname: string): boolean => {
  if (item.href === "/") return pathname === "/"
  if (pathname === item.href) return true

  return (
    item.matches?.some(
      (match) => pathname === match || pathname.startsWith(`${match}/`),
    ) ?? false
  )
}

// The navigation the acting role may actually use. Before `/auth/me` answers,
// the role is unknown and the internal navigation is shown: this shell only
// renders on a workbench route, which a Client cannot load in the first place,
// and a sidebar that appeared a moment late would flicker on every page.
export const visibleNavGroups = (role: string | null): readonly NavGroup[] => {
  if (role === null) return NAV_GROUPS

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0)
}
