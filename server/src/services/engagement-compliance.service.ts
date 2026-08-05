import {
  createConsentRecord,
  findActiveConsentRecord,
  listConsentRecords,
  updateEngagementCompliance,
  updateEngagementPrivacyProcessing,
  withdrawConsentRecord,
} from "../repositories/compliance.repository.js"
import {
  getCompliancePolicy,
  recordComplianceEvent,
} from "./compliance.service.js"

import type {
  EngagementCompliance,
  EngagementConsentRecord,
  RecordEngagementConsent,
  UpdateEngagementCompliance,
  UpdateEngagementPrivacyProcessing,
} from "../../../shared/compliance.schema.js"
import type { Prisma } from "@prisma/client"
import type { EngagementScope } from "../domain/access/access.js"
import type { EngagementWithOrganization } from "../repositories/engagement.repository.js"

// One engagement's compliance state: how its content is classified, whether AI
// may assist with it, what makes processing its personal data lawful, where its
// DPIA screening stands, and whether a legal hold prevents its erasure.
//
// The three questions are deliberately kept apart, because conflating them was
// the defect these corrections exist to fix:
//
//  - **AI processing permission** is the consulting team's internal decision
//    about using AI on this engagement. It is not consent.
//  - **The privacy-processing record** is what the personal data is processed
//    for and what makes that lawful. It is a human's determination and the
//    product never invents one.
//  - **A consent record** exists only where the determined basis genuinely is
//    consent, and it records a real subject agreeing to a real text.

// The engagement's compliance state as the API returns it, consent history
// included.
export const getEngagementCompliance = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
): Promise<EngagementCompliance> => {
  const consents = await listConsentRecords(engagement.id, scope)
  const history = consents.map(toConsentRecord)

  return {
    dataClassification: engagement.dataClassification,

    aiProcessingPermission: engagement.aiProcessingPermission,
    aiProcessingPermissionNotes: engagement.aiProcessingPermissionNotes,
    aiProcessingPermissionUpdatedAt:
      engagement.aiProcessingPermissionUpdatedAt?.toISOString() ?? null,
    aiProcessingPermissionUpdatedByUserId:
      engagement.aiProcessingPermissionUpdatedByUserId,

    privacyProcessing: {
      processingPurpose: engagement.processingPurpose,
      legalBasis: engagement.legalBasis,
      legalBasisNote: engagement.legalBasisNote,
      confirmedAt: engagement.privacyProcessingConfirmedAt?.toISOString() ?? null,
      confirmedByUserId: engagement.privacyProcessingConfirmedByUserId,
    },
    activeConsent: history.find((record) => record.withdrawnAt === null) ?? null,
    consentHistory: history,

    dpiaScreening: engagement.dpiaScreening,
    dpiaScreeningNote: engagement.dpiaScreeningNote,

    legalHold: engagement.legalHold,
    legalHoldReason: engagement.legalHoldReason,
  }
}

// --- Classification, AI permission, DPIA screening, legal hold -------------

export type SaveEngagementComplianceResult =
  | { success: true }
  | { success: false; failure: "not_found" }

// Each kind of decision produces its own Audit Trail entry, because they are
// different decisions: how the content is classified, whether AI may assist,
// where the DPIA screening stands, and whether the record may be erased at all.
export const saveEngagementCompliance = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  actingUserId: string,
  update: UpdateEngagementCompliance,
): Promise<SaveEngagementComplianceResult> => {
  const saved = await updateEngagementCompliance(
    engagement.id,
    scope,
    update,
    actingUserId,
  )
  if (!saved) return { success: false, failure: "not_found" }

  const audit = (
    eventType: Parameters<typeof recordComplianceEvent>[0]["eventType"],
    payload: Record<string, unknown>,
  ) =>
    recordComplianceEvent({
      workspaceId: scope.workspaceId,
      userId: actingUserId,
      engagementId: engagement.id,
      eventType,
      payload: payload as Prisma.InputJsonValue,
    })

  if (
    update.dataClassification !== undefined &&
    update.dataClassification !== engagement.dataClassification
  ) {
    await audit("engagement_classification_changed", {
      from: engagement.dataClassification,
      to: update.dataClassification,
    })
  }

  if (
    update.aiProcessingPermission !== undefined &&
    update.aiProcessingPermission !== engagement.aiProcessingPermission
  ) {
    await audit("engagement_ai_processing_permission_changed", {
      from: engagement.aiProcessingPermission,
      to: update.aiProcessingPermission,
    })
  }

  if (
    update.dpiaScreening !== undefined &&
    update.dpiaScreening !== engagement.dpiaScreening
  ) {
    await audit("engagement_dpia_screening_changed", {
      from: engagement.dpiaScreening,
      to: update.dpiaScreening,
    })
  }

  if (
    update.legalHold !== undefined &&
    update.legalHold !== engagement.legalHold
  ) {
    await audit("engagement_legal_hold_changed", { legalHold: update.legalHold })
  }

  return { success: true }
}

