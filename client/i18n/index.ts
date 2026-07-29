import { de, type MessageKey } from "./de"

// The localization seam (architecture.md §7.1). One locale ships — German —
// behind a key-based lookup, so adding a language later is a second catalogue
// rather than a rewrite. Per architecture §1.6 there is deliberately no locale
// switcher, no negotiation, and no translation tooling until a second language
// actually exists.

export const LOCALE = "de-DE"

const catalogue: Record<MessageKey, string> = de

export type MessageParams = Record<string, string | number>

// Look up a user-facing string by key, filling {placeholders} from params.
// The key type makes a missing translation a compile error rather than a
// string that quietly renders as its own key.
export const t = (key: MessageKey, params?: MessageParams): string =>
  interpolate(catalogue[key], params)

// Render an outcome the server reported. The server sends an identifier and
// structured parameters, never prose (coding-standards.md §12A); parameter
// values that are themselves identifiers — an actor, a transition, a status —
// are localized in turn, so no displayed text ever comes off the wire.
export const translateServerMessage = (
  messageId: string | undefined,
  params?: Record<string, string>,
  fallback: MessageKey = "common.error.unexpected",
): string => {
  if (messageId === undefined || !isMessageKey(messageId)) {
    return t(fallback)
  }

  return t(messageId, localizeParams(params))
}

export const isMessageKey = (value: string): value is MessageKey =>
  Object.hasOwn(catalogue, value)

// Dates and times are rendered in the active locale from the start, so a
// second language needs no formatting change.
export const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

export const formatList = (values: readonly string[]): string =>
  new Intl.ListFormat(LOCALE, { style: "long", type: "conjunction" }).format(
    values,
  )

// Which server parameters name an internal identifier, and where that
// identifier's label lives in the catalogue.
const PARAM_KEY_PREFIX: Record<string, string> = {
  actor: "discovery.actor.",
  transition: "discovery.transition.",
  status: "discovery.status.short.",
}

const localizeParams = (
  params: Record<string, string> | undefined,
): MessageParams | undefined => {
  if (!params) return undefined

  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => {
      const prefix = PARAM_KEY_PREFIX[name]
      const key = prefix === undefined ? undefined : `${prefix}${value}`

      return [name, key !== undefined && isMessageKey(key) ? t(key) : value]
    }),
  )
}

const interpolate = (template: string, params?: MessageParams): string => {
  if (!params) return template

  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  )
}
