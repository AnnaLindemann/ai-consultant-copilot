import type {
  DocumentPublicationSummary,
  ReportPublicationRecipient,
  ReportVersionDetail,
} from "../../shared/consultant-report.schema"
import type { MessageKey } from "../i18n/de"

export type PublishDialogInput = {
  version: ReportVersionDetail | null
  stale: boolean
  recipient: ReportPublicationRecipient | null
  title: string
}

export type PublishDialogValidation =
  | { valid: true }
  | { valid: false; messageKey: MessageKey }

export const canOpenPublishDialog = ({
  version,
  stale,
  recipient,
}: Omit<PublishDialogInput, "title">): boolean =>
  version?.reviewState === "approved" &&
  version.status === "active" &&
  !stale &&
  recipient !== null

export const reportSaveActionPayload = ({
  version,
  expectedRevision,
  reviewState,
}: {
  version: ReportVersionDetail
  expectedRevision?: number
  reviewState: "draft" | "manager_review"
}) => ({
  versionId: version.id,
  expectedRevision: expectedRevision ?? version.revision,
  reviewState,
})

export const canApproveReportVersion = ({
  version,
  stale,
  complete,
  saving,
  readOnly,
}: {
  version: ReportVersionDetail | null
  stale: boolean
  complete: boolean
  saving: boolean
  readOnly: boolean
}): boolean =>
  version?.reviewState === "manager_review" &&
  version.status === "active" &&
  !stale &&
  complete &&
  !saving &&
  !readOnly

export const validatePublishDialog = ({
  version,
  stale,
  recipient,
  title,
}: PublishDialogInput): PublishDialogValidation => {
  if (version?.reviewState !== "approved" || version.status !== "active") {
    return { valid: false, messageKey: "report.publish.error.not_approved" }
  }
  if (stale) return { valid: false, messageKey: "report.publish.error.stale" }
  if (!recipient) {
    return { valid: false, messageKey: "report.publish.error.no_client" }
  }
  if (title.trim().length === 0) {
    return { valid: false, messageKey: "report.publish.title_required" }
  }

  return { valid: true }
}

export const notificationOutcomeKey = (
  publication: DocumentPublicationSummary | null,
): MessageKey => {
  const latest = publication?.notificationAttempts.at(-1)
  if (!latest) return "report.publication.email_not_sent"
  if (latest.outcome === "sent") return "report.publication.email_sent"
  if (latest.outcome === "pending") return "report.publication.email_pending"
  return "report.publication.email_failed"
}