// --- The privacy-processing record -----------------------------------------

export type SavePrivacyProcessingFailure =
  | "not_found"
  | "legal_basis_not_supported"

export type SavePrivacyProcessingResult =
  | { success: true }
  | { success: false; failure: SavePrivacyProcessingFailure }

// Record what this engagement's personal data is processed for, and what makes
// that lawful.
//
// The workspace may declare which bases it supports, and a basis outside that
// list is refused — but the *effective* purpose and basis are always this
// engagement's own. A workspace default is a starting point for a new
// engagement, never a determination inherited silently by an existing one.
export const savePrivacyProcessing = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  actingUserId: string,
  update: UpdateEngagementPrivacyProcessing,
): Promise<SavePrivacyProcessingResult> => {
  if (update.legalBasis !== undefined) {
    const policy = await getCompliancePolicy({ workspaceId: scope.workspaceId })
    if (!policy.supportedLegalBases.includes(update.legalBasis)) {
      return { success: false, failure: "legal_basis_not_supported" }
    }
  }

  const saved = await updateEngagementPrivacyProcessing(
    engagement.id,
    scope,
    update,
    actingUserId,
  )
  if (!saved) return { success: false, failure: "not_found" }

  await recordComplianceEvent({
    workspaceId: scope.workspaceId,
    userId: actingUserId,
    engagementId: engagement.id,
    eventType: "engagement_privacy_processing_updated",
    payload: {
      // The basis and whether a purpose is now stated. The purpose text itself
      // stays out of the log: it is the consultant's description of what is
      // done with a client's data, which is exactly the content the Audit Trail
      // does not carry.
      legalBasisFrom: engagement.legalBasis,
      legalBasisTo: update.legalBasis ?? engagement.legalBasis,
      purposeRecorded:
        update.processingPurpose !== undefined
          ? update.processingPurpose !== null &&
            update.processingPurpose.trim().length > 0
          : engagement.processingPurpose !== null,
    },
  })

  return { success: true }
}

// --- Real GDPR consent ------------------------------------------------------

export type RecordConsentFailure =
  | "not_found"
  | "consent_requires_consent_basis"

export type RecordConsentResult =
  | { success: true; consent: EngagementConsentRecord }
  | { success: false; failure: RecordConsentFailure }

// Take a consent record for this engagement.
//
// Only where the determined legal basis is `consent`. Recording one under any
// other basis would be the false claim this separation exists to prevent: a
// signature collected "just in case" is not the basis the processing rests on,
// and storing it as though it were would misrepresent both.
//
// A new record supersedes nothing automatically. The most recent record that
// has not been withdrawn is the one in force, and every earlier one stays as
// the account of what was lawful before it.
export const recordEngagementConsent = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  actingUserId: string,
  input: RecordEngagementConsent,
): Promise<RecordConsentResult> => {
  if (engagement.legalBasis !== "consent") {
    return { success: false, failure: "consent_requires_consent_basis" }
  }

  const created = await createConsentRecord(
    { workspaceId: scope.workspaceId },
    {
      engagementId: engagement.id,
      consentText: input.consentText,
      consentTextVersion: input.consentTextVersion,
      processingPurpose: input.processingPurpose,
      subjectName: input.subjectName,
      subjectRole: input.subjectRole ?? null,
      subjectOrganization: input.subjectOrganization ?? null,
      privacyNoticeVersion: input.privacyNoticeVersion ?? null,
      recordedByUserId: actingUserId,
    },
  )

  await recordComplianceEvent({
    workspaceId: scope.workspaceId,
    userId: actingUserId,
    engagementId: engagement.id,
    eventType: "engagement_consent_recorded",
    payload: {
      // The consent's identity and version — never the subject's name or the
      // consent text, which are the personal data the record itself holds.
      consentId: created.id,
      consentTextVersion: created.consentTextVersion,
      privacyNoticeVersion: created.privacyNoticeVersion,
    },
  })

  return { success: true, consent: toConsentRecord(created) }
}

