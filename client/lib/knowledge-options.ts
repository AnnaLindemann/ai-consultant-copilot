import type {
  ConsultingKnowledgeKind,
  ConsultingKnowledgeStage,
} from "../../shared/consulting-knowledge.schema"

// The knowledge identifiers the curation surface offers, listed literally.
//
// Every client import from `shared/` is **type-only**: the shared modules sit
// outside the frontend's build root, so a value imported from one does not
// resolve at build time. The identifiers are therefore repeated here and held
// to the shared contract by `i18n/catalogue.test.ts`, which asserts these lists
// are exactly the schema's own options — so a kind added to the domain fails a
// test rather than quietly disappearing from the curator's dropdown.
//
// The types above are what keep the entries honest: a value that is not a
// `ConsultingKnowledgeKind` is a compile error.

export const KNOWLEDGE_KINDS: readonly ConsultingKnowledgeKind[] = [
  "business_domain",
  "business_process",
  "business_problem",
  "customer_operations_taxonomy",
  "discovery_question",
  "assessment_framework",
  "ai_readiness_criterion",
  "ai_use_case",
  "solution_pattern",
  "implementation_pattern",
  "roi_model",
  "risk_model",
  "best_practice",
  "follow_up_template",
]

export const KNOWLEDGE_STAGES: readonly ConsultingKnowledgeStage[] = [
  "discovery",
  "assessment",
  "prioritization",
  "solution_matching",
  "roadmap",
  "report",
]
