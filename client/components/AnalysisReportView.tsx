import type { CSSProperties, ReactNode } from "react"

import { Badge, bodyTextStyle, nestedBlockStyle } from "./UiKit"
import { t } from "../i18n"
import { uiColors, uiSpace } from "../lib/design-tokens"

import type { AnalysisReport } from "../../shared/analysis-report.schema"

type AnalysisReportViewProps = {
  report: AnalysisReport
}

export default function AnalysisReportView({ report }: AnalysisReportViewProps) {
  return (
    <div style={reportStackStyle}>
      <Section title={t("report.section.client_summary")}>
        <p style={bodyTextStyle}>{report.clientSummary}</p>
      </Section>
      <Section title={t("report.section.detected_problems")}>
        {report.detectedProblems.map((problem) => (
          <div key={problem.statedProblem} style={nestedBlockStyle}>
            <h4 style={cardTitleStyle}>{problem.statedProblem}</h4>
            <Badge
              label={t("report.badge.confidence", {
                level: problem.confidence,
              })}
            />
            <p style={bodyTextStyle}>{problem.hiddenProblemHypothesis}</p>
          </div>
        ))}
      </Section>
      <Section title={t("report.section.ai_opportunities")}>
        {report.aiOpportunities.map((opportunity) => (
          <div key={opportunity.title} style={nestedBlockStyle}>
            <h4 style={cardTitleStyle}>{opportunity.title}</h4>
            <Badge label={opportunity.recommendedApproach} />
            <p style={bodyTextStyle}>{opportunity.description}</p>
            <p style={bodyTextStyle}>{opportunity.businessValue}</p>
          </div>
        ))}
      </Section>
      <Section title={t("report.section.recommended_solution")}>
        <div style={nestedBlockStyle}>
          <h4 style={cardTitleStyle}>{report.recommendedSolution.mainUseCase}</h4>
          <Badge label={report.recommendedSolution.approach} />
          <p style={bodyTextStyle}>{report.recommendedSolution.reason}</p>
          <p style={bodyTextStyle}>{report.recommendedSolution.architectureSummary}</p>
        </div>
      </Section>
      <Section title={t("report.section.risks")}>
        {report.risks.map((risk) => (
          <div key={risk.title} style={nestedBlockStyle}>
            <h4 style={cardTitleStyle}>{risk.title}</h4>
            <Badge label={risk.severity} />
            <p style={bodyTextStyle}>{risk.mitigation}</p>
          </div>
        ))}
      </Section>
      <Section title={t("report.section.validation_plan")}>
        {report.validationPlan.map((step) => (
          <div key={step.hypothesis} style={nestedBlockStyle}>
            <h4 style={cardTitleStyle}>{step.hypothesis}</h4>
            <Badge label={step.priority} />
            <p style={bodyTextStyle}>{step.description}</p>
            <p style={bodyTextStyle}>{step.successCriteria}</p>
          </div>
        ))}
      </Section>
      <Section title={t("report.section.follow_up_questions")}>
        <ul style={listStyle}>
          {report.followUpQuestions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </Section>
      <Section title={t("report.section.mvp_plan")}>
        <ul style={listStyle}>
          {report.mvpPlan.map((step) => (
            <li key={step.step}>{`${step.step}: ${step.goal}`}</li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section style={sectionStyle}>
      <h3 style={sectionTitleStyle}>{title}</h3>
      {children}
    </section>
  )
}

const reportStackStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.md,
}

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.sm,
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 16,
  fontWeight: 650,
}

const cardTitleStyle: CSSProperties = {
  margin: 0,
  color: uiColors.textPrimary,
  fontSize: 14,
  fontWeight: 650,
}

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: uiColors.textPrimary,
  fontSize: 14,
  lineHeight: 1.5,
}
