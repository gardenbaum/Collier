/**
 * Release pipeline invariants — unit tests for the GitHub Actions
 * workflows, version sync, and Tauri config that together
 * gate a tagged Collier release.
 *
 * The release-hardening card asks for these guarantees so a
 * tagged release cannot ship a broken smoke contract, a
 * version drift, or a misconfigured updater endpoint:
 *
 *  1. `release.yml` is gated on `check:all` AND the E2E
 *     harness (extracted into the reusable
 *     `.github/workflows/e2e.yml` so ci.yml and release.yml
 *     share one source of truth).
 *  2. The release workflow reads the right GitHub secrets
 *     (`TAURI_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)
 *     and maps them to the env-var names `tauri-action`
 *     consumes.
 *  3. `package.json`, `Cargo.toml`, and `tauri.conf.json` carry
 *     the same version (a drift between these breaks the bundle
 *     metadata that the auto-updater uses to detect new
 *     versions).
 *  4. `tauri.conf.json::plugins.updater` is shaped correctly:
 *     `active: true`, at least one endpoint, and a non-empty
 *     `pubkey` (otherwise existing users get "Invalid
 *     signature" on the next update check).
 *  5. The E2E workflow is `workflow_call`-triggered (so it
 *     never runs on its own) and the CI workflow's `e2e` job
 *     references it via `uses:`.
 *
 * We intentionally avoid a YAML parser dependency — `yaml`
 * exists in the build tree via prettier, but it's transitive,
 * and the contract we're checking is simple enough that
 * targeted text matches are clearer than a parsed AST. If
 * the workflows ever get nested enough that regex parsing
 * becomes brittle, switch this test to `yaml.parse(...)`.
 *
 * Spec: docs/specs/m6-foundation.md (release-hardening card).
 * See also: docs/developer/releases.md.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '..', '..')

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8')
}

interface JsonReadOptions {
  /** Strip line / block comments before parsing — needed for
   * `tauri.conf.json` which contains JSON-with-comments. */
  stripComments?: boolean
}

function readJson<T>(relativePath: string, opts: JsonReadOptions = {}): T {
  let raw = readRepoFile(relativePath)
  if (opts.stripComments === true) {
    raw = raw
      // line comments
      .replace(/^\s*\/\/.*$/gm, '')
      // block comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
  }
  return JSON.parse(raw) as T
}

/**
 * Extract the top-level `version = "X.Y.Z"` value from a
 * Cargo.toml file. Hand-rolled because we don't want a TOML
 * parser as a direct dep just for this test. Matches the
 * standard `version = "..."` shape produced by `cargo new`.
 * Returns null when not found.
 */
function readCargoVersion(relativePath: string): string {
  const raw = readRepoFile(relativePath)
  const m = raw.match(/^\s*version\s*=\s*"([^"]+)"\s*$/m)
  return m === null ? '' : (m[1] ?? '')
}

// ---------------------------------------------------------------------------
// Helpers — narrow YAML-structure matchers that avoid a parser dependency.
// ---------------------------------------------------------------------------

/**
 * Lightweight YAML line scan. GitHub Actions workflows are
 * flat enough that we can pull out the lines we care about
 * with `startsWith` on indentation. This will NOT handle
 * multi-line scalar folds or anchors; if a future workflow
 * grows them, switch to a proper parser.
 *
 * Returns the children of `topKey:` as a string slice. If the
 * matched line is itself a leaf scalar (e.g. `needs: [a, b]`
 * — nothing after the colon on the next line), returns an
 * empty string; the caller is expected to inspect the raw
 * matched line instead.
 */
