// What a log line is allowed to say about a failure.
//
// An error object is not diagnostic data that happens to be verbose — it is
// arbitrary text and attached state from wherever the failure came from. A
// vendor SDK routinely attaches the failing request; a database driver attaches
// the failing query and its parameters; a fetch error attaches the URL. Each of
// those can carry exactly what must never reach a log: a verification or reset
// link, an invitation token, a session cookie, an Authorization header, an API
// key, a password (coding-standards.md §6, §6A).
//
// So nothing is *sanitized* here. Sanitizing means starting from untrusted text
// and hoping the patterns you thought of cover the ones you did not. This module
// starts from nothing and admits two fields, each only if it has the shape of an
// identifier rather than of prose: the error's class name and its code. A
// message, a stack, a body, a `cause`, and any other attached property never
// leave this function.

export type FailureIdentity = {
  // The error's class, e.g. `PrismaClientKnownRequestError`, `TypeError`.
  errorName: string
  // The machine code the source assigned it, e.g. `P2003`, `ECONNREFUSED`.
  errorCode: string | null
}

// A class name: letters, digits and underscores, starting with a letter. Long
// enough for the real ones, short enough that nothing narrative fits.
const NAME_SHAPE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

// A machine code: upper-case identifier (`ECONNREFUSED`) or a vendor code with
// digits (`P2003`, `23505`). Deliberately excludes anything with the shape of a
// sentence, a URL, or a token.
const CODE_SHAPE = /^[A-Z][A-Z0-9_]{0,31}$|^[0-9A-Z]{2,10}$/

export const failureIdentity = (error: unknown): FailureIdentity => ({
  errorName: identifierOr(nameOf(error), "unrecognized", NAME_SHAPE),
  errorCode: identifierOr(codeOf(error), null, CODE_SHAPE),
})

const nameOf = (error: unknown): unknown => {
  if (error instanceof Error) return error.name
  if (error && typeof error === "object") return error.constructor?.name
  return typeof error
}

const codeOf = (error: unknown): unknown =>
  error && typeof error === "object" && "code" in error
    ? (error as { code: unknown }).code
    : undefined

function identifierOr<TFallback extends string | null>(
  value: unknown,
  fallback: TFallback,
  shape: RegExp,
): string | TFallback {
  return typeof value === "string" && shape.test(value) ? value : fallback
}
