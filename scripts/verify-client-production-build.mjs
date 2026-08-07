#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

// `npm run verify:client-production-build` — would this repository build on Vercel?
//
// The sibling `verify-production-build.mjs` asks the same question about the
// Render backend. This one exists because the frontend failed for the *same*
// underlying reason and the failure was invisible locally:
//
//   1. `shared/*.schema.ts` imports zod by bare specifier. Node and TypeScript
//      resolve that by walking up from `shared/` — `shared/node_modules`, then
//      the repository root, then above it. They never look sideways into
//      `client/node_modules`. So while Vercel's Root Directory was `client` and
//      `client/` carried its own lockfile, nothing was ever installed anywhere
//      `shared/` could see, and all thirteen schema modules failed with
//      `TS2307: Cannot find module 'zod'`. Every `z.infer<…>` collapsed to
//      `z.infer<any>` — i.e. `any` — which cascaded into ~215 further errors in
//      client code. Turbopack bundles regardless; `tsc` does not, so the build
//      died in the type-check step.
//   2. A developer machine has a populated `node_modules` at the repository
//      root from working on the backend, and `shared/` resolves zod out of it.
//      The failure only exists in a tree where the client was installed alone.
//
// So this script throws the tree away and rebuilds it the way Vercel does:
// committed files only, a cold install, and the exact commands in
// `docs/deployment.md` §5. If those commands stop matching this file, one of
// the two is wrong.
//
// It needs the network (for `npm ci`) and no database and no backend: a Next
// production build talks to neither.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const log = (message) => console.log(`[verify-client-build] ${message}`)

// Committable files only. `--exclude-standard` applies .gitignore, so
// `node_modules` and `.next` — exactly what the platform will not have — stay
// out; copying them would hide the class of bug this script exists to find.
// `--others` includes files that are not staged yet, because this is meant to
// be run *before* the commit that deploys.
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
    // A tracked file deleted but not staged. The platform would still have it;
    // skipping keeps the copy faithful to `git ls-files`.
    if (!existsSync(source)) continue
    const target = path.join(destination, relativePath)
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(source, target)
  }

  return tracked.length
}

const run = (label, command, args, cwd, extraEnv = {}) => {
  log(`${label}: ${command} ${args.join(" ")}`)
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production", ...extraEnv },
    shell: process.platform === "win32",
  })

  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.status ?? "null"} (signal ${result.signal ?? "none"}).`,
    )
  }
}

const main = () => {
  const workspace = mkdtempSync(path.join(tmpdir(), "verify-client-production-build-"))
  log(`clean tree at ${workspace}`)

  try {
    const fileCount = copyTrackedFilesInto(workspace)
    log(`copied ${fileCount} committed files, no node_modules and no .next`)

    // The Vercel build, verbatim. The install runs at the **repository root**
    // even though the Root Directory is `client`, because that is the only
    // place an install puts zod where `shared/` can resolve it.
    //
    // `--include=dev` for the same reason as the backend: `NODE_ENV=production`
    // makes npm default `omit` to `dev`, and `typescript`, `eslint` and the
    // `@types` packages are build-time tools. Without it the type-check step
    // has no compiler.
    run("install", "npm", ["ci", "--include=dev"], workspace)

    // Exactly one zod. Two copies compile — the types are structural — but they
    // are two distinct type identities that drift apart on the first version
    // skew, and a duplicate is the symptom of `shared/` resolving its
    // dependency somewhere other than the workspace root.
    const zodCopies = [
      path.join(workspace, "node_modules", "zod"),
      path.join(workspace, "client", "node_modules", "zod"),
      path.join(workspace, "server", "node_modules", "zod"),
      path.join(workspace, "shared", "node_modules", "zod"),
    ].filter((candidate) => existsSync(candidate))
    if (zodCopies.length !== 1 || !zodCopies[0].endsWith(path.join("node_modules", "zod"))) {
      throw new Error(
        `expected exactly one installed zod at the workspace root, found ${zodCopies.length}: ${zodCopies
          .map((copy) => path.relative(workspace, copy))
          .join(", ")}`,
      )
    }
    log(`exactly one zod, hoisted to ${path.relative(workspace, zodCopies[0])}`)

    // The check that would have caught the defect on its own, and the cheapest
    // one to read when it fails: `tsc` over the client *and* `../shared`, in a
    // tree where nothing was installed under `client/`. A `TS2307` here means
    // `shared/` cannot see zod again.
    run("typecheck", "npm", ["run", "typecheck", "-w", "client"], workspace)

    // The real build. `NEXT_PUBLIC_API_BASE_URL` is required — `next.config.ts`
    // refuses a production build without one — and is inlined into the bundle,
    // so this stands in for the value Vercel injects.
    run("build", "npm", ["run", "build:client"], workspace, {
      NEXT_PUBLIC_API_BASE_URL: "https://api.example.com",
    })

    // A build can succeed and still emit nothing deployable. This is the
    // directory Vercel collects as the Output Directory.
    const routesManifest = path.join(workspace, "client", ".next", "routes-manifest.json")
    if (!existsSync(routesManifest)) {
      throw new Error("build produced no client/.next/routes-manifest.json — nothing for Vercel to deploy")
    }
    log("build output emitted: client/.next")

    log("PASSED — this tree builds the way Vercel builds it")
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(`[verify-client-build] FAILED: ${error.message}`)
  process.exitCode = 1
}
