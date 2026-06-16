import { consultantReportSchema } from "../../../shared/consultant-report.schema.js"

export function validateConsultantReport(parsed: unknown) {
  return consultantReportSchema.parse(parsed)
}