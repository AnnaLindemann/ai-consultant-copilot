import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

import { de } from "./de.ts"
import { translateServerMessage } from "./index.ts"
import {
  jsxTextNodes,
  readsAsProse,
  stringLiterals,
  stripComments,
  stripStyles,
} from "./surface-scan.ts"
import { discoveryMessageIds } from "../../shared/discovery-messages.ts"
import { opportunityMessageIds } from "../../shared/opportunity-messages.ts"
import { workbenchMessageIds } from "../../shared/workbench-messages.ts"
import { consultingKnowledgeMessageIds } from "../../shared/consulting-knowledge-messages.ts"
import {
  businessImpactCategorySchema,
  dataSourceKindSchema,
  discoveryGapCategorySchema,
  measurementBasisSchema,
  measurementGapReasonSchema,
  measurementGapSubjectSchema,
} from "../../shared/discovery-profile.schema.ts"
import {
  consultingKnowledgeKindSchema,
  consultingKnowledgeStageSchema,
} from "../../shared/consulting-knowledge.schema.ts"
import {
  KNOWLEDGE_KINDS,
  KNOWLEDGE_STAGES,
} from "../lib/knowledge-options.ts"
import {
  DISCOVERY_SECTIONS,
  discoveryActorSchema,
  discoveryProvenanceSchema,
  discoveryStatusSchema,
  discoveryTransitionSchema,
} from "../../shared/discovery-workflow.schema.ts"

// The localization gate (implementation-workflow §13.6b): every string the
// Discovery surface shows is looked up by key, every identifier it renders has
// a German label, and nothing the server can send is left untranslated.

const catalogue: Record<string, string> = de
const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const componentsDir = path.join(clientDir, "components")
const appDir = path.join(clientDir, "app")

const has = (key: string) => Object.hasOwn(catalogue, key)

// Every implemented user-facing surface, found rather than listed: a page or
// component added without a line in this file would otherwise be exempt from
// the rules below by simple omission.
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

const relative = (file: string) => path.relative(clientDir, file)

// The narrowed source of a surface: comments and styling removed, so what is
// left is the content (see `surface-scan.ts`).
const contentOf = (file: string) =>
  stripStyles(stripComments(readFileSync(file, "utf8")))

// Strings that read as prose to the scanner but reach no screen. Kept short and
// justified one by one: this list is the only way past the rule, so anything
// added to it without a reason is a hole in the rule.
const NOT_DISPLAYED = new Map<string, string>([
  ["use client", "a React directive"],
  ["use server", "a React directive"],
  ["Content-Type", "an HTTP header name"],
  ["Enter", "a KeyboardEvent.key value"],
  // Data, not a label: the server refuses a save that still carries this exact
  // string, so both sides must agree on it. See the comment at its declaration
  // in `OpportunityPanel.tsx`; making it language-neutral is a contract change.
  ["Zu definieren", "the unfilled-success-criterion marker in the contract"],
])

const labelledIdentifiers: [string, readonly string[]][] = [
  ["discovery.status", discoveryStatusSchema.options],
  ["discovery.status.short", discoveryStatusSchema.options],
  ["discovery.actor", discoveryActorSchema.options],
  ["discovery.transition", discoveryTransitionSchema.options],
  ["discovery.provenance", discoveryProvenanceSchema.options],
  ["discovery.section", DISCOVERY_SECTIONS],
  ["discovery.basis", measurementBasisSchema.options],
  ["discovery.data_source", dataSourceKindSchema.options],
  ["discovery.impact_category", businessImpactCategorySchema.options],
  ["discovery.gap_category", discoveryGapCategorySchema.options],
  [
    "discovery.frequency",
    [
      "rarely",
      "monthly",
      "weekly",
      "daily",
      "many_times_per_day",
    ] as const,
  ],
  [
    "discovery.data_availability",
    ["none", "unknown", "restricted", "available"] as const,
  ],
  ["discovery.data_quality", ["poor", "mixed", "good", "unknown"] as const],
  ["discovery.timeline", ["asap", "this_quarter", "this_year", "unknown"] as const],
  ["common.currency", ["eur", "usd", "gbp", "other"] as const],
  ["discovery.gap_subject", measurementGapSubjectSchema.options],
  ["discovery.gap_reason", measurementGapReasonSchema.options],
  // The Opportunity surface's identifiers. Listed literally, as the enums above
  // it are: this suite runs on Node's plain type stripping, which resolves a
  // `.ts` file but not the `.js` specifier a shared schema uses to reach
  // another one. A value missing from the schema's own contract would fail the
  // server's schema tests instead.
  [
    "assessment.dimension",
    [
      "businessProcess",
      "data",
      "technology",
      "aiReadiness",
      "risks",
      "opportunities",
    ] as const,
  ],
  ["opportunity.level", ["low", "medium", "high"] as const],
  [
    "opportunity.ai_readiness",
    ["ready", "conditional", "not_ready"] as const,
  ],
  [
    "opportunity.review_state",
    ["ai_draft", "consultant_edited", "accepted"] as const,
  ],
  ["knowledge.kind", consultingKnowledgeKindSchema.options],
  ["knowledge.stage", consultingKnowledgeStageSchema.options],
]

