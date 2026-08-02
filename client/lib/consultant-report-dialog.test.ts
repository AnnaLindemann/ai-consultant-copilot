import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

import { de } from "../i18n/de.ts"
import {
  canOpenPublishDialog,
  canApproveReportVersion,
  notificationOutcomeKey,
  reportSaveActionPayload,
  validatePublishDialog,
} from "./consultant-report-dialog.ts"

import type {
  DocumentPublicationSummary,
  ReportPublicationRecipient,
  ReportVersionDetail,
} from "../../shared/consultant-report.schema.ts"

const recipient: ReportPublicationRecipient = {
  userId: "client_1",
  email: "client@example.com",
  displayName: "Client One",
}

test("publish dialog opens for an approved non-stale version with a Client recipient", () => {
  assert.equal(
    canOpenPublishDialog({
      version: version({ reviewState: "approved" }),
      stale: false,
      recipient,
    }),
    true,
  )
})

test("title and Manager message are represented by German catalogue-backed fields", () => {
  assert.equal(de["report.publish.title_label"], "Client-sichtbarer Titel")
  assert.equal(de["report.publish.message_label"], "Nachricht an den Client")
})

test("dialog cannot publish without required title, Client, or approved version data", () => {
  assert.deepEqual(
    validatePublishDialog({
      version: version({ reviewState: "approved" }),
      stale: false,
      recipient,
      title: " ",
    }),
    { valid: false, messageKey: "report.publish.title_required" },
  )
  assert.deepEqual(
    validatePublishDialog({
      version: version({ reviewState: "approved" }),
      stale: false,
      recipient: null,
      title: "Report",
    }),
    { valid: false, messageKey: "report.publish.error.no_client" },
  )
  assert.deepEqual(
    validatePublishDialog({
      version: version({ reviewState: "manager_review" }),
      stale: false,
      recipient,
      title: "Report",
    }),
    { valid: false, messageKey: "report.publish.error.not_approved" },
  )
})

test("approval remains separate from publication in ConsultantReportPanel source", () => {
  const source = panelSource()
  const approveBody = functionBody(source, "approve")
  const publishBody = functionBody(source, "publish")
  assert.match(approveBody, /\/approve`/)
  assert.doesNotMatch(approveBody, /\/publish`/)
  assert.match(publishBody, /\/publish`/)
  assert.doesNotMatch(publishBody, /\/approve`/)
})

test("publication success and notification failure use separate German outcomes", () => {
  assert.equal(de["report.message.published"], "Report im Client Portal veröffentlicht")
  assert.equal(
    notificationOutcomeKey(publication("failed")),
    "report.publication.email_failed",
  )
})

test("retry notification invokes only the notification retry path", () => {
  const source = panelSource()
  const retryBody = source.slice(source.indexOf("async function retryNotification"))
  assert.match(retryBody, /\/publication\/notify`/)
  assert.doesNotMatch(retryBody, /\/publish`/)
})

test("revoke opens a destructive confirmation dialog", () => {
  const source = panelSource()
  assert.match(source, /setRevokeDialogOpen\(true\)/)
  assert.match(source, /variant: "danger"/)
  assert.equal(de["report.revoke.primary"], "Veröffentlichung widerrufen")
})

test("revoke invokes the revoke endpoint and removes active Client visibility state", () => {
  const source = panelSource()
  assert.match(source, /\/publication\/revoke`/)
  assert.match(source, /activePublication: null/)
  assert.match(source, /publication: null/)
})

test("historical approved or published versions remain read-only", () => {
  const source = panelSource()
  assert.match(source, /activeVersion\.status === "superseded"/)
  assert.match(source, /activeVersion\.reviewState === "approved"/)
})

test("draft save, review submission and approval are separate report actions", () => {
  const draftPayload = reportSaveActionPayload({
    version: version({ reviewState: "draft" }),
    reviewState: "draft",
  })
  const submitPayload = reportSaveActionPayload({
    version: version({ reviewState: "draft" }),
    reviewState: "manager_review",
  })

  assert.equal(draftPayload.reviewState, "draft")
  assert.equal(submitPayload.reviewState, "manager_review")
  assert.equal(
    canApproveReportVersion({
      version: version({ reviewState: "draft" }),
      stale: false,
      complete: true,
      saving: false,
      readOnly: false,
    }),
    false,
  )
  assert.equal(
    canApproveReportVersion({
      version: version({ reviewState: "manager_review" }),
      stale: false,
      complete: true,
      saving: false,
      readOnly: false,
    }),
    true,
  )
})

test("stale report does not expose an enabled publish action", () => {
  assert.equal(
    canOpenPublishDialog({
      version: version({ reviewState: "approved" }),
      stale: true,
      recipient,
    }),
    false,
  )
})

test("keyboard-accessible dialog close and cancel behavior is implemented", () => {
  const source = readFileSync(
    path.join(clientDir(), "components", "AppDialog.tsx"),
    "utf8",
  )
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /event\.key === "Escape"/)
  assert.match(source, /event\.key !== "Tab"/)
})

test("German catalogue identifiers are used rather than hard-coded visible English", () => {
  const source = panelSource()
  assert.doesNotMatch(source, />Publish</)
  assert.doesNotMatch(source, />Cancel</)
  assert.doesNotMatch(source, />Revoke</)
  assert.equal(de["report.publish.primary"], "Bericht veröffentlichen")
})

const panelSource = () =>
  readFileSync(path.join(clientDir(), "components", "ConsultantReportPanel.tsx"), "utf8")

const clientDir = () => path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

const functionBody = (source: string, name: string): string => {
  const start = source.indexOf(`async function ${name}()`)
  assert.notEqual(start, -1)
  const next = source.indexOf("\n  async function", start + 1)
  return next === -1 ? source.slice(start) : source.slice(start, next)
}

const version = ({
  reviewState,
}: {
  reviewState: "draft" | "manager_review" | "approved"
}): ReportVersionDetail =>
  ({
    id: "version_1",
    versionNumber: 1,
    status: "active",
    reviewState,
    revision: 0,
    report: { title: "Report" },
  }) as ReportVersionDetail

const publication = (
  outcome: "sent" | "failed",
): DocumentPublicationSummary =>
  ({
    notificationAttempts: [
      {
        id: "attempt_1",
        requestKey: "request_1",
        outcome,
        errorCategory: outcome === "failed" ? "provider_unavailable" : null,
        attemptedAt: new Date().toISOString(),
      },
    ],
  }) as DocumentPublicationSummary
