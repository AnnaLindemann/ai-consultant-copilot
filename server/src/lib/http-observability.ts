import type { ErrorRequestHandler, Request, RequestHandler } from "express"

import {
  generateRequestId,
  getLogContext,
  logger,
  REQUEST_ID_HEADER,
  withLogContext,
} from "./application-logger.js"
import { failureIdentity } from "./failure-identity.js"

import type { LogMetadata } from "./application-logger.js"

declare global {
  namespace Express {
    interface Request {
      requestId: string
      observabilityRoute?: string
    }
  }
}

const STATIC_ASSET_PATTERN = /\.(?:css|js|map|ico|png|jpg|jpeg|svg|webp|woff2?)$/i
const SAFE_ENGAGEMENT_ID_SHAPE = /^eng_[A-Za-z0-9_-]{1,96}$/
const SAFE_METHOD_SHAPE = /^[A-Z]{3,16}$/
const MAX_SAFE_SEGMENT_LENGTH = 32
const TOKEN_LIKE_SEGMENT_LENGTH = 24

export const requestContext: RequestHandler = (req, res, next) => {
  const requestId = generateRequestId()
  req.requestId = requestId
  res.setHeader(REQUEST_ID_HEADER, requestId)

  const originalJson = res.json.bind(res)
  res.json = ((body?: unknown) => {
    if (res.statusCode >= 400 && isSafeErrorBody(body)) {
      return originalJson({ ...body, requestId })
    }
    return originalJson(body)
  }) as typeof res.json

  return withLogContext({ requestId }, () => next())
}

export const requestLifecycleLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint()

  if (shouldLogRequest(req)) {
    logger.debug("http.request_started", safeRequestMetadata(req))
  }

  res.on("finish", () => {
    try {
      const status = safeStatusCode(res.statusCode)
      if (!shouldLogCompletedRequest(req, status)) return

      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
      const metadata = {
        ...safeRequestMetadata(req),
        httpStatus: status,
        latencyMs: Math.max(0, Math.round(latencyMs)),
      }

      if (status >= 400) {
        logger.warn("http.request_completed", metadata)
      } else {
        logger.info("http.request_completed", metadata)
      }
    } catch (error) {
      logger.error("http.observability_failed", failureIdentity(error))
    }
  })

  next()
}

export const globalErrorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next,
) => {
  const status = safeHttpStatus(error)

  if (res.headersSent) {
    logger.error("http.unexpected_error", {
      ...safeRequestMetadata(req),
      httpStatus: status,
      ...failureIdentity(error),
    })
    destroyResponse(res)
    return
  }

  logger.error("http.unexpected_error", {
    ...safeRequestMetadata(req),
    httpStatus: status,
    ...failureIdentity(error),
  })

  res.status(status).json({
    status: false,
    message: "server.error.internal",
  })
}

export const safeRequestMetadata = (req: Request): LogMetadata => {
  try {
    const context = getLogContext()
    return compact({
      method: safeMethod(req),
      route: stableRoute(req),
      actorId: context.actorId ?? safeString(req.identity?.actingUser?.id),
      workspaceId:
        context.workspaceId ?? safeString(req.identity?.actingUser?.workspaceId),
      engagementId: context.engagementId ?? safeEngagementIdFromParams(req),
    })
  } catch {
    return {}
  }
}

const routePattern = (req: Request): string | undefined => {
  const route = safeRoute(req)
  if (route !== undefined) return route
  const path = safePath(req)
  return path === undefined ? undefined : normalizePath(path)
}

const stableRoute = (req: Request): string | undefined => {
  const existing = safeString(req.observabilityRoute)
  if (existing !== undefined) return existing

  const route = routePattern(req)
  if (route !== undefined) req.observabilityRoute = route
  return route
}

const normalizePath = (path: string): string =>
  (path.startsWith("/") ? path : `/${path}`)
    .split("/")
    .map((rawSegment, index) => {
      if (index === 0) return ""
      const segment = safeDecode(rawSegment)
      if (segment === "") return segment
      if (/^[0-9a-f]{8,}$/i.test(segment)) return ":id"
      if (/^(eng|org|usr|ws|run|rec|opp|rpt)_[A-Za-z0-9_-]+$/.test(segment)) {
        return ":id"
      }
      if (/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(segment)) return ":segment"
      if (
        /^[A-Za-z0-9_-]+={0,2}$/.test(segment) &&
        segment.length >= TOKEN_LIKE_SEGMENT_LENGTH
      ) {
        return ":segment"
      }
      if (!/^[A-Za-z0-9_.:-]+$/.test(segment)) return ":segment"
      if (segment.length > MAX_SAFE_SEGMENT_LENGTH) return ":segment"
      return segment
    })
    .join("/")

const safeEngagementIdFromParams = (req: Request): string | undefined => {
  try {
    const params = req.params
    if (!params || typeof params !== "object") return undefined
    const value = "id" in params ? params.id : params.engagementId
    return typeof value === "string" && SAFE_ENGAGEMENT_ID_SHAPE.test(value)
      ? value
      : undefined
  } catch {
    return undefined
  }
}

const shouldLogRequest = (req: Request): boolean => {
  const path = safePath(req) ?? "/"
  return path !== "/health" && !STATIC_ASSET_PATTERN.test(path)
}

const shouldLogCompletedRequest = (req: Request, status: number): boolean =>
  shouldLogRequest(req) || status >= 400

const isSafeErrorBody = (
  body: unknown,
): body is { status: false; requestId?: string } =>
  body !== null &&
  typeof body === "object" &&
  "status" in body &&
  (body as { status: unknown }).status === false

const safeHttpStatus = (error: unknown): number => {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    const status = (error as { status: number }).status
    if (status >= 400 && status <= 599) return status
  }

  return 500
}

const safeStatusCode = (status: unknown) =>
  typeof status === "number" && status >= 100 && status <= 599 ? status : 500

const safeMethod = (req: Request): string | undefined => {
  try {
    const method = req.method
    return typeof method === "string" && SAFE_METHOD_SHAPE.test(method)
      ? method
      : undefined
  } catch {
    return undefined
  }
}

const safeRoute = (req: Request): string | undefined => {
  try {
    const path = req.route?.path
    if (!path) return undefined
    const routePath = Array.isArray(path) ? path.join("|") : String(path)
    return normalizePath(`${safeBaseUrl(req)}${routePath}`)
  } catch {
    return undefined
  }
}

const safeBaseUrl = (req: Request): string => {
  try {
    return typeof req.baseUrl === "string" ? req.baseUrl : ""
  } catch {
    return ""
  }
}

const safePath = (req: Request): string | undefined => {
  try {
    return typeof req.path === "string" ? req.path : undefined
  } catch {
    return undefined
  }
}

const safeString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined

const safeDecode = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return ":segment"
  }
}

const destroyResponse = (res: Parameters<ErrorRequestHandler>[2]) => {
  try {
    if (!res.destroyed) res.destroy()
  } catch {
    // Error paths are already being handled; never throw from the fallback.
  }
}

const compact = (metadata: Record<string, unknown>): LogMetadata =>
  Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  ) as LogMetadata
