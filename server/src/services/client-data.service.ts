import { createHash } from "node:crypto"

import { canEraseClientData } from "../domain/compliance/compliance.js"
import {
  deleteEngagementPermanently,
  minimizeAuditEntriesForEngagement,
  readEngagementForExport,
} from "../repositories/compliance.repository.js"
import {
  getCompliancePolicy,
  recordComplianceEvent,
} from "./compliance.service.js"

import type { EngagementScope } from "../domain/access/access.js"

// The GDPR rights the roadmap requires of Phase 10: "complete client-data
// export and permanent deletion in accordance with configured retention and
// legal obligations".
//
// Both act on one **Engagement**, because that is where a client's data lives:
// the engagement aggregate owns the discovery the client provided, every
// version derived from it, the documents published to them, their feedback, and
// the AI assistance behind all of it. Nothing client-specific lives outside an
// engagement (architecture.md §4.2), so an engagement is a complete answer.

export type ExportClientDataFailure = "not_found" | "export_not_permitted"

export type ExportClientDataResult =
  | { success: true; export: ClientDataExport }
  | { success: false; failure: ExportClientDataFailure }

export type ClientDataExport = {
  exportedAt: string
  engagementId: string
  // The record itself, as stored, with database-specific types rendered as
  // plain JSON. Content is exported **as written**: a data subject is entitled
  // to what was actually held about them, not to a summary of it.
  engagement: unknown
}

export const exportClientData = async (
  engagementId: string,
  scope: EngagementScope,
  actingUserId: string,
): Promise<ExportClientDataResult> => {
  const policy = await getCompliancePolicy({ workspaceId: scope.workspaceId })

  // An administrator may switch export off for the whole workspace — a data
  // handling rule of the Compliance Policy, enforced here rather than assumed.
  if (!policy.clientDataExportPermitted) {
    return { success: false, failure: "export_not_permitted" }
  }

  const engagement = await readEngagementForExport(engagementId, scope)
  if (engagement === null) return { success: false, failure: "not_found" }

  await recordComplianceEvent({
    workspaceId: scope.workspaceId,
    userId: actingUserId,
    engagementId,
    eventType: "client_data_exported",
    payload: {
      organizationId: engagement.organizationId,
      dataClassification: engagement.dataClassification,
    },
  })

  return {
    success: true,
    export: {
      exportedAt: new Date().toISOString(),
      engagementId,
      engagement: toJsonSafe(engagement),
    },
  }
}

export type EraseClientDataFailure =
  | "not_found"
  | "legal_hold_active"
  | "confirmation_mismatch"

export type EraseClientDataResult =
  | { success: true }
  | { success: false; failure: EraseClientDataFailure }

// Permanently delete one engagement's client data.
//
// The right to erasure is not absolute: a legal obligation to keep a record
// outranks it, and a **legal hold** is how that obligation is recorded on an
// engagement. A configured retention period does *not* block erasure — it says
// how long data is kept by default, not how long it must be kept.
//
// The append-only Audit Trail survives the deletion: its rows reference the
// engagement with ON DELETE SET NULL, and the erasure appends an entry naming
// the erased engagement in its payload. A log that could be emptied by deleting
// what it accounts for would account for nothing (architecture.md §7A.8).
export const eraseClientData = async (
  engagementId: string,
  scope: EngagementScope,
  actingUserId: string,
  request: {
    confirmEngagementId: string
    reasonCode: "client_request" | "retention_follow_up" | "admin_correction"
    administrativeNote?: string
  },
): Promise<EraseClientDataResult> => {
  if (request.confirmEngagementId !== engagementId) {
    return { success: false, failure: "confirmation_mismatch" }
  }

  const engagement = await readEngagementForExport(engagementId, scope)
  if (engagement === null) return { success: false, failure: "not_found" }

  if (!canEraseClientData(engagement)) {
    return { success: false, failure: "legal_hold_active" }
  }

  const minimizedAuditEntries = await minimizeAuditEntriesForEngagement(
    engagementId,
    { workspaceId: scope.workspaceId },
  )

  await recordComplianceEvent({
    workspaceId: scope.workspaceId,
    userId: actingUserId,
    engagementId,
    eventType: "audit_entries_minimized",
    payload: {
      auditEntryCount: minimizedAuditEntries,
      reasonCode: request.reasonCode,
    },
  })

  // Written *before* the deletion, so the entry exists even if the delete then
  // fails: an account of an attempted erasure is worth having, and an erasure
  // that happened without one would not be. The payload contains only
  // governance metadata, pseudonymous references, and the safe reason code;
  // arbitrary free text is never copied into the surviving Audit Trail.
  await recordComplianceEvent({
    workspaceId: scope.workspaceId,
    userId: actingUserId,
    engagementId,
    eventType: "client_data_erased",
    payload: {
      erasedEngagementRef: pseudonymousRef(scope.workspaceId, engagementId),
      organizationRef: pseudonymousRef(
        scope.workspaceId,
        engagement.organizationId,
      ),
      dataClassification: engagement.dataClassification,
      reportVersionCount: engagement.reportVersions.length,
      analysisRunCount: engagement.analysisRuns.length,
      reasonCode: request.reasonCode,
      administrativeNoteRecorded: Boolean(request.administrativeNote?.trim()),
    },
  })

  const deleted = await deleteEngagementPermanently(engagementId, scope)
  if (!deleted) return { success: false, failure: "not_found" }

  return { success: true }
}

// Render database-specific values as plain JSON: Prisma `Decimal` objects, byte
// buffers, and dates would otherwise serialize as shapes no reader can use.
const toJsonSafe = (value: unknown): unknown => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    // Byte content is not exported inline: the rendered PDF is the report
    // content that is already exported as structured data above it, and a
    // megabyte of base64 in the middle of a record helps nobody read it.
    return `[${value.length} bytes]`
  }
  if (Array.isArray(value)) return value.map(toJsonSafe)

  if (typeof value === "object") {
    const record = value as Record<string, unknown>

    // Prisma's Decimal, and anything else that knows how to render itself as a
    // number-like string, is exported as that string rather than as its
    // internals.
    if (typeof record.toFixed === "function" && typeof record.d !== "undefined") {
      return String(value)
    }

    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [key, toJsonSafe(entry)]),
    )
  }

  return value
}

const pseudonymousRef = (workspaceId: string, id: string): string =>
  createHash("sha256").update(`${workspaceId}:${id}`).digest("hex").slice(0, 16)
