"use client"

import {
  DiscoverySection,
  SelectField,
  TextField,
  addButtonStyle,
  cardRowStyle,
  eyebrowStyle,
  fieldsGridStyle,
  hintStyle,
  introStyle,
  removeButtonStyle,
} from "./DiscoveryFields"
import { t } from "../i18n"

import type {
  BusinessImpact,
  DataSourceKind,
  DiscoveryFigure,
  MeasurementBasis,
  MeasurementGapReason,
  MeasurementGapSubject,
  ValueMeasurementBaseline,
} from "../../shared/discovery-profile.schema"

type DiscoveryBaselineEditorProps = {
  baseline: ValueMeasurementBaseline
  onChange: (baseline: ValueMeasurementBaseline) => void
}

// Identifier → localized label. The identifiers stay English; only what the
// consultant reads is German (coding-standards.md §12A).
const labelsFor = (
  values: readonly string[],
  keyPrefix: string,
): Record<string, string> =>
  Object.fromEntries(
    values.map((value) => [
      value,
      t(`${keyPrefix}.${value}` as Parameters<typeof t>[0]),
    ]),
  )

const BUSINESS_IMPACT_CATEGORIES = [
  "lost_time",
  "lost_revenue",
  "rework",
  "customer_dissatisfaction",
  "staff_load",
  "other",
] as const

const DATA_SOURCE_KINDS: readonly DataSourceKind[] = [
  "system",
  "report",
  "interview",
  "estimate",
  "other",
]

const MEASUREMENT_BASES: readonly MeasurementBasis[] = ["measured", "estimated"]

const SEVERITY_LEVELS = ["low", "medium", "high"] as const

const GAP_SUBJECTS: readonly MeasurementGapSubject[] = [
  "business_impact",
  "error_frequency",
  "error_severity",
  "error_cost",
  "existing_kpis",
  "baseline_metrics",
  "target_success_metrics",
  "measurement_method",
  "data_sources",
]

const GAP_REASONS: readonly MeasurementGapReason[] = [
  "not_measured",
  "not_available",
  "not_shared",
  "unknown",
  "other",
]

// A new figure starts as an estimate: nothing is a measurement until someone
// says how it was measured.
const newFigure = (): DiscoveryFigure => ({
  value: "",
  basis: "estimated",
  measurementMethod: null,
  dataSource: { kind: "interview", detail: null },
})

