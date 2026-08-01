import type { ReactNode } from "react"

import { t } from "../i18n"
import { uiColors, uiSpace } from "../lib/design-tokens"

// The frame for the surfaces reached without a session: sign-in, client
// self-registration, invitation acceptance, and the one-off bootstrap.
//
// A public page gets neither the consultant's sidebar — there is nothing yet to
// navigate — nor a look of its own. It uses the same typography, tokens, form
// controls and buttons as the rest of the product, so the first screen a person
// sees already belongs to it (UI-KIT §3.7).

type PublicShellProps = {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

export default function PublicShell({
  title,
  description,
  children,
  footer,
}: PublicShellProps) {
  return (
    <div className="public-shell">
      <header className="public-shell__bar">
        <div style={brandStyle}>
          <span style={brandMarkStyle} aria-hidden="true">
            <PublicMark />
          </span>
          <span style={brandTitleStyle}>{t("shell.brand.title")}</span>
        </div>
      </header>

      <main className="public-shell__main">
        <div className="public-shell__column">
          <header style={pageHeaderStyle}>
            <h1 style={titleStyle}>{title}</h1>
            {description && <p style={descriptionStyle}>{description}</p>}
          </header>

          {children}

          {footer && <div style={footerStyle}>{footer}</div>}
        </div>
      </main>
    </div>
  )
}

function PublicMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 5 20h14L12 3Z" />
      <path d="M12 11v5" />
    </svg>
  )
}

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: uiSpace.xs,
}

const brandMarkStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 26,
  height: 26,
  flexShrink: 0,
  borderRadius: 8,
  background: uiColors.primaryTint,
  color: uiColors.primary,
}

const brandTitleStyle: React.CSSProperties = {
  color: uiColors.textPrimary,
  fontSize: 14,
  fontWeight: 650,
}

const pageHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xxs,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 28,
  lineHeight: 1.28,
  fontWeight: 650,
  letterSpacing: "-0.01em",
}

const descriptionStyle: React.CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1.5,
}

const footerStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 13,
}
