import { logger } from "../lib/application-logger.js"
import { validateEnvironment } from "./environment.js"

import type {
  EnvironmentSource,
  EnvironmentVerdict,
  ValidatedEnvironment,
} from "./environment.js"

// The process-facing half of environment validation: report the verdict and,
// where it is a refusal, stop.
//
// Kept apart from `environment.ts` so that the rules stay pure and testable and
// only this thin layer touches the logger and the exit code. It is also the
// reason `server.ts` can import the validator before anything that touches
// infrastructure: nothing here reaches a database, a provider, or the
// authentication library.

type Terminate = (code: number) => never | void

// Each failure is reported on its own line, as its stable identifier and
// nothing else.
//
// One line per failure rather than one line carrying a list, because the
// application logger deliberately does not serialize arrays (application
// logging policy) — and because a deploy log is grepped, so one greppable
// identifier per line is the more useful shape anyway.
//
// The variable's *value* never appears. Half of what was validated is a secret,
// and the identifier already names the variable and the problem.
export const reportEnvironmentVerdict = (verdict: EnvironmentVerdict) => {
  for (const warning of verdict.warnings) {
    logger.warn("startup.environment_warning", {
      reasonCode: warning.code,
      category: "environment",
    })
  }

  if (verdict.valid) {
    logger.info("startup.environment_valid", {
      category: "environment",
      count: verdict.warnings.length,
    })
    return
  }

  for (const failure of verdict.failures) {
    logger.error("startup.environment_invalid", {
      reasonCode: failure.code,
      category: "environment",
    })
  }

  logger.error("STARTUP_ENVIRONMENT_INVALID", {
    category: "environment",
    count: verdict.failures.length,
  })
}

// Validate, report, and either hand back the resolved configuration or stop the
// process.
//
// `terminate` and `env` are injected so the whole path — including the refusal
// — is exercisable in a test without killing the test runner.
export const requireValidEnvironment = (
  env: EnvironmentSource = process.env,
  terminate: Terminate = process.exit,
): ValidatedEnvironment | null => {
  const verdict = validateEnvironment(env)
  reportEnvironmentVerdict(verdict)

  if (!verdict.valid) {
    terminate(1)
    return null
  }

  return verdict.environment
}