export default function DiscoveryBaselineEditor({
  baseline,
  onChange,
}: DiscoveryBaselineEditorProps) {
  function setBaseline(change: Partial<ValueMeasurementBaseline>) {
    onChange({ ...baseline, ...change })
  }

  return (
    <DiscoverySection title={t("discovery.baseline.title")}>
      <div style={{ gridColumn: "1 / -1", display: "grid", gap: 20 }}>
        <p style={introStyle}>{t("discovery.baseline.intro")}</p>

        <Group
          title={t("discovery.baseline.business_impact.title")}
          hint={t("discovery.baseline.business_impact.hint")}
          onAdd={() =>
            setBaseline({
              businessImpacts: [
                ...baseline.businessImpacts,
                { category: "lost_time", description: "", figure: null },
              ],
            })
          }
          addLabel={t("discovery.baseline.business_impact.add")}
        >
          {baseline.businessImpacts.map((impact, index) => (
            <div key={index} style={cardRowStyle}>
              <div style={fieldsGridStyle}>
                <SelectField
                  label={t("discovery.baseline.business_impact.category")}
                  value={impact.category}
                  options={BUSINESS_IMPACT_CATEGORIES}
                  optionLabels={labelsFor(
                    BUSINESS_IMPACT_CATEGORIES,
                    "discovery.impact_category",
                  )}
                  includeUnknown={false}
                  onChange={(value) =>
                    setBaseline({
                      businessImpacts: replaceAt(
                        baseline.businessImpacts,
                        index,
                        {
                          ...impact,
                          category: value as BusinessImpact["category"],
                        },
                      ),
                    })
                  }
                />
                <TextField
                  label={t("discovery.baseline.business_impact.description")}
                  value={impact.description}
                  placeholder={t(
                    "discovery.baseline.business_impact.description_placeholder",
                  )}
                  onChange={(value) =>
                    setBaseline({
                      businessImpacts: replaceAt(
                        baseline.businessImpacts,
                        index,
                        { ...impact, description: value ?? "" },
                      ),
                    })
                  }
                />
              </div>
              <FigureFields
                label={t("discovery.baseline.business_impact.figure")}
                figure={impact.figure}
                onChange={(figure) =>
                  setBaseline({
                    businessImpacts: replaceAt(baseline.businessImpacts, index, {
                      ...impact,
                      figure,
                    }),
                  })
                }
              />
              <RemoveButton
                onClick={() =>
                  setBaseline({
                    businessImpacts: removeAt(baseline.businessImpacts, index),
                  })
                }
              />
            </div>
          ))}
        </Group>

        <Group
          title={t("discovery.baseline.error_profile.title")}
          hint={t("discovery.baseline.error_profile.hint")}
        >
          <div style={cardRowStyle}>
            <FigureFields
              label={t("discovery.baseline.error_profile.frequency")}
              figure={baseline.errorProfile.frequency}
              onChange={(frequency) =>
                setBaseline({
                  errorProfile: { ...baseline.errorProfile, frequency },
                })
              }
            />
            <div style={fieldsGridStyle}>
              <SelectField
                label={t("discovery.baseline.error_profile.severity")}
                value={baseline.errorProfile.severity.level}
                options={SEVERITY_LEVELS}
                optionLabels={labelsFor(SEVERITY_LEVELS, "discovery.severity")}
                onChange={(level) =>
                  setBaseline({
                    errorProfile: {
                      ...baseline.errorProfile,
                      severity: {
                        ...baseline.errorProfile.severity,
                        level: level as "low" | "medium" | "high" | null,
                      },
                    },
                  })
                }
              />
              <TextField
                label={t(
                  "discovery.baseline.error_profile.severity_description",
                )}
                value={baseline.errorProfile.severity.description}
                placeholder={t(
                  "discovery.baseline.error_profile.severity_placeholder",
                )}
                onChange={(description) =>
                  setBaseline({
                    errorProfile: {
                      ...baseline.errorProfile,
                      severity: {
                        ...baseline.errorProfile.severity,
                        description,
                      },
                    },
                  })
                }
              />
            </div>
            <FigureFields
              label={t("discovery.baseline.error_profile.cost")}
              figure={baseline.errorProfile.costPerOccurrence}
              onChange={(costPerOccurrence) =>
                setBaseline({
                  errorProfile: {
                    ...baseline.errorProfile,
                    costPerOccurrence,
                  },
                })
              }
            />
          </div>
        </Group>

        <Group
          title={t("discovery.baseline.existing_kpis.title")}
          hint={t("discovery.baseline.existing_kpis.hint")}
          onAdd={() =>
            setBaseline({
              existingKpis: [
                ...baseline.existingKpis,
                { name: "", description: null },
              ],
            })
          }
          addLabel={t("discovery.baseline.existing_kpis.add")}
        >
          {baseline.existingKpis.map((kpi, index) => (
            <div key={index} style={cardRowStyle}>
              <div style={fieldsGridStyle}>
                <TextField
                  label={t("discovery.baseline.existing_kpis.name")}
                  value={kpi.name}
                  placeholder={t(
                    "discovery.baseline.existing_kpis.name_placeholder",
                  )}
                  onChange={(name) =>
                    setBaseline({
                      existingKpis: replaceAt(baseline.existingKpis, index, {
                        ...kpi,
                        name: name ?? "",
                      }),
                    })
                  }
                />
                <TextField
                  label={t("discovery.baseline.existing_kpis.description")}
                  value={kpi.description}
                  placeholder={t(
                    "discovery.baseline.existing_kpis.description_placeholder",
                  )}
                  onChange={(description) =>
                    setBaseline({
                      existingKpis: replaceAt(baseline.existingKpis, index, {
                        ...kpi,
                        description,
                      }),
                    })
                  }
                />
              </div>
              <RemoveButton
                onClick={() =>
                  setBaseline({
                    existingKpis: removeAt(baseline.existingKpis, index),
                  })
                }
              />
            </div>
          ))}
        </Group>

        <Group
          title={t("discovery.baseline.baseline_metrics.title")}
          hint={t("discovery.baseline.baseline_metrics.hint")}
          onAdd={() =>
            setBaseline({
              baselineMetrics: [
                ...baseline.baselineMetrics,
                { name: "", current: newFigure(), notes: null },
              ],
            })
          }
          addLabel={t("discovery.baseline.baseline_metrics.add")}
        >
          {baseline.baselineMetrics.map((metric, index) => (
            <MetricRow
              key={index}
              figureLabel={t("discovery.baseline.baseline_metrics.figure")}
              name={metric.name}
              notes={metric.notes}
              figure={metric.current}
              onNameChange={(name) =>
                setBaseline({
                  baselineMetrics: replaceAt(baseline.baselineMetrics, index, {
                    ...metric,
                    name,
                  }),
                })
              }
              onNotesChange={(notes) =>
                setBaseline({
                  baselineMetrics: replaceAt(baseline.baselineMetrics, index, {
                    ...metric,
                    notes,
                  }),
                })
              }
              onFigureChange={(current) =>
                setBaseline({
                  baselineMetrics: replaceAt(baseline.baselineMetrics, index, {
                    ...metric,
                    current,
                  }),
                })
              }
              onRemove={() =>
                setBaseline({
                  baselineMetrics: removeAt(baseline.baselineMetrics, index),
                })
              }
            />
          ))}
        </Group>

        <Group
          title={t("discovery.baseline.target_metrics.title")}
          hint={t("discovery.baseline.target_metrics.hint")}
          onAdd={() =>
            setBaseline({
              targetSuccessMetrics: [
                ...baseline.targetSuccessMetrics,
                { name: "", target: newFigure(), notes: null },
              ],
            })
          }
          addLabel={t("discovery.baseline.target_metrics.add")}
        >
          {baseline.targetSuccessMetrics.map((metric, index) => (
            <MetricRow
              key={index}
              figureLabel={t("discovery.baseline.target_metrics.figure")}
              name={metric.name}
              notes={metric.notes}
              figure={metric.target}
              onNameChange={(name) =>
                setBaseline({
                  targetSuccessMetrics: replaceAt(
                    baseline.targetSuccessMetrics,
                    index,
                    { ...metric, name },
                  ),
                })
              }
              onNotesChange={(notes) =>
                setBaseline({
                  targetSuccessMetrics: replaceAt(
                    baseline.targetSuccessMetrics,
                    index,
                    { ...metric, notes },
                  ),
                })
              }
              onFigureChange={(target) =>
                setBaseline({
                  targetSuccessMetrics: replaceAt(
                    baseline.targetSuccessMetrics,
                    index,
                    { ...metric, target },
                  ),
                })
              }
              onRemove={() =>
                setBaseline({
                  targetSuccessMetrics: removeAt(
                    baseline.targetSuccessMetrics,
                    index,
                  ),
                })
              }
            />
          ))}
        </Group>

        <Group
          title={t("discovery.baseline.measurement_gaps.title")}
          hint={t("discovery.baseline.measurement_gaps.hint")}
          onAdd={() =>
            setBaseline({
              measurementGaps: [
                ...baseline.measurementGaps,
                {
                  subject: "baseline_metrics",
                  reason: "not_measured",
                  description: null,
                },
              ],
            })
          }
          addLabel={t("discovery.baseline.measurement_gaps.add")}
        >
          {baseline.measurementGaps.map((gap, index) => (
            <div key={index} style={cardRowStyle}>
              <div style={fieldsGridStyle}>
                <SelectField
                  label={t("discovery.baseline.measurement_gaps.subject")}
                  value={gap.subject}
                  options={GAP_SUBJECTS}
                  optionLabels={labelsFor(GAP_SUBJECTS, "discovery.gap_subject")}
                  includeUnknown={false}
                  onChange={(subject) =>
                    setBaseline({
                      measurementGaps: replaceAt(
                        baseline.measurementGaps,
                        index,
                        { ...gap, subject: subject as MeasurementGapSubject },
                      ),
                    })
                  }
                />
                <SelectField
                  label={t("discovery.baseline.measurement_gaps.reason")}
                  value={gap.reason}
                  options={GAP_REASONS}
                  optionLabels={labelsFor(GAP_REASONS, "discovery.gap_reason")}
                  includeUnknown={false}
                  onChange={(reason) =>
                    setBaseline({
                      measurementGaps: replaceAt(
                        baseline.measurementGaps,
                        index,
                        { ...gap, reason: reason as MeasurementGapReason },
                      ),
                    })
                  }
                />
                <TextField
                  label={t("discovery.baseline.measurement_gaps.detail")}
                  value={gap.description}
                  placeholder={t(
                    "discovery.baseline.measurement_gaps.detail_placeholder",
                  )}
                  onChange={(description) =>
                    setBaseline({
                      measurementGaps: replaceAt(
                        baseline.measurementGaps,
                        index,
                        { ...gap, description },
                      ),
                    })
                  }
                />
              </div>
              <RemoveButton
                onClick={() =>
                  setBaseline({
                    measurementGaps: removeAt(baseline.measurementGaps, index),
                  })
                }
              />
            </div>
          ))}
        </Group>
      </div>
    </DiscoverySection>
  )
}

