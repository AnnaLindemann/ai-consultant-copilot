import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import {
  createDevMailboxEmailDelivery,
  createEmailDeliveryProvider,
  createLoggingEmailDelivery,
  createResendEmailDelivery,
  readEmailDeliveryConfig,
  type EmailDeliveryConfig,
} from "./email-delivery.js"
import { createDevMailbox } from "./dev-mailbox.js"
import { renderEmail } from "./email-templates.js"

import type { EmailDeliveryProvider } from "../domain/access/ports.js"

// Which email adapter a deployment gets, which one it is refused, and — the two
// properties this file exists to pin down — that no adapter ever puts
// secret-bearing content in a log, and that no adapter ever claims a delivery it
// did not perform.
//
// The bodies these providers carry are single-use links: an email-verification
// URL, a password-reset URL, a staff-invitation URL with its token. A log line
// is aggregated, shipped, retained, and read by people who are not the
// recipient, so a token that reaches a log is a token disclosed.
//
// The vendor is the harder half. Nothing constrains what a provider puts in an
// error, and several quote the rejected request back verbatim — with the link,
// the Authorization header, and the cookie that carried it. The strategy under
// test is therefore *not* redaction: the vendor's prose is never admitted at
// all, and only an allow-listed error name survives (`email-delivery.ts`). The
// echo cases below are the proof, and they are deliberately chosen so that a
// pattern-based redactor would pass some and fail others.

const configFor = (
  overrides: Partial<EmailDeliveryConfig> = {},
): EmailDeliveryConfig => ({
  resendApiKey: undefined,
  fromAddress: undefined,
  isProduction: false,
  useDevMailbox: false,
  devMailboxDirectory: path.join(tmpdir(), "unused-dev-mailbox"),
  ...overrides,
})

// --- Which adapter a deployment gets ---------------------------------------

test("a configured deployment sends through Resend", () => {
  const provider = createEmailDeliveryProvider(
    configFor({
      resendApiKey: "re_test_key",
      fromAddress: "workbench@example.com",
      isProduction: true,
    }),
  )

  assert.equal(provider.channel, "resend")
})

test("production refuses to start without email delivery configured", () => {
  const incomplete = [
    { resendApiKey: undefined, fromAddress: undefined },
    { resendApiKey: "re_test_key", fromAddress: undefined },
    { resendApiKey: undefined, fromAddress: "workbench@example.com" },
  ]

  for (const config of incomplete) {
    assert.throws(
      () =>
        createEmailDeliveryProvider(configFor({ ...config, isProduction: true })),
      /Email delivery is not configured/,
      `production started with ${JSON.stringify(config)}`,
    )
  }
})

test("development without configuration logs instead of sending", () => {
  const provider = createEmailDeliveryProvider(configFor())

  // The channel says `log`, so a caller can report honestly that mail was not
  // sent rather than implying it was.
  assert.equal(provider.channel, "log")
})

test("the development mailbox is chosen only when it is asked for", () => {
  assert.equal(createEmailDeliveryProvider(configFor()).channel, "log")

  assert.equal(
    createEmailDeliveryProvider(configFor({ useDevMailbox: true })).channel,
    "dev_mailbox",
  )

  // Explicit beats implicit: a developer who asked for the mailbox gets it even
  // on a machine that also carries vendor credentials, so a local run cannot
  // accidentally mail a real address.
  assert.equal(
    createEmailDeliveryProvider(
      configFor({
        useDevMailbox: true,
        resendApiKey: "re_test_key",
        fromAddress: "workbench@example.com",
      }),
    ).channel,
    "dev_mailbox",
  )
})

test("production refuses to start with the development mailbox enabled", () => {
  // Real recipients' verification and reset links would be written to the
  // server's disk and never delivered. A startup refusal, not a downgrade.
  assert.throws(
    () =>
      createEmailDeliveryProvider(
        configFor({
          useDevMailbox: true,
          isProduction: true,
          resendApiKey: "re_test_key",
          fromAddress: "workbench@example.com",
        }),
      ),
    /never available in production/,
  )
})

test("blank configuration counts as absent, not as configured", () => {
  // An empty environment variable is a common half-configured state; treating
  // it as a value would hand Resend an empty API key in production.
  const config = readEmailDeliveryConfig({
    RESEND_API_KEY: "   ",
    EMAIL_FROM: "",
    NODE_ENV: "production",
  })

  assert.equal(config.resendApiKey, undefined)
  assert.equal(config.fromAddress, undefined)
  assert.throws(() => createEmailDeliveryProvider(config))
})

