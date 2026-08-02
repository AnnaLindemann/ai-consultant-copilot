export type PortalDocumentViewInput = {
  title: string
  managerMessage: string | null
  reportVersionId: string
  publishedAt: string
}

export const portalDocumentView = ({
  apiBaseUrl,
  engagementId,
  document,
  formatDateTime,
  translate,
}: {
  apiBaseUrl: string
  engagementId: string
  document: PortalDocumentViewInput
  formatDateTime: (value: string) => string
  translate: (key: "portal.documents.published" | "portal.documents.open", values?: Record<string, string>) => string
}) => ({
  title: document.title,
  managerMessage: document.managerMessage,
  publishedText: translate("portal.documents.published", {
    date: formatDateTime(document.publishedAt),
  }),
  pdfHref: `${apiBaseUrl}/portal/engagements/${engagementId}/documents/${document.reportVersionId}/pdf`,
  openLabel: translate("portal.documents.open"),
})
