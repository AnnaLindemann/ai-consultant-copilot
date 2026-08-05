import assert from "node:assert/strict"
import { test } from "node:test"

import {
  canEraseClientData,
  carriesPersonalData,
  decideAiProcessing,
  defaultCompliancePolicy,
  isAiRestricted,
  isConfidential,
  isPastRetention,
  isPiiRedactionRequired,
  outputClassificationFor,
  retentionDueAt,
  strongerClassification,
} from "./compliance.js"

import type {
  AiProcessingDecision,
  AiProcessingRequest,
} from "./compliance.js"
import type {
  CompliancePolicy,
  WorkspaceAiModelApproval,
} from "../../../../shared/compliance.schema.js"

const policy = (overrides: Partial<CompliancePolicy> = {}): CompliancePolicy => ({
  ...defaultCompliancePolicy(),
  ...overrides,
})

const approved: Pick<WorkspaceAiModelApproval, "status"> = {
  status: "approved",
}

const request = (
  overrides: Partial<AiProcessingRequest> = {},
): AiProcessingRequest => ({
  inputClassification: "internal",
  permission: "allowed",
  privacy: {
    processingPurpose: null,
    legalBasis: "not_assessed",
    activeConsent: null,
  },
  dpiaScreening: "not_assessed",
  workspaceDpiaStatus: "not_started",
  approval: approved,
  ...overrides,
})

const denied = (decision: AiProcessingDecision) => {
  assert.equal(decision.permitted, false)
  return decision
}

test("classification questions are answered from the classification alone", () => {
  assert.equal(isConfidential("public"), false)
  assert.equal(isConfidential("internal"), false)
  assert.equal(isConfidential("confidential"), true)
  assert.equal(isConfidential("personal_data"), true)
  assert.equal(isConfidential("strictly_confidential"), true)
  assert.equal(isConfidential("ai_restricted"), true)

  assert.equal(isAiRestricted("ai_restricted"), true)
  assert.equal(isAiRestricted("strictly_confidential"), false)

  assert.equal(carriesPersonalData("personal_data"), true)
  assert.equal(carriesPersonalData("confidential"), false)
  assert.equal(carriesPersonalData("strictly_confidential"), true)

  assert.equal(strongerClassification("internal", "confidential"), "confidential")
  assert.equal(strongerClassification("ai_restricted", "public"), "ai_restricted")
  assert.equal(strongerClassification("internal", "internal"), "internal")
})

test("an engagement that prohibits AI is refused whatever the policy permits", () => {
  assert.deepEqual(
    decideAiProcessing(policy(), request({ permission: "prohibited" })),
    {
      permitted: false,
      reason: "engagement_ai_processing_prohibited",
    },
  )
})

test("AI-restricted content is refused before any policy switch is consulted", () => {
  assert.deepEqual(
    decideAiProcessing(policy(), request({ inputClassification: "ai_restricted" })),
    { permitted: false, reason: "content_ai_restricted" },
  )
})

test("a workspace that has switched AI off refuses every request", () => {
  assert.deepEqual(
    decideAiProcessing(policy({ aiProcessingPermitted: false }), request()),
    { permitted: false, reason: "workspace_ai_processing_disabled" },
  )
})

test("restricted AI permission permits non-confidential material and refuses the rest", () => {
  const permitted = decideAiProcessing(
    policy(),
    request({ permission: "restricted", inputClassification: "internal" }),
  )
  assert.equal(permitted.permitted, true)

  assert.deepEqual(
    decideAiProcessing(
      policy(),
      request({ permission: "restricted", inputClassification: "confidential" }),
    ),
    {
      permitted: false,
      reason: "engagement_ai_processing_restricted_classification",
    },
  )
})

test("personal data needs an engagement purpose and assessed legal basis", () => {
  assert.deepEqual(
    decideAiProcessing(
      policy(),
      request({ inputClassification: "personal_data" }),
    ),
    { permitted: false, reason: "processing_purpose_not_recorded" },
  )

  assert.deepEqual(
    decideAiProcessing(
      policy(),
      request({
        inputClassification: "personal_data",
        privacy: {
          processingPurpose: "Engagement analysis",
          legalBasis: "not_assessed",
          activeConsent: null,
        },
      }),
    ),
    { permitted: false, reason: "legal_basis_not_assessed" },
  )
})

test("strictly confidential content follows the personal-data gates", () => {
  assert.deepEqual(
    decideAiProcessing(
      policy(),
      request({ inputClassification: "strictly_confidential" }),
    ),
    { permitted: false, reason: "processing_purpose_not_recorded" },
  )

  assert.deepEqual(
    decideAiProcessing(
      policy(),
      request({
        inputClassification: "strictly_confidential",
        privacy: {
          processingPurpose: "Engagement analysis",
          legalBasis: "contract",
          activeConsent: null,
        },
        dpiaScreening: "not_assessed",
      }),
    ),
    { permitted: false, reason: "dpia_not_screened" },
  )
})

test("consent basis requires a real active consent record", () => {
  const consentPrivacy = {
    processingPurpose: "Engagement analysis",
    legalBasis: "consent" as const,
    activeConsent: null,
  }

  assert.deepEqual(
    decideAiProcessing(
      policy(),
      request({ inputClassification: "personal_data", privacy: consentPrivacy }),
    ),
    { permitted: false, reason: "consent_record_missing" },
  )

  assert.deepEqual(
    decideAiProcessing(
      policy(),
      request({
        inputClassification: "personal_data",
        privacy: {
          ...consentPrivacy,
          activeConsent: { withdrawn: true },
        },
      }),
    ),
    { permitted: false, reason: "consent_withdrawn" },
  )
})

