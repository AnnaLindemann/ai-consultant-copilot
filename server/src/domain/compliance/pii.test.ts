import assert from "node:assert/strict"
import { test } from "node:test"

import { findPersonalIdentifiers, redactPersonalIdentifiers } from "./pii.js"

import type { PersonalIdentifierRule } from "../../../../shared/compliance.schema.js"

// The PII redactor is pure and deterministic, so it is tested without
// infrastructure and without a live model (coding-standards.md §9). What is
// tested is what the roadmap requires of it: that personal data is removed
// before AI processing, that what could not be removed is *reported* rather
// than quietly passed on, and that ordinary engagement content survives — an
// redactor that redacted the client's actual problem would make the stage
// useless.

const noRules: PersonalIdentifierRule[] = []

test("email addresses are replaced with stable placeholders", () => {
  const result = redactPersonalIdentifiers(
    "Schreiben Sie an anna.mueller@kunde.de und cc an anna.mueller@kunde.de.",
    noRules,
  )

  assert.equal(result.text.includes("anna.mueller@kunde.de"), false)
  // The same value gets the same placeholder, so the model can still reason
  // about "the same person" without being told who they are.
  assert.equal(result.text.match(/\[EMAIL_1\]/g)?.length, 2)
  assert.deepEqual(result.redactions, [
    { kind: "email", placeholder: "[EMAIL_1]" },
  ])
})

test("telephone numbers, IBANs and street addresses are recognized by shape", () => {
  const phone = redactPersonalIdentifiers("Rückruf unter +49 89 1234567 erbeten.", noRules)
  assert.equal(phone.text.includes("1234567"), false)
  assert.equal(phone.redactions[0]?.kind, "phone")

  const iban = redactPersonalIdentifiers("Konto DE89 3704 0044 0532 0130 00 belastet.", noRules)
  assert.equal(iban.text.includes("3704"), false)
  assert.equal(iban.redactions[0]?.kind, "iban")

  const address = redactPersonalIdentifiers("Zustellung an Musterstraße 12 in München.", noRules)
  assert.equal(address.text.includes("Musterstraße 12"), false)
  assert.equal(address.redactions[0]?.kind, "postal_address")
  // The city is context the assessment legitimately needs, and is not personal
  // data on its own.
  assert.equal(address.text.includes("München"), true)
})

test("a labelled contract reference is recognized and a bare token is not", () => {
  const labelled = redactPersonalIdentifiers("Kundennummer: KD-99881 ist betroffen.", noRules)
  assert.equal(labelled.text.includes("KD-99881"), false)
  assert.equal(labelled.redactions[0]?.kind, "contract_identifier")

  // A bare alphanumeric token is indistinguishable from a product name or a
  // system identifier, and redacting it would destroy the content the
  // consultant needs the model to reason about.
  const bare = redactPersonalIdentifiers("Das System SAP-ERP7 ist der Engpass.", noRules)
  assert.deepEqual(bare.redactions, [])
  assert.equal(bare.text, "Das System SAP-ERP7 ist der Engpass.")
})

test("a German compound beginning with a contract label is not an identifier", () => {
  // The label's "nummer"/"-Nr." part is what makes a reference a reference. With
  // it optional, the stem alone matched and the rest of the compound was taken
  // for the identifier — so ordinary consulting vocabulary was redacted out of
  // the prompt under any policy that removes personal data.
  const compounds =
    "Vertragspartner und Vertragsbedingungen bestimmen das Auftragsvolumen; die Vertragsdefinition ist offen."

  const scanned = redactPersonalIdentifiers(compounds, noRules)

  assert.deepEqual(scanned.redactions, [])
  assert.equal(scanned.text, compounds)
  assert.deepEqual(findPersonalIdentifiers(compounds, noRules), [])

  // The labelled forms on those same stems are still recognized.
  for (const labelled of [
    "Vertragsnummer: V-2031",
    "Vertrags-Nr. 88120",
    "Auftragsnummer A-4711",
    "Contract Number C-9004",
  ]) {
    assert.deepEqual(
      findPersonalIdentifiers(labelled, noRules),
      ["contract_identifier"],
      labelled,
    )
  }
})

test("ordinary engagement content passes through untouched", () => {
  const content =
    "Der Kundenservice bearbeitet 400 Tickets pro Woche und verliert dabei 12 Stunden."

  const result = redactPersonalIdentifiers(content, noRules)

  assert.equal(result.text, content)
  assert.deepEqual(result.redactions, [])
})

test("a workspace's own configured identifiers are removed", () => {
  const rules: PersonalIdentifierRule[] = [
    { label: "Kontakt", kind: "person_name", match: "literal", value: "Anna Neva" },
    {
      label: "Kundennummer",
      kind: "custom",
      match: "pattern",
      value: "\\bCUST-\\d{6}\\b",
    },
  ]

  const result = redactPersonalIdentifiers(
    "Anna Neva betreut CUST-123456 und CUST-654321.",
    rules,
  )

  assert.equal(result.text.includes("Anna Neva"), false)
  assert.equal(result.text.includes("CUST-123456"), false)
  assert.equal(result.text.includes("CUST-654321"), false)
  // Two distinct customer numbers get two distinct placeholders.
  assert.equal(result.redactions.filter((r) => r.kind === "custom").length, 2)
})

test("a broken configured pattern is skipped rather than breaking every AI stage", () => {
  const rules: PersonalIdentifierRule[] = [
    { label: "kaputt", kind: "custom", match: "pattern", value: "([unclosed" },
    { label: "Kontakt", kind: "person_name", match: "literal", value: "Anna" },
  ]

  const result = redactPersonalIdentifiers("Anna meldet den Fall.", rules)

  assert.equal(result.text.includes("Anna"), false)
})

test("PII redaction is deterministic", () => {
  const rules: PersonalIdentifierRule[] = [
    { label: "Kontakt", kind: "person_name", match: "literal", value: "Anna" },
  ]
  const content = "Anna schreibt an a@b.de, Rückruf +49 89 1234567."

  assert.deepEqual(
    redactPersonalIdentifiers(content, rules),
    redactPersonalIdentifiers(content, rules),
  )
})

test("verification reports what survived, and reports nothing on clean text", () => {
  // The placeholders the redactor itself wrote are not leftovers.
  const redacted = redactPersonalIdentifiers(
    "Kontakt a@b.de, Kundennummer: KD-1234, IBAN DE89 3704 0044 0532 0130 00.",
    noRules,
  )
  assert.deepEqual(findPersonalIdentifiers(redacted.text, noRules), [])

  // Text that was never redacted still carries what a rule recognizes, and
  // the verification says so — which is what makes the gate refuse rather than
  // send the original.
  const remaining = findPersonalIdentifiers("Kontakt a@b.de", noRules)
  assert.deepEqual(remaining, ["email"])
})

test("the record of a redaction never contains the value that was removed", () => {
  const result = redactPersonalIdentifiers("Kontakt anna.mueller@kunde.de", noRules)

  const serialized = JSON.stringify(result.redactions)
  assert.equal(serialized.includes("anna.mueller"), false)
  assert.equal(serialized.includes("kunde.de"), false)
})