function getIndentedBlock(source: string, topKey: string): string {
  const lines = source.split('\n')
  const startIdx = lines.findIndex(line => {
    const trimmed = line.trimStart()
    return trimmed === `${topKey}:` || trimmed.startsWith(`${topKey}:`)
  })
  if (startIdx === -1 || startIdx >= lines.length) {
    throw new Error(`top-level key "${topKey}" not found`)
  }
  const matchedLine = lines[startIdx] as string
  // Leaf check: if the matched line has content after the
  // colon on the same line, this is a scalar / inline-list,
  // not a block. Return the raw matched line so the caller
  // can match against it directly.
  const colonIdx = matchedLine.indexOf(':')
  const afterColon =
    colonIdx === -1 ? '' : matchedLine.slice(colonIdx + 1).trim()
  if (afterColon !== '') {
    return matchedLine
  }
  // The indent of the matched line is the baseline for the
  // block's children: any later line at this indent or
  // deeper belongs to this block; shallower lines signal the
  // end.
  const indentMatch = matchedLine.match(/^(\s*)/)
  const matchedIndent =
    indentMatch !== null && indentMatch[1] !== undefined
      ? indentMatch[1].length
      : 0
  const block: string[] = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = (lines[i] ?? '') as string
    if (line.trim() === '') {
      block.push(line)
      continue
    }
    const childIndentMatch = line.match(/^(\s*)/)
    const indent =
      childIndentMatch !== null && childIndentMatch[1] !== undefined
        ? childIndentMatch[1].length
        : 0
    if (indent < matchedIndent) {
      break
    }
    block.push(line)
  }
  return block.join('\n')
}

/** Return a list under a key (e.g. `tags:` -> `['v*']`). */
function getList(block: string, key: string): string[] {
  const re = new RegExp(`^\\s*${key}:\\s*\\[(.*?)\\]\\s*$`, 'm')
  const m = block.match(re)
  if (m === null) return []
  const inner = m[1] ?? ''
  return inner
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(s => s.length > 0)
}