test("configuration is read from the environment, trimmed", () => {
  const config = readEmailDeliveryConfig({
    RESEND_API_KEY: " re_test_key ",
    EMAIL_FROM: " workbench@example.com ",
    NODE_ENV: "development",
    EMAIL_DEV_MAILBOX: "1",
    EMAIL_DEV_MAILBOX_DIR: " /tmp/mailbox ",
  })

  assert.deepEqual(config, {
    resendApiKey: "re_test_key",
    fromAddress: "workbench@example.com",
    isProduction: false,
    useDevMailbox: true,
    devMailboxDirectory: "/tmp/mailbox",
  })
})

test("the development mailbox stays off unless explicitly enabled", () => {
  for (const flag of [undefined, "", "0", "false", "no", "off", "maybe"]) {
    assert.equal(
      readEmailDeliveryConfig({ EMAIL_DEV_MAILBOX: flag }).useDevMailbox,
      false,
      `EMAIL_DEV_MAILBOX=${JSON.stringify(flag)} enabled the mailbox`,
    )
  }

  for (const flag of ["1", "true", "TRUE", " yes "]) {
    assert.equal(
      readEmailDeliveryConfig({ EMAIL_DEV_MAILBOX: flag }).useDevMailbox,
      true,
      `EMAIL_DEV_MAILBOX=${JSON.stringify(flag)} did not enable the mailbox`,
    )
  }
})

// --- Truthful reporting ----------------------------------------------------

test("the development adapter reports that nothing was sent", async () => {
  const provider = createLoggingEmailDelivery()

  const result = await captureConsole(() =>
    provider.send(invitationWithToken()),
  ).then(({ value }) => value)

  // Not a delivery, and it says so as an identifier the caller can act on. The
  // opposite — `delivered: true` on the log channel — is what turns "the
  // invitation was sent" into a statement nobody checked.
  assert.equal(result.delivered, false)
  assert.equal(result.channel, "log")
  assert.equal(result.delivered === false && result.reason, "logged_not_sent")
})

test("a rejected send is reported as a failure, not as a delivery", async () => {
  const provider = rejectingWith({ message: "domain is not verified" })

  const { value: result } = await captureConsole(() =>
    provider.send(invitationWithToken()),
  )

  assert.equal(result.delivered, false)
  assert.equal(result.delivered === false && result.reason, "provider_rejected")
})

test("a vendor outage is reported as a failure, not as a delivery", async () => {
  const provider = createResendEmailDelivery("workbench@example.com", async () => {
    throw new Error("connect ETIMEDOUT")
  })

  const { value: result } = await captureConsole(() =>
    provider.send(invitationWithToken()),
  )

  assert.equal(result.delivered, false)
  assert.equal(
    result.delivered === false && result.reason,
    "provider_unavailable",
  )
})

test("only a real send reports a delivery", async () => {
  const provider = createResendEmailDelivery("workbench@example.com", async () => ({
    data: { id: "resend_1" },
    error: null,
  }))

  const { value: result } = await captureConsole(() =>
    provider.send(invitationWithToken()),
  )

  assert.equal(result.delivered, true)
  assert.equal(result.channel, "resend")
})

// --- A vendor cannot echo a secret into a log -------------------------------
//
// Five shapes of echo, each a real thing a provider does with a rejected
// request. A bare token matches no URL pattern; an Authorization header and a
// cookie are not URLs either; and the last case hands back the entire message.
// Because the vendor's text is never admitted, all five come out the same.

const SECRET_TOKEN = "tok_do_not_log_5f3a9c1e7b2d4a86"
const SECRET_URL = `https://workbench.example.com/auth?invitation=${SECRET_TOKEN}`
const SESSION_COOKIE = `better-auth.session_token=${SECRET_TOKEN}; Path=/; HttpOnly`
const AUTHORIZATION_HEADER = `Authorization: Bearer ${SECRET_TOKEN}`
const API_KEY = "re_live_do_not_log_9a8b7c6d"

