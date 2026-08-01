"use client"

import { useState } from "react"
import Link from "next/link"

import PublicShell from "../../components/PublicShell"
import {
  InlineAlert,
  buttonStyle,
  cardStyle,
  fieldStyle,
  hintStyle,
  inputStyle,
  mutedTextStyle,
  sectionTitleStyle,
} from "../../components/UiKit"
import {
  HOME_PATH,
  RETURN_PARAM,
  safeReturnPath,
} from "../../lib/auth-redirect"
import { t, translateServerMessage } from "../../i18n"
import type { MessageKey } from "../../i18n/de"
import { uiColors, uiRadius, uiSpace } from "../../lib/design-tokens"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

// The access surface. Four entry points, matching the documented lifecycles
// (roadmap Phase 3A "Authentication"):
//   - sign in              — everyone who already has an account
//   - create an account    — clients, who self-register; never staff
//   - accept an invitation — managers and administrators, who set their own
//                            password from an emailed link
//   - bootstrap            — the first administrator, once per installation
//
// Every string is looked up by key, and the server sends message identifiers
// that `translateServerMessage` renders, so no displayed text comes off the
// wire (coding-standards.md §12A).
type Mode = "login" | "register" | "invitation" | "bootstrap"

type Field = {
  id: string
  labelKey: MessageKey
  type: string
  hintKey?: MessageKey
}

// What the access routes answer with: an identifier for the outcome and, where
// the route establishes one, the acting user (`routes/auth.ts`).
type AuthResponse = {
  message?: string
  data?: { user?: { role?: string } | null }
}

// The page the visitor was trying to reach, as `proxy.ts` and the protected
// pages recorded it. Read when the form is submitted rather than during render,
// so this page needs no Suspense boundary to stay prerenderable.
const returnPath = () =>
  new URLSearchParams(window.location.search).get(RETURN_PARAM)

const MODES: { value: Mode; labelKey: MessageKey }[] = [
  { value: "login", labelKey: "auth.tab.login" },
  { value: "register", labelKey: "auth.tab.register" },
  { value: "invitation", labelKey: "auth.tab.invitation" },
  { value: "bootstrap", labelKey: "auth.tab.bootstrap" },
]

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const switchMode = (next: Mode) => {
    setMode(next)
    setError("")
    setMessage("")
  }

  return (
    <PublicShell
      title={t("auth.page.title")}
      description={t("auth.page.subtitle")}
      footer={
        <Link href="/" style={footerLinkStyle}>
          {t("auth.page.back_home")}
        </Link>
      }
    >
      <section style={cardStyle}>
        {/* One card, four entry points. The tabs are a segmented control rather
            than four differently-styled pills, so which one is active is
            carried by the same selected-state language the sidebar uses. */}
        <div style={tabsStyle} role="tablist" aria-label={t("auth.page.eyebrow")}>
          {MODES.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => switchMode(value)}
              style={{ ...tabStyle, ...(mode === value ? activeTabStyle : null) }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {mode === "login" && (
          <AuthForm
            key="login"
            titleKey="auth.form.login.title"
            submitKey="auth.form.login.submit"
            path="/auth/login"
            fields={[
              { id: "email", labelKey: "auth.field.email", type: "email" },
              {
                id: "password",
                labelKey: "auth.field.password",
                type: "password",
              },
            ]}
            onSuccess={(result) => {
              // Back to the page that sent them here — but only once there is
              // somewhere to go back *to*. A confirmed identity with no
              // workspace membership (a self-registered client awaiting
              // association) is signed in and reaches no consultant surface, so
              // returning them to one would bounce them straight back here.
              window.location.href = result.data?.user
                ? safeReturnPath(returnPath())
                : HOME_PATH
            }}
            setError={setError}
            setMessage={setMessage}
          />
        )}

        {mode === "register" && (
          <AuthForm
            key="register"
            titleKey="auth.form.register.title"
            hintKey="auth.form.register.hint"
            submitKey="auth.form.register.submit"
            path="/auth/register"
            fields={[
              { id: "email", labelKey: "auth.field.email", type: "email" },
              {
                id: "displayName",
                labelKey: "auth.field.display_name",
                type: "text",
              },
              {
                id: "password",
                labelKey: "auth.field.password",
                type: "password",
                hintKey: "auth.field.password_hint",
              },
            ]}
            setError={setError}
            setMessage={setMessage}
          />
        )}

        {mode === "invitation" && (
          <AuthForm
            key="invitation"
            titleKey="auth.form.invitation.title"
            hintKey="auth.form.invitation.hint"
            submitKey="auth.form.invitation.submit"
            path="/auth/invitations/accept"
            fields={[
              {
                id: "token",
                labelKey: "auth.field.invitation_token",
                type: "text",
              },
              {
                id: "displayName",
                labelKey: "auth.field.display_name",
                type: "text",
              },
              {
                id: "password",
                labelKey: "auth.field.password",
                type: "password",
                hintKey: "auth.field.password_hint",
              },
            ]}
            setError={setError}
            setMessage={setMessage}
          />
        )}

        {mode === "bootstrap" && (
          <AuthForm
            key="bootstrap"
            titleKey="auth.form.bootstrap.title"
            hintKey="auth.form.bootstrap.hint"
            submitKey="auth.form.bootstrap.submit"
            path="/auth/bootstrap"
            fields={[
              {
                id: "secret",
                labelKey: "auth.field.bootstrap_secret",
                type: "password",
              },
              {
                id: "workspaceName",
                labelKey: "auth.field.workspace_name",
                type: "text",
              },
              {
                id: "administratorEmail",
                labelKey: "auth.field.administrator_email",
                type: "email",
              },
              {
                id: "administratorName",
                labelKey: "auth.field.administrator_name",
                type: "text",
              },
              {
                id: "password",
                labelKey: "auth.field.password",
                type: "password",
                hintKey: "auth.field.password_hint",
              },
            ]}
            setError={setError}
            setMessage={setMessage}
          />
        )}

        {message && <InlineAlert tone="success">{message}</InlineAlert>}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      </section>
    </PublicShell>
  )
}