test("DPIA screening blocks personal-data processing until approved where required", () => {
  const privacy = {
    processingPurpose: "Engagement analysis",
    legalBasis: "contract" as const,
    activeConsent: null,
  }

  assert.deepEqual(
    decideAiProcessing(
      policy(),
      request({ inputClassification: "personal_data", privacy }),
    ),
    { permitted: false, reason: "dpia_not_screened" },
  )

  assert.deepEqual(
    decideAiProcessing(
      policy(),
      request({
        inputClassification: "personal_data",
        privacy,
        dpiaScreening: "additional_required",
      }),
    ),
    { permitted: false, reason: "dpia_required_not_completed" },
  )

  assert.deepEqual(
    decideAiProcessing(
      policy(),
      request({
        inputClassification: "personal_data",
        privacy,
        dpiaScreening: "within_standard_dpia",
        workspaceDpiaStatus: "in_progress",
      }),
    ),
    { permitted: false, reason: "workspace_dpia_not_approved" },
  )
})

test("governed provider/model approval is deny-by-default", () => {
  assert.deepEqual(
    decideAiProcessing(policy(), request({ approval: null })),
    { permitted: false, reason: "provider_model_not_approved" },
  )
  assert.deepEqual(
    decideAiProcessing(policy(), request({ approval: { status: "needs_review" } })),
    { permitted: false, reason: "provider_model_approval_needs_review" },
  )
  assert.deepEqual(
    decideAiProcessing(policy(), request({ approval: { status: "revoked" } })),
    { permitted: false, reason: "provider_model_approval_revoked" },
  )
})

test("PII redaction is required on any of its three independent grounds", () => {
  const off = policy({ redactPersonalDataBeforeAi: false })

  assert.equal(
    isPiiRedactionRequired(off, {
      inputClassification: "internal",
      permission: "allowed",
    }),
    false,
  )
  assert.equal(
    isPiiRedactionRequired(policy({ redactPersonalDataBeforeAi: true }), {
      inputClassification: "internal",
      permission: "allowed",
    }),
    true,
  )
  assert.equal(
    isPiiRedactionRequired(off, {
      inputClassification: "personal_data",
      permission: "allowed",
    }),
    true,
  )
  assert.equal(
    isPiiRedactionRequired(off, {
      inputClassification: "strictly_confidential",
      permission: "allowed",
    }),
    true,
  )
  assert.equal(
    isPiiRedactionRequired(off, {
      inputClassification: "internal",
      permission: "restricted",
    }),
    true,
  )
})

test("a permitted decision carries redaction and review obligations", () => {
  const decision = decideAiProcessing(
    policy({
      redactPersonalDataBeforeAi: true,
      humanApprovalRequiredForAiOutput: true,
    }),
    request(),
  )

  assert.deepEqual(decision, {
    permitted: true,
    piiRedactionRequired: true,
    humanReviewRequired: true,
  })
})

test("output classification is based on the response scan, not redaction alone", () => {
  assert.equal(
    outputClassificationFor({
      inputClassification: "personal_data",
      piiRedactionApplied: true,
      outputScan: "clean",
    }),
    "confidential",
  )
  assert.equal(
    outputClassificationFor({
      inputClassification: "personal_data",
      piiRedactionApplied: true,
      outputScan: "not_scanned",
    }),
    "personal_data",
  )
  assert.equal(
    outputClassificationFor({
      inputClassification: "internal",
      piiRedactionApplied: true,
      outputScan: "personal_data_detected",
    }),
    "personal_data",
  )
  assert.equal(
    outputClassificationFor({
      inputClassification: "strictly_confidential",
      piiRedactionApplied: true,
      outputScan: "personal_data_detected",
    }),
    "strictly_confidential",
  )
})

test("a legal hold blocks erasure and nothing else does", () => {
  assert.equal(canEraseClientData({ legalHold: false }), true)
  assert.equal(canEraseClientData({ legalHold: true }), false)
})

test("retention has no due date when nothing was configured", () => {
  const created = new Date("2026-01-01T00:00:00.000Z")

  assert.equal(retentionDueAt(created, null), null)
  assert.equal(
    isPastRetention(created, null, new Date("2099-01-01T00:00:00.000Z")),
    false,
  )
  assert.deepEqual(
    retentionDueAt(created, 30),
    new Date("2026-01-31T00:00:00.000Z"),
  )
  assert.equal(
    isPastRetention(created, 30, new Date("2026-01-30T00:00:00.000Z")),
    false,
  )
  assert.equal(
    isPastRetention(created, 30, new Date("2026-01-31T00:00:00.000Z")),
    true,
  )
})

test("the default policy classifies honestly without inventing legal approval", () => {
  const seeded = defaultCompliancePolicy()

  assert.equal(seeded.defaultDataClassification, "confidential")
  assert.equal(seeded.redactPersonalDataBeforeAi, true)
  assert.equal(seeded.humanApprovalRequiredForAiOutput, true)
  assert.equal(seeded.defaultLegalBasis, "not_assessed")

  const decision = denied(
    decideAiProcessing(seeded, request({ approval: { status: "needs_review" } })),
  )
  assert.equal(decision.reason, "provider_model_approval_needs_review")
})
