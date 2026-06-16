import type { CSSProperties } from "react"

import type { ConsultantReport } from "../../shared/consultant-report.schema"

type AnalysisReportViewProps = {
  report: ConsultantReport
}

export default function AnalysisReportView({ report }: AnalysisReportViewProps) {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Section title="Client Summary">
        <p style={paragraphStyle}>{report.clientSummary}</p>
      </Section>

      <Section title="Detected Problems">
        <div style={{ display: "grid", gap: 12 }}>
          {report.detectedProblems.map((problem, index) => (
            <Card key={index}>
              <p style={labelStyle}>Stated problem</p>
              <p style={paragraphStyle}>{problem.statedProblem}</p>
              <p style={labelStyle}>Hidden problem hypothesis</p>
              <p style={paragraphStyle}>{problem.hiddenProblemHypothesis}</p>
              <Badge label={`confidence: ${problem.confidence}`} />
            </Card>
          ))}
        </div>
      </Section>

      <Section title="AI Opportunities">
        <div style={{ display: "grid", gap: 12 }}>
          {report.aiOpportunities.map((opportunity, index) => (
            <Card key={index}>
              <h4 style={cardTitleStyle}>{opportunity.title}</h4>
              <p style={paragraphStyle}>{opportunity.description}</p>
              <p style={labelStyle}>Business value</p>
              <p style={paragraphStyle}>{opportunity.businessValue}</p>
              <div style={badgeRowStyle}>
                <Badge label={`complexity: ${opportunity.complexity}`} />
                <Badge label={`impact: ${opportunity.impact}`} />
                <Badge label={opportunity.recommendedApproach} />
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Recommended Solution">
        <Card>
          <h4 style={cardTitleStyle}>{report.recommendedSolution.mainUseCase}</h4>
          <div style={badgeRowStyle}>
            <Badge label={report.recommendedSolution.approach} />
          </div>
          <p style={labelStyle}>Reason</p>
          <p style={paragraphStyle}>{report.recommendedSolution.reason}</p>
          <p style={labelStyle}>Architecture summary</p>
          <p style={paragraphStyle}>
            {report.recommendedSolution.architectureSummary}
          </p>
          <p style={labelStyle}>Suggested tools</p>
          <BulletList items={report.recommendedSolution.suggestedTools} />
        </Card>
      </Section>

      <Section title="Risks">
        <div style={{ display: "grid", gap: 12 }}>
          {report.risks.map((risk, index) => (
            <Card key={index}>
              <h4 style={cardTitleStyle}>{risk.title}</h4>
              <Badge label={`severity: ${risk.severity}`} />
              <p style={labelStyle}>Mitigation</p>
              <p style={paragraphStyle}>{risk.mitigation}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Validation Plan">
        <div style={{ display: "grid", gap: 12 }}>
          {report.validationPlan.map((item, index) => (
            <Card key={index}>
              <p style={labelStyle}>Hypothesis</p>
              <p style={paragraphStyle}>{item.hypothesis}</p>
              <p style={paragraphStyle}>{item.description}</p>
              <div style={badgeRowStyle}>
                <Badge label={`method: ${item.method}`} />
                <Badge label={`priority: ${item.priority}`} />
              </div>
              <p style={labelStyle}>What to check</p>
              <BulletList items={item.whatToCheck} />
              <p style={labelStyle}>Required data</p>
              <BulletList items={item.requiredData} />
              <p style={labelStyle}>Data source</p>
              <BulletList items={item.dataSource} />
              <p style={labelStyle}>Success criteria</p>
              <p style={paragraphStyle}>{item.successCriteria}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Follow-up Questions">
        <BulletList items={report.followUpQuestions} />
      </Section>

      <Section title="MVP Plan">
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 12 }}>
          {report.mvpPlan.map((step, index) => (
            <li key={index}>
              <strong>{step.step}</strong>
              <p style={paragraphStyle}>{step.goal}</p>
              <Badge label={`effort: ${step.estimatedEffort}`} />
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
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        display: "grid",
        gap: 6,
      }}
    >
      {children}
    </div>
  )
}

function BulletList({ items }: { items: readonly string[] }) {
  if (items.length === 0) {
    return <p style={{ ...paragraphStyle, color: "#9ca3af" }}>None.</p>
  }

  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
      {items.map((item, index) => (
        <li key={index} style={paragraphStyle}>
          {item}
        </li>
      ))}
    </ul>
  )
}

function Badge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 999,
        background: "#eef2ff",
        color: "#3730a3",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  )
}

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 18,
  color: "#111827",
}

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  color: "#111827",
}

const labelStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#6b7280",
}

const paragraphStyle: CSSProperties = {
  margin: 0,
  color: "#374151",
  lineHeight: 1.5,
}

const badgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
}
