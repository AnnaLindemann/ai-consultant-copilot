"use client"

import { useState } from "react"
import Link from "next/link"

import { t, translateServerMessage } from "../../i18n"
import type { MessageKey } from "../../i18n/de"

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
    <main style={pageStyle}>
      <section style={cardStyle}>
        <p style={eyebrowStyle}>{t("auth.page.eyebrow")}</p>
        <h1 style={titleStyle}>{t("auth.page.title")}</h1>
        <p style={subtitleStyle}>{t("auth.page.subtitle")}</p>

        <div style={tabsStyle}>
          {MODES.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
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
            onSuccess={() => {
              window.location.href = "/"
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

        {message && <p style={successStyle}>{message}</p>}
        {error && <p style={errorStyle}>{error}</p>}

        <p style={footnoteStyle}>
          <Link href="/">{t("auth.page.back_home")}</Link>
        </p>
      </section>
    </main>
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
  onSuccess?: () => void
  setError: (value: string) => void
  setMessage: (value: string) => void
}) {
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((field) => [field.id, ""])),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <form
      style={{ display: "grid", gap: 16, marginTop: 24 }}
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

          const result = (await response.json()) as { message?: string }

          if (!response.ok) {
            // The server sends an identifier; the wording is ours.
            setError(translateServerMessage(result.message))
            return
          }

          setMessage(translateServerMessage(result.message))
          onSuccess?.()
        } catch {
          setError(t("common.error.unexpected"))
        } finally {
          setIsSubmitting(false)
        }
      }}
    >
      <h2 style={{ margin: 0, fontSize: 22 }}>{t(titleKey)}</h2>
      {hintKey && <p style={formHintStyle}>{t(hintKey)}</p>}

      {fields.map((field) => (
        <label key={field.id} style={fieldLabelStyle}>
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
          {field.hintKey && (
            <span style={fieldHintStyle}>{t(field.hintKey)}</span>
          )}
        </label>
      ))}

      <button type="submit" disabled={isSubmitting} style={buttonStyle}>
        {isSubmitting ? t("auth.form.submitting") : t(submitKey)}
      </button>
    </form>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, #eff6ff 0%, #f8fafc 42%, #eef2ff 100%)",
  padding: "48px 24px",
  color: "#111827",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const cardStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: 32,
  borderRadius: 28,
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#4f46e5",
  fontWeight: 800,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1,
}

const titleStyle: React.CSSProperties = {
  margin: "8px 0 12px",
  fontSize: 38,
  lineHeight: 1.1,
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: 17,
  lineHeight: 1.5,
}

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 24,
  flexWrap: "wrap",
}

const tabStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 700,
}

const activeTabStyle: React.CSSProperties = {
  background: "#111827",
  color: "#fff",
  borderColor: "#111827",
}

const formHintStyle: React.CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: 14,
  lineHeight: 1.5,
}

const fieldLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 700,
  fontSize: 14,
}

const fieldHintStyle: React.CSSProperties = {
  color: "#6b7280",
  fontWeight: 400,
  fontSize: 13,
}

const inputStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid #d1d5db",
  padding: "12px 14px",
  fontSize: 15,
}

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 14,
  padding: "12px 16px",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
}

const successStyle: React.CSSProperties = {
  marginTop: 20,
  color: "#065f46",
  fontWeight: 700,
}

const errorStyle: React.CSSProperties = {
  marginTop: 20,
  color: "#991b1b",
  fontWeight: 700,
}

const footnoteStyle: React.CSSProperties = {
  marginTop: 16,
  color: "#64748b",
}