const vendorEchoes: [name: string, message: string][] = [
  ["a full URL containing a token", `rejected request to ${SECRET_URL}`],
  ["a bare token", `invalid token: ${SECRET_TOKEN}`],
  ["an Authorization header", `request headers: {${AUTHORIZATION_HEADER}}`],
  ["a cookie", `request cookie: ${SESSION_COOKIE}`],
  [
    "the complete rejected email body",
    `rejected payload: ${JSON.stringify({
      from: "workbench@example.com",
      to: "invitee@example.com",
      subject: invitationWithToken().subject,
      html: invitationWithToken().html,
      text: invitationWithToken().text,
      headers: { authorization: `Bearer ${API_KEY}` },
    })}`,
  ],
]

for (const [name, echoed] of vendorEchoes) {
  test(`a vendor that echoes ${name} cannot get it into a log`, async () => {
    const message = invitationWithToken()

    // Both vendor paths: a structured rejection, and a thrown SDK error whose
    // message and stack carry the same echo.
    const paths: [string, EmailDeliveryProvider][] = [
      ["rejection", rejectingWith({ message: echoed, name: echoed })],
      [
        "thrown error",
        createResendEmailDelivery("workbench@example.com", async () => {
          throw Object.assign(new Error(echoed), {
            code: echoed,
            request: { headers: { authorization: `Bearer ${API_KEY}` } },
            response: { body: message.text },
          })
        }),
      ],
    ]

    for (const [pathName, provider] of paths) {
      const { logged } = await captureConsole(() => provider.send(message))

      assert.ok(logged.length > 0, `${pathName} logged nothing at all`)
      assertNoSecrets(logged.join("\n"), message, `${name} / ${pathName}`)
    }
  })
}

test("an unrecognized vendor error name is reduced to an identifier", async () => {
  // What survives is not a filtered version of the vendor's words — it is a
  // single allow-listed value, or nothing. Stated as a test so that a later
  // "keep the vendor's exact message, it is only an error name" change has to
  // argue with an assertion rather than with a comment.
  const provider = rejectingWith({
    message: `rejected: ${SECRET_URL}`,
    name: `unexpected_${SECRET_TOKEN}`,
  })

  const { logged } = await captureConsole(() => provider.send(invitationWithToken()))
  const transcript = logged.join("\n")

  assert.match(transcript, /"vendorError":"unrecognized"/)
  assert.equal(transcript.includes(SECRET_TOKEN), false)
})

test("an allow-listed vendor error name is kept, because it is diagnostic", async () => {
  // The rest of the strategy is only acceptable if a failed flow stays
  // diagnosable: the operator still learns that the vendor refused, and why.
  const provider = rejectingWith({
    message: `rejected: ${SECRET_URL}`,
    name: "invalid_from_address",
  })

  const { logged } = await captureConsole(() => provider.send(invitationWithToken()))
  const transcript = logged.join("\n")

  assert.match(transcript, /"vendorError":"invalid_from_address"/)
  assert.match(transcript, /invitee@example\.com/)
  assert.match(transcript, /bodyBytes/)
  assert.equal(transcript.includes(SECRET_URL), false)
})

// --- No adapter logs a body -------------------------------------------------

const loggingPaths: [name: string, build: () => EmailDeliveryProvider][] = [
  ["development log adapter", () => createLoggingEmailDelivery()],
  [
    "Resend rejection",
    () => rejectingWith({ message: `rejected payload: ${SECRET_URL}` }),
  ],
  [
    "Resend outage",
    () =>
      createResendEmailDelivery("workbench@example.com", async () => {
        throw new Error(`request failed: ${SECRET_URL}`)
      }),
  ],
]

for (const [name, build] of loggingPaths) {
  test(`the ${name} never logs the message body`, async () => {
    const message = invitationWithToken()
    const { logged } = await captureConsole(() => build().send(message))

    assert.ok(logged.length > 0, "nothing was logged at all")
    assertNoSecrets(logged.join("\n"), message, name)

    // The safe metadata is still there, so a failed flow is still diagnosable.
    assert.match(logged.join("\n"), /invitee@example\.com/)
    assert.match(logged.join("\n"), /bodyBytes/)
  })
}