test("every Discovery outcome the server reports has a German message", () => {
  for (const messageId of discoveryMessageIds) {
    assert.equal(has(messageId), true, `${messageId} has no German message`)
  }
})

// The curation surface repeats the knowledge identifiers locally, because a
// client file may only import from `shared/` type-only (the shared modules are
// outside the frontend build root). This is what keeps the copy honest.
test("the curation surface offers exactly the knowledge kinds and stages the domain defines", () => {
  assert.deepEqual(
    [...KNOWLEDGE_KINDS],
    [...consultingKnowledgeKindSchema.options],
  )
  assert.deepEqual(
    [...KNOWLEDGE_STAGES],
    [...consultingKnowledgeStageSchema.options],
  )
})

test("every Consulting Knowledge outcome the server reports has a German message", () => {
  for (const messageId of consultingKnowledgeMessageIds) {
    assert.equal(has(messageId), true, `${messageId} has no German message`)
  }
})

test("every Discovery identifier the interface renders has a German label", () => {
  for (const [keyPrefix, identifiers] of labelledIdentifiers) {
    for (const identifier of identifiers) {
      assert.equal(
        has(`${keyPrefix}.${identifier}`),
        true,
        `${keyPrefix}.${identifier} has no German label`,
      )
    }
  }
})

test("every key the Discovery components look up exists in the catalogue", () => {
  const files = readdirSync(componentsDir).filter((file) =>
    file.startsWith("Discovery"),
  )

  assert.ok(files.length > 0, "no Discovery components were found to check")

  const missing: string[] = []

  for (const file of files) {
    const source = readFileSync(path.join(componentsDir, file), "utf8")

    // Static lookups: t("some.key"). Keys built from an identifier at runtime
    // (t(`discovery.section.${section}`)) are covered by the test above.
    for (const [, key] of source.matchAll(/\bt\(\s*"([^"]+)"/g)) {
      if (!has(key)) missing.push(`${file}: ${key}`)
    }
  }

  assert.deepEqual(missing, [], "keys are looked up but not translated")
})

test("every Opportunity outcome the server reports has a German message", () => {
  for (const messageId of opportunityMessageIds) {
    assert.equal(has(messageId), true, `${messageId} has no German message`)
  }
})

test("the Opportunity surface is looked up by key and carries no literal", () => {
  // The prioritization surface (Phase 4) is held to the same rule as the
  // Discovery and access surfaces: every string looked up by key, no German
  // literal in the component (coding-standards.md §12A).
  const file = path.join(componentsDir, "OpportunityPanel.tsx")
  const source = readFileSync(file, "utf8")

  const missing: string[] = []
  for (const [, key] of source.matchAll(/\bt\(\s*"([^"]+)"/g)) {
    if (!has(key)) missing.push(`OpportunityPanel.tsx: ${key}`)
  }
  assert.deepEqual(missing, [], "keys are looked up but not translated")

  const offenders: string[] = []
  for (const [lineNumber, line] of source.split("\n").entries()) {
    const isComment = /^\s*(\/\/|\*|\/\*)/.test(line)
    if (!isComment && /[äöüßÄÖÜ]/.test(line)) {
      offenders.push(`OpportunityPanel.tsx:${lineNumber + 1}`)
    }
  }
  assert.deepEqual(offenders, [], "a user-facing literal was written inline")
})

