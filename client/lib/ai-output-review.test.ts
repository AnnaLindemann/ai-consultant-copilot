import assert from "node:assert/strict"
import { test } from "node:test"

import {
  aiStageForEngagementStage,
  reviewableAiStage,
  submitAiOutputReview,
  type AiOutputReviewRun,
} from "./ai-output-review.ts"

// What the engagement page has to get right about human review of AI output
// (roadmap Phase 10): which stage the action names, when it may be offered at
// all, and that reviewing one stage is a request about that stage and nothing
// else.
//
// The pending flag is deliberately read from Analysis Runs the server returned.
// These tests therefore feed runs, not component state — the same shape the
// page receives from `/engagements/:id/analysis-runs`.

const run = (
  stage: string,
  humanReviewStatus: string | null,
): AiOutputReviewRun => ({ stage, humanReviewStatus })

test("the stage the engagement stands at is offered when its output is unreviewed", () => {
  assert.deepEqual(
    reviewableAiStage("assessment", [run("assessment", "pending")]),
    { stage: "assessment", pending: true },
  )
})

test("a pending analysis run is offered for review", () => {
  // The regression this exists for: `analysis` has no engagement stage, so a
  // mapping built only from engagement stages left its runs pending forever,
  // with no action anywhere in the product to clear them.
  assert.deepEqual(reviewableAiStage("discovery", [run("analysis", "pending")]), {
    stage: "analysis",
    pending: true,
  })

  // Also while the engagement stands somewhere else, once that stage has
  // nothing outstanding of its own.
  assert.deepEqual(
    reviewableAiStage("assessment", [
      run("assessment", "reviewed"),
      run("analysis", "pending"),
    ]),
    { stage: "analysis", pending: true },
  )
})

test("the stage the consultant is standing in comes first", () => {
  // Both are pending: the action names the stage whose work is in front of
  // them, and the analysis run stays pending until it is reviewed in turn.
  assert.deepEqual(
    reviewableAiStage("roadmap", [
      run("analysis", "pending"),
      run("roadmap", "pending"),
    ]),
    { stage: "roadmap", pending: true },
  )
})

test("no review is pending when analysis has already been reviewed", () => {
  assert.deepEqual(
    reviewableAiStage("discovery", [
      run("analysis", "reviewed"),
      run("analysis", "not_required"),
    ]),
    { stage: null, pending: false },
  )

  // Nothing at all to review, and nothing to offer an action for: Discovery has
  // no AI stage of its own.
  assert.deepEqual(reviewableAiStage("discovery", []), {
    stage: null,
    pending: false,
  })
})

test("a stage with no pending run resolves, but as not pending", () => {
  // The panel still shows the resolved stage so a consultant sees "nothing is
  // waiting" rather than seeing nothing; the action itself stays disabled.
  assert.deepEqual(
    reviewableAiStage("report", [run("report", "reviewed")]),
    { stage: "report", pending: false },
  )
})

test("another stage's pending run never makes this stage reviewable", () => {
  // Reviewing is stage-scoped end to end: a pending Assessment run does not
  // offer the report stage for review, and the server marks only the stage the
  // request names.
  assert.deepEqual(
    reviewableAiStage("report", [run("assessment", "pending")]),
    { stage: "report", pending: false },
  )
})

test("only the five engagement stages map to themselves", () => {
  assert.equal(aiStageForEngagementStage("discovery"), null)
  assert.equal(aiStageForEngagementStage("assessment"), "assessment")
  assert.equal(aiStageForEngagementStage("prioritization"), "prioritization")
  assert.equal(aiStageForEngagementStage("solution_matching"), "solution_matching")
  assert.equal(aiStageForEngagementStage("roadmap"), "roadmap")
  assert.equal(aiStageForEngagementStage("report"), "report")
})

test("reviewing analysis posts to the one review endpoint, naming that stage", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []

  const outcome = await submitAiOutputReview({
    apiBaseUrl: "http://api.test",
    engagementId: "eng_1",
    stage: "analysis",
    fetchImpl: (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: true,
        json: async () => ({
          status: true,
          message: "compliance.message.ai_output_reviewed",
        }),
      }
    }) as unknown as typeof fetch,
  })

  assert.equal(calls.length, 1)
  assert.equal(
    calls[0]?.url,
    "http://api.test/engagements/eng_1/ai-output-review",
  )
  assert.equal(calls[0]?.init?.method, "POST")
  // The stage is in the request, so the server marks that stage's runs and no
  // other. There is no second review mechanism to reach.
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { stage: "analysis" })
  assert.equal(calls[0]?.init?.credentials, "include")

  assert.deepEqual(outcome, {
    reviewed: true,
    message: "compliance.message.ai_output_reviewed",
  })
})

test("a refused review is reported as refused, with the server's identifier", async () => {
  const outcome = await submitAiOutputReview({
    apiBaseUrl: "http://api.test",
    engagementId: "eng_1",
    stage: "analysis",
    fetchImpl: (async () => ({
      ok: false,
      json: async () => ({ status: false, message: "access.denied" }),
    })) as unknown as typeof fetch,
  })

  // Not reviewed, so the caller shows the refusal and does not refresh into a
  // state it did not reach.
  assert.deepEqual(outcome, { reviewed: false, message: "access.denied" })
})

test("a reviewed analysis stage stops being pending once the server says so", () => {
  // What the page re-reads after a successful review: the same runs, now
  // `reviewed`. This is the server-derived refresh — the badge clears because
  // the server's answer changed, not because the browser decided it had.
  const before = [run("analysis", "pending")]
  const after = [run("analysis", "reviewed")]

  assert.equal(reviewableAiStage("discovery", before).pending, true)
  assert.equal(reviewableAiStage("discovery", after).pending, false)
})
