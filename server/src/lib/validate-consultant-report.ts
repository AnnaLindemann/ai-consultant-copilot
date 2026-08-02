import { generatedConsultantReportDraftSchema } from "../../../shared/consultant-report.schema.js"

export function validateConsultantReport(parsed: unknown) {
  return generatedConsultantReportDraftSchema.parse(parsed)
}
