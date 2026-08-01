import type { ReactNode } from "react"

import { t } from "../i18n"
import { uiColors, uiSpace } from "../lib/design-tokens"

// The Client Portal's frame (UI-KIT §6.2).
//
// Deliberately not the consultant's shell: no workbench sidebar, no stage
// controls, no internal terminology, and a bounded readable column rather than
// the full desktop width. The client is here to answer questions about their
// own organization, on whatever device they have to hand — so this surface is
// mobile-first, and the layout that makes it so lives in `globals.css`.
//
// The navigation lists exactly the client surfaces that exist. The UI kit also
// foresees `Übersicht` and `Dokumente`; neither is implemented, and a disabled
// entry for an unbuilt page is a promise the product cannot keep.

type ClientPortalShellProps = {
  title: string
  description?: string
  children: ReactNode
}

export default function ClientPortalShell({
  title,
  description,
  children,
}: ClientPortalShellProps) {
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="portal-header__inner">
          <div style={brandStyle}>
            <span style={brandMarkStyle} aria-hidden="true">
              <PortalMark />
            </span>
            <span style={brandTitleStyle}>{t("portal.shell.brand")}</span>
          </div>

          <nav aria-label={t("portal.shell.nav_aria_label")}>
            <ul style={navListStyle}>
              <li>
                <span aria-current="page" style={navCurrentStyle}>
                  {t("portal.shell.nav.discovery")}
                </span>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main className="portal-main">
        <header style={pageHeaderStyle}>
          <h1 style={titleStyle}>{title}</h1>
          {description && <p style={descriptionStyle}>{description}</p>}
        </header>

        {children}
      </main>
    </div>
  )
}

function PortalMark() {
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
  minWidth: 0,
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
  overflow: "hidden",
  color: uiColors.textPrimary,
  fontSize: 14,
  fontWeight: 650,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const navListStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: uiSpace.xs,
  margin: 0,
  padding: 0,
  listStyle: "none",
}

const navCurrentStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 36,
  padding: `0 ${uiSpace.sm}`,
  borderRadius: 8,
  background: uiColors.primaryTint,
  color: uiColors.primary,
  fontSize: 14,
  fontWeight: 600,
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
