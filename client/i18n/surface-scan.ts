// Reading a `.tsx` surface well enough to tell displayed text from machinery.
//
// The catalogue tests need to answer one question about every user-facing file:
// *does any text reach the screen without passing through the catalogue?* A
// plain search for prose cannot answer it — a component is mostly strings, and
// almost all of them are CSS values, HTTP verbs, enum identifiers and paths.
//
// So the source is narrowed first: comments go, style objects go, and what
// remains is the file's actual content. Every string literal left in it is then
// either an identifier the code works with, or text somebody will read.
//
// This lives beside the tests rather than inside them because both the
// "no literal" test and the "no raw identifier" test read the same narrowed
// source, and a scanner that disagreed with itself between two tests would be
// worse than no scanner at all.

// Strip line and block comments. Documentation is not user-facing text, and it
// is where the German explanations of these very rules live.
export const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")

// Strip the styling: `const xStyle: React.CSSProperties = { … }` declarations
// and inline `style={{ … }}` props. Their values are full of things that look
// like prose — font stacks, `repeat(auto-fit, minmax(250px, 1fr))`, gradients —
// and none of it is read by anyone.
export const stripStyles = (source: string): string => {
  // `className` is styling too — Tailwind's utility strings read as prose to
  // any scanner and are read by nobody.
  source = source.replace(/className=(?:"[^"]*"|'[^']*')/g, "")

  let result = ""
  let index = 0

  const openers = [
    /(?:const\s+\w+\s*:\s*(?:React\.)?CSSProperties\s*=\s*)\{/g,
    // A style helper — `(selected: boolean): CSSProperties => ({ … })`. The
    // shared UI kit builds variant styles this way, and the object it returns
    // is a style object like any other: full of `1px solid …` and
    // `repeat(auto-fit, …)`, read by nobody.
    /:\s*(?:React\.)?CSSProperties\s*=>\s*\(\{/g,
    /style=\{\{/g,
    /className=\{/g,
  ]

  while (index < source.length) {
    const next = nextOpener(source, index, openers)
    if (next === null) {
      result += source.slice(index)
      break
    }

    result += source.slice(index, next.start)
    index = skipBalanced(source, next.braceIndex)
  }

  return result
}

type Opener = { start: number; braceIndex: number }

const nextOpener = (
  source: string,
  from: number,
  patterns: RegExp[],
): Opener | null => {
  let best: Opener | null = null

  for (const pattern of patterns) {
    pattern.lastIndex = from
    const match = pattern.exec(source)
    if (match === null) continue

    // The last `{` of the match is the one whose block is being skipped:
    // `style={{` opens two, and only the inner object is the style.
    const braceIndex = match.index + match[0].lastIndexOf("{")
    if (best === null || match.index < best.start) {
      best = { start: match.index, braceIndex }
    }
  }

  return best
}

// The index just past the `}` that closes the brace at `openIndex`. Strings
// inside the block are skipped so a `}` in a CSS value cannot close it early.
const skipBalanced = (source: string, openIndex: number): number => {
  let depth = 0

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index]

    if (character === '"' || character === "'" || character === "`") {
      index = skipString(source, index)
      continue
    }

    if (character === "{") depth += 1
    if (character === "}") {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }

  return source.length
}

const skipString = (source: string, openIndex: number): number => {
  const quote = source[openIndex]

  for (let index = openIndex + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1
      continue
    }
    if (source[index] === quote) return index
  }

  return source.length
}

export type Literal = { text: string; line: number }

// Every string literal in the source, with the line it sits on. Template
// literals contribute their static chunks only: the interpolations are values,
// but the text around them is written text like any other — which is how
// `` `${count} tokens` `` gets caught.
export const stringLiterals = (source: string): Literal[] => {
  const literals: Literal[] = []
  const lineOf = lineCounter(source)

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character !== '"' && character !== "'" && character !== "`") continue

    const end = skipString(source, index)
    const raw = source.slice(index + 1, end)

    if (character === "`") {
      for (const chunk of raw.split(/\$\{[^}]*\}/)) {
        literals.push({ text: chunk, line: lineOf(index) })
      }
    } else {
      literals.push({ text: raw, line: lineOf(index) })
    }

    index = end
  }

  return literals
}

// JSX text nodes: what sits between a `>` and the next `<` with no brace in
// between. Text typed straight into the markup instead of being looked up.
//
// A generic type argument — `useState<FormState>(initial)` — has the same shape
// to a regular expression, so a candidate that spans lines or carries code
// punctuation is not a text node and is dropped.
export const jsxTextNodes = (source: string): Literal[] => {
  const nodes: Literal[] = []
  const lineOf = lineCounter(source)

  for (const match of source.matchAll(/>([^<>{}\n]+)</g)) {
    const text = match[1].trim()
    if (/[=();[\]]/.test(text)) continue
    if (readsAsProse(text)) nodes.push({ text, line: lineOf(match.index) })
  }

  return nodes
}

const lineCounter = (source: string) => {
  const offsets: number[] = []
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") offsets.push(index)
  }

  return (offset: number) => {
    let line = 1
    for (const newline of offsets) {
      if (newline >= offset) break
      line += 1
    }
    return line
  }
}

// Does this literal read as something a person would read, rather than as an
// identifier the code works with?
//
// Written text gives itself away two ways: it contains a space between letters,
// or it is Capitalized like a sentence or a label. Identifiers, CSS keywords,
// paths, MIME types and HTTP verbs are none of those — `application/json`,
// `discovery_fact`, `PATCH` and `engagement.stage.label` all pass through.
export const readsAsProse = (text: string): boolean => {
  if (!/\p{L}/u.test(text)) return false
  if (/\p{L}\s+\p{L}/u.test(text)) return true

  return /^\p{Lu}\p{Ll}/u.test(text)
}
