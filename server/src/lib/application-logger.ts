import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"

import { failureIdentity } from "./failure-identity.js"

type LogLevel = "debug" | "info" | "warn" | "error"

export type LogMetadataValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | Error
  | readonly unknown[]
  | { readonly [key: string]: unknown }

export type LogMetadata = Record<string, LogMetadataValue>

export type LogContext = {
  requestId?: string
  actorId?: string
  workspaceId?: string
  engagementId?: string
}

const contextStorage = new AsyncLocalStorage<LogContext>()

const EVENT_SHAPE = /^[A-Za-z][A-Za-z0-9_.:_-]{0,95}$/
const PREFIXED_IDENTIFIER_SHAPE = /^[A-Za-z]{2,16}_[A-Za-z0-9_-]{1,96}$/
const CUID_IDENTIFIER_SHAPE = /^[a-z][a-z0-9]{20,31}$/
const UUID_IDENTIFIER_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_ROUTE_SHAPE = /^\/[A-Za-z0-9/_.:{}|*-]{0,255}$/
const MAX_STRING_LENGTH = 128
const MAX_EVENT_LENGTH = 96

const ALLOWED_METADATA_FIELDS = new Set([
  "requestId",
  "method",
  "route",
  "httpStatus",
  "latencyMs",
  "workspaceId",
  "engagementId",
  "actorId",
  "userId",
  "provider",
  "model",
  "stage",
  "action",
  "eventType",
  "errorName",
  "errorCode",
  "reasonCode",
  "outcome",
  "count",
  "category",
  "port",
  "afterRetry",
  "kind",
  "failure",
  "publicationId",
  "reportVersionId",
  "vendorError",
])

export const REQUEST_ID_HEADER = "x-request-id"

export const REQUEST_ID_SHAPE = /^req_[A-Za-z0-9_-]{8,80}$/

export const generateRequestId = () =>
  `req_${randomUUID().replaceAll("-", "")}`

export const safeInboundRequestId = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return REQUEST_ID_SHAPE.test(trimmed) ? trimmed : null
}

export const getLogContext = (): LogContext => contextStorage.getStore() ?? {}

export const getCurrentRequestId = (): string | undefined =>
  getLogContext().requestId

export const withLogContext = <T>(context: LogContext, callback: () => T): T =>
  contextStorage.run(context, callback)

export const updateLogContext = (context: LogContext) => {
  const current = contextStorage.getStore()
  if (!current) return

  for (const [key, value] of Object.entries(context) as [
    keyof LogContext,
    string | undefined,
  ][]) {
    if (value !== undefined) current[key] = value
  }
}

const write = (level: LogLevel, event: string, metadata?: LogMetadata) => {
  try {
    const safeEvent = safeEventName(event)
    if (!safeEvent) return

    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      ...sanitizeMetadata(metadata ?? {}),
      event: safeEvent,
      ...sanitizeContext(getLogContext()),
    })

    if (level === "warn" || level === "error") {
      console.error(line)
    } else {
      console.log(line)
    }
  } catch {
    // Observability failures must never break the primary operation.
  }
}

export const logger = {
  debug: (event: string, metadata?: LogMetadata) => write("debug", event, metadata),
  info: (event: string, metadata?: LogMetadata) => write("info", event, metadata),
  warn: (event: string, metadata?: LogMetadata) => write("warn", event, metadata),
  error: (event: string, metadata?: LogMetadata) => write("error", event, metadata),
}

const compact = (metadata: LogMetadata): LogMetadata =>
  Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  ) as LogMetadata

const sanitizeMetadata = (metadata: LogMetadata): LogMetadata => {
  const safe: LogMetadata = {}

  for (const [key, value] of safeEntries(metadata)) {
    if (value instanceof Error) {
      Object.assign(safe, sanitizeMetadata(failureIdentity(value)))
      continue
    }
    if (!ALLOWED_METADATA_FIELDS.has(key)) continue
    const sanitized = sanitizeFieldValue(key, value)
    if (sanitized !== undefined) safe[key] = sanitized
  }

  return safe
}

const sanitizeContext = (context: LogContext): LogMetadata =>
  compact({
    requestId: sanitizeFieldValue("requestId", context.requestId),
    actorId: sanitizeFieldValue("actorId", context.actorId),
    workspaceId: sanitizeFieldValue("workspaceId", context.workspaceId),
    engagementId: sanitizeFieldValue("engagementId", context.engagementId),
  })

const sanitizeFieldValue = (
  key: string,
  value: unknown,
): LogMetadataValue => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (value instanceof Error) return undefined
  if (typeof value === "string") return sanitizeStringField(key, value)
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "boolean") return value

  return undefined
}

const sanitizeStringField = (
  key: string,
  value: string,
): string | undefined => {
  const trimmed = value.trim()
  if (trimmed === "") return undefined

  if (key === "requestId") {
    return REQUEST_ID_SHAPE.test(trimmed) ? trimmed : undefined
  }

  if (key === "engagementId") {
    return isSafeSpecificIdentifier(trimmed, "eng") ? trimmed : undefined
  }

  if (key === "workspaceId") {
    return isSafeSpecificIdentifier(trimmed, "ws") ? trimmed : undefined
  }

  if (key === "actorId" || key === "userId") {
    return isSafeSpecificIdentifier(trimmed, "usr") ? trimmed : undefined
  }

  if (key === "route") {
    if (!SAFE_ROUTE_SHAPE.test(trimmed)) return undefined
    return truncate(trimmed, 256)
  }

  if (isIdentifierField(key) && !isSafeIdentifier(trimmed)) {
    return undefined
  }

  return truncate(trimmed, MAX_STRING_LENGTH)
}

const safeEventName = (event: string): string | undefined => {
  const trimmed = event.trim()
  if (!EVENT_SHAPE.test(trimmed)) return undefined
  return truncate(trimmed, MAX_EVENT_LENGTH)
}

const safeEntries = (metadata: LogMetadata): [string, unknown][] => {
  try {
    return Object.entries(metadata)
  } catch {
    return []
  }
}

const isIdentifierField = (key: string) =>
  key.endsWith("Id") ||
  key === "actorId" ||
  key === "workspaceId" ||
  key === "engagementId" ||
  key === "userId" ||
  key === "publicationId" ||
  key === "reportVersionId"

const isSafeSpecificIdentifier = (value: string, prefix: string) =>
  value.startsWith(`${prefix}_`)
    ? PREFIXED_IDENTIFIER_SHAPE.test(value)
    : CUID_IDENTIFIER_SHAPE.test(value) || UUID_IDENTIFIER_SHAPE.test(value)

const isSafeIdentifier = (value: string) =>
  PREFIXED_IDENTIFIER_SHAPE.test(value) ||
  CUID_IDENTIFIER_SHAPE.test(value) ||
  UUID_IDENTIFIER_SHAPE.test(value)

const truncate = (value: string, limit: number) =>
  value.length > limit ? value.slice(0, limit) : value
