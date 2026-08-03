"use client"

import { useRouter } from "next/navigation"
import { useState, type CSSProperties } from "react"

import {
  InlineAlert,
  buttonStyle,
  fieldStyle,
  hintStyle,
  textareaStyle,
} from "./UiKit"
import { t, translateServerMessage } from "../i18n"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"

type ClientFeedbackFormProps = {
  engagementId: string
  publicationId: string
  apiBaseUrl: string
}

export default function ClientFeedbackForm({
  engagementId,
  publicationId,
  apiBaseUrl,
}: ClientFeedbackFormProps) {
  const router = useRouter()
  const [content, setContent] = useState("")
  // One retry key per intended submission. It survives a failed attempt, so
  // pressing send again after a timeout is recognized as the *same* submission
  // rather than creating a second Feedback — and is replaced only once the
  // server has confirmed, so deliberately writing again says something new.
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setIsSubmitting(true)
    setError(null)
    setSent(false)

    try {
      const response = await fetch(
        `${apiBaseUrl}/portal/engagements/${engagementId}/feedback`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ publicationId, submissionKey, content }),
        },
      )
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.status) {
        // The server answers with a stable message identifier and no prose, so
        // a revoked publication, a mismatched retry, a rejected input and a
        // refusal each read differently here (coding-standards.md §12A).
        setError(
          typeof result?.message === "string"
            ? translateServerMessage(result.message)
            : t("portal.feedback.error"),
        )
        return
      }

      setContent("")
      setSubmissionKey(crypto.randomUUID())
      setSent(true)
      // The submitted, immutable entry is rendered by the page from the server,
      // so it is reloaded rather than kept as a second copy here.
      router.refresh()
    } catch {
      setError(t("portal.feedback.error"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={feedbackStyle}>
      <label style={fieldStyle}>
        {t("portal.feedback.label")}
        <textarea
          style={textareaStyle}
          value={content}
          disabled={isSubmitting}
          onChange={(event) => setContent(event.target.value)}
        />
      </label>
      <p style={hintStyle}>{t("portal.feedback.hint")}</p>
      {sent && <InlineAlert tone="success">{t("portal.feedback.sent")}</InlineAlert>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <button
        type="button"
        style={buttonStyle("primary", isSubmitting || content.trim().length === 0)}
        disabled={isSubmitting || content.trim().length === 0}
        onClick={submit}
      >
        {isSubmitting ? t("portal.feedback.sending") : t("portal.feedback.submit")}
      </button>
    </div>
  )
}

const feedbackStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.sm,
  marginTop: uiSpace.md,
  padding: uiSpace.md,
  borderRadius: uiRadius.control,
  border: `1px solid ${uiColors.border}`,
  background: uiColors.surface,
}
