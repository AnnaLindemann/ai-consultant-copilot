import "dotenv/config"

import { createDevMailbox } from "../lib/dev-mailbox.js"
import {
  DEFAULT_DEV_MAILBOX_DIRECTORY,
  readEmailDeliveryConfig,
} from "../lib/email-delivery.js"

// `npm run mail:dev` — read the local development mailbox.
//
// This is the deliberate act the mailbox exists for: a developer walking the
// verification, password-reset, invitation, or Discovery-Access flow opens the
// message here instead of hunting for a token in a log line or querying the
// authentication provider's tables by hand.
//
// It prints message bodies, which is the point — and exactly why it is a
// command someone runs rather than something the server writes anywhere. It
// reads a directory on this machine; it talks to no database and no vendor.

const config = readEmailDeliveryConfig()

if (config.isProduction) {
  // The mailbox never exists in production (`email-delivery.ts` refuses to
  // start with it), so a reader pointed at a production process is either a
  // mistake or an attempt to read real recipients' links off a server's disk.
  console.error(
    "Refusing to read the development mailbox with NODE_ENV=production.",
  )
  process.exit(1)
}

const directory = config.devMailboxDirectory
const limit = Number.parseInt(process.argv[2] ?? "", 10)

const messages = await createDevMailbox(directory).read(
  Number.isFinite(limit) && limit > 0 ? limit : undefined,
)

if (messages.length === 0) {
  console.log(`No messages in ${directory}.`)
  console.log(
    config.useDevMailbox
      ? "Walk a flow that sends mail — the message will appear here."
      : "The development mailbox is off. Set EMAIL_DEV_MAILBOX=1 in server/.env and restart the API.",
  )

  if (directory === DEFAULT_DEV_MAILBOX_DIRECTORY) {
    console.log("(Set EMAIL_DEV_MAILBOX_DIR to read a different directory.)")
  }

  process.exit(0)
}

console.log(`${messages.length} message(s) in ${directory}, newest first.\n`)

for (const message of messages) {
  console.log("─".repeat(72))
  console.log(`  ${message.storedAt}  →  ${message.to}`)
  console.log(`  ${message.subject}`)
  console.log("─".repeat(72))
  console.log(message.text)
  console.log()
}
