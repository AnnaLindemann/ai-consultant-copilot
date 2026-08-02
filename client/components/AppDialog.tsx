"use client"

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react"

import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"
import { actionRowStyle, buttonStyle, sectionTitleStyle } from "./UiKit"

type AppDialogProps = {
  open: boolean
  title: string
  description: string
  children: ReactNode
  primaryAction: {
    label: string
    onClick: () => void
    loading?: boolean
    disabled?: boolean
    variant?: "primary" | "danger"
  }
  cancelLabel: string
  onCancel: () => void
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

export function AppDialog({
  open,
  title,
  description,
  children,
  primaryAction,
  cancelLabel,
  onCancel,
  initialFocusRef,
}: AppDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const fallbackFocusRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target = initialFocusRef?.current ?? fallbackFocusRef.current
    target?.focus()

    return () => {
      restoreFocusRef.current?.focus()
      restoreFocusRef.current = null
    }
  }, [initialFocusRef, open])

  if (!open) return null

  return (
    <div style={overlayStyle} onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={dialogStyle}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
            return
          }
          if (event.key !== "Tab") return

          const focusable = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
          ).filter((element) => element.offsetParent !== null)
          if (focusable.length === 0) return

          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <div style={headerStyle}>
          <h3 id={titleId} style={sectionTitleStyle}>
            {title}
          </h3>
          <p id={descriptionId} style={descriptionStyle}>
            {description}
          </p>
        </div>
        <div style={contentStyle}>{children}</div>
        <div style={actionRowStyle}>
          <button
            ref={fallbackFocusRef}
            type="button"
            style={buttonStyle("secondary", primaryAction.loading)}
            disabled={primaryAction.loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            style={buttonStyle(
              primaryAction.variant ?? "primary",
              primaryAction.disabled || primaryAction.loading,
            )}
            disabled={primaryAction.disabled || primaryAction.loading}
            onClick={primaryAction.onClick}
          >
            {primaryAction.loading ? primaryAction.label : primaryAction.label}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "grid",
  placeItems: "center",
  padding: uiSpace.lg,
  background: "rgba(15, 23, 42, 0.42)",
}

const dialogStyle: CSSProperties = {
  width: "min(640px, 100%)",
  maxHeight: "min(760px, 100%)",
  overflow: "auto",
  display: "grid",
  gap: uiSpace.lg,
  padding: uiSpace.lg,
  borderRadius: uiRadius.card,
  border: `1px solid ${uiColors.borderStrong}`,
  background: uiColors.surface,
}

const headerStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
}

const descriptionStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textSecondary,
  fontSize: 14,
  lineHeight: 1.5,
}

const contentStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
}
