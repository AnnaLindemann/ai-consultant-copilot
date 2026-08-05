// The scripts folder used to carry its own byte-identical copy of the parser.
// Two copies of one business rule is one too many: hardening the shared
// implementation for the reasoning-model migration would have left this one
// behind, and a smoke-test script that parses differently from the stages it
// smoke-tests proves nothing about them (audit finding 2.4).
//
// Kept as a re-export rather than deleted, so any existing import keeps working
// and resolves to the one implementation.
export {
  LLM_JSON_ERRORS,
  parseLlmJson,
  type ParseLlmJsonOptions,
} from "../lib/parse-llm-json.js"
