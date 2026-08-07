#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

// `npm run verify:production-build` — would this repository build on Render?
//
// Phase 12's first real deploy failed on a build that passed on every developer
// machine, and it failed for reasons no local check could see:
//
//   1. Render sets `NODE_ENV=production`, which makes npm default `omit` to
//      `dev`. The build-time toolchain — `@types/express`, `@types/cors` —
//      was therefore never installed, while `typescript` happened to survive as
//      a transitive dependency of a runtime package. So `tsc` ran, and reported
//      hundreds of implicit-any errors instead of an honest "not installed".
//   2. A developer machine always has a populated `node_modules` from an
//      earlier, non-production install. The failure only exists in a tree that
//      has never been installed into.
//
// Neither `npm run typecheck` nor `npm test` can catch that, because both run
// against the tree the developer already has. This script throws the tree away
// and rebuilds it the way the platform does: only committed files, a cold
// install, `NODE_ENV=production`, and the exact commands in
// `docs/deployment.md`. If those commands stop matching this file, one of the
// two is wrong.
//
// It needs the network (for `npm ci`) and no database: nothing here starts the
// server. `server/scripts/production-smoke.mjs` is the check that does, and it
// runs against the artifact this one proves can be produced.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const log = (message) => console.log(`[verify-build] ${message}`)

// Committable files only. `--exclude-standard` applies .gitignore, so
// `node_modules`, `dist` and `.env` — exactly what the platform will not have —
// stay out; copying them would hide the class of bug this script exists to
// find. `--others` includes files that are not staged yet, because this is
// meant to be run *before* the commit that deploys, and a fix that lives only
// in an unstaged file still has to be validated.
const copyTrackedFilesInto = (destination) => {
  const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean)

  for (const relativePath of tracked) {
    const source = path.join(repoRoot, relativePath)
    // A tracked file that has been deleted but not staged. The platform would
    // still have it; skipping keeps the copy faithful to `git ls-files`.
    if (!existsSync(source)) continue
    const target = path.join(destination, relativePath)
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(source, target)
  }

  return tracked.length
}

// Every command runs with `NODE_ENV=production` — the variable that caused the
// failure — and inherits stdio so a build error reads the same here as it does
// in the platform's log.
const run = (label, command, args, cwd) => {
  log(`${label}: ${command} ${args.join(" ")}`)
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
    shell: process.platform === "win32",
  })

  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.status ?? "null"} (signal ${result.signal ?? "none"}).`,
    )
  }
}

const main = () => {
  const workspace = mkdtempSync(path.join(tmpdir(), "verify-production-build-"))
  log(`clean tree at ${workspace}`)

  try {
    const fileCount = copyTrackedFilesInto(workspace)
    log(`copied ${fileCount} committed files, no node_modules and no dist`)

    // The Render build, verbatim. Root Directory is the repository root, so the
    // install runs here and npm hoists the workspace's dependencies to
    // `node_modules/` — which is where `shared/*.ts` can resolve zod from.
    //
    // `--include=dev` is the fix for cause (1) above. It is not optional and it
    // is not a developer convenience: `tsc` and the `@types` packages are
    // build-time tools, and a build cannot run without them. They are still
    // absent from the *running* service, which only ever executes `dist/`.
    run("install", "npm", ["ci", "--include=dev"], workspace)
    run("build", "npm", ["run", "build:server"], workspace)

    // The build can succeed and still emit something unusable, so check the
    // three properties the start command actually depends on.
    const entryPoint = path.join(workspace, "server", "dist", "server", "src", "server.js")
    if (!existsSync(entryPoint)) {
      throw new Error(`build produced no entry point at server/dist/server/src/server.js`)
    }
    log("entry point emitted: server/dist/server/src/server.js")

    // `shared/` is compiled alongside `server/` (tsconfig `rootDir: ".."`), so
    // it must land in `dist/shared/`. If it does not, the server's imports of
    // `../../../shared/*.js` resolve to nothing at runtime.
    const compiledShared = path.join(workspace, "server", "dist", "shared")
    if (!existsSync(compiledShared) || readdirSync(compiledShared).length === 0) {
      throw new Error("build emitted no dist/shared — the server's shared imports would not resolve")
    }
    log(`shared contracts emitted: dist/shared (${readdirSync(compiledShared).length} files)`)

    // Exactly one zod. Two copies compile — the types are structural — but they
    // are two distinct type identities that drift apart on the first version
    // skew, and the duplicate is the symptom of `shared/` resolving its
    // dependency somewhere other than the workspace root.
    const zodCopies = [
      path.join(workspace, "node_modules", "zod"),
      path.join(workspace, "server", "node_modules", "zod"),
      path.join(workspace, "shared", "node_modules", "zod"),
    ].filter((candidate) => existsSync(candidate))
    if (zodCopies.length !== 1) {
      throw new Error(
        `expected exactly one installed zod, found ${zodCopies.length}: ${zodCopies
          .map((copy) => path.relative(workspace, copy))
          .join(", ")}`,
      )
    }
    log("exactly one zod, hoisted to the workspace root")

    // Type resolution succeeding does not prove *runtime* resolution succeeds:
    // the emitted `dist/shared/*.js` still contains a bare `import ... from
    // "zod"`, resolved from a different directory than the sources were. Load
    // one for real. A schema module touches no configuration and no database.
    run(
      "runtime resolution",
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'const m = await import("./dist/shared/access.schema.js"); if (Object.keys(m).length === 0) { throw new Error("compiled shared module exported nothing") }',
      ],
      path.join(workspace, "server"),
    )
    log("compiled shared contracts import zod successfully at runtime")

    log("PASSED — this tree builds the way Render builds it")
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(`[verify-build] FAILED: ${error.message}`)
  process.exitCode = 1
}
