import type { CSSProperties } from "react"

import {
  Badge as UiBadge,
  bodyTextStyle,
  eyebrowStyle,
  nestedBlockStyle,
  rowStyle,
  sectionTitleStyle as uiSectionTitleStyle,
  subSectionTitleStyle,
} from "./UiKit"
import { t } from "../i18n"
import { uiColors, uiSpace } from "../lib/design-tokens"
import type { ConsultantReport } from "../../shared/consultant-report.schema"

// The consultant report, laid out for reading. Every heading, label and badge
// caption is looked up; the *content* between them is what the model wrote and
// is passed through untouched — its language is the prompt's business, not the
// catalogue's.
//
// The values a badge names — a confidence, a complexity, a severity — are the
// report schema's own identifiers and stay as they are on the wire; only the
// caption around them is rendered here.

type AnalysisReportViewProps = {
  report: ConsultantReport
}

export default function AnalysisReportView({ report }: AnalysisReportViewProps) {
  return (
    <div style={reportStackStyle}>
      <Section title={t("report.section.client_summary")}>
        <p style={paragraphStyle}>{report.clientSummary}</p>
      </Section>

      <Section title={t("report.section.detected_problems")}>
        <div style={cardStackStyle}>
          {report.detectedProblems.map((problem, index) => (
            <Card key={index}>
              <p style={labelStyle}>{t("report.field.stated_problem")}</p>
              <p style={paragraphStyle}>{problem.statedProblem}</p>
              <p style={labelStyle}>{t("report.field.hidden_problem")}</p>
              <p style={paragraphStyle}>{problem.hiddenProblemHypothesis}</p>
              <Badge
                label={t("report.badge.confidence", {
                  level: problem.confidence,
                })}
              />
            </Card>
          ))}
        </div>
      </Section>

      <Section title={t("report.section.ai_opportunities")}>
        <div style={cardStackStyle}>
          {report.aiOpportunities.map((opportunity, index) => (
            <Card key={index}>
              <h4 style={cardTitleStyle}>{opportunity.title}</h4>
              <p style={paragraphStyle}>{opportunity.description}</p>
              <p style={labelStyle}>{t("report.field.business_value")}</p>
              <p style={paragraphStyle}>{opportunity.businessValue}</p>
              <div style={badgeRowStyle}>
                <Badge
                  label={t("report.badge.complexity", {
                    level: opportunity.complexity,
                  })}
                />
                <Badge
                  label={t("report.badge.impact", {
                    level: opportunity.impact,
                  })}
                />
                <Badge label={opportunity.recommendedApproach} />
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={t("report.section.recommended_solution")}>
        <Card>
          <h4 style={cardTitleStyle}>{report.recommendedSolution.mainUseCase}</h4>
          <div style={badgeRowStyle}>
            <Badge label={report.recommendedSolution.approach} />
          </div>
          <p style={labelStyle}>{t("report.field.reason")}</p>
          <p style={paragraphStyle}>{report.recommendedSolution.reason}</p>
          <p style={labelStyle}>{t("report.field.architecture_summary")}</p>
          <p style={paragraphStyle}>
            {report.recommendedSolution.architectureSummary}
          </p>
          <p style={labelStyle}>{t("report.field.suggested_tools")}</p>
          <BulletList items={report.recommendedSolution.suggestedTools} />
        </Card>
      </Section>

      <Section title={t("report.section.risks")}>
        <div style={cardStackStyle}>
          {report.risks.map((risk, index) => (
            <Card key={index}>
              <h4 style={cardTitleStyle}>{risk.title}</h4>
              <Badge
                label={t("report.badge.severity", { level: risk.severity })}
              />
              <p style={labelStyle}>{t("report.field.mitigation")}</p>
              <p style={paragraphStyle}>{risk.mitigation}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={t("report.section.validation_plan")}>
        <div style={cardStackStyle}>
          {report.validationPlan.map((item, index) => (
            <Card key={index}>
              <p style={labelStyle}>{t("report.field.hypothesis")}</p>
              <p style={paragraphStyle}>{item.hypothesis}</p>
              <p style={paragraphStyle}>{item.description}</p>
              <div style={badgeRowStyle}>
                <Badge label={t("report.badge.method", { method: item.method })} />
                <Badge
                  label={t("report.badge.priority", { priority: item.priority })}
                />
              </div>
              <p style={labelStyle}>{t("report.field.what_to_check")}</p>
              <BulletList items={item.whatToCheck} />
              <p style={labelStyle}>{t("report.field.required_data")}</p>
              <BulletList items={item.requiredData} />
              <p style={labelStyle}>{t("report.field.data_source")}</p>
              <BulletList items={item.dataSource} />
              <p style={labelStyle}>{t("report.field.success_criteria")}</p>
              <p style={paragraphStyle}>{item.successCriteria}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={t("report.section.follow_up_questions")}>
        <BulletList items={report.followUpQuestions} />
      </Section>

      <Section title={t("report.section.mvp_plan")}>
        <ol style={stepListStyle}>
          {report.mvpPlan.map((step, index) => (
            <li key={index}>
              <strong>{step.step}</strong>
              <p style={paragraphStyle}>{step.goal}</p>
              <Badge
                label={t("report.badge.effort", { effort: step.estimatedEffort })}
              />
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 style={sectionTitleStyle}>{title}</h3>
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={cardStyle}>{children}</div>
}

function BulletList({ items }: { items: readonly string[] }) {
  if (items.length === 0) {
    return <p style={noneStyle}>{t("common.field.none")}</p>
  }

  return (
    <ul style={bulletListStyle}>
      {items.map((item, index) => (
        <li key={index} style={paragraphStyle}>
          {item}
        </li>
      ))}
    </ul>
  )
}

// The report's badges name a level the model reported — a confidence, a
// complexity, an effort. They are descriptive, not a status the product stands
// behind, so they take the neutral tone rather than a colour of their own.
function Badge({ label }: { label: string }) {
  return <UiBadge tone="neutral" label={label} />
}

const reportStackStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.lg,
}

const cardStackStyle: CSSProperties = {
  display: "grid",
  gap: uiSpace.xs,
}

const cardStyle: CSSProperties = nestedBlockStyle

const sectionTitleStyle: CSSProperties = {
  ...uiSectionTitleStyle,
  marginBottom: uiSpace.sm,
}

const cardTitleStyle: CSSProperties = subSectionTitleStyle

const labelStyle: CSSProperties = {
  ...eyebrowStyle,
  marginTop: uiSpace.xxs,
}

const paragraphStyle: CSSProperties = bodyTextStyle

const noneStyle: CSSProperties = {
  ...bodyTextStyle,
  color: uiColors.textMuted,
}

const badgeRowStyle: CSSProperties = rowStyle

const bulletListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  display: "grid",
  gap: 4,
}

const stepListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  display: "grid",
  gap: uiSpace.sm,
}
