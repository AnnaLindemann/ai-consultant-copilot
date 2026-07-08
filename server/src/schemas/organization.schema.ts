import { z } from "zod"

const companySizeSchema = z.enum([
  "solo",
  "micro",
  "small",
  "medium",
  "large",
  "enterprise",
])

const nonEmptyString = z.string().trim().min(1)

// An Organization is identity + company-level context only — deliberately not a
// customer-relationship record (domain-model.md §2, §6). Only the name is
// required; the rest is context that can be filled in later.
export const createOrganizationSchema = z.object({
  name: nonEmptyString,
  industry: z.string().trim().optional(),
  companySize: companySizeSchema.optional(),
  geography: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>
