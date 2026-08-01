"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"

import { buildDiscoverySections } from "./DiscoverySections"
import type { WorkflowSectionItem } from "./WorkflowPrimitives"
import { t, translateServerMessage } from "../i18n"
import {
  resolveActiveSectionId,
  toggledSectionId,
} from "../lib/discovery-progress"
import type { DiscoveryAudience } from "../lib/discovery-guidance"

import type {
  DiscoveryGapCategory,
  DiscoveryProfile,
} from "../../shared/discovery-profile.schema"
import type {
  DiscoveryActor,
  DiscoveryWorkflowState,
} from "../../shared/discovery-workflow.schema"

// Everything the two Discovery surfaces do identically: hold the edited
// profile, build the sections from it, save it, and decide which section is
// open. The consultant's workspace and the Client Portal differ in chrome and
// in what their user may do — not in how Discovery itself behaves — so that
// behavior lives here once.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

type DiscoveryEditorOptions = {
  engagementId: string
  initialProfile: DiscoveryProfile
  workflow: DiscoveryWorkflowState
  audience: DiscoveryAudience
  contributor: DiscoveryActor
  pathPrefix: string
}

export type DiscoveryEditor = {
  profile: DiscoveryProfile
  sections: WorkflowSectionItem[]
  activeSectionId: string
  openSection: (sectionId: string) => void
  toggleSection: (sectionId: string) => void
  /** Opens the section that most needs attention — used after a refused submit. */
  revealFirstOpenSection: () => void
  /** Fire-and-forget: the outcome is reported through `message` / `error`. */
  save: () => void
  isSaving: boolean
  message: string
  error: string
}

export function useDiscoveryEditor({
  engagementId,
  initialProfile,
  workflow,
  audience,
  contributor,
  pathPrefix,
}: DiscoveryEditorOptions): DiscoveryEditor {
  const router = useRouter()
  const [profile, setProfile] = useState(initialProfile)
  const [gapCategory, setGapCategory] =
    useState<DiscoveryGapCategory>("situation")
  const [gapDescription, setGapDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [requestedSectionId, setRequestedSectionId] = useState<string | null>(null)

  const setField = useCallback(
    <K extends keyof DiscoveryProfile>(field: K, value: DiscoveryProfile[K]) => {
      setProfile((current) => ({ ...current, [field]: value }))
      setMessage("")
    },
    [],
  )

  function addGap() {
    const description = gapDescription.trim()
    if (!description) return

    setField("missingInformation", [
      ...profile.missingInformation,
      { category: gapCategory, description },
    ])
    setGapDescription("")
  }

  function removeGap(index: number) {
    setField(
      "missingInformation",
      profile.missingInformation.filter((_, itemIndex) => itemIndex !== index),
    )
  }

  const openSection = useCallback((sectionId: string) => {
    setRequestedSectionId(sectionId)

    // Scrolling happens after the section has been asked to open, so the
    // browser measures the expanded panel rather than the collapsed one.
    requestAnimationFrame(() => {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [])

  const sections = buildDiscoverySections({
    profile,
    workflow,
    audience,
    gapCategory,
    gapDescription,
    setField,
    setGapCategory,
    setGapDescription,
    addGap,
    removeGap,
    onOpenSection: openSection,
  })

  // Until the reader chooses a section, the workspace opens on the first one
  // still needing work. A chosen section that has since gone away falls back to
  // the same rule rather than leaving the accordion shut.
  const activeSectionId = resolveActiveSectionId(
    requestedSectionId,
    sections,
    sections[0]?.id ?? "",
  )

  function toggleSection(sectionId: string) {
    const next = toggledSectionId(activeSectionId, sectionId)

    if (next === "") {
      setRequestedSectionId("")
      return
    }
    openSection(next)
  }

  const revealFirstOpenSection = useCallback(() => {
    const target =
      sections.find((section) => section.status === "action_required") ??
      sections.find((section) => section.status !== "complete")

    if (target) openSection(target.id)
  }, [sections, openSection])

  async function save() {
    setIsSaving(true)
    setError("")
    setMessage("")

    try {
      const response = await fetch(
        `${API_BASE_URL}${pathPrefix}/${engagementId}/discovery`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ contributor, profile }),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        // The server names the refusal; the wording is the frontend's.
        throw new Error(
          translateServerMessage(
            result.message,
            result.data?.messageParams,
            "discovery.editor.save_failed",
          ),
        )
      }

      setMessage(translateServerMessage(result.message))
      router.refresh()
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setIsSaving(false)
    }
  }

  // Returned as a fresh object each render on purpose: the sections close over
  // the profile being edited, so memoizing them would hand the caller a stale
  // form.
  return {
    profile,
    sections,
    activeSectionId,
    openSection,
    toggleSection,
    revealFirstOpenSection,
    save,
    isSaving,
    message,
    error,
  }
}
