"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import {
  STAGE_LABELS,
  STAGE_ORDER,
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
        body: JSON.stringify({ stage: nextStage }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message ?? "Failed to save stage")
      }

      setSaved(true)
      // Re-fetch the server component so the resumed state reflects the save.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div style={wrapperStyle}>
      <label style={labelStyle} htmlFor="engagement-stage">
        Current stage
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
            {STAGE_LABELS[value]}
          </option>
        ))}
      </select>

      {isSaving && <span style={mutedStyle}>Saving…</span>}
      {saved && !isSaving && <span style={savedStyle}>Saved</span>}
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  )
}

const wrapperStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 20,
}

const labelStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.5,
}

const selectStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "10px 12px",
  fontSize: 15,
  fontWeight: 700,
  background: "#ffffff",
}

const mutedStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 14,
}

const savedStyle: React.CSSProperties = {
  color: "#065f46",
  fontSize: 14,
  fontWeight: 700,
}

const errorStyle: React.CSSProperties = {
  color: "#991b1b",
  fontSize: 14,
  fontWeight: 700,
}
