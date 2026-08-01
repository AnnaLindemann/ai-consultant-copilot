"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  Badge,
  EmptyState,
  InlineAlert,
  actionRowStyle,
  bodyTextStyle,
  buttonStyle,
  cardStyle,
  fieldStyle,
  inputStyle,
  metaTextStyle,
  mutedTextStyle,
  pageStackStyle,
  sectionTitleStyle,
  subSectionTitleStyle,
  textareaStyle,
  type Tone,
} from "./UiKit"
import { signInPath } from "../lib/auth-redirect"
import { uiColors, uiRadius, uiSpace } from "../lib/design-tokens"
import { TECHNOLOGY_CHANGE_KINDS } from "../lib/technology-options"
import { t, translateServerMessage } from "../i18n"

// Type-only, like every other client import from `shared/`: those modules sit
// outside the frontend's build root, so a value imported from one would not
// resolve. The identifiers the dropdowns need come from `lib/technology-options`.
import type {
  TechnologyCategory,
  TechnologyChangeKind,
  TechnologyProfile,
  TechnologySource,
} from "../../shared/technology-knowledge.schema"

// The Technology Knowledge Base (screen A10): the category hierarchy, the
// profiles under it, the registry of official sources, and each profile's
// update status.
//
// **Nothing here writes a profile.** Curating a profile means proposing a
// change to it; the change reaches the knowledge base only when an
// administrator approves the proposal on the review screen. That is the
// product's rule, and the surface is shaped to make it obvious rather than to
// work around it.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"

type RegistriesResponse = {
  status: boolean
  message?: string
  data?: { categories: TechnologyCategory[]; sources: TechnologySource[] }
}

type ProfilesResponse = {
  status: boolean
  message?: string
  data?: { profiles: TechnologyProfile[] }
}

type ProposalResponse = {
  status: boolean
  message?: string
  data?: { proposal?: { id: string }; failure?: string; unknownCodes?: string[] }
}

type ProposalForm = {
  changeKind: TechnologyChangeKind
  profileCode: string
  categoryCode: string
  title: string
  summary: string
  role: string
  strengths: string
  limitations: string
  suitability: string
  matchTerms: string
  tags: string
  rationale: string
  assumptions: string
  gaps: string
  sourceCodes: string[]
}

const blankProposal = (categoryCode: string): ProposalForm => ({
  changeKind: "create",
  profileCode: "",
  categoryCode,
  title: "",
  summary: "",
  role: "",
  strengths: "",
  limitations: "",
  suitability: "",
  matchTerms: "",
  tags: "",
  rationale: "",
  assumptions: "",
  gaps: "",
  sourceCodes: [],
})

