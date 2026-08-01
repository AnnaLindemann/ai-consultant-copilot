// A stable, order-independent rendering of a stage's content, so hashing it
// gives the same answer for the same content however the object was built.
//
// Downstream stages record the hash of their source stage's canonical content
// to recognize that what they were derived from has since moved on — a
// recommendation to regenerate, never a reason to rewrite an earlier conclusion
// (agent-rules.md §15). Content-based rather than time-based, so a save that
// changed nothing does not make a derived stage look stale, and any real edit
// does.
//
// Object keys are emitted in sorted order; arrays keep theirs, because the order
// of findings, opportunities, and gaps is content. Only the plain data the stage
// schemas admit reaches this — strings, numbers, booleans, arrays, objects.
export const canonicalStageContent = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStageContent).join(",")}]`
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([one], [other]) => (one < other ? -1 : one > other ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalStageContent(nested)}`)

    return `{${entries.join(",")}}`
  }

  return JSON.stringify(value) ?? "null"
}
