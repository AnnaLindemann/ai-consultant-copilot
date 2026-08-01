"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  EmptyState,
  InlineAlert,
  actionRowStyle,
  buttonStyle,
  cardStyle,
  fieldStyle,
  inputStyle,
  pageStackStyle,
  sectionTitleStyle,
  textareaStyle,
} from "./UiKit"
import { signInPath } from "../lib/auth-redirect"
import { uiColors, uiSpace } from "../lib/design-tokens"
import { KNOWLEDGE_KINDS, KNOWLEDGE_STAGES } from "../lib/knowledge-options"
import { t, translateServerMessage } from "../i18n"

// Type-only, like every other client import from `shared/`: those modules sit
// outside the frontend's build root, so a value imported from one would not
// resolve. The identifiers the dropdowns need come from `lib/knowledge-options`.
import type {
  ConsultingKnowledgeEntry,
  ConsultingKnowledgeKind,
  ConsultingKnowledgeSearchResult,
} from "../../shared/consulting-knowledge.schema"

// The curation surface. Reading is a MANAGER's as well as an ADMIN's; curating
// is an ADMIN's alone. The editor below is hidden from a reader as a courtesy —
// the control is the server's refusal, not this flag (architecture.md §7A.2).

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

type BrowseResponse = {
  status: boolean
  message?: string
  data?: {
    results: ConsultingKnowledgeSearchResult[]
  }
}

type EntryResponse = {
  status: boolean
  message?: string
  data?: {
    entry: ConsultingKnowledgeEntry
  }
}

type SaveState = {
  status: "idle" | "loading" | "saved" | "conflict" | "validation" | "error"
  message: string
}

const blankEntry = (): ConsultingKnowledgeEntry => ({
  code: "",
  kind: "business_domain",
  domainCode: "customer-operations",
  title: "",
  summary: "",
  tags: [],
  matchTerms: [],
  stageScopes: [],
  taxonomyCodes: [],
  processCodes: [],
  problemCodes: [],
  useCaseCodes: [],
  relatedCodes: [],
  details: {
    objective: null,
    applicability: [],
    questions: [],
    criteria: [],
    signals: [],
    steps: [],
    risks: [],
    mitigations: [],
    roiDrivers: [],
    bestPractices: [],
    notes: [],
  },
  sortOrder: 1,
  active: true,
  revision: 0,
})

