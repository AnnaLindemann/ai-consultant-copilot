import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"

import type {
  TechnologyCategory,
  TechnologyProfile,
  TechnologyProfileDraft,
  TechnologySource,
  TechnologyUpdateHistoryEntry,
  TechnologyUpdateProposal,
  TechnologyUpdateProposalDraft,
} from "../../../shared/technology-knowledge.schema.js"
import type { ActingUser } from "../domain/access/access.js"

// The curator's orchestration, exercised against its module seams so the
// approval gate can be proven without a database (coding-standards.md §9).
//
// What these tests prove: nothing reaches the knowledge base without an
// explicit approval; a rejection changes nothing and writes no history; an
// approval writes the profile *and* the history together; a proposal that went
// stale between drafting and approval is refused rather than applied; and no
// curator path records an Analysis Run.

const ADMIN: ActingUser = {
  id: "user_admin",
  workspaceId: "ws_1",
  role: "ADMIN",
  email: "admin@example.com",
  displayName: "Admin",
}

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

const categories: TechnologyCategory[] = [
  {
    code: "ai-models",
    title: "AI Models",
    summary: "Die Modelle selbst.",
    sortOrder: 1,
    active: true,
    revision: 0,
  },
]

const sources: TechnologySource[] = [
  {
    code: "openai",
    name: "OpenAI",
    summary: "Offizielle Ankündigungen von OpenAI.",
    officialChannels: [{ label: "Docs", url: "https://platform.openai.com/docs" }],
    active: true,
    revision: 0,
  },
]

// The curated store, as the service sees it.
let storedProfiles: TechnologyProfile[] = []
let storedProposals: TechnologyUpdateProposal[] = []
let appendedHistory: TechnologyUpdateHistoryEntry[] = []
let applyOutcome: "applied" | "already_decided" = "applied"

// Every write the curator makes, in order — so a test can assert not only the
// end state but that a refused path wrote nothing at all.
let writes: string[] = []

mock.module("../repositories/technology-knowledge.repository.js", {
  namedExports: {
    listTechnologyCategories: async () => categories,
    listTechnologySources: async () => sources,
    getTechnologyProfileByCode: async (code: string) =>
      storedProfiles.find((one) => one.code === code) ?? null,
  },
})

mock.module("../repositories/technology-curator.repository.js", {
  namedExports: {
    createTechnologyProposal: async (
      draft: TechnologyUpdateProposalDraft,
      createdByUserId: string,
    ) => {
      writes.push("proposal_created")
      const proposal: TechnologyUpdateProposal = {
        ...draft,
        id: `prop_${storedProposals.length + 1}`,
        status: "pending",
        createdAt: "2026-08-01T10:00:00.000Z",
        createdByUserId,
        createdByName: "Admin",
        decidedAt: null,
        decidedByUserId: null,
        decidedByName: null,
        decisionNote: null,
        appliedAt: null,
      }
      storedProposals.push(proposal)
      return proposal
    },

    getTechnologyProposalById: async (id: string) =>
      storedProposals.find((one) => one.id === id) ?? null,

    listTechnologyProposals: async () => storedProposals,

    rejectTechnologyProposal: async (
      id: string,
      decidedByUserId: string,
      note: string | null,
    ) => {
      writes.push("proposal_rejected")
      const proposal = storedProposals.find((one) => one.id === id)
      if (!proposal || proposal.status !== "pending") return null

      const rejected: TechnologyUpdateProposal = {
        ...proposal,
        status: "rejected",
        decidedAt: "2026-08-01T11:00:00.000Z",
        decidedByUserId,
        decidedByName: "Admin",
        decisionNote: note,
      }
      storedProposals = storedProposals.map((one) =>
        one.id === id ? rejected : one,
      )
      return rejected
    },

    applyApprovedProposal: async (
      proposalId: string,
      appliedProfile: TechnologyProfileDraft,
      sourceCodes: readonly string[],
      approvedByUserId: string,
    ) => {
      if (applyOutcome === "already_decided") {
        return { applied: false, reason: "already_decided" }
      }

      writes.push("profile_written")
      writes.push("history_appended")

      // The apply path owns origin: content arriving through the gate is
      // curator-originated and the seed declaration is cleared with it.
      const stored: TechnologyProfile = {
        ...appliedProfile,
        origin: "curator",
        originSourceCodes: [],
        revision: 0,
      }
      storedProfiles = [
        ...storedProfiles.filter((one) => one.code !== stored.code),
        stored,
      ]

      const proposal = storedProposals.find((one) => one.id === proposalId)!
      const approved: TechnologyUpdateProposal = {
        ...proposal,
        status: "approved",
        decidedAt: "2026-08-01T11:00:00.000Z",
        decidedByUserId: approvedByUserId,
        decidedByName: "Admin",
        appliedAt: "2026-08-01T11:00:00.000Z",
      }
      storedProposals = storedProposals.map((one) =>
        one.id === proposalId ? approved : one,
      )

      const historyEntry: TechnologyUpdateHistoryEntry = {
        id: `hist_${appendedHistory.length + 1}`,
        proposalId,
        profileCode: stored.code,
        categoryCode: stored.categoryCode,
        changeKind: proposal.changeKind,
        sourceCodes: [...sourceCodes],
        appliedProfile: stored,
        approvedByUserId,
        approvedByName: "Admin",
        appliedAt: "2026-08-01T11:00:00.000Z",
      }
      appendedHistory.push(historyEntry)

      return { applied: true, proposal: approved, historyEntry }
    },

    listTechnologyUpdateHistory: async () => appendedHistory,
  },
})