function AuthForm({
  titleKey,
  hintKey,
  submitKey,
  path,
  fields,
  onSuccess,
  setError,
  setMessage,
}: {
  titleKey: MessageKey
  hintKey?: MessageKey
  submitKey: MessageKey
  path: string
  fields: Field[]
  onSuccess?: (result: AuthResponse) => void
  setError: (value: string) => void
  setMessage: (value: string) => void
}) {
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((field) => [field.id, ""])),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <form
      style={formStyle}
      onSubmit={async (event) => {
        event.preventDefault()
        setIsSubmitting(true)
        setError("")
        setMessage("")

        try {
          const response = await fetch(`${API_BASE_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(form),
          })

          const result = (await response.json()) as AuthResponse

          if (!response.ok) {
            // The server sends an identifier; the wording is ours.
            setError(translateServerMessage(result.message))
            return
          }

          setMessage(translateServerMessage(result.message))
          onSuccess?.(result)
        } catch {
          setError(t("common.error.unexpected"))
        } finally {
          setIsSubmitting(false)
        }
      }}
    >
      <h2 style={sectionTitleStyle}>{t(titleKey)}</h2>
      {hintKey && <p style={mutedTextStyle}>{t(hintKey)}</p>}

      {fields.map((field) => (
        <label key={field.id} style={fieldStyle}>
          <span>{t(field.labelKey)}</span>
          <input
            type={field.type}
            value={form[field.id] ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                [field.id]: event.target.value,
              }))
            }
            style={inputStyle}
          />
          {field.hintKey && <span style={hintStyle}>{t(field.hintKey)}</span>}
        </label>
      ))}

      <button
        type="submit"
        disabled={isSubmitting}
        style={{ ...buttonStyle("primary", isSubmitting), justifySelf: "start" }}
      >
        {isSubmitting ? t("auth.form.submitting") : t(submitKey)}
      </button>
    </form>
  )
}

const formStyle: React.CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
  minWidth: 0,
}

// A segmented control: one bounded strip, one selected item, no four-pill
// rainbow. The selected state uses the same tint the sidebar's active entry
// does, so "selected" means one thing across the product.
const tabsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 2,
  padding: 2,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.subtle,
}

const tabStyle: React.CSSProperties = {
  flex: "1 1 auto",
  minHeight: 36,
  padding: `0 ${uiSpace.sm}`,
  borderRadius: 6,
  border: "1px solid transparent",
  background: "transparent",
  color: uiColors.textSecondary,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
}

const activeTabStyle: React.CSSProperties = {
  borderColor: uiColors.border,
  background: uiColors.surface,
  color: uiColors.primary,
}

const footerLinkStyle: React.CSSProperties = {
  color: uiColors.primary,
  fontWeight: 600,
  textDecoration: "none",
}
