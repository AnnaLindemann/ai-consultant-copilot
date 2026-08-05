import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

import { de } from "../i18n/de.ts"
import { stripComments } from "../i18n/surface-scan.ts"

// The visual-consistency contract, held against the repository rather than
// against a list somebody maintains by hand.
//
// One product, three experiences: the internal workbench (Manager and
// Administrator), the Client Portal, and the public access surfaces. Each has
// exactly one shell, every page picks the right one, and no page rebuilds a
// frame, a palette, or a control of its own.

const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const appDir = path.join(clientDir, "app")
const componentsDir = path.join(clientDir, "components")

const read = (...segments: string[]) =>
  readFileSync(path.join(...segments), "utf8")

const page = (...segments: string[]) => read(appDir, ...segments, "page.tsx")

const component = (name: string) => read(componentsDir, `${name}.tsx`)

// Every route the application implements, found rather than listed: a page
// added without a line here would otherwise be exempt from every rule below.
const routeFiles = (): string[] => {
  const found: string[] = []

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory).sort()) {
      const full = path.join(directory, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === "page.tsx") found.push(full)
    }
  }

  walk(appDir)

  return found
}

const routePath = (file: string) => {
  const relative = path
    .relative(appDir, path.dirname(file))
    .split(path.sep)
    .filter(Boolean)

  return `/${relative.join("/")}`
}

// --- the route inventory ------------------------------------------------

// The implemented routes and the shell each one belongs in. This is the
// inventory the review is against: a new page fails the test below until it is
// recorded here *and* renders the shell its experience calls for.
const ROUTE_SHELLS: Record<string, "ManagerShell" | "ClientPortalShell" | "PublicShell"> = {
  "/": "ManagerShell",
  "/compliance": "ManagerShell",
  "/engagements": "ManagerShell",
  "/engagements/[id]": "ManagerShell",
  "/engagements/[id]/discovery": "ManagerShell",
  "/knowledge": "ManagerShell",
  "/technology": "ManagerShell",
  "/technology/proposals": "ManagerShell",
  "/technology/history": "ManagerShell",
  "/portal/engagements/[id]": "ClientPortalShell",
  "/auth": "PublicShell",
}

test("the not-found state belongs to the product, not to the framework", () => {
  // Any mistyped address reaches this. It used to be the framework's own bare
  // page: another font, another background, an English sentence, no way on.
  const notFound = read(appDir, "not-found.tsx")

  assert.match(notFound, /<PublicShell/)
  assert.match(notFound, /t\("not_found\.title"\)/)
  assert.match(notFound, /href="\/"/)

  // And it reveals nothing about which addresses do exist.
  assert.doesNotMatch(stripComments(notFound), /engagement|workspace|knowledge/i)
})

test("every implemented route is in the inventory", () => {
  assert.deepEqual(
    routeFiles().map(routePath).sort(),
    Object.keys(ROUTE_SHELLS).sort(),
  )
})

test("every route renders exactly one shell, and the right one", () => {
  const shells = ["ManagerShell", "ClientPortalShell", "PublicShell"] as const

  for (const file of routeFiles()) {
    const route = routePath(file)
    const expected = ROUTE_SHELLS[route]
    let source = stripComments(readFileSync(file, "utf8"))

    // The Discovery route hands its whole surface to a component, which is
    // where the shell is chosen. Follow it rather than accepting the absence.
    if (route === "/engagements/[id]/discovery") {
      source += stripComments(component("DiscoveryWorkspace"))
    }

    for (const shell of shells) {
      const rendered = new RegExp(`<${shell}[\\s>]`).test(source)

      assert.equal(
        rendered,
        shell === expected,
        rendered
          ? `${route} renders ${shell}, which is not its shell`
          : `${route} does not render ${shell}`,
      )
    }
  }
})

// --- the internal workbench shell ---------------------------------------

test("the Manager and Administrator shell renders the sidebar, the header and the user", () => {
  const shell = component("ManagerShell")

  assert.match(shell, /className="app-shell"/)
  assert.match(shell, /<aside className="app-sidebar">/)
  assert.match(shell, /className="app-sidebar__nav"/)
  assert.match(shell, /<main className="app-main">/)
  assert.match(shell, /<header className="app-page-header">/)
  assert.match(shell, /<h1 style=\{titleStyle\}>\{title\}<\/h1>/)
  assert.match(shell, /className="app-sidebar__user"/)

  // The active entry is marked for assistive technology, not only in colour.
  assert.match(shell, /aria-current=\{active \? "page" : undefined\}/)
})