test("every rendered template keeps its link out of the log", async () => {
  // Verification, reset, and access mail carry the same kind of single-use URL
  // as the invitation, and go through the same adapter — so the property is
  // checked against each template rather than against one of them.
  const messages = [
    renderEmail("staff_invitation", "invitee@example.com", {
      recipientName: "invitee@example.com",
      acceptUrl: SECRET_URL,
      expiresOn: "2026-08-06",
    }),
    renderEmail("email_verification", "invitee@example.com", {
      verifyUrl: SECRET_URL,
    }),
    renderEmail("password_reset", "invitee@example.com", {
      resetUrl: SECRET_URL,
    }),
    renderEmail("discovery_access_granted", "invitee@example.com", {
      portalUrl: SECRET_URL,
    }),
    renderEmail("discovery_returned", "invitee@example.com", {
      portalUrl: SECRET_URL,
    }),
  ]

  const provider = createLoggingEmailDelivery()

  for (const message of messages) {
    const { logged } = await captureConsole(() => provider.send(message))
    assertNoSecrets(logged.join("\n"), message, message.subject)
  }
})

// --- The development mailbox ------------------------------------------------

test("the development mailbox stores the message and logs only metadata", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "dev-mailbox-test-"))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const message = invitationWithToken()
  const provider = createDevMailboxEmailDelivery(createDevMailbox(directory))

  const { value: result, logged } = await captureConsole(() =>
    provider.send(message),
  )

  // Stored, not sent — and it says so, so no caller can report a delivery.
  assert.equal(result.delivered, false)
  assert.equal(result.channel, "dev_mailbox")
  assert.equal(
    result.delivered === false && result.reason,
    "stored_in_dev_mailbox",
  )

  // The link is on disk, where a developer went to look for it...
  const files = await readdir(directory)
  assert.equal(files.length, 1)
  const stored = await readFile(path.join(directory, files[0]!), "utf8")
  assert.ok(stored.includes(SECRET_TOKEN), "the mailbox stored no usable link")

  // ...and nowhere else. A mailbox that also logs the link is just log output
  // with extra steps.
  assertNoSecrets(logged.join("\n"), message, "dev mailbox")
})

test("a failing development mailbox is reported without the message", async () => {
  const message = invitationWithToken()
  const provider = createDevMailboxEmailDelivery({
    directory: "/nonexistent",
    store: async () => {
      throw Object.assign(new Error(`ENOENT writing ${message.text}`), {
        code: "ENOENT",
      })
    },
    read: async () => [],
  })

  const { value: result, logged } = await captureConsole(() =>
    provider.send(message),
  )

  assert.equal(result.delivered, false)
  assert.equal(
    result.delivered === false && result.reason,
    "provider_unavailable",
  )

  const transcript = logged.join("\n")
  assert.match(transcript, /"errorCode":"ENOENT"/)
  assertNoSecrets(transcript, message, "dev mailbox failure")
})

// --- Helpers ---------------------------------------------------------------

// A function declaration, not a const: the echo table above builds a message at
// module-evaluation time.
function invitationWithToken() {
  return renderEmail("staff_invitation", "invitee@example.com", {
    recipientName: "invitee@example.com",
    acceptUrl: SECRET_URL,
    expiresOn: "2026-08-06",
  })
}

const rejectingWith = (error: { message: string; name?: string }) =>
  createResendEmailDelivery("workbench@example.com", async () => ({
    data: null,
    error,
  }))

// Everything that must never appear, checked in one place so a new logging path
// cannot be added with a weaker list of its own.
function assertNoSecrets(
  transcript: string,
  message: { text: string; html: string },
  context: string,
) {
  for (const forbidden of [
    SECRET_TOKEN,
    SECRET_URL,
    SESSION_COOKIE,
    AUTHORIZATION_HEADER,
    API_KEY,
    "Bearer ",
    message.text,
    message.html,
  ]) {
    assert.equal(
      transcript.includes(forbidden),
      false,
      `${context} logged secret-bearing content (${forbidden.slice(0, 24)}…): ${transcript}`,
    )
  }
}

// Run an operation with the console captured, and hand back everything it
// wrote, flattened to text. Restoring in a `finally` keeps one failing
// assertion from silencing the rest of the suite's output.
const captureConsole = async <T>(operation: () => Promise<T>) => {
  const logged: string[] = []
  const originals = {
    info: console.info,
    error: console.error,
    warn: console.warn,
    log: console.log,
    debug: console.debug,
  }

  const record = (...args: unknown[]) => {
    logged.push(args.map(stringify).join(" "))
  }

  console.info = record
  console.error = record
  console.warn = record
  console.log = record
  console.debug = record

  try {
    return { value: await operation(), logged }
  } finally {
    Object.assign(console, originals)
  }
}

const stringify = (value: unknown): string => {
  if (typeof value === "string") return value
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
