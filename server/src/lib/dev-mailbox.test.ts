import assert from "node:assert/strict"
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import { DEV_MAILBOX_RETAINED_MESSAGES, createDevMailbox } from "./dev-mailbox.js"

import type { EmailMessage } from "../domain/access/ports.js"

// The development mailbox is the safe answer to "how does a developer follow a
// verification link without a mail vendor" — the unsafe answers being a token in
// a log line and a hand-written query against the authentication provider's own
// tables. It is only the safe answer while the fences below hold, so they are
// tested rather than described.

const mailboxDirectory = async (t: { after: (fn: () => unknown) => void }) => {
  const directory = await mkdtemp(path.join(tmpdir(), "dev-mailbox-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

const messageFor = (recipient: string, token: string): EmailMessage => ({
  to: recipient,
  subject: "Einladung zur AI Consulting Workbench",
  text: `https://workbench.example.com/auth?invitation=${token}`,
  html: `<p>https://workbench.example.com/auth?invitation=${token}</p>`,
})

test("a stored message can be read back whole", async (t) => {
  const directory = await mailboxDirectory(t)
  const mailbox = createDevMailbox(directory)

  const stored = await mailbox.store(messageFor("client@example.com", "tok_1"))
  const [read] = await mailbox.read()

  assert.ok(read, "the mailbox read nothing back")
  assert.equal(read.id, stored.id)
  assert.equal(read.to, "client@example.com")
  // The whole point: the link survives, so the flow is walkable.
  assert.match(read.text, /invitation=tok_1/)
})

test("the newest message is read first", async (t) => {
  const directory = await mailboxDirectory(t)
  const mailbox = createDevMailbox(directory)

  for (const token of ["tok_1", "tok_2", "tok_3"]) {
    await mailbox.store(messageFor("client@example.com", token))
  }

  const read = await mailbox.read()

  assert.deepEqual(
    read.map((message) => message.text.split("=")[1]),
    ["tok_3", "tok_2", "tok_1"],
  )
})

test("retention is bounded, so a long session cannot accumulate live links", async (t) => {
  const directory = await mailboxDirectory(t)
  const retain = 3
  const mailbox = createDevMailbox(directory, retain)

  for (let index = 0; index < retain + 5; index += 1) {
    await mailbox.store(messageFor("client@example.com", `tok_${index}`))
  }

  // The bound holds on disk, not only in what `read` returns — an unbounded
  // directory of single-use links is the thing being prevented.
  assert.equal((await readdir(directory)).length, retain)

  const read = await mailbox.read()
  assert.equal(read.length, retain)
  assert.deepEqual(
    read.map((message) => message.text.split("=")[1]),
    ["tok_7", "tok_6", "tok_5"],
  )
})

test("the default retention is bounded too", () => {
  assert.ok(
    DEV_MAILBOX_RETAINED_MESSAGES > 0 && DEV_MAILBOX_RETAINED_MESSAGES <= 200,
    "the default retention is not a bound",
  )
})

test("stored messages are readable only by the developer who ran the server", async (t) => {
  const directory = await mailboxDirectory(t)
  const mailbox = createDevMailbox(directory)

  await mailbox.store(messageFor("client@example.com", "tok_1"))

  const [name] = await readdir(directory)
  const mode = (await stat(path.join(directory, name!))).mode & 0o777

  // A shared machine is the normal case for a mailbox holding other people's
  // verification links.
  assert.equal(mode, 0o600, `stored message is mode ${mode.toString(8)}`)
})

test("reading tolerates a file that is not a stored message", async (t) => {
  const directory = await mailboxDirectory(t)
  const mailbox = createDevMailbox(directory)

  await mailbox.store(messageFor("client@example.com", "tok_1"))
  await writeFile(path.join(directory, "9999-half-written.json"), "{ not json")
  await writeFile(path.join(directory, "notes.txt"), "ignored")

  // A developer convenience, not a store of record: a broken file is skipped
  // rather than turned into a crash in the middle of a local flow.
  const read = await mailbox.read()

  assert.equal(read.length, 1)
  assert.equal(read[0]!.to, "client@example.com")
})

test("an absent mailbox reads as empty rather than failing", async () => {
  const mailbox = createDevMailbox(
    path.join(tmpdir(), "dev-mailbox-never-created"),
  )

  assert.deepEqual(await mailbox.read(), [])
})

test("the mailbox holds one process's own traffic and offers no lookup", async (t) => {
  const directory = await mailboxDirectory(t)
  const mailbox = createDevMailbox(directory)

  await mailbox.store(messageFor("client@example.com", "tok_client"))
  await mailbox.store(messageFor("manager@example.com", "tok_manager"))

  // There is no `findByRecipient`, no workspace filter, and no endpoint: the
  // mailbox is a local file surface a developer opens deliberately, not a
  // service one user could query for another's mail. This asserts the shape of
  // the port, so adding a lookup becomes a deliberate change.
  assert.deepEqual(Object.keys(mailbox).sort(), ["directory", "read", "store"])
})
