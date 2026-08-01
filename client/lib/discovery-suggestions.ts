// What choosing a suggested answer actually does to a value.
//
// A suggestion is a starting point, never a commitment: it extends what is
// already written instead of replacing it, it can be taken away again, and a
// value typed by hand is treated exactly like one that came from the list.

/**
 * Adds a suggested sentence to a free-text answer. Existing text is kept and
 * the phrase goes on its own line, so a second suggestion extends the answer
 * rather than overwriting the first one — or anything the user wrote.
 */
export const appendSuggestionPhrase = (
  current: string | null,
  phrase: string,
): string => {
  const existing = current?.trim() ?? ""

  return existing.length === 0 ? phrase : `${existing}\n${phrase}`
}

/**
 * Adds an item to a list answer. Blank entries are ignored and an item already
 * present is not duplicated, so clicking the same suggestion twice is harmless.
 */
export const addSuggestionItem = (
  items: readonly string[],
  item: string,
): string[] => {
  const trimmed = item.trim()

  if (trimmed.length === 0 || items.includes(trimmed)) return [...items]

  return [...items, trimmed]
}

export const removeSuggestionItem = (
  items: readonly string[],
  item: string,
): string[] => items.filter((entry) => entry !== item)