test("breadcrumbs appear wherever the route is deeper than one level", () => {
  const shell = component("ManagerShell")
  assert.match(shell, /aria-label=\{t\("shell\.breadcrumbs\.aria_label"\)\}/)

  // Every route below `/engagements` names its way back to the list.
  const deep: [string, string][] = [
    ["/engagements/[id]", page("engagements", "[id]")],
    ["/engagements/[id]/discovery", component("DiscoveryWorkspace")],
  ]

  for (const [route, source] of deep) {
    assert.match(
      source,
      /breadcrumbs=\{\[/,
      `${route} shows no breadcrumbs`,
    )
    assert.match(
      source,
      /label: t\("engagements\.title"\), href: "\/engagements"/,
      `${route} has no way back to the engagement list`,
    )
  }
})

test("no internal page is a dead end", () => {
  // Every workbench page either carries breadcrumbs or is a top-level entry
  // that the sidebar itself marks as current.
  // `/technology` is a sidebar entry of its own; the curator's two surfaces
  // under it carry breadcrumbs back to it rather than standing alone.
  // `/compliance` is likewise a sidebar entry of its own.
  const topLevel = [
    "/",
    "/engagements",
    "/knowledge",
    "/technology",
    "/compliance",
  ]

  for (const file of routeFiles()) {
    const route = routePath(file)
    if (ROUTE_SHELLS[route] !== "ManagerShell") continue
    if (topLevel.includes(route)) continue

    const source =
      route === "/engagements/[id]/discovery"
        ? component("DiscoveryWorkspace")
        : readFileSync(file, "utf8")

    assert.match(source, /breadcrumbs=\{\[/, `${route} offers no way back`)
  }
})

// --- the Client Portal shell --------------------------------------------

test("the Client Portal shell carries no workbench chrome", () => {
  const shell = component("ClientPortalShell")

  assert.doesNotMatch(shell, /app-sidebar|app-shell|ManagerShell/)
  assert.match(shell, /className="portal-shell"/)
  assert.match(shell, /className="portal-header"/)
  assert.match(shell, /className="portal-main"/)

  // A simple client header with a bounded navigation, and nothing internal.
  assert.match(shell, /aria-label=\{t\("portal\.shell\.nav_aria_label"\)\}/)
  assert.match(shell, /aria-current="page"/)
})

test("the Client Portal offers no internal route", () => {
  const portal = [
    page("portal", "engagements", "[id]"),
    component("ClientPortalShell"),
    component("ClientDiscoveryWorkspace"),
  ].join("\n")

  // `/auth` is the one link a client may need — to sign in again. Nothing
  // else in the workbench is reachable from here.
  for (const internal of ["/engagements", "/knowledge"]) {
    assert.ok(
      !portal.includes(`href="${internal}`),
      `the portal links to ${internal}`,
    )
  }
})

test("the Client Portal's content column is bounded and its own", () => {
  const css = read(clientDir, "app", "globals.css")

  assert.match(css, /--portal-max: 960px/)
  assert.match(css, /\.portal-main \{[^}]*max-width: var\(--portal-max\)/)

  // The workbench, by contrast, is never capped.
  assert.doesNotMatch(css, /\.app-main \{[^}]*max-width/)
})

// --- the public shell ----------------------------------------------------

test("the public surfaces use the shared system without the workbench sidebar", () => {
  const shell = component("PublicShell")

  assert.doesNotMatch(shell, /app-sidebar|ManagerShell/)
  assert.match(shell, /className="public-shell"/)
  // Same brand, same tokens, same typography as everything else.
  assert.match(shell, /t\("shell\.brand\.title"\)/)
  assert.match(shell, /design-tokens/)

  const auth = page("auth")
  assert.match(auth, /<PublicShell/)
  assert.match(auth, /from "\.\.\/\.\.\/components\/UiKit"/)
})

// --- one visual system ---------------------------------------------------

const surfaceFiles = (): string[] => {
  const found: string[] = []

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory).sort()) {
      const full = path.join(directory, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (full.endsWith(".tsx")) found.push(full)
    }
  }

  walk(appDir)
  walk(componentsDir)

  return found
}

test("no surface hard-codes a colour outside the design tokens", () => {
  // The old indigo root page, teal Knowledge Base and near-black buttons are
  // exactly what this prevents coming back. Every colour comes from
  // `design-tokens.json` by way of `lib/design-tokens.ts`.
  const offenders: string[] = []

  for (const file of surfaceFiles()) {
    const source = stripComments(readFileSync(file, "utf8"))

    for (const [lineNumber, line] of source.split("\n").entries()) {
      if (/#[0-9a-fA-F]{3,8}\b/.test(line)) {
        offenders.push(`${path.relative(clientDir, file)}:${lineNumber + 1}`)
      }
      // A named CSS colour is the same problem wearing a different hat.
      if (/(?:background|color|border[A-Za-z]*)\s*:\s*"(?:white|black|red|green|blue)"/.test(line)) {
        offenders.push(`${path.relative(clientDir, file)}:${lineNumber + 1}`)
      }
    }
  }

  assert.deepEqual(offenders, [], "a hard-coded colour escaped the tokens")
})

test("no surface uses a gradient as decoration", () => {
  for (const file of surfaceFiles()) {
    assert.doesNotMatch(
      stripComments(readFileSync(file, "utf8")),
      /linear-gradient|radial-gradient/,
      `${path.relative(clientDir, file)} paints a decorative gradient`,
    )
  }
})

test("shadow is reserved for floating elements, not for cards", () => {
  // UI-KIT §4.4: a card is bounded by its border. The one remaining shadow is
  // the Discovery navigation's inset selection marker, which is a rule, not a
  // drop shadow.
  for (const file of surfaceFiles()) {
    const source = stripComments(readFileSync(file, "utf8"))

    for (const match of source.matchAll(/boxShadow:/g)) {
      // The value may be a conditional spanning lines, so read enough of what
      // follows to see what is actually painted.
      const value = source.slice(match.index, match.index + 160)

      assert.match(
        value,
        /inset/,
        `${path.relative(clientDir, file)} puts a drop shadow on a surface`,
      )
    }
  }
})

test("no internal page centres itself in a column of its own", () => {
  // A workbench page uses the width the shell gives it. The bounded measures
  // belong to the Client Portal and to the public form column, and both live
  // in the stylesheet.
  const internalPages = routeFiles().filter(
    (file) => ROUTE_SHELLS[routePath(file)] === "ManagerShell",
  )

  for (const file of internalPages) {
    const source = stripComments(readFileSync(file, "utf8"))

    assert.doesNotMatch(
      source,
      /maxWidth/,
      `${routePath(file)} constrains its own width`,
    )
    assert.doesNotMatch(
      source,
      /margin:\s*"0 auto"|marginInline:\s*"auto"/,
      `${routePath(file)} centres itself independently`,
    )
  }
})

test("every control comes from the shared kit rather than from the page", () => {
  // A page may lay itself out; it may not invent a button, an input or a
  // badge. Those are one definition, in `UiKit.tsx`.
  const kit = component("UiKit")

  for (const exported of [
    "buttonStyle",
    "inputStyle",
    "textareaStyle",
    "fieldStyle",
    "badgeStyle",
    "alertStyle",
    "emptyStateStyle",
    "cardStyle",
    "tableStyle",
  ]) {
    assert.match(
      kit,
      new RegExp(`export const ${exported}\\b`),
      `the shared kit has no ${exported}`,
    )
  }

  // One control height, defined once.
  assert.match(kit, /export const CONTROL_HEIGHT = 40/)

  const usesKit = [
    "app/page.tsx",
    "app/engagements/page.tsx",
    "app/engagements/[id]/page.tsx",
    "app/auth/page.tsx",
    "app/portal/engagements/[id]/page.tsx",
    "components/AssessmentPanel.tsx",
    "components/OpportunityPanel.tsx",
    "components/EngagementAnalysisPanel.tsx",
    "components/KnowledgeBrowser.tsx",
    "components/AnalysisReportView.tsx",
  ]

  for (const relative of usesKit) {
    assert.match(
      read(clientDir, relative),
      /components\/UiKit"|from "\.\/UiKit"/,
      `${relative} does not use the shared control kit`,
    )
  }
})

test("the shared kit's tones are semantic, never per-feature branding", () => {
  const kit = component("UiKit")

  // Four semantic tones and a neutral. No fifth colour to hand a feature.
  const tone = kit.slice(kit.indexOf("export type Tone ="))
  assert.match(
    tone.slice(0, 120),
    /"neutral"\s*\|\s*"info"\s*\|\s*"success"\s*\|\s*"warning"\s*\|\s*"danger"/,
  )
  // Five names, and no sixth to hand to a feature.
  assert.equal(
    (kit.match(/^const TONES: Record<Tone, ToneColors> = \{$/m) ?? []).length,
    1,
  )

  // And a badge is never colour alone.
  assert.match(kit, /TONE_ICONS/)
  assert.match(kit, /aria-hidden="true" style=\{badgeIconStyle\}/)
})

// --- the root create-engagement route ------------------------------------

test("the root route is one process, in the internal shell", () => {
  const home = page()

  assert.match(home, /<ManagerShell/)
  assert.match(home, /<ProcessStep/)

  // Three steps, numbered, in the order they happen.
  const numbers = [...home.matchAll(/number=\{(\d)\}/g)].map(([, n]) => n)
  assert.deepEqual(numbers, ["1", "2", "3"])

  // A step that depends on an earlier one says so, and its controls are
  // genuinely disabled rather than merely dimmed.
  assert.match(home, /lockedHint=\{t\("home\.step\.locked\.needs_organization"\)\}/)
  assert.match(home, /lockedHint=\{t\("home\.step\.locked\.needs_engagement"\)\}/)
  assert.match(home, /disabled=\{!organizationReady\}/)
  assert.match(home, /disabled=\{isLoading \|\| !engagementReady\}/)

  // And the way back to the list of engagements is on the page.
  assert.match(home, /href="\/engagements"/)
})

test("the root route keeps every action it had", () => {
  const home = page()

  for (const action of [
    "home.organization.submit",
    "home.engagement.submit",
    "analysis.action.run",
    "analysis.runs.title",
    "analysis.result.title",
  ]) {
    assert.ok(home.includes(`"${action}"`), `the root route lost ${action}`)
  }
})

// --- the engagement list -------------------------------------------------

test("the engagement list is a table of the data the endpoint returns", () => {
  const list = page("engagements")

  assert.match(list, /<ManagerShell/)
  assert.match(list, /<table/)
  assert.match(list, /aria-label=\{t\("engagements\.table\.aria_label"\)\}/)

  for (const column of [
    "engagements.column.organization",
    "engagements.column.engagement",
    "engagements.column.stage",
    "engagements.column.updated",
    "engagements.column.created",
  ]) {
    assert.ok(list.includes(`"${column}"`), `the list has no ${column} column`)
  }

  // Nothing the contract does not carry: no status, no next action and no
  // derived score (UI-KIT §3.8 "evidence over decoration").
  for (const invented of ["nextAction", "healthScore", "progressPercent"]) {
    assert.ok(!list.includes(invented), `the list invents ${invented}`)
  }

  // And no filter controls, because the list endpoint takes no filter. An
  // input that quietly filtered only the current page would be a lie.
  assert.doesNotMatch(stripComments(list), /<select|<input/)

  // The table scrolls inside its own container rather than pushing the page.
  assert.match(list, /tableScrollStyle/)
})

test("the engagement list still refuses an unauthenticated caller the same way", () => {
  const list = page("engagements")

  assert.match(list, /status === 401/)
  assert.match(list, /redirect\(signInPath\("\/engagements"\)\)/)
})

// --- the engagement workspace --------------------------------------------

test("the engagement workspace runs the consulting stages in order", () => {
  const detail = page("engagements", "[id]")

  const order = ["engagement.discovery.card", "<AssessmentPanel", "<OpportunityPanel", "<EngagementAnalysisPanel"]
  let cursor = -1

  for (const marker of order) {
    const index = detail.indexOf(marker)
    assert.ok(index > cursor, `${marker} is out of the consulting sequence`)
    cursor = index
  }
})

test("the Knowledge Base is not a stage of an engagement", () => {
  const detail = page("engagements", "[id]")

  assert.doesNotMatch(detail, /KnowledgeGuidancePanel|KnowledgeBrowser/)

  // It is its own authorized route, in the same internal shell.
  const knowledge = page("knowledge")
  assert.match(knowledge, /<ManagerShell/)
  assert.match(knowledge, /<KnowledgeBrowser/)
})

test("every stage panel shares one surface, one width and one control set", () => {
  for (const panel of [
    "AssessmentPanel",
    "OpportunityPanel",
    "EngagementAnalysisPanel",
  ]) {
    const source = component(panel)

    assert.match(source, /stageSurfaceStyle/, `${panel} has a surface of its own`)
    assert.match(source, /from "\.\/UiKit"/, `${panel} has controls of its own`)
    assert.doesNotMatch(source, /maxWidth/, `${panel} constrains its own width`)
  }
})

test("the Discovery direction the other stages follow is unchanged", () => {
  const discovery = component("DiscoveryWorkspace")

  assert.match(discovery, /<ManagerShell/)
  assert.match(discovery, /className="discovery-grid"/)
  assert.match(discovery, /className="discovery-mobile-selector"/)
  assert.match(discovery, /<DiscoveryReviewControl/)
})

// --- the Consulting Knowledge Base ---------------------------------------

test("the Knowledge Base page is full width with a readable, selectable result list", () => {
  const browser = component("KnowledgeBrowser")

  assert.match(browser, /className="knowledge-shell"/)
  assert.match(browser, /className="knowledge-results"/)
  assert.doesNotMatch(browser, /maxWidth/)

  // The selected entry is marked, not merely tinted.
  assert.match(browser, /aria-current=\{isSelected \? "true" : undefined\}/)

  // Its behaviour is untouched: the same search, the same curator gate, the
  // same revision-conflict handling.
  for (const preserved of [
    "loadEntries",
    "loadEntry",
    "saveEntry",
    "canCurate",
    "setAccessDenied",
    "knowledge.browser.conflict",
    "includeInactive",
  ]) {
    assert.ok(browser.includes(preserved), `the curation surface lost ${preserved}`)
  }

  assert.match(browser, /router\.replace\(signInPath\("\/knowledge"\)\)/)
})

// --- responsive structure ------------------------------------------------

test("every layout the product uses collapses at a defined breakpoint", () => {
  const css = read(clientDir, "app", "globals.css")

  // Each multi-column grid has a rule that makes it one column.
  for (const layout of [
    ".app-shell",
    ".discovery-grid",
    ".workflow-shell",
    ".knowledge-shell",
  ]) {
    const collapses = new RegExp(
      `${layout.replace(".", "\\.")}[^{]*\\{\\s*grid-template-columns: minmax\\(0, 1fr\\)`,
    )
    assert.match(css, collapses, `${layout} never becomes a single column`)
  }

  // Page padding steps down on tablet and phone.
  assert.match(css, /@media \(max-width: 1279px\) \{\s*:root \{\s*--page-padding: 24px/)
  assert.match(css, /@media \(max-width: 767px\) \{\s*:root \{\s*--page-padding: 16px/)
})

test("a wide table scrolls inside its own container, never the page", () => {
  const kit = component("UiKit")
  const scroll = kit.slice(kit.indexOf("export const tableScrollStyle"))

  assert.match(scroll.slice(0, 200), /overflowX: "auto"/)
})

test("a sticky column is bounded so it cannot cover what is under it", () => {
  const css = read(clientDir, "app", "globals.css")
  const sticky = css.slice(css.indexOf(".discovery-sticky {"))

  assert.match(sticky, /max-height: calc\(/)
  assert.match(sticky, /overflow-y: auto/)
})

// --- localization --------------------------------------------------------

test("no user-facing string names a roadmap implementation phase", () => {
  // The consulting phase a reader may legitimately see — Discovery, Assessment
  // — is named, never numbered. "Phase 4" is how this project's roadmap is
  // organized, not how a consulting engagement is.
  const offenders = Object.entries(de)
    .filter(([, value]) => /\bPhase\s*\d/.test(value))
    .map(([key]) => key)

  assert.deepEqual(offenders, [])
})

test("the shells and the shared kit hold no user-facing text of their own", () => {
  // Every label the new chrome shows is looked up by key, so a second
  // catalogue is a translation rather than a rewrite.
  for (const name of ["ManagerShell", "ClientPortalShell", "PublicShell"]) {
    const source = stripComments(component(name))
    const keys = [...source.matchAll(/\bt\(\s*"([^"]+)"/g)].map(([, key]) => key)

    assert.ok(keys.length > 0, `${name} looks up nothing`)

    for (const key of keys) {
      assert.ok(Object.hasOwn(de, key), `${name} looks up the untranslated ${key}`)
    }
  }

  // The kit is styling and geometry; it carries no wording at all.
  assert.doesNotMatch(stripComments(component("UiKit")), /\bt\(\s*"/)
})
