import { logger } from "./application-logger.js"
import { failureIdentity } from "./failure-identity.js"

type Terminate = (code: number) => never | void
type ProcessLike = {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): unknown
  on(event: "uncaughtException", listener: (error: Error) => void): unknown
}

const installedTargets = new WeakSet<ProcessLike>()

export const handleUnhandledRejection = (
  reason: unknown,
  terminate: Terminate = process.exit,
) => {
  logger.error("process.unhandled_rejection", failureIdentity(reason))
  terminate(1)
}

export const handleUncaughtException = (
  error: Error,
  terminate: Terminate = process.exit,
) => {
  logger.error("process.uncaught_exception", failureIdentity(error))
  terminate(1)
}

export const installProcessErrorHandlers = (
  terminate: Terminate = process.exit,
  target: ProcessLike = process,
): boolean => {
  if (installedTargets.has(target)) return false

  target.on("unhandledRejection", (reason) => {
    handleUnhandledRejection(reason, terminate)
  })
  target.on("uncaughtException", (error) => {
    handleUncaughtException(error, terminate)
  })
  installedTargets.add(target)
  return true
}
