import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { test } from "node:test"

import {
  handleUncaughtException,
  handleUnhandledRejection,
  installProcessErrorHandlers,
} from "./process-error-handlers.js"

test("unhandled rejections are logged safely and terminate non-zero", () => {
  let exitCode: number | undefined
  const { stderr } = captureLogger(() => {
    handleUnhandledRejection(
      new Error("raw rejection message with password=secret"),
      (code) => {
        exitCode = code
      },
    )
  })

  assert.equal(exitCode, 1)
  assert.equal(stderr.length, 1)
  const entry = JSON.parse(stderr[0]!)
  assert.equal(entry.event, "process.unhandled_rejection")
  assert.equal(entry.errorName, "Error")
  assert.equal(stderr[0]!.includes("password=secret"), false)
})

test("uncaught exceptions are logged safely and terminate non-zero", () => {
  let exitCode: number | undefined
  const error = new Error("raw exception message with token=secret")
  const { stderr } = captureLogger(() => {
    handleUncaughtException(error, (code) => {
      exitCode = code
    })
  })

  assert.equal(exitCode, 1)
  assert.equal(stderr.length, 1)
  const entry = JSON.parse(stderr[0]!)
  assert.equal(entry.event, "process.uncaught_exception")
  assert.equal(entry.errorName, "Error")
  assert.equal(stderr[0]!.includes("token=secret"), false)
  assert.equal(stderr[0]!.includes("at "), false)
})

test("process error handlers install only once", () => {
  const target = new EventEmitter()

  assert.equal(installProcessErrorHandlers(() => undefined, target), true)
  assert.equal(installProcessErrorHandlers(() => undefined, target), false)
  assert.equal(target.listenerCount("unhandledRejection"), 1)
  assert.equal(target.listenerCount("uncaughtException"), 1)
})

const captureLogger = (operation: () => void) => {
  const stderr: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "))
  }

  try {
    operation()
    return { stderr }
  } finally {
    console.error = original
  }
}