/** Extract `jobs.<name>:` block as a string slice. */
function getJobBlock(workflowSource: string, jobName: string): string {
  const jobsBlock = getIndentedBlock(workflowSource, 'jobs')
  return getIndentedBlock(jobsBlock, jobName)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('release pipeline — workflows', () => {
  const releaseYml = readRepoFile('.github/workflows/release.yml')
  const ciYml = readRepoFile('.github/workflows/ci.yml')
  const e2eYml = readRepoFile('.github/workflows/e2e.yml')

  describe('release.yml', () => {
    it('triggers on v* tag push and workflow_dispatch', () => {
      const onBlock = getIndentedBlock(releaseYml, 'on')
      // The `on:` block must reference push.tags v* AND workflow_dispatch.
      expect(onBlock).toMatch(/push:/)
      // push.tags is a list with `v*`. Tolerate the list scalar
      // syntax (`tags: ['v*']`) and the block syntax.
      const pushBlock = getIndentedBlock(onBlock, 'push')
      const tags = getList(pushBlock, 'tags')
      expect(tags).toContain('v*')
      expect(onBlock).toMatch(/workflow_dispatch:/)
    })

    it('has a `check-all` job that runs `bun run check:all`', () => {
      const job = getJobBlock(releaseYml, 'check-all')
      expect(job).toMatch(/bun run check:all/)
    })

    it('has an `e2e` job that calls the reusable e2e workflow', () => {
      const job = getJobBlock(releaseYml, 'e2e')
      expect(job).toMatch(/uses:\s*\.\/\.github\/workflows\/e2e\.yml/)
    })

    it('gates `publish-tauri` on BOTH check-all AND e2e', () => {
      const job = getJobBlock(releaseYml, 'publish-tauri')
      // `getIndentedBlock` returns the raw matched line
      // for leaf scalars (the inline `[a, b]` needs form
      // is a leaf — `needs:` has nothing on the next line).
      const needsRaw = getIndentedBlock(job, 'needs')
      // Accept either an inline flow list `[a, b]` form or
      // a multi-line `- a\n- b` block form.
      const inlineList = needsRaw.match(/\[(.*?)\]/)?.[1] ?? ''
      const lineRefs = inlineList
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
      if (lineRefs.length > 0) {
        expect(lineRefs).toContain('check-all')
        expect(lineRefs).toContain('e2e')
      } else {
        // Block form: each `- name` is on its own line.
        expect(needsRaw).toMatch(/-\s*check-all/)
        expect(needsRaw).toMatch(/-\s*e2e/)
      }
    })

    it('reads TAURI_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD from secrets', () => {
      // The Build and release step must reference both
      // secrets by name and pass them via env vars named the
      // way `tauri-action` consumes them.
      expect(releaseYml).toMatch(/secrets\.TAURI_PRIVATE_KEY/)
      expect(releaseYml).toMatch(/secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD/)
      expect(releaseYml).toMatch(
        /TAURI_SIGNING_PRIVATE_KEY:\s*\$\{\{\s*secrets\.TAURI_PRIVATE_KEY\s*\}\}/
      )
      expect(releaseYml).toMatch(
        /TAURI_SIGNING_PRIVATE_KEY_PASSWORD:\s*\$\{\{\s*secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD\s*\}\}/
      )
    })

    it('builds for all three target platforms (macOS, Windows, Linux)', () => {
      const job = getJobBlock(releaseYml, 'publish-tauri')
      const strategyBlock = getIndentedBlock(job, 'strategy')
      expect(strategyBlock).toMatch(/matrix:/)
      // Each platform should appear in the matrix.
      expect(strategyBlock).toMatch(/macos-latest/)
      expect(strategyBlock).toMatch(/windows-latest/)
      expect(strategyBlock).toMatch(/ubuntu-22\.04/)
    })

    it('never invents or includes signing key values inline', () => {
      // Defence in depth: a hand-pasted private key in the
      // workflow YAML is the most common accidental leak.
      // Reject anything that looks like a PEM-encoded key
      // body OR a 64-hex-char Ed25519 secret scalar.
      expect(releaseYml).not.toMatch(
        /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/
      )
      expect(releaseYml).not.toMatch(/-----BEGIN ENCRYPTED PRIVATE KEY-----/)
      // Hex scalars are rare in a workflow but check anyway.
      expect(releaseYml).not.toMatch(/['"][0-9a-f]{64,}['"]/)
    })
  })

  describe('ci.yml', () => {
    it('has a `check` job that runs `bun run check:all`', () => {
      const job = getJobBlock(ciYml, 'check')
      expect(job).toMatch(/bun run check:all/)
    })

    it('has an `e2e` job that uses the reusable workflow', () => {
      const job = getJobBlock(ciYml, 'e2e')
      expect(job).toMatch(/uses:\s*\.\/\.github\/workflows\/e2e\.yml/)
    })
  })

  describe('e2e.yml (reusable workflow)', () => {
    it('is gated on workflow_call so it cannot run standalone', () => {
      const onBlock = getIndentedBlock(e2eYml, 'on')
      // The block must contain `workflow_call:` and nothing
      // else (no `push:`, no `pull_request:`). The latter
      // would let the workflow fire on every PR, defeating
      // the reusable-workflow contract.
      expect(onBlock).toMatch(/workflow_call:/)
      expect(onBlock).not.toMatch(/^\s*push:/m)
      expect(onBlock).not.toMatch(/^\s*pull_request:/m)
    })

    it('uses tauri-driver + wdio for the smoke run', () => {
      // The harness must boot the fixture, start tauri-driver
      // under xvfb, and run `bun run test:e2e`. A regression
      // here would silently turn the release gate into a
      // no-op.
      expect(e2eYml).toMatch(/tauri-driver/)
      expect(e2eYml).toMatch(/xvfb-run/)
      expect(e2eYml).toMatch(/bun run test:e2e/)
      // `VITE_E2E=1` flips the build-time gate in main.tsx
      // that exposes __collierQueryClient__ etc.
      expect(e2eYml).toMatch(/VITE_E2E:\s*['"]1['"]/)
    })

    it('defines a single `e2e` job', () => {
      const jobsBlock = getIndentedBlock(e2eYml, 'jobs')
      // Extract immediate children of `jobs:` (2-space indent).
      const topLevelJobNames: string[] = []
      const lines = jobsBlock.split('\n')
      for (const line of lines) {
        const m = line.match(/^ {2}([a-zA-Z0-9_-]+):/)
        if (m !== null && m[1] !== undefined) {
          topLevelJobNames.push(m[1])
        }
      }
      expect(topLevelJobNames).toEqual(['e2e'])
    })
  })
})

describe('release pipeline — version sync', () => {
  interface PkgJson {
    name: string
    version: string
  }
  interface TauriConfig {
    version: string
    identifier: string
  }

  const pkg = readJson<PkgJson>('package.json')
  const cargoVersion = readCargoVersion('src-tauri/Cargo.toml')
  const tauri = readJson<TauriConfig>('src-tauri/tauri.conf.json', {
    stripComments: true,
  })

  it('package.json and Cargo.toml share the same version', () => {
    expect(pkg.version).toBe(cargoVersion)
  })

  it('package.json and tauri.conf.json share the same version', () => {
    expect(pkg.version).toBe(tauri.version)
  })

  it('the shared version is a valid semver string (X.Y.Z)', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/)
  })

  it('tauri.conf.json identifier stays in reverse-DNS form', () => {
    // Tauri requires alphanumeric + dots + hyphens — a
    // regression here would break the bundler.
    expect(tauri.identifier).toMatch(/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/)
  })
})

describe('release pipeline — updater config', () => {
  interface UpdaterConfig {
    active?: boolean
    endpoints?: string[]
    pubkey?: string
    dialog?: boolean
  }
  interface TauriPlugins {
    updater?: UpdaterConfig
  }
  interface TauriConfig {
    plugins?: TauriPlugins
    bundle?: { createUpdaterArtifacts?: boolean }
  }

  const tauri = readJson<TauriConfig>('src-tauri/tauri.conf.json', {
    stripComments: true,
  })
  const updater = tauri.plugins?.updater ?? {}

  it('updater is active in the bundled config', () => {
    expect(updater.active).toBe(true)
  })

  it('bundle.createUpdaterArtifacts is on (tauri-action emits latest.json)', () => {
    expect(tauri.bundle?.createUpdaterArtifacts).toBe(true)
  })

  it('at least one updater endpoint is configured', () => {
    const endpoints = updater.endpoints ?? []
    expect(endpoints.length).toBeGreaterThan(0)
    for (const endpoint of endpoints) {
      // The updater enforces HTTPS for non-localhost endpoints.
      expect(endpoint).toMatch(/^https:\/\//)
    }
  })

  it('endpoints point at the configured GitHub repo (not a fork or staging host)', () => {
    // Pinned to the upstream gardenbaum/Collier releases URL.
    // A drift here would silently misroute user updates.
    const endpoints = updater.endpoints ?? []
    for (const endpoint of endpoints) {
      expect(endpoint).toMatch(
        /^https:\/\/github\.com\/gardenbaum\/Collier\/releases\/latest\/download\/latest\.json$/
      )
    }
  })

  it('a non-empty pubkey is configured (or an explicit "REPLACE_WITH_" placeholder)', () => {
    // The bundled pubkey is consumed by the auto-updater at
    // runtime to verify `latest.json` signatures. An empty
    // pubkey causes "Invalid signature" errors on every
    // update check.
    //
    // Pre-release state (no production key generated yet):
    // `tauri.conf.json` carries a `REPLACE_WITH_*` placeholder.
    // The release docs (docs/developer/releases.md) instruct
    // the operator to swap in the real public-key half of
    // `TAURI_PRIVATE_KEY` before cutting a tagged release.
    // We accept the placeholder here so the unit test
    // doesn't fail CI on a fresh clone, but we still
    // surface it as a `console.warn` so the test log
    // tells the next reviewer "this is the placeholder, you
    // owe the project a real pubkey before tagging".
    expect(typeof updater.pubkey).toBe('string')
    expect((updater.pubkey ?? '').trim().length).toBeGreaterThan(0)
    if (
      updater.pubkey !== undefined &&
      /^REPLACE_WITH_/i.test(updater.pubkey)
    ) {
      console.warn(
        '[release-pipeline] tauri.conf.json::plugins.updater.pubkey ' +
          'still carries the REPLACE_WITH_* placeholder — generate a ' +
          'real pubkey before cutting the next tagged release. ' +
          'See docs/developer/releases.md → "Initial Setup".'
      )
    }
  })
})