export default function TechnologyLibrary() {
  const router = useRouter()
  const [categories, setCategories] = useState<TechnologyCategory[]>([])
  const [sources, setSources] = useState<TechnologySource[]>([])
  const [profiles, setProfiles] = useState<TechnologyProfile[]>([])
  const [categoryFilter, setCategoryFilter] = useState("")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<TechnologyProfile | null>(null)
  const [composing, setComposing] = useState(false)
  const [form, setForm] = useState<ProposalForm>(blankProposal(""))
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Two refusals that must not be shown as one thing.
  //
  // 401 is "we do not know who you are" — the answer is the sign-in page.
  // 403 is "we know who you are, and this is not yours" — a real answer for
  // every role but ADMIN. Signing in again would change nothing, so the surface
  // says so and stays put (architecture.md §7A.2).
  function refused(status: number) {
    if (status === 401) {
      router.replace(signInPath("/technology"))
      return true
    }

    if (status === 403) {
      setAccessDenied(true)
      return true
    }

    return false
  }

  async function loadAll() {
    setLoading(true)
    setError("")
    setAccessDenied(false)

    try {
      const registries = await fetch(`${API_BASE_URL}/technology/registries`, {
        credentials: "include",
      })

      if (refused(registries.status)) return

      const registryResult = (await registries.json()) as RegistriesResponse
      if (!registries.ok || !registryResult.data) {
        throw new Error(t("technology.library.error"))
      }

      setCategories(registryResult.data.categories)
      setSources(registryResult.data.sources)
      await loadProfiles()
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setLoading(false)
    }
  }

  async function loadProfiles() {
    try {
      const params = new URLSearchParams()
      if (categoryFilter) params.set("categoryCode", categoryFilter)
      if (query.trim()) params.set("query", query.trim())

      const response = await fetch(
        `${API_BASE_URL}/technology/profiles?${params}`,
        { credentials: "include" },
      )

      if (refused(response.status)) return

      const result = (await response.json()) as ProfilesResponse
      if (!response.ok || !result.data) {
        throw new Error(t("technology.library.error"))
      }

      setProfiles(result.data.profiles)
    } catch {
      setError(t("common.error.unexpected"))
    }
  }

  function startProposal(kind: TechnologyChangeKind, profile: TechnologyProfile | null) {
    setNotice("")
    setError("")
    setComposing(true)
    setForm(
      profile === null
        ? blankProposal(categories[0]?.code ?? "")
        : {
            changeKind: kind,
            profileCode: profile.code,
            categoryCode: profile.categoryCode,
            title: profile.title,
            summary: profile.summary,
            role: profile.details.role,
            strengths: profile.details.strengths.join("\n"),
            limitations: profile.details.limitations.join("\n"),
            suitability: profile.details.suitability.join("\n"),
            matchTerms: profile.matchTerms.join(", "),
            tags: profile.tags.join(", "),
            rationale: "",
            assumptions: "",
            gaps: "",
            sourceCodes: [],
          },
    )
  }

  async function submitProposal() {
    setSubmitting(true)
    setError("")
    setNotice("")

    try {
      // The server decides validity — sources, categories, coherence and all
      // (coding-standards.md §5 "the client holds no business rules"). This
      // only avoids spending a request on an obviously empty form.
      if (
        !form.profileCode.trim() ||
        !form.rationale.trim() ||
        form.sourceCodes.length === 0
      ) {
        setError(t("technology.proposal.validation"))
        return
      }

      const isDeprecation = form.changeKind === "deprecate"

      const response = await fetch(`${API_BASE_URL}/technology/proposals`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changeKind: form.changeKind,
          profileCode: form.profileCode.trim(),
          categoryCode: form.categoryCode,
          proposedProfile: isDeprecation
            ? null
            : {
                code: form.profileCode.trim(),
                categoryCode: form.categoryCode,
                title: form.title.trim(),
                summary: form.summary.trim(),
                details: {
                  role: form.role.trim(),
                  strengths: toList(form.strengths),
                  limitations: toList(form.limitations),
                  suitability: toList(form.suitability),
                },
                matchTerms: toInlineList(form.matchTerms),
                tags: toInlineList(form.tags),
                status: "active",
                sortOrder: 50,
              },
          rationale: form.rationale.trim(),
          assumptions: toList(form.assumptions),
          gaps: toList(form.gaps),
          sourceCodes: form.sourceCodes,
        }),
      })

      if (refused(response.status)) return

      const result = (await response.json()) as ProposalResponse

      if (!response.ok || !result.status) {
        setError(
          translateServerMessage(result.message, undefined, "technology.library.error"),
        )
        return
      }

      // Drafting changes nothing: the knowledge base moves when an
      // administrator approves the proposal, not now.
      setNotice(t("technology.proposal.submitted"))
      setComposing(false)
    } catch {
      setError(t("common.error.unexpected"))
    } finally {
      setSubmitting(false)
    }
  }

  if (accessDenied) {
    return (
      <div style={pageStackStyle}>
        <InlineAlert tone="warning">{t("technology.access_denied")}</InlineAlert>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={pageStackStyle}>
        <p style={mutedTextStyle}>{t("common.state.loading")}</p>
      </div>
    )
  }

  const categoryOf = (code: string) =>
    categories.find((one) => one.code === code)?.title ?? code

  return (
    <div style={pageStackStyle}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t("technology.library.filter.title")}</h2>
        <div style={filterRowStyle}>
          <label style={fieldStyle}>
            {t("technology.library.filter.category")}
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              style={inputStyle}
            >
              <option value="">{t("technology.library.filter.all_categories")}</option>
              {categories.map((category) => (
                <option key={category.code} value={category.code}>
                  {category.title}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            {t("technology.library.filter.query")}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={inputStyle}
            />
          </label>
          <div style={actionRowStyle}>
            <button
              type="button"
              onClick={() => void loadProfiles()}
              style={buttonStyle("secondary")}
            >
              {t("technology.library.filter.apply")}
            </button>
            <button
              type="button"
              onClick={() => startProposal("create", null)}
              style={buttonStyle("primary")}
            >
              {t("technology.library.propose_new")}
            </button>
          </div>
        </div>
      </section>

      {composing && (
        <ProposalComposer
          form={form}
          categories={categories}
          sources={sources}
          submitting={submitting}
          onChange={setForm}
          onCancel={() => setComposing(false)}
          onSubmit={() => void submitProposal()}
        />
      )}

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t("technology.library.profiles.title")}</h2>
        <p style={mutedTextStyle}>{t("technology.library.profiles.hint")}</p>

        {profiles.length === 0 ? (
          <EmptyState title={t("technology.library.empty.title")}>
            <p style={mutedTextStyle}>
              {t("technology.library.empty.description")}
            </p>
          </EmptyState>
        ) : (
          <ul style={listStyle}>
            {profiles.map((profile) => (
              <li key={profile.code} style={listItemStyle}>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(selected?.code === profile.code ? null : profile)
                  }
                  style={listButtonStyle}
                >
                  <span style={listTitleStyle}>{profile.title}</span>
                  <span style={listMetaStyle}>{categoryOf(profile.categoryCode)}</span>
                  <Badge
                    tone={statusTone(profile.status)}
                    label={t(
                      profile.status === "active"
                        ? "technology.status.active"
                        : "technology.status.deprecated",
                    )}
                  />
                </button>

                {selected?.code === profile.code && (
                  <ProfileDetail
                    profile={profile}
                    sources={sources}
                    onPropose={(kind) => startProposal(kind, profile)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t("technology.library.sources.title")}</h2>
        <p style={mutedTextStyle}>{t("technology.library.sources.hint")}</p>

        <ul style={listStyle}>
          {sources.map((source) => (
            <li key={source.code} style={sourceItemStyle}>
              <div>
                <p style={listTitleStyle}>{source.name}</p>
                <p style={metaTextStyle}>{source.summary}</p>
              </div>
              <ul style={channelListStyle}>
                {source.officialChannels.map((channel) => (
                  <li key={channel.url} style={metaTextStyle}>
                    {channel.label}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function ProfileDetail({
  profile,
  sources,
  onPropose,
}: {
  profile: TechnologyProfile
  sources: TechnologySource[]
  onPropose: (kind: TechnologyChangeKind) => void
}) {
  return (
    <div style={detailStyle}>
      <p style={bodyTextStyle}>{profile.summary}</p>

      <DetailBlock titleKey="technology.profile.role" values={[profile.details.role]} />
      <DetailBlock
        titleKey="technology.profile.strengths"
        values={profile.details.strengths}
      />
      <DetailBlock
        titleKey="technology.profile.limitations"
        values={profile.details.limitations}
      />
      <DetailBlock
        titleKey="technology.profile.suitability"
        values={profile.details.suitability}
      />

      <p style={metaTextStyle}>
        {t("technology.profile.revision", { revision: profile.revision })}
      </p>

      {/* Where this content came from. A seeded profile names its official
          source and says plainly that no approval stands behind it; a curated
          one points at the change history instead. */}
      <p style={metaTextStyle}>
        {profile.origin === "product_seed"
          ? t("technology.profile.origin.product_seed", {
              sources:
                profile.originSourceCodes.length === 0
                  ? t("technology.history.no_sources")
                  : profile.originSourceCodes
                      .map(
                        (code) =>
                          sources.find((one) => one.code === code)?.name ?? code,
                      )
                      .join(", "),
            })
          : t("technology.profile.origin.curator")}
      </p>

      <div style={actionRowStyle}>
        <button
          type="button"
          onClick={() => onPropose("revise")}
          style={buttonStyle("secondary")}
        >
          {t("technology.library.propose_revision")}
        </button>
        {profile.status === "active" && (
          <button
            type="button"
            onClick={() => onPropose("deprecate")}
            style={buttonStyle("ghost")}
          >
            {t("technology.library.propose_deprecation")}
          </button>
        )}
      </div>
    </div>
  )
}

function DetailBlock({
  titleKey,
  values,
}: {
  titleKey: Parameters<typeof t>[0]
  values: readonly string[]
}) {
  if (values.length === 0) return null

  return (
    <div style={detailBlockStyle}>
      <p style={subSectionTitleStyle}>{t(titleKey)}</p>
      <ul style={detailListStyle}>
        {values.map((value) => (
          <li key={value} style={bodyTextStyle}>
            {value}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProposalComposer({
  form,
  categories,
  sources,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: ProposalForm
  categories: TechnologyCategory[]
  sources: TechnologySource[]
  submitting: boolean
  onChange: (form: ProposalForm) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const isDeprecation = form.changeKind === "deprecate"

  const set = (patch: Partial<ProposalForm>) => onChange({ ...form, ...patch })

  const toggleSource = (code: string) =>
    set({
      sourceCodes: form.sourceCodes.includes(code)
        ? form.sourceCodes.filter((one) => one !== code)
        : [...form.sourceCodes, code],
    })

  return (
    <section style={cardStyle}>
      <h2 style={sectionTitleStyle}>{t("technology.proposal.title")}</h2>
      <p style={mutedTextStyle}>{t("technology.proposal.gate_hint")}</p>

      <div style={formGridStyle}>
        <label style={fieldStyle}>
          {t("technology.proposal.change_kind")}
          <select
            value={form.changeKind}
            onChange={(event) =>
              set({ changeKind: event.target.value as TechnologyChangeKind })
            }
            style={inputStyle}
          >
            {TECHNOLOGY_CHANGE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`technology.change_kind.${kind}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          {t("technology.proposal.profile_code")}
          <input
            value={form.profileCode}
            onChange={(event) => set({ profileCode: event.target.value })}
            style={inputStyle}
          />
        </label>

        <label style={fieldStyle}>
          {t("technology.proposal.category")}
          <select
            value={form.categoryCode}
            onChange={(event) => set({ categoryCode: event.target.value })}
            style={inputStyle}
          >
            {categories.map((category) => (
              <option key={category.code} value={category.code}>
                {category.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!isDeprecation && (
        <>
          <div style={formGridStyle}>
            <label style={fieldStyle}>
              {t("technology.proposal.profile_title")}
              <input
                value={form.title}
                onChange={(event) => set({ title: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              {t("technology.proposal.match_terms")}
              <input
                value={form.matchTerms}
                onChange={(event) => set({ matchTerms: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              {t("technology.proposal.tags")}
              <input
                value={form.tags}
                onChange={(event) => set({ tags: event.target.value })}
                style={inputStyle}
              />
            </label>
          </div>

          <label style={fieldStyle}>
            {t("technology.proposal.summary")}
            <textarea
              value={form.summary}
              onChange={(event) => set({ summary: event.target.value })}
              style={textareaStyle}
            />
          </label>

          <label style={fieldStyle}>
            {t("technology.profile.role")}
            <textarea
              value={form.role}
              onChange={(event) => set({ role: event.target.value })}
              style={textareaStyle}
            />
          </label>

          <label style={fieldStyle}>
            {t("technology.profile.strengths")}
            <textarea
              value={form.strengths}
              onChange={(event) => set({ strengths: event.target.value })}
              style={textareaStyle}
            />
          </label>

          <label style={fieldStyle}>
            {t("technology.profile.limitations")}
            <textarea
              value={form.limitations}
              onChange={(event) => set({ limitations: event.target.value })}
              style={textareaStyle}
            />
          </label>

          <label style={fieldStyle}>
            {t("technology.profile.suitability")}
            <textarea
              value={form.suitability}
              onChange={(event) => set({ suitability: event.target.value })}
              style={textareaStyle}
            />
          </label>
        </>
      )}

      <label style={fieldStyle}>
        {t("technology.proposal.rationale")}
        <textarea
          value={form.rationale}
          onChange={(event) => set({ rationale: event.target.value })}
          style={textareaStyle}
        />
      </label>

      <label style={fieldStyle}>
        {t("technology.proposal.assumptions")}
        <textarea
          value={form.assumptions}
          onChange={(event) => set({ assumptions: event.target.value })}
          style={textareaStyle}
        />
      </label>

      <label style={fieldStyle}>
        {t("technology.proposal.gaps")}
        <textarea
          value={form.gaps}
          onChange={(event) => set({ gaps: event.target.value })}
          style={textareaStyle}
        />
      </label>

      <fieldset style={sourceFieldsetStyle}>
        <legend style={subSectionTitleStyle}>
          {t("technology.proposal.sources")}
        </legend>
        <p style={metaTextStyle}>{t("technology.proposal.sources_hint")}</p>
        <div style={sourceGridStyle}>
          {sources.map((source) => (
            <label key={source.code} style={sourceCheckboxStyle}>
              <input
                type="checkbox"
                checked={form.sourceCodes.includes(source.code)}
                onChange={() => toggleSource(source.code)}
              />
              {source.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div style={actionRowStyle}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          style={buttonStyle("primary")}
        >
          {submitting
            ? t("common.state.saving")
            : t("technology.proposal.submit")}
        </button>
        <button type="button" onClick={onCancel} style={buttonStyle("ghost")}>
          {t("common.action.cancel")}
        </button>
      </div>
    </section>
  )
}

const statusTone = (status: TechnologyProfile["status"]): Tone =>
  status === "active" ? "success" : "neutral"

// One item per line, blanks dropped: a curator writes a list the way a list
// reads, and an empty line is not an entry.
const toList = (value: string): string[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const toInlineList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

const filterRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: uiSpace.sm,
  alignItems: "end",
  marginTop: uiSpace.sm,
}

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: uiSpace.sm,
  marginTop: uiSpace.sm,
}

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: `${uiSpace.sm} 0 0`,
  padding: 0,
  display: "grid",
  gap: uiSpace.xs,
}

const listItemStyle: React.CSSProperties = {
  border: `1px solid ${uiColors.border}`,
  borderRadius: uiRadius.control,
  overflow: "hidden",
}

const listButtonStyle: React.CSSProperties = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  gap: uiSpace.sm,
  padding: uiSpace.sm,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  flexWrap: "wrap",
}

const listTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 650,
  color: uiColors.textPrimary,
}

const listMetaStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 13,
}

const detailStyle: React.CSSProperties = {
  padding: uiSpace.sm,
  borderTop: `1px solid ${uiColors.border}`,
  background: uiColors.subtle,
  display: "grid",
  gap: uiSpace.sm,
}

const detailBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
}

const detailListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: uiSpace.md,
  display: "grid",
  gap: 2,
}

const sourceItemStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: uiSpace.sm,
  padding: uiSpace.sm,
  border: `1px solid ${uiColors.border}`,
  borderRadius: uiRadius.control,
}

const channelListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 2,
  justifyItems: "end",
}

const sourceFieldsetStyle: React.CSSProperties = {
  marginTop: uiSpace.sm,
  padding: uiSpace.sm,
  border: `1px solid ${uiColors.border}`,
  borderRadius: uiRadius.control,
}

const sourceGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: uiSpace.xs,
  marginTop: uiSpace.xs,
}

const sourceCheckboxStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: uiSpace.xs,
  fontSize: 14,
}
