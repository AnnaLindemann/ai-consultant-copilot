import assert from "node:assert/strict"
import { test } from "node:test"

import { createOrganizationSchema } from "./organization.schema.js"

test("createOrganizationSchema accepts a name-only organization", () => {
  // Identity is the only requirement; context (industry, size, ...) is optional.
  const result = createOrganizationSchema.safeParse({
    name: "Demo Hotel GmbH",
  })

  assert.equal(result.success, true)
})

test("createOrganizationSchema accepts optional context", () => {
  const result = createOrganizationSchema.safeParse({
    name: "Demo Hotel GmbH",
    industry: "Hospitality",
    companySize: "small",
    geography: "DACH",
    notes: "Prospective client.",
  })

  assert.equal(result.success, true)
})

test("createOrganizationSchema rejects a missing name", () => {
  const result = createOrganizationSchema.safeParse({
    industry: "Hospitality",
  })

  assert.equal(result.success, false)
})

test("createOrganizationSchema rejects a blank name", () => {
  const result = createOrganizationSchema.safeParse({ name: "   " })

  assert.equal(result.success, false)
})

test("createOrganizationSchema rejects an out-of-range company size", () => {
  const result = createOrganizationSchema.safeParse({
    name: "Demo Hotel GmbH",
    companySize: "gigantic",
  })

  assert.equal(result.success, false)
})
