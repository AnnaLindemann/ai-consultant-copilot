"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { inputStyle, rowStyle } from "./UiKit"
import { t, translateServerMessage } from "../i18n"
import { uiColors } from "../lib/design-tokens"
import {
  STAGE_ORDER,
  stageLabel,
  type EngagementStage,
} from "../lib/engagement-stage"

type EngagementStageControlProps = {
  engagementId: string
  stage: EngagementStage
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

// Saves the engagement's methodology stage via PATCH /engagements/:id, so the
// consultant can record where the engagement stands and resume there later
// (roadmap Phase 1).
export default function EngagementStageControl({
  engagementId,
  stage,
}: EngagementStageControlProps) {
  const router = useRouter()
  const [selectedStage, setSelectedStage] = useState<EngagementStage>(stage)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  async function saveStage(nextStage: EngagementStage) {
    setSelectedStage(nextStage)
    setIsSaving(true)
    setError("")
    setSaved(false)

    try {
      const response = await fetch(`${API_BASE_URL}/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage: nextStage }),
      })

      const result = await response.json()

      if (!response.ok) {
        // The server names the outcome; the wording is ours. Its identifier is
        // never what the consultant reads.
        setError(
          translateServerMessage(
            result.message,
            undefined,
            "engagement.stage.save_failed",
          ),
        )
        return
      }

      setSaved(true)
      // Re-fetch the server component so the resumed state reflects the save.
      router.refresh()
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div style={wrapperStyle}>
      <label style={labelStyle} htmlFor="engagement-stage">
        {t("engagement.stage.label")}
      </label>
      <select
        id="engagement-stage"
        value={selectedStage}
        disabled={isSaving}
        onChange={(event) => saveStage(event.target.value as EngagementStage)}
        style={selectStyle}
      >
        {STAGE_ORDER.map((value) => (
          <option key={value} value={value}>
            {stageLabel(value)}
          </option>
        ))}
      </select>

      {isSaving && <span style={mutedStyle}>{t("common.state.saving")}</span>}
      {saved && !isSaving && (
        <span style={savedStyle}>{t("common.state.saved")}</span>
      )}
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  )
}

// The stage selector sits in the page header's action area, so it uses the
// shared control geometry rather than a height of its own.
const wrapperStyle: React.CSSProperties = rowStyle

const labelStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 12,
  fontWeight: 600,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: "auto",
  fontWeight: 600,
}

const mutedStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 13,
}

const savedStyle: React.CSSProperties = {
  color: uiColors.success,
  fontSize: 13,
  fontWeight: 600,
}

const errorStyle: React.CSSProperties = {
  color: uiColors.danger,
  fontSize: 13,
  fontWeight: 600,
}
