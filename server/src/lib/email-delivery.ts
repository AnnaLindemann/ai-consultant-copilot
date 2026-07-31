import path from "node:path"
import { fileURLToPath } from "node:url"

import { Resend } from "resend"

import { createDevMailbox, type DevMailbox } from "./dev-mailbox.js"
import { failureIdentity } from "./failure-identity.js"

import type {
  EmailChannel,
  EmailDeliveryProvider,
  EmailDeliveryResult,
  EmailMessage,
} from "../domain/access/ports.js"

// The `EmailDeliveryProvider` adapter (architecture.md §7A.1). Resend is the
// initial implementation; two non-sending adapters exist for development and
// tests so nobody needs a mail vendor to run the application locally.
//
// Production is *not* allowed to fall back to either of them: an invitation or
// a reset link that only ever reached a log line or a local file is a silently
// broken flow, so a production process without Resend configuration refuses to
// start.
//
// Three rules hold for every adapter:
//
//  - **The body is never logged.** Every message this port carries — email
//    verification, password reset, staff invitation, discovery access — has its
//    whole point in a single-use link. A log line is the wrong place for one:
//    logs are aggregated, shipped, retained, and read by people who are not the
//    recipient, so a token in a log is a token disclosed.
//  - **Nothing the vendor says is logged either.** A delivery failure is
//    reported as a stable identifier of our own plus vendor metadata drawn from
//    a fixed allow-list. The vendor's prose never reaches a log line, so there
//    is no channel through which an echoed request — with its link, its
//    Authorization header, or its cookie — could arrive in one. See
//    `vendorFailure` below.
//  - **Only a real send reports delivery.** The non-sending adapters return
//    `delivered: false` with a reason that names what actually happened, so no
//    caller, log line, or API response can claim mail was sent when it never
//    left the process. The `EmailDeliveryResult` type enforces this:
//    `delivered: true` exists only on the `resend` channel.

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

export const DEFAULT_DEV_MAILBOX_DIRECTORY = path.join(
  serverRoot,
  "tmp",
  "dev-mailbox",
)

export type EmailDeliveryConfig = {
  resendApiKey: string | undefined
  fromAddress: string | undefined
  isProduction: boolean
  // Capture mail locally instead of sending it (see `dev-mailbox.ts`). Opt-in,
  // and refused outright in production.
  useDevMailbox: boolean
  devMailboxDirectory: string
}

export const readEmailDeliveryConfig = (
  env: Record<string, string | undefined> = process.env,
): EmailDeliveryConfig => ({
  resendApiKey: nonEmpty(env.RESEND_API_KEY),
  fromAddress: nonEmpty(env.EMAIL_FROM),
  isProduction: env.NODE_ENV === "production",
  useDevMailbox: isEnabled(env.EMAIL_DEV_MAILBOX),
  devMailboxDirectory:
    nonEmpty(env.EMAIL_DEV_MAILBOX_DIR) ?? DEFAULT_DEV_MAILBOX_DIRECTORY,
})

// Choose the adapter the configuration calls for. Exported so the choice is
// testable without a live vendor.
export const createEmailDeliveryProvider = (
  config: EmailDeliveryConfig,
): EmailDeliveryProvider => {
  // Asked for in production, this is a misconfiguration with a security shape:
  // real recipients' verification and reset links would be written to the
  // server's disk and never delivered. It fails at startup rather than
  // degrading into something that looks like it works.
  if (config.useDevMailbox && config.isProduction) {
    throw new Error(
      "EMAIL_DEV_MAILBOX is set with NODE_ENV=production. The development mailbox stores messages " +
        "on disk instead of delivering them and is never available in production.",
    )
  }

  // Explicit beats implicit: a developer who asked for the mailbox gets the
  // mailbox, even on a machine that also carries Resend credentials.
  if (config.useDevMailbox) {
    return createDevMailboxEmailDelivery(
      createDevMailbox(config.devMailboxDirectory),
    )
  }

  if (config.resendApiKey && config.fromAddress) {
    const resend = new Resend(config.resendApiKey)

    return createResendEmailDelivery(config.fromAddress, (payload) =>
      resend.emails.send(payload),
    )
  }

  if (config.isProduction) {
    throw new Error(
      "Email delivery is not configured: RESEND_API_KEY and EMAIL_FROM are required in production. " +
        "Verification, password-reset, and invitation mail would otherwise never reach anyone.",
    )
  }

  return createLoggingEmailDelivery()
}

// What this adapter needs from the vendor SDK, and nothing more. Stated as a
// function type so the failure paths below can be tested without a network
// call or an API key — the paths that must be proven not to log a body are
// exactly the ones a live vendor would never reproduce on demand.
export type ResendSend = (payload: {
  from: string
  to: string
  subject: string
  html: string
  text: string
}) => Promise<{
  data: { id: string } | null
  error: { message: string; name?: string } | null
}>

