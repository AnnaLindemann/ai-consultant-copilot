import assert from "node:assert/strict"
import { test } from "node:test"

import {
  defaultOpenSectionId,
  nextRecommendedSectionId,
  summarizeDiscoveryProgress,
} from "./discovery-progress.ts"

// The Discovery workspace states its progress in three places at once — the
// summary, the section navigation, and the recommended next step. These are the
// rules that keep those three telling the consultant the same thing.

const sections = [
  { id: "situation", status: "complete" },
  { id: "problems", status: "in_progress" },
  { id: "current_process", status: "complete" },
  { id: "tools", status: "not_started" },
] as const

test("progress counts each status and reports completion as a whole percent", () => {
  const progress = summarizeDiscoveryProgress(sections)

  assert.equal(progress.total, 4)
  assert.equal(progress.complete, 2)
  assert.equal(progress.percent, 50)
  assert.deepEqual(progress.counts, {
    not_started: 1,
    in_progress: 1,
    complete: 2,
    action_required: 0,
  })
})

test("an empty Discovery reports no progress rather than dividing by zero", () => {
  const progress = summarizeDiscoveryProgress([])

  assert.equal(progress.total, 0)
  assert.equal(progress.percent, 0)
})

test("a returned section is recommended before anything else", () => {
  const recommended = nextRecommendedSectionId([
    { id: "situation", status: "in_progress" },
    { id: "problems", status: "not_started" },
    { id: "tools", status: "action_required" },
  ])

  assert.equal(recommended, "tools")
})

test("work already under way is recommended before work not begun", () => {
  assert.equal(nextRecommendedSectionId(sections), "problems")
})

test("a complete Discovery recommends nothing", () => {
  assert.equal(
    nextRecommendedSectionId([
      { id: "situation", status: "complete" },
      { id: "problems", status: "complete" },
    ]),
    null,
  )
})

test("the workspace opens on the first section still needing work", () => {
  assert.equal(defaultOpenSectionId(sections, "situation"), "problems")
})

test("a complete Discovery opens on its first section", () => {
  assert.equal(
    defaultOpenSectionId(
      [
        { id: "situation", status: "complete" },
        { id: "problems", status: "complete" },
      ],
      "gaps",
    ),
    "situation",
  )
})

test("with no sections at all the workspace falls back", () => {
  assert.equal(defaultOpenSectionId([], "situation"), "situation")
})