export default function KnowledgeBrowser() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<ConsultingKnowledgeKind | "">("")
  const [stage, setStage] = useState<string>("")
  const [includeInactive, setIncludeInactive] = useState(false)
  const [canCurate, setCanCurate] = useState(false)
  const [results, setResults] = useState<ConsultingKnowledgeSearchResult[]>([])
  const [selected, setSelected] = useState<ConsultingKnowledgeEntry | null>(null)
  const [form, setForm] = useState<ConsultingKnowledgeEntry>(blankEntry())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [error, setError] = useState("")
  const [saveState, setSaveState] = useState<SaveState>({
    status: "idle",
    message: "",
  })

  // The initial load runs once, on mount. The filters below re-run it on the
  // curator's explicit search, deliberately — re-fetching on every keystroke is
  // not what a curation browser should do.
  useEffect(() => {
    void loadEntries()
    void loadRole()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Two refusals that must not be shown as one thing.
  //
  // 401 is "we do not know who you are" — the answer is the sign-in page.
  // `proxy.ts` cannot have caught it, because a session cookie was present and
  // only the server can tell that it is no longer good.
  //
  // 403 is "we know who you are, and this is not yours" — the CLIENT's answer,
  // and a real one. Signing in again would change nothing, so the surface says
  // so and stays put (architecture.md §7A.2).
  function refused(status: number) {
    if (status === 401) {
      router.replace(signInPath("/knowledge"))
      return true
    }

    if (status === 403) {
      setAccessDenied(true)
      return true
    }

    return false
  }

  async function loadRole() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: "include",
      })
      const result = (await response.json()) as { data?: { role?: string } }
      setCanCurate(result.data?.role === "ADMIN")
    } catch {
      // A reader who cannot be identified simply does not see the editor.
      setCanCurate(false)
    }
  }

  async function loadEntries() {
    setLoading(true)
    setError("")
    setAccessDenied(false)

    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set("query", query.trim())
      if (kind) params.set("kind", kind)
      if (stage) params.set("stage", stage)
      if (includeInactive) params.set("includeInactive", "true")
      params.set("domainCode", "customer-operations")

      const response = await fetch(`${API_BASE_URL}/knowledge?${params}`, {
        credentials: "include",
      })
      const result = (await response.json()) as BrowseResponse

      if (refused(response.status)) {
        setResults([])
        return
      }

      if (!response.ok || !result.status || !result.data) {
        throw new Error(
          result.message
            ? translateServerMessage(result.message, undefined, "knowledge.browser.error")
            : t("knowledge.browser.error"),
        )
      }

      setResults(result.data.results)
    } catch {
      setError(t("common.error.unexpected"))
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  async function loadEntry(code: string) {
    setError("")
    try {
      const response = await fetch(`${API_BASE_URL}/knowledge/entries/${code}`, {
        credentials: "include",
      })
      const result = (await response.json()) as EntryResponse

      if (refused(response.status)) return

      if (!response.ok || !result.status || !result.data) {
        throw new Error(
          result.message
            ? translateServerMessage(result.message, undefined, "knowledge.browser.error")
            : t("knowledge.browser.error"),
        )
      }

      setSelected(result.data.entry)
      setForm(result.data.entry)
      setSaveState({ status: "idle", message: "" })
    } catch {
      setError(t("common.error.unexpected"))
    }
  }

  async function saveEntry() {
    setSaving(true)
    setError("")
    setSaveState({ status: "idle", message: "" })

    try {
      // The server decides validity — relationships, revisions, duplicate
      // codes and all (coding-standards.md §5 "the client holds no business
      // rules"). This only avoids spending a request on an obviously empty
      // form, and reports whatever the server answers.
      if (!form.code.trim() || !form.title.trim() || !form.summary.trim()) {
        setSaveState({
          status: "validation",
          message: t("knowledge.browser.validation"),
        })
        return
      }

      const isUpdate = Boolean(selected?.code)
      const url = isUpdate
        ? `${API_BASE_URL}/knowledge/entries/${selected?.code}`
        : `${API_BASE_URL}/knowledge/entries`
      const response = await fetch(url, {
        method: isUpdate ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const result = (await response.json()) as EntryResponse & {
        data?: { currentRevision?: number }
      }

      if (refused(response.status)) return

      if (response.status === 400) {
        setSaveState({
          status: "validation",
          message: translateServerMessage(
            result.message,
            undefined,
            "knowledge.browser.validation",
          ),
        })
        return
      }

      if (response.status === 409) {
        setSaveState({
          status: "conflict",
          message:
            result.message
              ? translateServerMessage(result.message, undefined, "knowledge.browser.conflict")
              : t("knowledge.browser.conflict"),
        })
        if (result.data?.currentRevision !== undefined) {
          setForm((current) => ({
            ...current,
            revision: result.data?.currentRevision ?? current.revision,
          }))
        }
        return
      }

      if (!response.ok || !result.status || !result.data) {
        throw new Error(
          result.message
            ? translateServerMessage(result.message, undefined, "knowledge.browser.error")
            : t("knowledge.browser.error"),
        )
      }

      setSelected(result.data.entry)
      setForm(result.data.entry)
      setSaveState({
        status: "saved",
        message: translateServerMessage(
          result.message,
          undefined,
          "knowledge.browser.saved",
        ),
      })
      await loadEntries()
    } catch {
      setSaveState({
        status: "error",
        message: t("common.error.unexpected"),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={pageStackStyle}>
      {/* The page header, its title and its description belong to the shell.
          What is left here is the search, the results and the entry. */}
      <section style={filterCardStyle} aria-label={t("knowledge.browser.filters")}>
        <div style={filtersStyle}>
        <label style={fieldStyle}>
          <span>{t("knowledge.browser.filter.query")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("knowledge.browser.filter.query_placeholder")}
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          <span>{t("knowledge.browser.filter.kind")}</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as ConsultingKnowledgeKind | "")}
            style={inputStyle}
          >
            <option value="">{t("common.field.not_captured")}</option>
            {KNOWLEDGE_KINDS.map((option) => (
              <option key={option} value={option}>
                {t(`knowledge.kind.${option}`)}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span>{t("knowledge.browser.filter.include_inactive")}</span>
          <select
            value={String(includeInactive)}
            onChange={(event) => setIncludeInactive(event.target.value === "true")}
            style={inputStyle}
          >
            <option value="false">{t("common.field.no")}</option>
            <option value="true">{t("common.field.yes")}</option>
          </select>
        </label>

        <label style={fieldStyle}>
          <span>{t("knowledge.browser.filter.stage")}</span>
          <select
            value={stage}
            onChange={(event) => setStage(event.target.value)}
            style={inputStyle}
          >
            <option value="">{t("common.field.not_captured")}</option>
            {KNOWLEDGE_STAGES.map((option) => (
              <option key={option} value={option}>
                {t(`knowledge.stage.${option}`)}
              </option>
            ))}
          </select>
        </label>

          <button
            type="button"
            style={searchButtonStyle(loading)}
            disabled={loading}
            onClick={() => void loadEntries()}
          >
            {loading ? t("knowledge.browser.searching") : t("knowledge.browser.search")}
          </button>
        </div>
      </section>

      {accessDenied && (
        <InlineAlert tone="danger">
          {t("knowledge.browser.access_denied")}
        </InlineAlert>
      )}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {saveState.status !== "idle" && (
        <InlineAlert
          tone={
            saveState.status === "saved"
              ? "success"
              : saveState.status === "conflict" || saveState.status === "validation"
                ? "warning"
                : "danger"
          }
        >
          {saveState.message}
        </InlineAlert>
      )}

      <div className="knowledge-shell">
        <section style={resultsPaneStyle}>
          <h2 style={sectionTitleStyle}>{t("knowledge.browser.results")}</h2>
          {loading ? (
            <EmptyState>{t("knowledge.browser.loading")}</EmptyState>
          ) : results.length === 0 ? (
            <EmptyState>{t("knowledge.browser.empty")}</EmptyState>
          ) : (
            <ul className="knowledge-results" style={listStyle}>
              {results.map((result) => {
                const isSelected = selected?.code === result.entry.code

                return (
                  <li key={result.entry.code}>
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      style={resultButtonStyle(isSelected)}
                      onClick={() => void loadEntry(result.entry.code)}
                    >
                      <span style={resultCodeStyle}>{result.entry.code}</span>
                      <strong>{result.entry.title}</strong>
                      <span style={resultKindStyle}>{t(`knowledge.kind.${result.entry.kind}`)}</span>
                      <small style={resultReasonStyle}>
                        {result.reasons.join(" · ")}
                      </small>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {!canCurate ? (
          <section style={editorPaneStyle}>
            <h2 style={sectionTitleStyle}>{t("knowledge.browser.editor.title")}</h2>
            <EmptyState>{t("knowledge.browser.read_only")}</EmptyState>
          </section>
        ) : (
        <section style={editorPaneStyle}>
          <div style={editorHeaderStyle}>
            <h2 style={sectionTitleStyle}>{t("knowledge.browser.editor.title")}</h2>
            <button
              type="button"
              style={buttonStyle("secondary")}
              onClick={() => setForm(blankEntry())}
            >
              {t("knowledge.browser.new_entry")}
            </button>
          </div>
          <div style={editorGridStyle}>
            <label style={fieldStyle}>
              <span>{t("knowledge.browser.editor.code")}</span>
              <input
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span>{t("knowledge.browser.editor.kind")}</span>
              <select
                value={form.kind}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    kind: event.target.value as ConsultingKnowledgeKind,
                  }))
                }
                style={inputStyle}
              >
                {KNOWLEDGE_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {t(`knowledge.kind.${option}`)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span>{t("knowledge.browser.editor.title_field")}</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span>{t("knowledge.browser.editor.summary")}</span>
              <textarea
                value={form.summary}
                onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
                style={textareaStyle}
              />
            </label>
            <TextField
              label={t("knowledge.browser.editor.tags")}
              value={form.tags.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  tags: splitCsv(value),
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.match_terms")}
              value={form.matchTerms.join(", ")}
              onChange={(value) =>
                setForm((current) => ({ ...current, matchTerms: splitCsv(value) }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.taxonomy_codes")}
              value={form.taxonomyCodes.join(", ")}
              onChange={(value) =>
                setForm((current) => ({ ...current, taxonomyCodes: splitCsv(value) }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.process_codes")}
              value={form.processCodes.join(", ")}
              onChange={(value) =>
                setForm((current) => ({ ...current, processCodes: splitCsv(value) }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.problem_codes")}
              value={form.problemCodes.join(", ")}
              onChange={(value) =>
                setForm((current) => ({ ...current, problemCodes: splitCsv(value) }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.use_case_codes")}
              value={form.useCaseCodes.join(", ")}
              onChange={(value) =>
                setForm((current) => ({ ...current, useCaseCodes: splitCsv(value) }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.related_codes")}
              value={form.relatedCodes.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  relatedCodes: splitCsv(value),
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.sort_order")}
              value={String(form.sortOrder)}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  sortOrder: value ? Number(value) : 0,
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.stage_scopes")}
              value={form.stageScopes.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  stageScopes: splitCsv(value) as ConsultingKnowledgeEntry["stageScopes"],
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.revision")}
              value={String(form.revision)}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  revision: value ? Number(value) : 0,
                }))
              }
            />
            <label style={fieldStyle}>
              <span>{t("knowledge.browser.editor.objective")}</span>
              <textarea
                value={form.details.objective ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    details: { ...current.details, objective: event.target.value || null },
                  }))
                }
                style={textareaStyle}
              />
            </label>
            <TextField
              label={t("knowledge.browser.editor.applicability")}
              value={form.details.applicability.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  details: { ...current.details, applicability: splitCsv(value) },
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.questions")}
              value={form.details.questions.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  details: { ...current.details, questions: splitCsv(value) },
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.criteria")}
              value={form.details.criteria.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  details: { ...current.details, criteria: splitCsv(value) },
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.signals")}
              value={form.details.signals.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  details: { ...current.details, signals: splitCsv(value) },
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.steps")}
              value={form.details.steps.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  details: { ...current.details, steps: splitCsv(value) },
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.risks")}
              value={form.details.risks.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  details: { ...current.details, risks: splitCsv(value) },
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.mitigations")}
              value={form.details.mitigations.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  details: { ...current.details, mitigations: splitCsv(value) },
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.roi_drivers")}
              value={form.details.roiDrivers.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  details: { ...current.details, roiDrivers: splitCsv(value) },
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.best_practices")}
              value={form.details.bestPractices.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  details: { ...current.details, bestPractices: splitCsv(value) },
                }))
              }
            />
            <TextField
              label={t("knowledge.browser.editor.notes")}
              value={form.details.notes.join(", ")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  details: { ...current.details, notes: splitCsv(value) },
                }))
              }
            />
            <label style={fieldStyle}>
              <span>{t("knowledge.browser.editor.active")}</span>
              <select
                value={String(form.active)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    active: event.target.value === "true",
                  }))
                }
                style={inputStyle}
              >
                <option value="true">{t("common.field.yes")}</option>
                <option value="false">{t("common.field.no")}</option>
              </select>
            </label>
          </div>

          <div style={actionRowStyle}>
            <button
              type="button"
              style={buttonStyle("secondary")}
              onClick={() => setForm(selected ?? blankEntry())}
            >
              {t("knowledge.browser.reset")}
            </button>
            <button
              type="button"
              style={buttonStyle("primary", saving)}
              disabled={saving}
              onClick={() => void saveEntry()}
            >
              {saving ? t("knowledge.browser.saving") : t("knowledge.browser.save")}
            </button>
          </div>
        </section>
        )}
      </div>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string | null) => void
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    </label>
  )
}

const splitCsv = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

// The curation surface uses the shared controls: the same inputs, buttons and
// selected state as every other internal screen. Its own styles are limited to
// the two panes and the result row.

const filterCardStyle: React.CSSProperties = cardStyle

const filtersStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: uiSpace.sm,
  alignItems: "end",
}

const searchButtonStyle = (loading: boolean): React.CSSProperties => ({
  ...buttonStyle("primary", loading),
  alignSelf: "end",
})

const resultsPaneStyle: React.CSSProperties = {
  ...cardStyle,
  gap: uiSpace.sm,
  alignContent: "start",
}

const editorPaneStyle: React.CSSProperties = {
  ...cardStyle,
  gap: uiSpace.md,
  alignContent: "start",
}

const editorHeaderStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: uiSpace.sm,
}

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: uiSpace.xxs,
}

// The selected entry carries the same tint the sidebar's active item does, so
// "this is the one you are looking at" reads the same everywhere.
const resultButtonStyle = (selected: boolean): React.CSSProperties => ({
  width: "100%",
  display: "grid",
  gap: 2,
  padding: uiSpace.sm,
  borderRadius: 8,
  border: `1px solid ${selected ? uiColors.primary : uiColors.border}`,
  background: selected ? uiColors.primaryTint : uiColors.surface,
  color: uiColors.textPrimary,
  textAlign: "left",
  fontSize: 14,
  cursor: "pointer",
})

const resultCodeStyle: React.CSSProperties = {
  color: uiColors.textMuted,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
}

const resultKindStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 13,
}

const resultReasonStyle: React.CSSProperties = {
  color: uiColors.textMuted,
  fontSize: 12,
}

const editorGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: uiSpace.sm,
}
