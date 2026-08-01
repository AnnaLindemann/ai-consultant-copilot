import assert from "node:assert/strict"
import { test } from "node:test"

import {
  addSuggestionItem,
  appendSuggestionPhrase,
  removeSuggestionItem,
} from "./discovery-suggestions.ts"

// A suggestion is a starting point. These are the rules that keep it from
// becoming a constraint.

test("a suggestion fills an empty answer with an editable sentence", () => {
  assert.equal(
    appendSuggestionPhrase(null, "Die Bearbeitungszeit soll sinken."),
    "Die Bearbeitungszeit soll sinken.",
  )
})

test("a suggestion never overwrites what the user already wrote", () => {
  const written = "Wir haben das im Team schon besprochen."

  assert.equal(
    appendSuggestionPhrase(written, "Die Fehlerquote soll sinken."),
    `${written}\nDie Fehlerquote soll sinken.`,
  )
})

test("a second suggestion extends the answer instead of replacing the first", () => {
  const first = appendSuggestionPhrase(null, "Erstens.")
  const second = appendSuggestionPhrase(first, "Zweitens.")

  assert.equal(second, "Erstens.\nZweitens.")
})

test("choosing a list suggestion adds it once", () => {
  const once = addSuggestionItem([], "Bearbeitungszeit")

  assert.deepEqual(once, ["Bearbeitungszeit"])
  assert.deepEqual(addSuggestionItem(once, "Bearbeitungszeit"), ["Bearbeitungszeit"])
})

test("a custom answer is accepted exactly like a suggested one", () => {
  const items = addSuggestionItem(["Fehlerquote"], "Eigene Kennzahl aus dem Werk")

  assert.deepEqual(items, ["Fehlerquote", "Eigene Kennzahl aus dem Werk"])
})

test("a blank custom answer is ignored", () => {
  assert.deepEqual(addSuggestionItem(["Fehlerquote"], "   "), ["Fehlerquote"])
})

test("a chosen answer can be taken away again", () => {
  assert.deepEqual(
    removeSuggestionItem(["Fehlerquote", "Bearbeitungszeit"], "Fehlerquote"),
    ["Bearbeitungszeit"],
  )
})

test("removing something that is not selected changes nothing", () => {
  assert.deepEqual(removeSuggestionItem(["Fehlerquote"], "Umsatz"), ["Fehlerquote"])
})

test("the helpers never mutate the value they were given", () => {
  const original = ["Fehlerquote"]

  addSuggestionItem(original, "Umsatz")
  removeSuggestionItem(original, "Fehlerquote")

  assert.deepEqual(original, ["Fehlerquote"])
})