const {
  decideTechnologyProposal,
  getProposalReview,
  proposeTechnologyUpdate,
} = await import("./technology-curator.service.js")

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

beforeEach(() => {
  storedProfiles = []
  storedProposals = []
  appendedHistory = []
  applyOutcome = "applied"
  writes = []
})

test("drafting a proposal changes nothing in the knowledge base", async () => {
  const result = await proposeTechnologyUpdate(ADMIN, draft())

  assert.equal(result.success, true)
  assert.deepEqual(storedProfiles, [])
  assert.deepEqual(appendedHistory, [])
  assert.deepEqual(writes, ["proposal_created"])
})

test("a proposal citing a source the registry does not contain is refused", async () => {
  const result = await proposeTechnologyUpdate(
    ADMIN,
    draft({ sourceCodes: ["invented-vendor"] }),
  )

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "unknown_source")
  assert.equal(
    result.success === false && result.messageId,
    "technology.error.unknown_source",
  )
  assert.deepEqual(
    result.success === false ? result.unknownCodes : undefined,
    ["invented-vendor"],
  )
  assert.deepEqual(writes, [])
})

test("a proposal naming an unknown category is refused", async () => {
  const result = await proposeTechnologyUpdate(
    ADMIN,
    draft({
      categoryCode: "does-not-exist",
      proposedProfile: profileContent({ categoryCode: "does-not-exist" }),
    }),
  )

  assert.equal(result.success, false)
  assert.equal(result.success === false && result.failure, "unknown_category")
  assert.deepEqual(writes, [])
})

test("approving is what writes the profile, and it writes the history with it", async () => {
  const proposed = await proposeTechnologyUpdate(ADMIN, draft())
  assert.equal(proposed.success, true)
  if (!proposed.success) return

  const decided = await decideTechnologyProposal(
    ADMIN,
    proposed.proposal.id,
    "approve",
    null,
  )

  assert.equal(decided.success, true)
  assert.equal(storedProfiles.length, 1)
  assert.equal(appendedHistory.length, 1)
  // The profile and the history land together; neither can happen alone.
  assert.deepEqual(writes, [
    "proposal_created",
    "profile_written",
    "history_appended",
  ])
})

test("the history entry preserves the sources the proposal cited", async () => {
  const proposed = await proposeTechnologyUpdate(ADMIN, draft())
  if (!proposed.success) return assert.fail("the proposal should have been drafted")

  await decideTechnologyProposal(ADMIN, proposed.proposal.id, "approve", null)

  assert.deepEqual(appendedHistory[0]?.sourceCodes, ["openai"])
  assert.equal(appendedHistory[0]?.approvedByUserId, ADMIN.id)
})