// One figure with the provenance that travels with it. The figure can be left
// unrecorded — that is what the measurement gaps are for — but it can never be
// recorded without saying where it came from.
function FigureFields({
  label,
  figure,
  onChange,
}: {
  label: string
  figure: DiscoveryFigure | null
  onChange: (figure: DiscoveryFigure | null) => void
}) {
  if (figure === null) {
    return (
      <div>
        <button
          type="button"
          onClick={() => onChange(newFigure())}
          style={addButtonStyle}
        >
          {t("discovery.baseline.figure.record", { label })}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={fieldsGridStyle}>
        <TextField
          label={label}
          value={figure.value}
          placeholder={t("discovery.baseline.figure.value_placeholder")}
          onChange={(value) => onChange({ ...figure, value: value ?? "" })}
        />
        <SelectField
          label={t("discovery.baseline.figure.basis")}
          value={figure.basis}
          options={MEASUREMENT_BASES}
          optionLabels={labelsFor(MEASUREMENT_BASES, "discovery.basis")}
          includeUnknown={false}
          onChange={(basis) =>
            onChange({ ...figure, basis: basis as MeasurementBasis })
          }
        />
        <TextField
          label={t("discovery.baseline.figure.method")}
          value={figure.measurementMethod}
          placeholder={t("discovery.baseline.figure.method_placeholder")}
          onChange={(measurementMethod) =>
            onChange({ ...figure, measurementMethod })
          }
        />
        <SelectField
          label={t("discovery.baseline.figure.source")}
          value={figure.dataSource.kind}
          options={DATA_SOURCE_KINDS}
          optionLabels={labelsFor(DATA_SOURCE_KINDS, "discovery.data_source")}
          includeUnknown={false}
          onChange={(kind) =>
            onChange({
              ...figure,
              dataSource: {
                ...figure.dataSource,
                kind: kind as DataSourceKind,
              },
            })
          }
        />
        <TextField
          label={t("discovery.baseline.figure.source_detail")}
          value={figure.dataSource.detail}
          placeholder={t("discovery.baseline.figure.source_detail_placeholder")}
          onChange={(detail) =>
            onChange({ ...figure, dataSource: { ...figure.dataSource, detail } })
          }
        />
      </div>
      <small style={hintStyle}>{t("discovery.baseline.figure.hint")}</small>
      <RemoveButton
        label={t("discovery.baseline.figure.remove")}
        onClick={() => onChange(null)}
      />
    </div>
  )
}

function MetricRow({
  figureLabel,
  name,
  notes,
  figure,
  onNameChange,
  onNotesChange,
  onFigureChange,
  onRemove,
}: {
  figureLabel: string
  name: string
  notes: string | null
  figure: DiscoveryFigure
  onNameChange: (name: string) => void
  onNotesChange: (notes: string | null) => void
  onFigureChange: (figure: DiscoveryFigure) => void
  onRemove: () => void
}) {
  return (
    <div style={cardRowStyle}>
      <div style={fieldsGridStyle}>
        <TextField
          label={t("discovery.baseline.metric.name")}
          value={name}
          placeholder={t("discovery.baseline.metric.name_placeholder")}
          onChange={(value) => onNameChange(value ?? "")}
        />
        <TextField
          label={t("discovery.baseline.metric.notes")}
          value={notes}
          placeholder={t("discovery.baseline.metric.notes_placeholder")}
          onChange={onNotesChange}
        />
      </div>
      {/* A metric always carries a figure; clearing it means removing the
          metric, which the measurement gaps then explain. */}
      <FigureFields
        label={figureLabel}
        figure={figure}
        onChange={(next) => onFigureChange(next ?? newFigure())}
      />
      <RemoveButton onClick={onRemove} />
    </div>
  )
}

function Group({
  title,
  hint,
  onAdd,
  addLabel,
  children,
}: {
  title: string
  hint: string
  onAdd?: () => void
  addLabel?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <p style={eyebrowStyle}>{title}</p>
        <p style={{ ...introStyle, marginTop: 4 }}>{hint}</p>
      </div>
      {children}
      {onAdd && (
        <div>
          <button type="button" onClick={onAdd} style={addButtonStyle}>
            {addLabel}
          </button>
        </div>
      )}
    </div>
  )
}

function RemoveButton({
  onClick,
  label = t("common.action.remove"),
}: {
  onClick: () => void
  label?: string
}) {
  return (
    <div>
      <button type="button" onClick={onClick} style={removeButtonStyle}>
        {label}
      </button>
    </div>
  )
}

function replaceAt<T>(items: T[], index: number, item: T): T[] {
  return items.map((current, currentIndex) =>
    currentIndex === index ? item : current,
  )
}

function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, currentIndex) => currentIndex !== index)
}