export type WithdrawConsentFailure = "not_found" | "consent_already_withdrawn"

export type WithdrawConsentResult =
  | { success: true }
  | { success: false; failure: WithdrawConsentFailure }

// Withdraw a consent.
//
// Withdrawal is prospective: the record stays, and what was lawful while the
// consent stood remains lawful. What it prevents is *future* AI processing that
// depends on it — the compliance gate refuses the moment there is no consent in
// force, which is why withdrawal needs no cascade of its own.
export const withdrawEngagementConsent = async (
  engagement: EngagementWithOrganization,
  scope: EngagementScope,
  actingUserId: string,
  input: { consentId: string; withdrawalNote?: string },
): Promise<WithdrawConsentResult> => {
  const records = await listConsentRecords(engagement.id, scope)
  const target = records.find((record) => record.id === input.consentId)

  if (target === undefined) return { success: false, failure: "not_found" }
  if (target.withdrawnAt !== null) {
    return { success: false, failure: "consent_already_withdrawn" }
  }

  const withdrawn = await withdrawConsentRecord(
    input.consentId,
    engagement.id,
    { workspaceId: scope.workspaceId },
    {
      withdrawnByUserId: actingUserId,
      withdrawalNote: input.withdrawalNote ?? null,
    },
  )

  // Lost the race with another withdrawal. The first one stands, and its time
  // and author are not overwritten.
  if (!withdrawn) return { success: false, failure: "consent_already_withdrawn" }

  await recordComplianceEvent({
    workspaceId: scope.workspaceId,
    userId: actingUserId,
    engagementId: engagement.id,
    eventType: "engagement_consent_withdrawn",
    payload: {
      consentId: input.consentId,
      consentTextVersion: target.consentTextVersion,
    },
  })

  return { success: true }
}

// The consent in force for one engagement, as the AI compliance gate needs it.
export const activeConsentFacts = async (
  engagementId: string,
  scope: EngagementScope,
): Promise<{ withdrawn: boolean } | null> => {
  const active = await findActiveConsentRecord(engagementId, {
    workspaceId: scope.workspaceId,
  })

  if (active !== null) return { withdrawn: false }

  // Nothing in force. Whether that is because none was ever taken or because
  // the last one was withdrawn changes what the consultant is told, so the
  // distinction is preserved by looking for any record at all.
  const records = await listConsentRecords(engagementId, {
    workspaceId: scope.workspaceId,
  })

  return records.length === 0 ? null : { withdrawn: true }
}

type ConsentRow = {
  id: string
  consentText: string
  consentTextVersion: string
  processingPurpose: string
  subjectName: string
  subjectRole: string | null
  subjectOrganization: string | null
  privacyNoticeVersion: string | null
  grantedAt: Date
  recordedByUserId: string | null
  withdrawnAt: Date | null
  withdrawnByUserId: string | null
  withdrawalNote: string | null
}

const toConsentRecord = (row: ConsentRow): EngagementConsentRecord => ({
  id: row.id,
  consentText: row.consentText,
  consentTextVersion: row.consentTextVersion,
  processingPurpose: row.processingPurpose,
  subjectName: row.subjectName,
  subjectRole: row.subjectRole,
  subjectOrganization: row.subjectOrganization,
  privacyNoticeVersion: row.privacyNoticeVersion,
  grantedAt: row.grantedAt.toISOString(),
  recordedByUserId: row.recordedByUserId,
  withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
  withdrawnByUserId: row.withdrawnByUserId,
  withdrawalNote: row.withdrawalNote,
})
