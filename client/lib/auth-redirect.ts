// Where an unauthenticated visitor is sent, and where they come back to.
//
// The consultant surfaces are useless without a session, so a visitor without
// one is sent to `/auth` rather than shown the server's `auth.error.*`
// identifier — that identifier is a machine outcome for the interface to act
// on, not a sentence for a person to read (architecture.md §7.1).
//
// This is a convenience, never a control: every one of those pages is refused
// independently by the server, and nothing here decides what anyone may see
// (architecture.md §7A.2 "Permission-aware UI is a convenience").

export const HOME_PATH = "/"
export const SIGN_IN_PATH = "/auth"

// The query parameter carrying the page the visitor was trying to reach.
export const RETURN_PARAM = "redirect"

export const signInPath = (returnPath: string): string =>
  returnPath === HOME_PATH
    ? SIGN_IN_PATH
    : `${SIGN_IN_PATH}?${RETURN_PARAM}=${encodeURIComponent(returnPath)}`

// The return path, as the sign-in page is allowed to use it.
//
// The value arrives in a URL the visitor controls, so it is treated as input
// rather than as state: only a path inside this application is ever honoured.
// Anything absolute, protocol-relative, or otherwise off-origin falls back to
// the workspace home, so a crafted link cannot turn our sign-in page into a
// redirector to somebody else's.
export const safeReturnPath = (value: string | null | undefined): string => {
  if (!value || !value.startsWith("/")) return HOME_PATH

  // "//host" and "/\host" are both read as protocol-relative by browsers.
  if (value[1] === "/" || value[1] === "\\") return HOME_PATH

  // A control character can terminate the value early or split it across a
  // header, which makes what the browser follows differ from what was checked.
  const hasControlCharacter = [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 0x20 || code === 0x7f
  })
  if (hasControlCharacter) return HOME_PATH

  // Returning to the sign-in page would be a loop, not a return.
  if (
    value === SIGN_IN_PATH ||
    value.startsWith(`${SIGN_IN_PATH}?`) ||
    value.startsWith(`${SIGN_IN_PATH}/`)
  ) {
    return HOME_PATH
  }

  return value
}
