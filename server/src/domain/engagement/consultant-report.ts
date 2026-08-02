import { canonicalStageContent } from "./canonical-content.js"
import { canonicalAssessmentContent } from "./assessment.js"
import { canonicalOpportunityContent } from "./opportunities.js"
import { canonicalRecommendationContent } from "./recommendations.js"
import { canonicalRoadmapContent } from "./implementation-roadmap.js"
import { createSha256Hash } from "../../lib/create-sha256-hash.js"

import type { Assessment } from "../../../../shared/assessment.schema.js"
import type { DiscoveryProfile } from "../../../../shared/discovery-profile.schema.js"
import type { OpportunityVersionDetail } from "../../../../shared/opportunity.schema.js"
import type { RecommendationVersionDetail } from "../../../../shared/recommendation.schema.js"
import type {
  RoadmapRecommendationDisposition,
  RoadmapVersionDetail,
} from "../../../../shared/implementation-roadmap.schema.js"
import type {
  ConsultantReportContent,
  ConsultantReportSubmission,
  FollowUpQuestion,
  GeneratedConsultantReportDraft,
  ReportReviewState,
  ReportSourceSnapshot,
} from "../../../../shared/consultant-report.schema.js"

export type CitableFollowUpTemplate = ReadonlyMap<
  string,
  { kind: string; title: string; summary: string; revision?: number; fingerprint?: string }
>

export type ReportSourceBundle = {
  discovery: DiscoveryProfile
  assessment: Assessment
  assessmentRevision: number
  opportunities: OpportunityVersionDetail
  recommendations: RecommendationVersionDetail
  roadmap: RoadmapVersionDetail
}

export type ReportEligibility =
  | { eligible: true; sources: ReportSourceBundle; snapshot: ReportSourceSnapshot }
  | { eligible: false; missingAcceptedSources: string[] }

export const canReplaceReportVersion = (
  currentReviewState: ReportReviewState | null,
  replaceConsultantEdits: boolean,
): boolean =>
  currentReviewState === null ||
  currentReviewState === "draft" ||
  replaceConsultantEdits

export const canEditReportVersionInPlace = (
  currentReviewState: ReportReviewState,
): boolean => currentReviewState !== "approved"

export const isReportVersionStale = (
  versionSnapshot: ReportSourceSnapshot | null,
  currentSnapshot: ReportSourceSnapshot | null,
): boolean =>
  versionSnapshot !== null &&
  currentSnapshot !== null &&
  canonicalStageContent(versionSnapshot) !== canonicalStageContent(currentSnapshot)