test("every key the access surfaces look up exists in the catalogue", () => {
  // The Phase 3A surfaces — sign-in, self-registration, invitation acceptance,
  // bootstrap, and the Client Discovery Portal — are held to the same rule as
  // the Discovery components: no user-facing literal, every key translated.
  const files = [
    path.join(appDir, "auth", "page.tsx"),
    path.join(appDir, "portal", "engagements", "[id]", "page.tsx"),
    path.join(appDir, "knowledge", "page.tsx"),
    path.join(componentsDir, "KnowledgeBrowser.tsx"),
    path.join(componentsDir, "KnowledgeGuidancePanel.tsx"),
  ]

  const missing: string[] = []

  for (const file of files) {
    const source = readFileSync(file, "utf8")

    for (const [, key] of source.matchAll(/\bt\(\s*"([^"]+)"/g)) {
      if (!has(key)) missing.push(`${path.basename(path.dirname(file))}: ${key}`)
    }

    // Keys passed as props (labelKey, hintKey, …) are looked up just the same.
    for (const [, key] of source.matchAll(/\b\w*[kK]ey:\s*"([^"]+)"/g)) {
      if (!has(key)) missing.push(`${path.basename(path.dirname(file))}: ${key}`)
    }
  }

  assert.deepEqual(missing, [], "keys are looked up but not translated")
})

test("the access surfaces carry no hard-coded user-facing literal", () => {
  // A German literal in a component is a defect however small
  // (coding-standards.md §12A): it is the one thing that quietly turns a second
  // language back into a rewrite.
  const files = [
    path.join(appDir, "auth", "page.tsx"),
    path.join(appDir, "portal", "engagements", "[id]", "page.tsx"),
    path.join(appDir, "knowledge", "page.tsx"),
    path.join(componentsDir, "KnowledgeBrowser.tsx"),
    path.join(componentsDir, "KnowledgeGuidancePanel.tsx"),
  ]

  const offenders: string[] = []

  for (const file of files) {
    const source = readFileSync(file, "utf8")

    for (const [lineNumber, line] of source.split("\n").entries()) {
      // Umlauts and eszett are a reliable tell for prose that escaped the
      // catalogue; comments are documentation, not user-facing text.
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line)
      if (!isComment && /[äöüßÄÖÜ]/.test(line)) {
        offenders.push(`${path.basename(path.dirname(file))}:${lineNumber + 1}`)
      }
    }
  }

  assert.deepEqual(offenders, [], "a user-facing literal was written inline")
})

test("every Organization, Engagement, Assessment and Analysis outcome the server reports has a German message", () => {
  for (const messageId of workbenchMessageIds) {
    assert.equal(has(messageId), true, `${messageId} has no German message`)
  }
})

test("no implemented surface renders a literal instead of a lookup", () => {
  // The whole of the rule, applied to every page and component at once: text
  // typed into the markup, and any string literal that reads as something a
  // person would read rather than as an identifier the code works with.
  //
  // This is what catches an English literal — the German catalogue cannot
  // contain one, so anything left in a component is by definition unlocalized,
  // whichever language it happens to be written in.
  const files = surfaceFiles()
  assert.ok(files.length > 0, "no surfaces were found to check")

  const offenders: string[] = []

  for (const file of files) {
    const source = contentOf(file)

    for (const node of jsxTextNodes(source)) {
      offenders.push(`${relative(file)}:${node.line} — text "${node.text}"`)
    }

    for (const literal of stringLiterals(source)) {
      // A catalogue key is a lookup, not a string somebody reads.
      if (has(literal.text)) continue
      if (NOT_DISPLAYED.has(literal.text)) continue
      if (!readsAsProse(literal.text)) continue

      offenders.push(`${relative(file)}:${literal.line} — "${literal.text}"`)
    }
  }

  assert.deepEqual(offenders, [], "a user-facing literal escaped the catalogue")
})

