import type { AiAssistedStage } from "../../shared/compliance.schema"
import type { EngagementStage } from "./engagement-stage"

// Which AI-assisted stage an authorized Manager or Administrator may mark as
// reviewed right now, and whether anything is actually waiting (roadmap Phase
// 10).
//
// The answer comes from the **runs the server returned**, never from what the
// browser thinks it did a moment ago: `humanReviewStatus` on an Analysis Run is
// the same value the accept paths check server-side, so the panel and the
// server cannot disagree about what is pending.
//
// **Why `analysis` needs its own answer.** Five AI stages correspond to an
// engagement stage, so "the stage the engagement stands at" names them. The
// `analysis` stage does not: it is run from the engagement's analysis panel at
// any point and has no engagement stage and no trusted transition of its own.
// Left out of this mapping it became unreachable — its runs stayed `pending`
// forever, with no action anywhere in the product to clear them, and the
// Compliance Dashboard's "awaiting review" figure could only ever grow. So it
// is offered here when, and only when, one of its runs is pending.
//
// The precedence is the consultant's attention, not an ordering of importance:
// the stage they are standing in comes first, and `analysis` is offered when
// that stage has nothing outstanding. Reviewing one stage never touches
// another — the request names its stage and the server marks only that stage's
// runs.

export type AiOutputReviewRun = {
  stage: string
  humanReviewStatus: string | null
}

export type AiOutputReviewTarget = {
  // The stage the review action would name, or `null` when there is nothing to
  // offer an action for at all.
  stage: AiAssistedStage | null
  // Whether that stage has an unreviewed run. The action is disabled without
  // one; the panel still shows the resolved state so a consultant can see that
  // nothing is waiting rather than seeing nothing.
  pending: boolean
}

// The AI-assisted stage an engagement stage corresponds to. `discovery` has no
// AI stage, and `analysis` is not an engagement stage — that is exactly why it
// needs the fallback above.
export const aiStageForEngagementStage = (
  stage: EngagementStage,
): AiAssistedStage | null => {
  switch (stage) {
    case "assessment":
    case "prioritization":
    case "solution_matching":
    case "roadmap":
    case "report":
      return stage
    case "discovery":
      return null
  }
}

const hasPendingRun = (
  runs: readonly AiOutputReviewRun[],
  stage: AiAssistedStage,
): boolean =>
  runs.some((run) => run.stage === stage && run.humanReviewStatus === "pending")

export const reviewableAiStage = (
  engagementStage: EngagementStage,
  runs: readonly AiOutputReviewRun[],
): AiOutputReviewTarget => {
  const currentStage = aiStageForEngagementStage(engagementStage)

  if (currentStage !== null && hasPendingRun(runs, currentStage)) {
    return { stage: currentStage, pending: true }
  }

  // Nothing outstanding where the consultant is standing, so an unreviewed
  // analysis run is the one that still needs a human. During Discovery this is
  // the only stage that can have one.
  if (hasPendingRun(runs, "analysis")) {
    return { stage: "analysis", pending: true }
  }

  return { stage: currentStage, pending: false }
}

export type SubmitAiOutputReviewInput = {
  apiBaseUrl: string
  engagementId: string
  stage: AiAssistedStage
  // Injected so the request itself is testable without a browser, and so the
  // panel keeps passing the real `fetch` with its credentials.
  fetchImpl: typeof fetch
}

export type AiOutputReviewOutcome =
  | { reviewed: true; message?: string }
  | { reviewed: false; message?: string }

// Record the human review of one stage's AI output.
//
// It posts to the one review endpoint that exists and names its stage; there is
// no second mechanism, and no stage clears another's runs. The caller refreshes
// from the server on success rather than editing local state, because the
// pending flag is the server's answer and a locally-cleared badge would be a
// guess that outlives the truth.
export const submitAiOutputReview = async (
  input: SubmitAiOutputReviewInput,
): Promise<AiOutputReviewOutcome> => {
  const response = await input.fetchImpl(
    `${input.apiBaseUrl}/engagements/${input.engagementId}/ai-output-review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ stage: input.stage }),
    },
  )

  const result = (await response.json()) as { message?: string }

  return response.ok
    ? { reviewed: true, message: result.message }
    : { reviewed: false, message: result.message }
}
