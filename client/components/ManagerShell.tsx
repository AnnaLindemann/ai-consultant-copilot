"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { t } from "../i18n"
import {
  isNavItemActive,
  visibleNavGroups,
  type NavIconKind,
} from "../lib/app-navigation"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"

type Breadcrumb = {
  label: string
  href?: string
}

type ManagerShellProps = {
  breadcrumbs?: readonly Breadcrumb[]
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

type CurrentUser = {
  displayName: string | null
  role: string | null
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

// The consultant workspace's frame: a fixed navigation column and one main
// column that uses whatever width is left. The layout that makes that
// responsive lives in `globals.css` — a media query is not expressible as an
// inline style, and the page must not fall back to a centred card.
export default function ManagerShell({
  breadcrumbs,
  title,
  description,
  actions,
  children,
}: ManagerShellProps) {
  const pathname = usePathname()
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: "include",
        })

        if (!response.ok) return

        const result = (await response.json()) as {
          data?: CurrentUser
        }
        if (mounted) setCurrentUser(result.data ?? null)
      } catch {
        if (mounted) setCurrentUser(null)
      }
    }

    void loadUser()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div style={brandBlockStyle}>
          <div style={brandMarkStyle} aria-hidden="true">
            <SidebarIcon kind="brand" />
          </div>
          <p style={brandTitleStyle}>{t("shell.brand.title")}</p>
        </div>

        <nav aria-label={t("shell.nav.aria_label")} className="app-sidebar__nav">
          {visibleNavGroups(currentUser?.role ?? null).map((group) => (
            <section key={group.labelKey} style={groupStyle}>
              <p className="app-sidebar__group-label" style={groupLabelStyle}>
                {t(group.labelKey)}
              </p>
              <ul className="app-sidebar__list" style={listStyle}>
                {group.items.map((item) => {
                  const active = isNavItemActive(item, pathname)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        title={t(item.labelKey)}
                        style={{
                          ...navItemStyle,
                          background: active ? uiColors.primaryTint : "transparent",
                          color: active ? uiColors.primary : uiColors.textPrimary,
                        }}
                      >
                        <span style={navItemIconStyle}>
                          <SidebarIcon kind={item.icon} />
                        </span>
                        <span style={navItemLabelStyle}>{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </nav>

        <div className="app-sidebar__user" style={userCardStyle}>
          <div style={avatarStyle} aria-hidden="true">
            {initialsFor(currentUser?.displayName ?? null)}
          </div>
          <div className="app-sidebar__user-detail" style={userCopyStyle}>
            <strong style={userNameStyle}>
              {currentUser?.displayName ?? t("shell.user.unknown")}
            </strong>
            <span style={userRoleStyle}>{roleLabel(currentUser?.role)}</span>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-page-header">
          <div style={headerTextStyle}>
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav
                aria-label={t("shell.breadcrumbs.aria_label")}
                style={breadcrumbsStyle}
              >
                {breadcrumbs.map((item, index) => {
                  const isLast = index === breadcrumbs.length - 1
                  return (
                    <span key={`${item.label}-${index}`} style={breadcrumbItemStyle}>
                      {item.href && !isLast ? (
                        <Link href={item.href} style={breadcrumbLinkStyle}>
                          {item.label}
                        </Link>
                      ) : (
                        <span style={breadcrumbCurrentStyle}>{item.label}</span>
                      )}
                      {!isLast && (
                        <span aria-hidden="true" style={breadcrumbSeparatorStyle}>
                          ›
                        </span>
                      )}
                    </span>
                  )
                })}
              </nav>
            )}
            <h1 style={titleStyle}>{title}</h1>
            {description && <p style={descriptionStyle}>{description}</p>}
          </div>
          {actions && <div style={actionsStyle}>{actions}</div>}
        </header>

        {children}
      </main>
    </div>
  )
}

function initialsFor(name: string | null): string {
  if (!name) return "?"

  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?"
}

function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "MANAGER":
      return t("shell.user.role.manager")
    case "ADMIN":
      return t("shell.user.role.admin")
    case "CLIENT":
      return t("shell.user.role.client")
    default:
      return t("shell.user.role.unknown")
  }
}

function SidebarIcon({ kind }: { kind: NavIconKind | "brand" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  }

  switch (kind) {
    case "brand":
      return (
        <svg {...common}>
          <path d="M12 3 5 20h14L12 3Z" />
          <path d="M12 11v5" />
        </svg>
      )
    case "new":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
      )
    case "engagements":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M7 9h10" />
          <path d="M7 13h6" />
        </svg>
      )
    case "knowledge":
      return (
        <svg {...common}>
          <path d="M6 4h10a4 4 0 0 1 4 4v10H10a4 4 0 0 0-4 4V4Z" />
          <path d="M6 4v14" />
        </svg>
      )
    case "technology":
      return (
        <svg {...common}>
          <rect x="4" y="7" width="16" height="10" rx="2" />
          <path d="M9 7V5" />
          <path d="M15 7V5" />
          <path d="M9 17v2" />
          <path d="M15 17v2" />
        </svg>
      )
    case "updates":
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.3-5.6" />
          <path d="M20 4v5h-5" />
        </svg>
      )
    case "compliance":
      return (
        <svg {...common}>
          <path d="M12 3 5 6v5c0 4.2 2.9 8.1 7 9 4.1-.9 7-4.8 7-9V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )
  }
}

const brandBlockStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: uiSpace.sm,
  padding: `0 ${uiSpace.xs}`,
}

const brandMarkStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  flexShrink: 0,
  borderRadius: uiRadius.control,
  display: "grid",
  placeItems: "center",
  background: uiColors.primaryTint,
  color: uiColors.primary,
}

const brandTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 650,
  lineHeight: 1.25,
}

const groupStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
}

const groupLabelStyle: React.CSSProperties = {
  margin: `0 0 ${uiSpace.xxs} ${uiSpace.sm}`,
  color: uiColors.textMuted,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
}

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 2,
}

const navItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: uiSpace.sm,
  minHeight: 44,
  padding: `0 ${uiSpace.sm}`,
  borderRadius: uiRadius.control,
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

const navItemIconStyle: React.CSSProperties = {
  display: "inline-flex",
  flexShrink: 0,
}

const navItemLabelStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
}

const userCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: uiSpace.sm,
  padding: uiSpace.xs,
  borderRadius: uiRadius.control,
  background: uiColors.subtle,
}

const avatarStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  flexShrink: 0,
  borderRadius: uiRadius.pill,
  display: "grid",
  placeItems: "center",
  background: uiColors.surface,
  color: uiColors.textPrimary,
  fontWeight: 700,
  fontSize: 12,
}

const userCopyStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
}

const userNameStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const userRoleStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 12,
}

const headerTextStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: uiSpace.xs,
}

const breadcrumbsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: uiSpace.xs,
  color: uiColors.textSecondary,
  fontSize: 13,
  fontWeight: 500,
}

const breadcrumbItemStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: uiSpace.xs,
}

const breadcrumbLinkStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  textDecoration: "none",
}

const breadcrumbCurrentStyle: React.CSSProperties = {
  color: uiColors.textPrimary,
  fontWeight: 600,
}

const breadcrumbSeparatorStyle: React.CSSProperties = {
  color: uiColors.textMuted,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.28,
  fontWeight: 650,
  letterSpacing: "-0.01em",
}

const descriptionStyle: React.CSSProperties = {
  margin: 0,
  maxWidth: 760,
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1.5,
}

const actionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: uiSpace.sm,
}