export const reportSourceSnapshot = (
  sources: ReportSourceBundle,
  templates: CitableFollowUpTemplate = new Map(),
): ReportSourceSnapshot => ({
  fingerprint: sourceFingerprint(sources, templates),
  discoveryFingerprint: discoveryFingerprint(sources.discovery),
  assessmentRevision: sources.assessmentRevision,
  assessmentFingerprint: assessmentFingerprint(sources.assessment),
  opportunityVersionId: sources.opportunities.id,
  opportunityVersionNumber: sources.opportunities.versionNumber,
  opportunityFingerprint: opportunityFingerprint(sources.opportunities),
  opportunityVersions: sources.opportunities.prioritization.opportunities
    .map((opportunity) => ({
      id: opportunity.id,
      versionNumber: sources.opportunities.versionNumber,
      priorityRank: opportunity.priorityRank,
      fingerprint: createSha256Hash(canonicalStageContent(opportunity)),
    }))
    .sort((left, right) => left.priorityRank - right.priorityRank),
  recommendationVersionId: sources.recommendations.id,
  recommendationVersionNumber: sources.recommendations.versionNumber,
  recommendationFingerprint: recommendationFingerprint(sources.recommendations),
  recommendationVersions: sources.recommendations.recommendationSet.recommendations
    .map((recommendation) => ({
      id: recommendation.id,
      versionNumber: sources.recommendations.versionNumber,
      fingerprint: createSha256Hash(canonicalStageContent(recommendation)),
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
  recommendationDispositions: recommendationDispositions(sources),
  roadmapVersionId: sources.roadmap.id,
  roadmapVersionNumber: sources.roadmap.versionNumber,
  roadmapFingerprint: roadmapFingerprint(sources.roadmap),
  gaps: sourceGapRecords(sources),
  followUpTemplates: Array.from(templates.entries())
    .filter(([, template]) => template.kind === "follow_up_template")
    .map(([code, template]) => ({
      entryId: code,
      code,
      version: template.revision ?? 1,
      fingerprint:
        template.fingerprint ??
        createSha256Hash(canonicalStageContent({
          code,
          kind: template.kind,
          title: template.title,
          summary: template.summary,
          revision: template.revision ?? 1,
        })),
    }))
    .sort((left, right) => left.code.localeCompare(right.code)),
})

export type FollowUpResolution =
  | { resolved: true; questions: FollowUpQuestion[] }
  | {
      resolved: false
      unknownTemplateCodes: string[]
      nonTemplateCodes: string[]
      ungroundedQuestions: string[]
      invalidSourceReferences: string[]
    }

type FollowUpQuestionDraft = Omit<
  FollowUpQuestion,
  | "id"
  | "sourceGapId"
  | "sourceFingerprint"
  | "templateEntryId"
  | "templateVersion"
  | "templateFingerprint"
  | "templateTitle"
> & {
  id?: string
  templateTitle?: string | null
  sourceGapId?: string
  sourceFingerprint?: string
  templateEntryId?: string | null
  templateVersion?: number | null
  templateFingerprint?: string | null
}

export const resolveGeneratedReport = (
  generated: GeneratedConsultantReportDraft,
  sources: ReportSourceBundle,
  templates: CitableFollowUpTemplate,
  mintId: () => string,
): FollowUpResolution & { report?: ConsultantReportContent } => {
  const resolution = resolveFollowUpQuestions(
    generated.followUpQuestions,
    sources,
    templates,
    mintId,
  )
  if (!resolution.resolved) return resolution
  const invalidSourceReferences = invalidReportReferences(generated, sources)
  if (invalidSourceReferences.length > 0) {
    return {
      resolved: false,
      unknownTemplateCodes: [],
      nonTemplateCodes: [],
      ungroundedQuestions: [],
      invalidSourceReferences,
    }
  }

  return {
    resolved: true,
    questions: resolution.questions,
      report: {
        ...generated,
        followUpQuestions: resolution.questions,
        sourceSnapshot: reportSourceSnapshot(sources, templates),
      },
  }
}

export const resolveReportSubmission = (
  submission: ConsultantReportSubmission,
  sources: ReportSourceBundle,
  templates: CitableFollowUpTemplate,
  mintId: () => string,
): FollowUpResolution & { report?: ConsultantReportContent } => {
  const resolution = resolveFollowUpQuestions(
    submission.followUpQuestions,
    sources,
    templates,
    mintId,
  )
  if (!resolution.resolved) return resolution
  const invalidSourceReferences = invalidReportReferences(submission, sources)
  if (invalidSourceReferences.length > 0) {
    return {
      resolved: false,
      unknownTemplateCodes: [],
      nonTemplateCodes: [],
      ungroundedQuestions: [],
      invalidSourceReferences,
    }
  }

  return {
    resolved: true,
    questions: resolution.questions,
      report: {
        ...submission,
        followUpQuestions: resolution.questions,
        sourceSnapshot: reportSourceSnapshot(sources, templates),
      },
  }
}

export const canonicalReportContent = (
  report: ConsultantReportContent,
): string => canonicalStageContent(report)

export const renderReportPdf = (report: ConsultantReportContent): Buffer => {
  const lines = [
    report.title,
    "",
    "Management Summary",
    report.executiveSummary,
    "",
    "Situation und Ziele",
    `Organisation: ${report.engagementContext.organizationName}`,
    report.engagementContext.engagementTitle
      ? `Engagement: ${report.engagementContext.engagementTitle}`
      : "",
    report.engagementContext.department
      ? `Bereich: ${report.engagementContext.department}`
      : "",
    report.engagementContext.statedProblem
      ? `Ausgangslage: ${report.engagementContext.statedProblem}`
      : "",
    report.engagementContext.desiredOutcome
      ? `Zielbild: ${report.engagementContext.desiredOutcome}`
      : "",
    report.engagementContext.businessImpact
      ? `Geschäftliche Wirkung: ${report.engagementContext.businessImpact}`
      : "",
    "",
    "Herausforderungen",
    ...report.prioritizedProblems.map(
      (problem) =>
        `${problem.priorityRank}. ${problem.title}: ${problem.problem} ${problem.rationale}`,
    ),
    "",
    "Assessment-Zusammenfassung",
    report.assessmentSummary,
    "",
    "Priorisierte Opportunities",
    ...report.prioritizedProblems.map(
      (problem) => `${problem.priorityRank}. ${problem.title}: ${problem.problem}`,
    ),
    "",
    "Enthaltene Empfehlungen",
    ...report.recommendations.flatMap((recommendation) => [
      `${recommendation.title}: ${recommendation.approach}`,
      `Erwarteter Wert: ${recommendation.expectedValue}`,
      recommendation.effort
        ? `Qualitativer Aufwand: ${recommendation.effort.level} - ${recommendation.effort.rationale}`
        : "",
      `Begründung: ${recommendation.rationale}`,
      `Sicherheit: ${recommendation.confidence}`,
    ]),
    "",
    "Zurückgestellte Empfehlungen",
    ...(report.deferredRecommendations.length > 0
      ? report.deferredRecommendations.map(
          (recommendation) =>
            `${recommendation.title}: ${recommendation.rationale}`,
        )
      : ["Keine zurückgestellten Empfehlungen."]),
    "",
    "Annahmen",
    ...report.assumptions.map((assumption) => `- ${assumption}`),
    "",
    "Risiken",
    ...report.risks.map((risk) => `- ${risk}`),
    "",
    "Roadmap",
    report.roadmapSummary,
    ...report.roadmapPhases.map(
      (phase) =>
        `${phase.sequenceOrder}. ${phase.title}: ${phase.objective} Ergebnis: ${phase.expectedOutcome}`,
    ),
    "",
    "Follow-up-Fragen",
    ...report.followUpQuestions
      .filter((question) => question.status === "approved")
      .map((question) => `- ${question.question}`),
    "",
    "Nächste Schritte",
    ...report.nextSteps.map((step) => `- ${step}`),
  ]
    .filter((line) => line.trim().length > 0)

  return simplePdf(lines)
}

const resolveFollowUpQuestions = (
  questions: readonly FollowUpQuestionDraft[],
  sources: ReportSourceBundle,
  templates: CitableFollowUpTemplate,
  mintId: () => string,
): FollowUpResolution => {
  const gaps = sourceGapRecords(sources)
  const sourceGapsByDescription = new Map(
    gaps.map((gap) => [normalize(gap.description), gap]),
  )
  const sourceDescriptions = new Set(sourceGapsByDescription.keys())

  const unknownTemplateCodes = sorted(
    questions
      .map((question) => question.templateCode)
      .filter((code): code is string => code !== null)
      .filter((code) => !templates.has(code)),
  )
  const nonTemplateCodes = sorted(
    questions
      .map((question) => question.templateCode)
      .filter((code): code is string => code !== null)
      .filter((code) => templates.has(code) && templates.get(code)!.kind !== "follow_up_template"),
  )
  const ungroundedQuestions = sorted(
    questions
      .filter((question) => !sourceDescriptions.has(normalize(question.sourceDescription)))
      .map((question) => question.question),
  )

  if (
    unknownTemplateCodes.length > 0 ||
    nonTemplateCodes.length > 0 ||
    ungroundedQuestions.length > 0
  ) {
    return {
      resolved: false,
      unknownTemplateCodes,
      nonTemplateCodes,
      ungroundedQuestions,
      invalidSourceReferences: [],
    }
  }

  return {
    resolved: true,
    questions: questions.map((question) => {
      const template =
        question.templateCode === null ? null : templates.get(question.templateCode) ?? null
      const gap = sourceGapsByDescription.get(normalize(question.sourceDescription))
      if (!gap) throw new Error("Resolved follow-up question lost its source gap")
      const templateFingerprint =
        question.templateCode === null || template === null
          ? null
          : template.fingerprint ??
            createSha256Hash(canonicalStageContent({
              code: question.templateCode,
              kind: template.kind,
              title: template.title,
              summary: template.summary,
              revision: template.revision ?? 1,
            }))

      return {
        ...question,
        id: question.id ?? mintId(),
        sourceGapId: gap.id,
        sourceFingerprint: gap.fingerprint,
        templateEntryId: question.templateCode,
        templateVersion:
          question.templateCode === null || template === null
            ? null
            : template.revision ?? 1,
        templateFingerprint,
        templateTitle: template?.title ?? null,
      }
    }),
  }
}

export const sourceGaps = (sources: ReportSourceBundle) =>
  sourceGapRecords(sources).map((gap) => gap.description)

const discoveryFingerprint = (discovery: DiscoveryProfile): string =>
  createSha256Hash(canonicalStageContent(discovery))

const assessmentFingerprint = (assessment: Assessment): string =>
  createSha256Hash(canonicalAssessmentContent(assessment))

const opportunityFingerprint = (version: OpportunityVersionDetail): string =>
  createSha256Hash(canonicalOpportunityContent(version.prioritization))

const recommendationFingerprint = (version: RecommendationVersionDetail): string =>
  createSha256Hash(canonicalRecommendationContent(version.recommendationSet))

const roadmapFingerprint = (version: RoadmapVersionDetail): string =>
  createSha256Hash(canonicalRoadmapContent(version.roadmap))

const sourceFingerprint = (
  sources: ReportSourceBundle,
  templates: CitableFollowUpTemplate,
): string =>
  createSha256Hash(
    canonicalStageContent({
      discoveryFingerprint: discoveryFingerprint(sources.discovery),
      assessmentRevision: sources.assessmentRevision,
      assessmentFingerprint: assessmentFingerprint(sources.assessment),
      opportunityVersionId: sources.opportunities.id,
      opportunityVersionNumber: sources.opportunities.versionNumber,
      opportunityFingerprint: opportunityFingerprint(sources.opportunities),
      recommendationVersionId: sources.recommendations.id,
      recommendationVersionNumber: sources.recommendations.versionNumber,
      recommendationFingerprint: recommendationFingerprint(sources.recommendations),
      roadmapVersionId: sources.roadmap.id,
      roadmapVersionNumber: sources.roadmap.versionNumber,
      roadmapFingerprint: roadmapFingerprint(sources.roadmap),
      recommendationDispositions: recommendationDispositions(sources),
      gaps: sourceGapRecords(sources),
      followUpTemplates: Array.from(templates.entries()).map(([code, template]) => ({
        code,
        revision: template.revision ?? 1,
        fingerprint:
          template.fingerprint ??
          createSha256Hash(canonicalStageContent({
            code,
            kind: template.kind,
            title: template.title,
            summary: template.summary,
            revision: template.revision ?? 1,
          })),
      })),
    }),
  )

const recommendationDispositions = (sources: ReportSourceBundle) => {
  const acceptedRecommendationIds = new Set(
    sources.recommendations.recommendationSet.recommendations.map(
      (recommendation) => recommendation.id,
    ),
  )
  const dispositions = new Map(
    (sources.roadmap.roadmap.recommendationDispositions ?? []).map((disposition) => [
      disposition.recommendationId,
      disposition,
    ]),
  )

  return [...acceptedRecommendationIds]
    .sort()
    .map((recommendationId) => dispositions.get(recommendationId))
    .filter(
      (disposition): disposition is RoadmapRecommendationDisposition =>
        disposition !== undefined,
    )
}

export const sourceGapRecords = (sources: ReportSourceBundle) =>
  [
    ...sources.discovery.missingInformation.map((gap) => ({
      sourceType: "discovery_gap" as const,
      description: gap.description,
    })),
    ...sources.discovery.valueMeasurementBaseline.measurementGaps.map((gap) => ({
      sourceType: "measurement_gap" as const,
      description: gap.description ?? gap.subject,
    })),
    ...sources.assessment.gaps.map((gap) => ({
      sourceType: "assessment_gap" as const,
      description: gap.description,
    })),
    ...sources.opportunities.prioritization.gaps.map((description) => ({
      sourceType: "opportunity_gap" as const,
      description,
    })),
    ...sources.recommendations.recommendationSet.gaps.map((description) => ({
      sourceType: "recommendation_gap" as const,
      description,
    })),
    ...sources.roadmap.roadmap.gaps.map((description) => ({
      sourceType: "roadmap_gap" as const,
      description,
    })),
  ].map((gap) => {
    const fingerprint = createSha256Hash(canonicalStageContent(gap))
    return {
      id: `gap-${fingerprint.slice(0, 16)}`,
      ...gap,
      fingerprint,
    }
  })

const normalize = (value: string): string => value.trim().toLowerCase()

const sorted = (values: string[]): string[] => [...new Set(values)].sort()

const invalidReportReferences = (
  report: GeneratedConsultantReportDraft | ConsultantReportSubmission,
  sources: ReportSourceBundle,
): string[] => {
  const opportunities = sources.opportunities.prioritization.opportunities ?? []
  const recommendations = sources.recommendations.recommendationSet.recommendations ?? []
  const phases = sources.roadmap.roadmap.phases ?? []
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id))
  const recommendationIds = new Set(
    recommendations.map(
      (recommendation) => recommendation.id,
    ),
  )
  const includedRecommendationIds = new Set(
    sources.roadmap.roadmap.recommendationDispositions
      .filter((disposition) => disposition.disposition === "included")
      .map((disposition) => disposition.recommendationId),
  )
  const deferredRecommendationIds = new Set(
    sources.roadmap.roadmap.recommendationDispositions
      .filter((disposition) => disposition.disposition === "deferred")
      .map((disposition) => disposition.recommendationId),
  )
  const roadmapPhaseIds = new Set(phases.map((phase) => phase.id))

  return [
    ...report.prioritizedProblems
      .map((problem) => problem.opportunityId)
      .filter((id) => !opportunityIds.has(id))
      .map((id) => `opportunity:${id}`),
    ...report.recommendations
      .map((recommendation) => recommendation.recommendationId)
      .filter((id) => !recommendationIds.has(id))
      .map((id) => `recommendation:${id}`),
    ...report.recommendations
      .map((recommendation) => recommendation.recommendationId)
      .filter((id) => recommendationIds.has(id) && !includedRecommendationIds.has(id))
      .map((id) => `recommendation_not_included:${id}`),
    ...report.deferredRecommendations
      .map((recommendation) => recommendation.recommendationId)
      .filter((id) => !recommendationIds.has(id))
      .map((id) => `deferred_recommendation:${id}`),
    ...report.deferredRecommendations
      .map((recommendation) => recommendation.recommendationId)
      .filter((id) => recommendationIds.has(id) && !deferredRecommendationIds.has(id))
      .map((id) => `recommendation_not_deferred:${id}`),
    ...report.roadmapPhases
      .map((phase) => phase.phaseId)
      .filter((id) => !roadmapPhaseIds.has(id))
      .map((id) => `roadmap_phase:${id}`),
    ...unsupportedClientClaims(report, sources),
  ]
}

const unsupportedClientClaims = (
  report: GeneratedConsultantReportDraft | ConsultantReportSubmission,
  sources: ReportSourceBundle,
): string[] => {
  const acceptedRecommendations = new Map(
    sources.recommendations.recommendationSet.recommendations.map((recommendation) => [
      recommendation.id,
      recommendation,
    ]),
  )
  const fields: { path: string; value: string; allowedClaims?: readonly string[] }[] = [
    { path: "title", value: report.title },
    { path: "executiveSummary", value: report.executiveSummary },
    { path: "assessmentSummary", value: report.assessmentSummary },
    { path: "roadmapSummary", value: report.roadmapSummary },
    ...report.prioritizedProblems.flatMap((problem, index) => [
      { path: `prioritizedProblems.${index}.title`, value: problem.title },
      { path: `prioritizedProblems.${index}.problem`, value: problem.problem },
      { path: `prioritizedProblems.${index}.rationale`, value: problem.rationale },
    ]),
    ...report.recommendations.flatMap((recommendation, index) => [
      { path: `recommendations.${index}.title`, value: recommendation.title },
      { path: `recommendations.${index}.approach`, value: recommendation.approach },
      { path: `recommendations.${index}.rationale`, value: recommendation.rationale },
      {
        path: `recommendations.${index}.expectedValue`,
        value: recommendation.expectedValue,
        allowedClaims: acceptedRecommendationClaimSources(
          acceptedRecommendations.get(recommendation.recommendationId),
        ),
      },
      ...(recommendation.effort
        ? [
            {
              path: `recommendations.${index}.effort.rationale`,
              value: recommendation.effort.rationale,
            },
          ]
        : []),
    ]),
    ...report.deferredRecommendations.flatMap((recommendation, index) => [
      {
        path: `deferredRecommendations.${index}.title`,
        value: recommendation.title,
      },
      {
        path: `deferredRecommendations.${index}.rationale`,
        value: recommendation.rationale,
      },
    ]),
    ...report.roadmapPhases.flatMap((phase, index) => [
      { path: `roadmapPhases.${index}.title`, value: phase.title },
      { path: `roadmapPhases.${index}.objective`, value: phase.objective },
      { path: `roadmapPhases.${index}.expectedOutcome`, value: phase.expectedOutcome },
    ]),
    ...report.assumptions.map((value, index) => ({ path: `assumptions.${index}`, value })),
    ...report.risks.map((value, index) => ({ path: `risks.${index}`, value })),
    ...report.nextSteps.map((value, index) => ({ path: `nextSteps.${index}`, value })),
    ...report.followUpQuestions.flatMap((question, index) => [
      { path: `followUpQuestions.${index}.question`, value: question.question },
      { path: `followUpQuestions.${index}.rationale`, value: question.rationale },
    ]),
  ]

  return fields
    .filter(({ value, allowedClaims }) =>
      containsUnsupportedQuantifiedClaim(value, allowedClaims ?? []),
    )
    .map(({ path }) => `unsupported_claim:${path}`)
}

const acceptedRecommendationClaimSources = (
  recommendation:
    | ReportSourceBundle["recommendations"]["recommendationSet"]["recommendations"][number]
    | undefined,
): readonly string[] => {
  if (!recommendation) return []
  return [
    recommendation.expectedValue.summary,
    ...recommendation.expectedValue.drivers,
  ]
}

const containsUnsupportedQuantifiedClaim = (
  value: string,
  allowedClaimSources: readonly string[] = [],
): boolean => {
  const text = value.trim()
  const allowedTokens = new Set(allowedClaimSources.flatMap(extractQuantifiedClaims))
  const tokens = extractQuantifiedClaims(text)
  if (tokens.some((token) => !allowedTokens.has(token))) return true

  return [
    /\b(?:technology|technologie|tool|system)\s*[:#-]?\s*(?:tech|tk|kb)_[a-z0-9_-]+\b/i,
    /\b(?:roi|return on investment|kapitalrendite)\b/i,
  ].some((pattern) => pattern.test(text) && !allowedClaimSources.some((source) => pattern.test(source)))
}

const extractQuantifiedClaims = (value: string): string[] =>
  [
    ...value.matchAll(/\b(?:eur|usd|gbp|€|\$|£)\s?\d[\d.,]*(?=\s|\.|,|;|:|$)|\b\d[\d.,]*\s?(?:eur|usd|gbp|€|\$|£)(?=\s|\.|,|;|:|$)/gi),
    ...value.matchAll(/\b(?:q[1-4]\s*20\d{2}|20\d{2}|januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi),
    ...value.matchAll(/\b\d+[\d.,]*\s?(?:fte|mitarbeiter|stellen|personen|people|headcount)\b/gi),
    ...value.matchAll(/\b\d+[\d.,]*\s?(?:tickets|stunden|tage|wochen|monate|hours|days|weeks|months|users)\b/gi),
    ...value.matchAll(/\b\d+[\d.,]*\s?%(?=\s|\.|,|;|:|$)/gi),
  ].map((match) => normalizeQuantifiedClaim(match[0]))

const normalizeQuantifiedClaim = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, " ").trim()

const simplePdf = (rawLines: readonly string[]): Buffer => {
  const wrappedLines = rawLines.flatMap(wrapPdfLine)
  const pages = chunkLines(wrappedLines, 62)
  const pageIds = pages.map((_page, index) => 4 + index * 2)
  const contentIds = pages.map((_page, index) => 5 + index * 2)
  const objects: Buffer[] = [
    Buffer.from("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj"),
    Buffer.from(
      `2 0 obj << /Type /Pages /Kids [${pageIds
        .map((id) => `${id} 0 R`)
        .join(" ")}] /Count ${pages.length} >> endobj`,
    ),
    Buffer.from(
      "3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj",
    ),
  ]

  pages.forEach((page, index) => {
    const content = pdfPageContent(page)
    objects.push(
      Buffer.from(
        `${pageIds[index]} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >> endobj`,
      ),
      Buffer.concat([
        Buffer.from(
          `${contentIds[index]} 0 obj << /Length ${content.length} >> stream\n`,
        ),
        content,
        Buffer.from("\nendstream endobj"),
      ]),
    )
  })

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")]
  const offsets: number[] = [0]
  let length = parts[0].length
  for (const object of objects) {
    offsets.push(length)
    parts.push(object, Buffer.from("\n"))
    length += object.length + 1
  }
  const xref = length
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`))
  for (const offset of offsets.slice(1)) {
    parts.push(Buffer.from(`${String(offset).padStart(10, "0")} 00000 n \n`))
  }
  parts.push(
    Buffer.from(
      `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  )
  return Buffer.concat(parts)
}

const wrapPdfLine = (line: string): string[] => {
  const max = 96
  const words = line.trim().split(/\s+/)
  if (words.length === 0) return []

  const result: string[] = []
  let current = ""
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`
    if (next.length <= max) {
      current = next
      continue
    }
    if (current.length > 0) result.push(current)
    current = word.length <= max ? word : word.slice(0, max)
    let remaining = word.slice(current.length)
    while (remaining.length > max) {
      result.push(remaining.slice(0, max))
      remaining = remaining.slice(max)
    }
    if (remaining.length > 0 && word.length > max) current = remaining
  }
  if (current.length > 0) result.push(current)

  const continuationPrefix = line.trim().startsWith("- ") ? "  " : ""
  return result.map((value, index) =>
    index === 0 || continuationPrefix.length === 0
      ? value
      : `${continuationPrefix}${value}`,
  )
}

const chunkLines = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks.length > 0 ? chunks : [[]]
}

const pdfPageContent = (lines: readonly string[]): Buffer =>
  Buffer.concat(
    lines.flatMap((line, index) => {
      const command = Buffer.concat([
        Buffer.from(`BT /F1 10 Tf 48 ${790 - index * 12} Td (`),
        pdfWinAnsiString(line),
        Buffer.from(") Tj ET"),
      ])
      return index === 0 ? [command] : [Buffer.from("\n"), command]
    }),
  )

const pdfWinAnsiString = (value: string): Buffer => {
  const bytes: number[] = []
  for (const char of value) {
    const code = WIN_ANSI_BYTES.get(char) ?? char.codePointAt(0) ?? 63
    const byte =
      code >= 32 && code <= 126
        ? code
        : code >= 128 && code <= 255
          ? code
          : 63
    if (byte === 40 || byte === 41 || byte === 92) bytes.push(92)
    bytes.push(byte)
  }
  return Buffer.from(bytes)
}

const WIN_ANSI_BYTES = new Map<string, number>([
  ["€", 128],
  ["‚", 130],
  ["ƒ", 131],
  ["„", 132],
  ["…", 133],
  ["†", 134],
  ["‡", 135],
  ["ˆ", 136],
  ["‰", 137],
  ["Š", 138],
  ["‹", 139],
  ["Œ", 140],
  ["Ž", 142],
  ["‘", 145],
  ["’", 146],
  ["“", 147],
  ["”", 148],
  ["•", 149],
  ["–", 150],
  ["—", 151],
  ["˜", 152],
  ["™", 153],
  ["š", 154],
  ["›", 155],
  ["œ", 156],
  ["ž", 158],
  ["Ÿ", 159],
])