test("rejecting changes nothing and writes no history entry", async () => {
  const proposed = await proposeTechnologyUpdate(ADMIN, draft())
  if (!proposed.success) return assert.fail("the proposal should have been drafted")

  const decided = await decideTechnologyProposal(
    ADMIN,
    proposed.proposal.id,
    "reject",
    "Quelle nicht ausreichend.",
  )

  assert.equal(decided.success, true)
  assert.equal(decided.success === true && decided.historyEntry, null)
  assert.deepEqual(storedProfiles, [])
  // The Technology Update History records approved revisions only.
  assert.deepEqual(appendedHistory, [])
  assert.deepEqual(writes, ["proposal_created", "proposal_rejected"])
})

test("a decided proposal cannot be decided again", async () => {
  const proposed = await proposeTechnologyUpdate(ADMIN, draft())
  if (!proposed.success) return assert.fail("the proposal should have been drafted")

  await decideTechnologyProposal(ADMIN, proposed.proposal.id, "reject", null)
  const again = await decideTechnologyProposal(
    ADMIN,
    proposed.proposal.id,
    "approve",
    null,
  )

  assert.equal(again.success, false)
  assert.equal(again.success === false && again.failure, "already_decided")
  assert.deepEqual(storedProfiles, [])
})

test("a proposal that went stale between drafting and approval is not applied", async () => {
  // Drafted as a `create` while nothing existed…
  const proposed = await proposeTechnologyUpdate(ADMIN, draft())
  if (!proposed.success) return assert.fail("the proposal should have been drafted")

  // …and somebody created the profile in the meantime.
  storedProfiles = [
    {
      ...profileContent(),
      origin: "product_seed",
      originSourceCodes: ["openai"],
      revision: 0,
    },
  ]

  const decided = await decideTechnologyProposal(
    ADMIN,
    proposed.proposal.id,
    "approve",
    null,
  )

  assert.equal(decided.success, false)
  assert.equal(decided.success === false && decided.failure, "apply_failed")
  // The profile somebody else created is untouched, and no history was written.
  assert.deepEqual(appendedHistory, [])
  assert.deepEqual(writes, ["proposal_created"])
})

test("deciding a proposal that does not exist is refused as not found", async () => {
  const decided = await decideTechnologyProposal(ADMIN, "prop_missing", "approve", null)

  assert.equal(decided.success, false)
  assert.equal(decided.success === false && decided.failure, "not_found")
})

test("a lost race at the apply step leaves the knowledge base alone", async () => {
  const proposed = await proposeTechnologyUpdate(ADMIN, draft())
  if (!proposed.success) return assert.fail("the proposal should have been drafted")

  applyOutcome = "already_decided"

  const decided = await decideTechnologyProposal(
    ADMIN,
    proposed.proposal.id,
    "approve",
    null,
  )

  assert.equal(decided.success, false)
  assert.equal(decided.success === false && decided.failure, "already_decided")
  assert.deepEqual(storedProfiles, [])
  assert.deepEqual(appendedHistory, [])
})

test("the review assembles the diff and only the sources the proposal cites", async () => {
  const proposed = await proposeTechnologyUpdate(ADMIN, draft())
  if (!proposed.success) return assert.fail("the proposal should have been drafted")

  const review = await getProposalReview(proposed.proposal.id)

  assert.ok(review)
  assert.equal(review.currentProfile, null)
  assert.deepEqual(
    review.sources.map((one) => one.code),
    ["openai"],
  )
  assert.equal(review.diff.find((one) => one.field === "title")?.changed, true)
})

test("no refusal carries user-facing prose", async () => {
  const refused = await proposeTechnologyUpdate(
    ADMIN,
    draft({ sourceCodes: ["invented-vendor"] }),
  )

  assert.equal(refused.success, false)
  if (refused.success) return

  // The consultant is told the outcome by its identifier; the frontend renders
  // it in their language (coding-standards.md §12A).
  assert.match(refused.messageId, /^technology\.error\./)
})
