import assert from "node:assert/strict"
import { test } from "node:test"

import {
  applyProposal,
  canDecideProposal,
  findProposalCoherenceFailure,
  proposalDiff,
} from "./technology-curator.js"

import type {
  TechnologyProfile,
  TechnologyProfileDraft,
  TechnologyUpdateProposalDraft,
} from "../../../../shared/technology-knowledge.schema.js"

// The human-approval gate as pure business rules: which proposals are coherent,
// which decisions are legal, and what applying one produces. No database, no
// route, no provider (coding-standards.md §9).

const profileContent = (
  overrides: Partial<TechnologyProfileDraft> = {},
): TechnologyProfileDraft => ({
  code: "openai-gpt-5",
  categoryCode: "ai-models",
  title: "OpenAI GPT-5",
  summary: "Ein großes Sprachmodell.",
  details: {
    role: "Sprachmodell für Verstehen und Erzeugen von Text.",
    strengths: ["Versteht unstrukturierte Kundenkommunikation"],
    limitations: ["Ausgaben sind nicht deterministisch"],
    suitability: ["Triage eingehender Anfragen"],
  },
  matchTerms: ["gpt"],
  tags: ["llm"],
  status: "active",
  sortOrder: 1,
  ...overrides,
})

const storedProfile = (
  overrides: Partial<TechnologyProfile> = {},
): TechnologyProfile => ({
  ...profileContent(),
  origin: "product_seed",
  originSourceCodes: ["openai"],
  revision: 0,
  ...overrides,
})

const draft = (
  overrides: Partial<TechnologyUpdateProposalDraft> = {},
): TechnologyUpdateProposalDraft => ({
  changeKind: "create",
  profileCode: "openai-gpt-5",
  categoryCode: "ai-models",
  proposedProfile: profileContent(),
  rationale: "Das Modell wurde offiziell angekündigt.",
  assumptions: [],
  gaps: [],
  sourceCodes: ["openai"],
  ...overrides,
})

// --- Coherence -------------------------------------------------------------

test("a create for a profile that does not exist yet is coherent", () => {
  assert.equal(findProposalCoherenceFailure(draft(), null), null)
})

test("a create for a profile that already exists is refused", () => {
  assert.equal(
    findProposalCoherenceFailure(draft(), storedProfile()),
    "profile_exists",
  )
})

test("a revise for a profile that does not exist is refused", () => {
  assert.equal(
    findProposalCoherenceFailure(draft({ changeKind: "revise" }), null),
    "profile_missing",
  )
})

test("a create or revise without proposed content is refused", () => {
  assert.equal(
    findProposalCoherenceFailure(draft({ proposedProfile: null }), null),
    "proposal_content_required",
  )
})

test("a deprecate that also restates the content is refused", () => {
  // Otherwise a rewrite could ride in disguised as a retirement, and the
  // reviewer would be approving something other than what they read.
  assert.equal(
    findProposalCoherenceFailure(
      draft({ changeKind: "deprecate" }),
      storedProfile(),
    ),
    "proposal_content_not_allowed",
  )
})

test("a deprecate of a profile that does not exist is refused", () => {
  assert.equal(
    findProposalCoherenceFailure(
      draft({ changeKind: "deprecate", proposedProfile: null }),
      null,
    ),
    "profile_missing",
  )
})

test("a deprecate of an existing profile is coherent", () => {
  assert.equal(
    findProposalCoherenceFailure(
      draft({ changeKind: "deprecate", proposedProfile: null }),
      storedProfile(),
    ),
    null,
  )
})

test("content naming a different profile than the proposal targets is refused", () => {
  assert.equal(
    findProposalCoherenceFailure(
      draft({ proposedProfile: profileContent({ code: "something-else" }) }),
      null,
    ),
    "proposal_code_mismatch",
  )
})

test("content naming a different category than the proposal targets is refused", () => {
  assert.equal(
    findProposalCoherenceFailure(
      draft({
        proposedProfile: profileContent({ categoryCode: "vector-databases" }),
      }),
      null,
    ),
    "proposal_category_mismatch",
  )
})

// --- Decision legality -----------------------------------------------------

test("only a pending proposal can be decided", () => {
  assert.equal(canDecideProposal({ status: "pending" }), true)
  assert.equal(canDecideProposal({ status: "approved" }), false)
  assert.equal(canDecideProposal({ status: "rejected" }), false)
})

// --- Applying --------------------------------------------------------------

test("applying a create or revise yields exactly the proposed content", () => {
  const proposed = profileContent({ title: "OpenAI GPT-5 (überarbeitet)" })

  const applied = applyProposal(
    { changeKind: "revise", profileCode: proposed.code, proposedProfile: proposed },
    storedProfile(),
  )

  assert.deepEqual(applied, proposed)
})

test("applying a deprecate keeps every word and changes only the status", () => {
  const current = storedProfile({ revision: 3 })

  const applied = applyProposal(
    {
      changeKind: "deprecate",
      profileCode: current.code,
      proposedProfile: null,
    },
    current,
  )

  assert.equal(applied.status, "deprecated")
  assert.equal(applied.title, current.title)
  assert.deepEqual(applied.details, current.details)
  // The revision belongs to persistence, not to the applied content — and so do
  // origin and its source declaration, which the apply path owns.
  assert.equal("revision" in applied, false)
  assert.equal("origin" in applied, false)
  assert.equal("originSourceCodes" in applied, false)
})

// --- The review diff -------------------------------------------------------

test("the diff marks what a create adds and leaves the rest unchanged-from-nothing", () => {
  const diff = proposalDiff(
    { changeKind: "create", categoryCode: "ai-models", proposedProfile: profileContent() },
    null,
  )

  const title = diff.find((one) => one.field === "title")
  assert.deepEqual(title?.before, [])
  assert.deepEqual(title?.after, ["OpenAI GPT-5"])
  assert.equal(title?.changed, true)
})

test("the diff reports an unchanged field as unchanged", () => {
  const current = storedProfile()
  const diff = proposalDiff(
    {
      changeKind: "revise",
      categoryCode: "ai-models",
      proposedProfile: profileContent({ summary: "Ein anderes Wort." }),
    },
    current,
  )

  assert.equal(diff.find((one) => one.field === "title")?.changed, false)
  assert.equal(diff.find((one) => one.field === "summary")?.changed, true)
})

test("the diff of a deprecation shows the status change alone", () => {
  const current = storedProfile()
  const diff = proposalDiff(
    { changeKind: "deprecate", categoryCode: "ai-models", proposedProfile: null },
    current,
  )

  const changed = diff.filter((one) => one.changed).map((one) => one.field)
  assert.deepEqual(changed, ["status"])
})