// Resend — the real delivery path.
export const createResendEmailDelivery = (
  fromAddress: string,
  send: ResendSend,
): EmailDeliveryProvider => ({
  channel: "resend",
  send: async (message: EmailMessage): Promise<EmailDeliveryResult> => {
    try {
      const { data, error } = await send({
        from: fromAddress,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })

      if (error) {
        console.error("EMAIL_SEND_REJECTED", {
          ...safeMetadata("resend", message),
          ...vendorFailure(error.name),
        })

        return {
          delivered: false,
          channel: "resend",
          reason: "provider_rejected",
        }
      }

      return { delivered: true, channel: "resend", id: data?.id ?? null }
    } catch (error) {
      // The error object never appears here — not its message, not its stack,
      // not its attached request. Only its class and machine code survive, and
      // only if they have the shape of identifiers (`failure-identity.ts`).
      console.error("EMAIL_SEND_FAILED", {
        ...safeMetadata("resend", message),
        ...failureIdentity(error),
      })

      return {
        delivered: false,
        channel: "resend",
        reason: "provider_unavailable",
      }
    }
  },
})

// Development and test, with no local mailbox configured. Nothing is sent and
// nothing is claimed: the line below records that a message was raised, for
// whom, and of what size — enough to see that a flow reached the mail step, and
// not enough to follow the link it carried. A developer who needs the link runs
// with `EMAIL_DEV_MAILBOX=1` and reads it with `npm run mail:dev`.
export const createLoggingEmailDelivery = (): EmailDeliveryProvider => ({
  channel: "log",
  send: async (message: EmailMessage): Promise<EmailDeliveryResult> => {
    console.info("EMAIL_NOT_SENT_LOGGED_LOCALLY", safeMetadata("log", message))

    return { delivered: false, channel: "log", reason: "logged_not_sent" }
  },
})

// Development, with the local mailbox. The message is written to the
// developer's own machine and the console line stays metadata-only, exactly as
// on every other channel — the mailbox is a place to read a link deliberately,
// not a way to get one into the logs.
export const createDevMailboxEmailDelivery = (
  mailbox: DevMailbox,
): EmailDeliveryProvider => ({
  channel: "dev_mailbox",
  send: async (message: EmailMessage): Promise<EmailDeliveryResult> => {
    try {
      await mailbox.store(message)
    } catch (error) {
      console.error("EMAIL_DEV_MAILBOX_WRITE_FAILED", {
        ...safeMetadata("dev_mailbox", message),
        ...failureIdentity(error),
      })

      return {
        delivered: false,
        channel: "dev_mailbox",
        reason: "provider_unavailable",
      }
    }

    console.info(
      "EMAIL_NOT_SENT_STORED_IN_DEV_MAILBOX",
      safeMetadata("dev_mailbox", message),
    )

    return {
      delivered: false,
      channel: "dev_mailbox",
      reason: "stored_in_dev_mailbox",
    }
  },
})

// The only shape of an email that is allowed into a log. Subjects come from the
// server-side catalogue and are fixed strings; the recipient is the operational
// fact a delivery question is asked about. The body — and therefore every
// token, verification value, reset value, and link — is reduced to its length.
const safeMetadata = (channel: EmailChannel, message: EmailMessage) => ({
  channel,
  to: message.to,
  subject: message.subject,
  bodyBytes: message.text.length,
})

// What a vendor is allowed to contribute to a log line.
//
// A rejection's most useful fact is *why* the vendor refused, and the vendor's
// prose is the one string in this file we do not control. Several vendors quote
// the rejected request back — which would put the whole message, link included,
// into the log through the one field that was allowed in — and no amount of
// pattern-matching over arbitrary text can be relied on to catch every shape a
// secret can take: a bare token matches nothing, and a redactor that misses one
// discloses it.
//
// So the vendor's text is not filtered, it is not admitted at all. What is
// admitted is a single value matched against the fixed set of error names
// Resend documents. Anything outside the set — including any message text, and
// including a name a future API version invents — becomes `unrecognized`, and
// the operator still learns from `EMAIL_SEND_REJECTED` and the recipient that a
// message was refused.
const RESEND_ERROR_NAMES: ReadonlySet<string> = new Set([
  "application_error",
  "concurrent_idempotent_requests",
  "daily_quota_exceeded",
  "internal_server_error",
  "invalid_access",
  "invalid_attachment",
  "invalid_from_address",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
  "invalid_parameter",
  "invalid_region",
  "invalid_scope",
  "missing_api_key",
  "missing_required_field",
  "not_found",
  "rate_limit_exceeded",
  "restricted_api_key",
  "security_error",
  "testing_restriction",
  "validation_error",
])

const vendorFailure = (name: string | undefined) => ({
  vendorError: name && RESEND_ERROR_NAMES.has(name) ? name : "unrecognized",
})

const nonEmpty = (value: string | undefined): string | undefined =>
  value && value.trim() !== "" ? value.trim() : undefined

const isEnabled = (value: string | undefined): boolean => {
  const flag = value?.trim().toLowerCase()
  return flag === "1" || flag === "true" || flag === "yes"
}

// The process-wide provider. Constructed once, at import time, so a
// misconfigured production deployment fails at startup rather than at the first
// invitation.
export const emailDelivery: EmailDeliveryProvider = createEmailDeliveryProvider(
  readEmailDeliveryConfig(),
)