test("every key any implemented surface looks up exists in the catalogue", () => {
  // Static lookups and keys passed as props, across every surface rather than a
  // listed few. Keys built from an identifier at runtime — t(`x.${value}`) —
  // are covered by the identifier-label test above.
  const missing: string[] = []

  for (const file of surfaceFiles()) {
    const source = readFileSync(file, "utf8")

    for (const [, key] of source.matchAll(/\bt\(\s*"([^"]+)"/g)) {
      if (!has(key)) missing.push(`${relative(file)}: ${key}`)
    }

    // Keys passed as props — labelKey, hintKey, titleKey, submitKey. React's
    // own `key` is not one of them, hence the required capital.
    for (const [, key] of source.matchAll(/\b\w+Key[:=]\s*"([^"]+)"/g)) {
      if (!has(key)) missing.push(`${relative(file)}: ${key}`)
    }

    // The fallback a server message is rendered with is a key like any other.
    for (const [, key] of source.matchAll(
      /translateServerMessage\([^()]*?"([^"]+)",?\s*\)/g,
    )) {
      if (!has(key)) missing.push(`${relative(file)}: ${key}`)
    }
  }

  assert.deepEqual(missing, [], "keys are looked up but not translated")
})

test("a server message identifier is never displayed raw", () => {
  // The server answers with identifiers, and `auth.error.unauthenticated` on
  // the screen is the failure this rule exists to prevent. A response's
  // `message` may only reach the interface through the catalogue, and a caught
  // error's own `.message` — a stack-trace sentence, in English — may not reach
  // it at all.
  const offenders: string[] = []

  for (const file of surfaceFiles()) {
    const source = contentOf(file)

    for (const match of source.matchAll(/\bresult\.message\b/g)) {
      const before = source.slice(Math.max(0, match.index - 60), match.index)
      const after = source.slice(match.index + "result.message".length)

      // Passing it to the catalogue is the point; asking whether the server
      // sent one at all (`result.message ? … : …`) reads nothing to a screen.
      if (/translateServerMessage\(\s*$/.test(before)) continue
      if (/^\s*\?/.test(after)) continue

      offenders.push(`${relative(file)}: result.message rendered directly`)
    }

    // `caught.message` / `err.message` from a rejected fetch is the runtime's
    // own English text; the catch branch says something of ours instead.
    for (const [, expression] of source.matchAll(
      /\b(\w+)\s+instanceof\s+Error\s*\?\s*\1\.message/g,
    )) {
      offenders.push(`${relative(file)}: ${expression}.message rendered`)
    }
  }

  assert.deepEqual(offenders, [], "a server identifier could reach the screen")
})

test("an unauthenticated protected surface redirects instead of rendering the identifier", () => {
  // The other half of the rule above, and the one case that must not be solved
  // by wording: `auth.error.unauthenticated` has a German message, but showing
  // it to somebody who is simply not signed in is still the wrong answer. Each
  // protected surface sends a 401 to the sign-in page.
  //
  // This *validates* the redirect (`proxy.ts`, `lib/auth-redirect.ts`) rather
  // than restating it: the guard is the implementation's, and this pins that
  // every protected surface still has one.
  const guarded: [string, string][] = [
    [path.join(appDir, "engagements", "page.tsx"), "redirect"],
    [path.join(appDir, "engagements", "[id]", "page.tsx"), "redirect"],
    [path.join(componentsDir, "KnowledgeBrowser.tsx"), "router.replace"],
  ]

  for (const [file, navigation] of guarded) {
    const source = readFileSync(file, "utf8")

    assert.match(
      source,
      /status === 401/,
      `${relative(file)} does not recognize an unauthenticated caller`,
    )
    assert.match(
      source,
      new RegExp(`${navigation.replace(".", "\\.")}\\(signInPath\\(`),
      `${relative(file)} does not send a 401 to the sign-in page`,
    )
  }

  // And nowhere does a surface print the identifier itself.
  for (const file of surfaceFiles()) {
    for (const literal of stringLiterals(contentOf(file))) {
      assert.notEqual(
        literal.text,
        "auth.error.unauthenticated",
        `${relative(file)}:${literal.line} names the identifier directly`,
      )
    }
  }
})

test("an identifier the catalogue does not know still renders as German", () => {
  // The fallback is what makes the rule above safe: a message the server adds
  // before the catalogue catches up degrades to German prose rather than
  // surfacing as an identifier.
  assert.equal(
    translateServerMessage("auth.error.unauthenticated"),
    catalogue["auth.error.unauthenticated"],
  )

  for (const unknown of ["some.future.identifier", "", "not an identifier"]) {
    const rendered = translateServerMessage(unknown)
    assert.equal(rendered, catalogue["common.error.unexpected"])
    assert.notEqual(rendered, unknown)
  }

  assert.equal(
    translateServerMessage(undefined, undefined, "engagements.load_failed"),
    catalogue["engagements.load_failed"],
  )
})

test("no user-facing string names a roadmap implementation phase", () => {
  // "Phase 2", "Phase 5" and the like are how this project's roadmap is
  // organized, not how a consulting engagement is. The consulting phase a
  // reader may legitimately see — Discovery, Assessment — is named, never
  // numbered.
  const offenders: string[] = []

  for (const [key, value] of Object.entries(catalogue)) {
    if (/\bPhase\s*\d/.test(value)) offenders.push(`${key}: ${value}`)
  }

  assert.deepEqual(offenders, [], "a roadmap phase label reaches the screen")
})

test("the Discovery flow does not contain the Knowledge Base", () => {
  // The Consulting Knowledge Base is reached through its own navigation. A
  // Discovery surface that rendered it would break the sequence of the stage
  // the reader is actually working through.
  const discoverySurfaces = [
    path.join(appDir, "engagements", "[id]", "discovery", "page.tsx"),
    path.join(appDir, "portal", "engagements", "[id]", "page.tsx"),
    path.join(componentsDir, "DiscoveryWorkspace.tsx"),
    path.join(componentsDir, "ClientDiscoveryWorkspace.tsx"),
    path.join(componentsDir, "DiscoverySections.tsx"),
    path.join(componentsDir, "DiscoveryLayout.tsx"),
  ]

  for (const file of discoverySurfaces) {
    const source = readFileSync(file, "utf8")

    assert.doesNotMatch(
      source,
      /Knowledge(Guidance|Browser)/,
      `${relative(file)} pulls the Knowledge Base into Discovery`,
    )
  }
})

test("the engagement page does not render the Knowledge Base as a stage", () => {
  // The curated consulting knowledge is what the assessment is grounded in, not
  // a step in the client's engagement. Rendering it in the engagement's
  // vertical flow made internal support material read as a customer-facing
  // stage; it stays reachable through its own navigation entry instead.
  const page = readFileSync(
    path.join(appDir, "engagements", "[id]", "page.tsx"),
    "utf8",
  )

  assert.doesNotMatch(page, /<KnowledgeGuidancePanel/)
  assert.doesNotMatch(page, /import KnowledgeGuidancePanel/)

  // The route it lives on is untouched. The navigation model moved out of the
  // shell into `lib/app-navigation.ts`, which is where the entry now lives.
  const navigation = readFileSync(
    path.join(clientDir, "lib", "app-navigation.ts"),
    "utf8",
  )
  assert.match(navigation, /href: "\/knowledge"/)
})

test("every engagement stage panel shares one surface and one width", () => {
  // The panels used to carry three different maximum widths and centre
  // themselves independently, which is what made the page read as a column of
  // unrelated cards. There is now a single definition.
  const panels = [
    "AssessmentPanel.tsx",
    "OpportunityPanel.tsx",
    "EngagementAnalysisPanel.tsx",
  ]

  for (const panel of panels) {
    const source = readFileSync(path.join(componentsDir, panel), "utf8")

    assert.match(source, /stageSurfaceStyle/, `${panel} does not use the shared surface`)
    assert.doesNotMatch(
      source,
      /const panelStyle[\s\S]{0,200}?maxWidth/,
      `${panel} still constrains its own width`,
    )
    assert.doesNotMatch(
      source,
      /const panelStyle[\s\S]{0,200}?margin: "24px auto/,
      `${panel} still centres itself independently`,
    )
  }

  // And the shared surface itself constrains nothing. (The intro style does cap
  // its line length — that is a readable measure for prose, not a container.)
  const surface = readFileSync(path.join(componentsDir, "StagePanel.tsx"), "utf8")
  const container = surface.slice(
    surface.indexOf("export const stageSurfaceStyle"),
    surface.indexOf("export const stageHeaderStyle"),
  )

  assert.doesNotMatch(container, /maxWidth|margin/)
  assert.match(container, /width: "100%"/)
})

test("the Client Portal carries no workbench chrome", () => {
  // The portal is its own surface: no sidebar, no stage navigation, and none of
  // the review controls that belong to the consultant (UI-KIT §6.2).
  const portal = [
    readFileSync(path.join(appDir, "portal", "engagements", "[id]", "page.tsx"), "utf8"),
    readFileSync(path.join(componentsDir, "ClientDiscoveryWorkspace.tsx"), "utf8"),
  ].join("\n")

  for (const forbidden of [/ManagerShell/, /AssessmentPanel/, /OpportunityPanel/]) {
    assert.doesNotMatch(portal, forbidden, "workbench chrome reached the portal")
  }

  // The client's own surface asks for the client's own explanations.
  assert.match(portal, /audience="client"/)
})

test("both Discovery surfaces are built from the same sections and statuses", () => {
  const consultant = readFileSync(
    path.join(componentsDir, "DiscoveryWorkspace.tsx"),
    "utf8",
  )
  const client = readFileSync(
    path.join(componentsDir, "ClientDiscoveryWorkspace.tsx"),
    "utf8",
  )

  for (const source of [consultant, client]) {
    assert.match(source, /useDiscoveryEditor/)
    assert.match(source, /DiscoveryAccordion/)
    assert.match(source, /DiscoveryProgressSummary/)
  }

  assert.match(consultant, /audience: "consultant"/)
  assert.match(client, /audience: "client"/)
})

test("the accordion is a semantic disclosure, not a styled div", () => {
  const source = readFileSync(
    path.join(componentsDir, "DiscoveryLayout.tsx"),
    "utf8",
  )

  assert.match(source, /<button/, "the accordion header is not a button")
  assert.match(source, /aria-expanded=\{isOpen\}/)
  assert.match(source, /aria-controls=\{`\$\{section\.id\}-panel`\}/)
  // The status is readable while the section is closed, in words and not only
  // in colour.
  assert.match(source, /sectionStatusLabelInContext\(section\.status/)
  assert.match(source, /role="img"/)
})

test("the field help opens on activation rather than on hover", () => {
  const source = readFileSync(path.join(componentsDir, "FieldGuidance.tsx"), "utf8")

  assert.match(source, /aria-expanded=\{helpOpen\}/)
  assert.match(source, /aria-controls=\{helpId\}/)
  assert.doesNotMatch(source, /onMouseOver|onMouseEnter/)
  // Every suggestion and every removal is a labelled control.
  assert.match(source, /aria-label=\{t\("discovery\.guidance\.suggestions\.remove"/)
})

test("only the consultant is offered the consultant's transitions", () => {
  const source = readFileSync(
    path.join(componentsDir, "DiscoveryReviewControl.tsx"),
    "utf8",
  )

  assert.match(
    source,
    /\{actor === "consultant" && \(/,
    "accept, return and reopen are not gated on the acting role",
  )
  // Hiding is a convenience; the server refuses regardless of what is shown.
  assert.match(source, /runTransition\("submit"\)/)
})

test("the Discovery layout is one grid at every width", () => {
  const css = readFileSync(path.join(clientDir, "app", "globals.css"), "utf8")

  // Three columns on desktop, two on tablet, one on mobile — the same grid.
  assert.match(css, /\.discovery-grid \{[^}]*grid-template-columns/)
  assert.match(css, /\.discovery-nav-column \{\s*display: none/)
  assert.match(css, /\.discovery-mobile-selector \{\s*display: block/)

  // A sticky column is bounded on both ends and scrolls itself, so it can
  // never cover what is under it.
  const sticky = css.slice(css.indexOf(".discovery-sticky {"))
  assert.match(sticky, /top: var\(--sticky-offset\)/)
  assert.match(sticky, /max-height: calc\(/)
  assert.match(sticky, /overflow-y: auto/)

  // No centred application card: the workspace uses the width it is given.
  assert.doesNotMatch(css, /\.app-main \{[^}]*max-width/)
})

test("no Discovery message is left empty or untranslated", () => {
  for (const [key, value] of Object.entries(catalogue)) {
    assert.equal(typeof value, "string")
    assert.notEqual(value.trim(), "", `${key} has no German text`)
    assert.notEqual(value, key, `${key} still renders as its own identifier`)
  }
})

test("message placeholders are named, so a translation can reorder them", () => {
  // A positional placeholder would tie the German wording to the parameter
  // order; named ones let a translation put the actor before the transition.
  for (const [key, value] of Object.entries(catalogue)) {
    for (const [, name] of value.matchAll(/\{(\w*)\}/g)) {
      assert.match(name, /^[a-zA-Z][a-zA-Z0-9]*$/, `${key} has an unnamed slot`)
    }
  }
})
