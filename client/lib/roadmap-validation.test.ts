import assert from "node:assert/strict"
import { test } from "node:test"

import { roadmapValidationMessages } from "./roadmap-validation.ts"

test("roadmap validation maps disposition errors to consultant-visible German messages", () => {
  const messages = roadmapValidationMessages({
    missingRecommendationIds: ["rec_missing"],
    unknownRecommendationIds: ["rec_unknown"],
    dispositionErrors: [
      "included_recommendation_not_linked",
      "recommendation_included_and_deferred",
      "deferred_recommendation_missing_rationale",
      "duplicate_recommendation_disposition",
      "linked_recommendation_without_disposition",
    ],
  })

  assert.deepEqual(messages, [
    "Eine angenommene Empfehlung hat keine Entscheidung.",
    "Die Roadmap verweist auf eine unbekannte oder nicht zulässige Empfehlung.",
    "Eine enthaltene Empfehlung ist mit keiner Roadmap-Phase verknüpft.",
    "Eine zurückgestellte Empfehlung ist trotzdem mit einer Roadmap-Phase verknüpft.",
    "Eine zurückgestellte Empfehlung hat keine Begründung.",
    "Eine Empfehlung hat mehr als eine Entscheidung.",
    "Eine verknüpfte Empfehlung hat keine Entscheidung.",
  ])
})

test("roadmap validation keeps dependency and grounding details intact", () => {
  const messages = roadmapValidationMessages({
    unknownImplementationPatternCodes: ["pattern_missing"],
    nonImplementationPatternCodes: ["risk_model"],
    dependencyErrors: [
      "duplicate_dependency",
      "unknown_dependency",
      "self_dependency",
      "dependency_not_earlier",
      "dependency_cycle",
    ],
  })

  assert.deepEqual(messages, [
    "Die Roadmap verweist auf ein unbekanntes Implementation Pattern.",
    "Die Roadmap verweist auf einen Knowledge-Base-Eintrag, der kein Implementation Pattern ist.",
    "Eine Phase enthält dieselbe Abhängigkeit mehrfach.",
    "Eine Phase verweist auf eine unbekannte Abhängigkeit.",
    "Eine Phase darf nicht von sich selbst abhängen.",
    "Eine Phase darf nur von früheren Phasen abhängen.",
    "Die Roadmap enthält einen Abhängigkeits-Zyklus.",
  ])
})
