"use client"

import { useState } from "react"

import {
  WorkflowAccordion,
  type WorkflowSectionItem,
} from "./WorkflowPrimitives"
import {
  cardStyle as kitCardStyle,
  eyebrowStyle as kitEyebrowStyle,
  mutedTextStyle,
  sectionTitleStyle,
} from "./UiKit"
import { t } from "../i18n"
import { uiColors, uiSpace } from "../lib/design-tokens"

import type {
  ConsultingKnowledgeKind,
  KnowledgePackage,
  KnowledgeSelection,
} from "../../shared/consulting-knowledge.schema"

// The curated knowledge the consultant's stage view shows. It renders exactly
// the package the deterministic retrieval selected — the same entries, in the
// same order, that the Assessment was grounded in — so what the consultant
// reads is what the model was given.
//
// This is a consultant-facing panel. It is deliberately not rendered anywhere
// in the Client Portal: curated frameworks, AI-readiness criteria, and guidance
// are internal (domain-model.md §2 "Client Portal").

type KnowledgeGuidancePanelProps = {
  knowledgePackage: KnowledgePackage | null
}

export default function KnowledgeGuidancePanel({
  knowledgePackage,
}: KnowledgeGuidancePanelProps) {
  const groups = groupByKind(knowledgePackage?.entries ?? [])
  const sections: WorkflowSectionItem[] = groups.map(([kind, entries]) => ({
    id: kind,
    title: t(`knowledge.kind.${kind}`),
    status: entries.length === 0 ? "not_started" : "complete",
    summary:
      entries.length === 0
        ? t("knowledge.guidance.section.empty")
        : t("knowledge.guidance.section.count", { count: entries.length }),
    content: (
      <div style={blockStyle}>
        <ul style={listStyle}>
          {entries.map((entry) => (
            <li key={entry.code} style={listItemStyle}>
              <strong>{entry.title}</strong>
              <div style={itemSummaryStyle}>{entry.summary}</div>
              {/* Why this entry was selected, so the grounding is
                  inspectable rather than merely asserted. */}
              <div style={itemReasonStyle}>{entry.reasons.join(" · ")}</div>
            </li>
          ))}
        </ul>
      </div>
    ),
  }))
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "empty")

  return (
    <section style={panelStyle}>
      <p style={eyebrowStyle}>{t("knowledge.guidance.eyebrow")}</p>
      <h2 style={titleStyle}>{t("knowledge.guidance.title")}</h2>
      <p style={introStyle}>{t("knowledge.guidance.intro")}</p>

      {knowledgePackage === null || groups.length === 0 ? (
        <p style={emptyStyle}>{t("knowledge.guidance.empty")}</p>
      ) : (
        <>
          {knowledgePackage.fallback && (
            <p style={fallbackStyle}>{t("knowledge.guidance.fallback")}</p>
          )}
          <WorkflowAccordion
            items={sections}
            activeId={activeId}
            onActiveIdChange={setActiveId}
          />
        </>
      )}
    </section>
  )
}

// Grouped for reading, but the package's rank order is preserved inside each
// group and the groups follow the order the entries were selected in.
function groupByKind(
  entries: KnowledgeSelection[],
): [ConsultingKnowledgeKind, KnowledgeSelection[]][] {
  const groups = new Map<ConsultingKnowledgeKind, KnowledgeSelection[]>()

  for (const entry of entries) {
    const existing = groups.get(entry.kind)
    if (existing === undefined) {
      groups.set(entry.kind, [entry])
      continue
    }

    existing.push(entry)
  }

  return [...groups.entries()]
}

const panelStyle: React.CSSProperties = kitCardStyle

const eyebrowStyle: React.CSSProperties = kitEyebrowStyle

const titleStyle: React.CSSProperties = {
  ...sectionTitleStyle,
  margin: `${uiSpace.xxs} 0 ${uiSpace.xs}`,
}

const introStyle: React.CSSProperties = mutedTextStyle

const fallbackStyle: React.CSSProperties = {
  margin: `${uiSpace.sm} 0 0`,
  color: uiColors.warning,
  fontSize: 13,
  lineHeight: 1.5,
}

const blockStyle: React.CSSProperties = {
  padding: 0,
  borderRadius: 0,
  background: "transparent",
  border: 0,
}

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: "grid",
  gap: 6,
}

const listItemStyle: React.CSSProperties = {
  lineHeight: 1.45,
}

const itemSummaryStyle: React.CSSProperties = {
  color: uiColors.textSecondary,
  fontSize: 13,
  marginTop: 3,
}

const itemReasonStyle: React.CSSProperties = {
  color: uiColors.textMuted,
  fontSize: 11,
  marginTop: 3,
}

const emptyStyle: React.CSSProperties = {
  ...mutedTextStyle,
  marginTop: uiSpace.sm,
}
