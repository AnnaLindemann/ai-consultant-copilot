import type { EmailMessage } from "../domain/access/ports.js"

// The server-side email catalogue. Email is the one user-facing surface the
// frontend cannot localize for us, so the same discipline applies here as in
// `client/i18n`: every string lives behind a key in one catalogue, named after
// what the message *is* rather than its current wording, and a second language
// is a second catalogue (architecture.md §7.1; coding-standards.md §12A).
//
// German is the only active locale (roadmap "Language and localization
// readiness"). Nothing here is assembled from a caller's prose.

export type EmailTemplateId =
  | "staff_invitation"
  | "email_verification"
  | "password_reset"
  | "discovery_access_granted"
  | "discovery_returned"

type TemplateParams = {
  staff_invitation: { recipientName: string; acceptUrl: string; expiresOn: string }
  email_verification: { verifyUrl: string }
  password_reset: { resetUrl: string }
  discovery_access_granted: { portalUrl: string }
  discovery_returned: { portalUrl: string }
}

const de: {
  [Id in EmailTemplateId]: (params: TemplateParams[Id]) => {
    subject: string
    paragraphs: readonly string[]
  }
} = {
  staff_invitation: ({ recipientName, acceptUrl, expiresOn }) => ({
    subject: "Einladung zur AI Consulting Workbench",
    paragraphs: [
      `Hallo ${recipientName},`,
      "Sie wurden zur AI Consulting Workbench eingeladen. Über den folgenden Link legen Sie Ihr eigenes Passwort fest:",
      acceptUrl,
      `Der Link ist bis zum ${expiresOn} gültig.`,
      "Wenn Sie diese Einladung nicht erwartet haben, ignorieren Sie diese E-Mail.",
    ],
  }),

  email_verification: ({ verifyUrl }) => ({
    subject: "Bitte bestätigen Sie Ihre E-Mail-Adresse",
    paragraphs: [
      "Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihre Registrierung abzuschließen:",
      verifyUrl,
      "Wenn Sie sich nicht registriert haben, ignorieren Sie diese E-Mail.",
    ],
  }),

  password_reset: ({ resetUrl }) => ({
    subject: "Passwort zurücksetzen",
    paragraphs: [
      "Über den folgenden Link setzen Sie Ihr Passwort zurück:",
      resetUrl,
      "Wenn Sie kein neues Passwort angefordert haben, ignorieren Sie diese E-Mail. Ihr bestehendes Passwort bleibt unverändert.",
    ],
  }),

  discovery_access_granted: ({ portalUrl }) => ({
    subject: "Zugang zum Discovery-Formular",
    paragraphs: [
      "Sie können jetzt das Discovery-Formular für Ihr Projekt ausfüllen:",
      portalUrl,
      "Sie sehen dort ausschließlich dieses Discovery-Formular. Speichern Sie zwischendurch so oft Sie möchten und reichen Sie erst ein, wenn Sie fertig sind.",
    ],
  }),

  discovery_returned: ({ portalUrl }) => ({
    subject: "Ihre Discovery wurde mit Anmerkungen zurückgegeben",
    paragraphs: [
      "Der Consultant hat Ihre Discovery geprüft und mit Anmerkungen zurückgegeben. Ihre Eingaben sind unverändert erhalten:",
      portalUrl,
    ],
  }),
}

// Render a message for delivery. HTML and plain text come from the same
// paragraphs, so the two renderings can never drift apart.
export const renderEmail = <Id extends EmailTemplateId>(
  templateId: Id,
  to: string,
  params: TemplateParams[Id],
): EmailMessage => {
  const { subject, paragraphs } = de[templateId](params)

  return {
    to,
    subject,
    html: paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n"),
    text: paragraphs.join("\n\n"),
  }
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
