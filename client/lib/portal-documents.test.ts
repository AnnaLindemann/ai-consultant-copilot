import assert from "node:assert/strict"
import { test } from "node:test"

import { portalDocumentView } from "./portal-documents.ts"

test("portal document view exposes the published document fields and PDF action", () => {
  const view = portalDocumentView({
    apiBaseUrl: "http://localhost:8787",
    engagementId: "eng_1",
    document: {
      title: "Freigegebener Report",
      managerMessage: "Bitte vor dem Termin lesen.",
      reportVersionId: "version_1",
      publishedAt: "2026-08-02T10:00:00.000Z",
    },
    formatDateTime: (value) => `formatiert:${value}`,
    translate: (key, values) =>
      key === "portal.documents.open"
        ? "PDF öffnen"
        : `Veröffentlicht ${values?.date}`,
  })

  assert.equal(view.title, "Freigegebener Report")
  assert.equal(view.managerMessage, "Bitte vor dem Termin lesen.")
  assert.match(view.publishedText, /Veröffentlicht/)
  assert.equal(
    view.pdfHref,
    "http://localhost:8787/portal/engagements/eng_1/documents/version_1/pdf",
  )
  assert.equal(view.openLabel, "PDF öffnen")
})
