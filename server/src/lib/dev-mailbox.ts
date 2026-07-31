import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

import type { EmailMessage } from "../domain/access/ports.js"

// The local-development mailbox.
//
// Verification, password-reset, and invitation flows are only walkable end to
// end if the link actually arrives somewhere. Without a mail vendor there are
// three places it could go, and two of them are wrong: a log line is aggregated,
// shipped, retained, and read by people who are not the recipient, and a
// database row makes a developer hand-query the authentication provider's own
// storage to do ordinary work. The third is this: a file on the developer's own
// machine, written only when they asked for it, holding only their own local
// traffic.
//
// It is infrastructure for development, and it is fenced as such:
//
//  - **Explicitly enabled.** It exists only when `EMAIL_DEV_MAILBOX` is set. No
//    deployment acquires it by omitting configuration.
//  - **Never in production.** Asking for it with `NODE_ENV=production` is a
//    startup refusal, not a downgrade to logging (see `email-delivery.ts`).
//  - **Nothing reaches a log.** Storing a message writes no console line that a
//    log shipper could pick up; the message is read back only when a developer
//    runs `npm run mail:dev`.
//  - **Bounded.** Only the most recent messages are kept, so a long-running dev
//    session cannot accumulate an archive of live links.
//  - **Not served, and not committed.** There is no endpoint that returns these
//    messages — so there is no surface on which one workspace's or one user's
//    mail could reach another — and the directory is git-ignored.

export const DEV_MAILBOX_RETAINED_MESSAGES = 50

export type StoredMessage = {
  id: string
  storedAt: string
  to: string
  subject: string
  text: string
  html: string
}

export type DevMailbox = {
  directory: string
  store: (message: EmailMessage) => Promise<StoredMessage>
  read: (limit?: number) => Promise<StoredMessage[]>
}

export const createDevMailbox = (
  directory: string,
  retain: number = DEV_MAILBOX_RETAINED_MESSAGES,
): DevMailbox => ({
  directory,

  store: async (message) => {
    const stored: StoredMessage = {
      id: randomUUID(),
      storedAt: new Date().toISOString(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }

    await mkdir(directory, { recursive: true })

    // Sortable by name, so retention and reading both work from the file list
    // alone rather than from the contents.
    await writeFile(
      path.join(directory, fileNameFor(stored)),
      JSON.stringify(stored, null, 2),
      // Readable by this developer and nobody else on a shared machine.
      { mode: 0o600 },
    )

    await pruneTo(directory, retain)

    return stored
  },

  read: async (limit = retain) => {
    const names = await messageFiles(directory)
    const newestFirst = names.slice(-limit).reverse()

    const messages = await Promise.all(
      newestFirst.map(async (name) => {
        try {
          return JSON.parse(
            await readFile(path.join(directory, name), "utf8"),
          ) as StoredMessage
        } catch {
          // A half-written or hand-edited file is skipped rather than fatal:
          // this is a developer convenience, not a store of record.
          return null
        }
      }),
    )

    return messages.filter((message): message is StoredMessage => message !== null)
  },
})

// Two messages raised in the same millisecond — an invitation and its
// notification, say — would otherwise sort by a random identifier, which would
// make both the reading order and *which* message retention prunes arbitrary.
// A per-process counter breaks the tie in the order the messages were actually
// written.
let sequence = 0

const fileNameFor = (stored: StoredMessage) => {
  sequence += 1
  const tieBreaker = String(sequence).padStart(6, "0")

  return `${stored.storedAt.replace(/[:.]/g, "-")}-${tieBreaker}-${stored.id}.json`
}

const messageFiles = async (directory: string) => {
  try {
    const entries = await readdir(directory)
    return entries.filter((name) => name.endsWith(".json")).sort()
  } catch {
    return []
  }
}

// Retention is applied on every write, so the bound holds even if a session is
// never restarted.
const pruneTo = async (directory: string, retain: number) => {
  const names = await messageFiles(directory)
  const excess = names.slice(0, Math.max(0, names.length - retain))

  await Promise.all(
    excess.map((name) =>
      rm(path.join(directory, name), { force: true }).catch(() => undefined),
    ),
  )
}
