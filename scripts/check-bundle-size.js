#!/usr/bin/env node
/**
 * scripts/check-bundle-size.js — bundle-size budget guard.
 *
 * Reads the asset files emitted by `vite build` (when
 * `BUNDLE_ANALYZE=1` is set, rollup-plugin-visualizer also
 * emits a sidecar `dist/stats.json` we don't need here) and
 * asserts the per-chunk and total bundle sizes stay under the
 * budgets the M6 perf card set for the Tauri desktop build:
 *
 *   - Initial JS payload (the chunks loaded on the bootstrap
 *     screen) <= 600 KB gzipped.
 *   - Total bundle (every JS chunk in `dist/assets/`) <= 4 MB
 *     gzipped.
 *   - No single chunk >= 1.5 MB gzipped — such a chunk would
 *     defeat code splitting and block the initial render.
 *
 * We compute gzipped sizes on the fly (the visualizer's
 * sidecar JSON includes them, but its nested schema is brittle
 * and a custom gzip measurement is fast for a small number of
 * files). The Tauri app ships the gzipped bytes to the webview,
 * so gzipped is the budget that matters for cold-start latency.
 *
 * Exit code 0 on success, 1 on any budget breach. The script
 * prints the top-N largest chunks so a regression is easy to
 * diagnose without opening the treemap HTML.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const DIST_ASSETS = resolve('dist/assets')

// Tauri desktop — the webview is local so cold-start is bounded
// by the disk + parse + execute path, not by network bytes, but
// the 600 KB initial-payload budget still keeps the splash-to-
// interactive time below ~1s on a cold cache (Chromium parses
// ~1MB JS in ~50ms on an M-series Mac; the same budget on a
// modest laptop keeps the parse budget under ~200ms).
const INITIAL_PAYLOAD_BUDGET_KB = 600
const TOTAL_BUNDLE_BUDGET_KB = 4096
const SINGLE_CHUNK_BUDGET_KB = 1536

// Initial-entry chunks (loaded on the bootstrap screen). For
// Collier this is `main.js` + `window.js` (the shared webview
// runtime). `quick-pane.js` is a separate entry that's only
// loaded when the user opens the quick-pane window; it
// contributes to total bundle size but not to the initial
// bootstrap payload.
const INITIAL_ENTRY_NAMES = ['main', 'window']

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function listJsChunks() {
  let entries
  try {
    entries = readdirSync(DIST_ASSETS)
  } catch (err) {
    console.error(
      `FATAL: ${DIST_ASSETS} not found. Run \`bun run build:analyze\` first.\n  ${err.message}`
    )
    process.exit(1)
  }
  const chunks = []
  for (const name of entries) {
    if (!name.endsWith('.js')) continue
    const full = resolve(DIST_ASSETS, name)
    const raw = readFileSync(full)
    const gzip = gzipSync(raw, { level: 9 }).length
    chunks.push({
      name,
      rawBytes: raw.length,
      gzipBytes: gzip,
      // Heuristic: a chunk is initial if its filename starts
      // with one of the bootstrap entry names. The vite hash
      // suffix (`-Dt2dolUT`) doesn't change the prefix, so a
      // startsWith check is sufficient.
      isInitial: INITIAL_ENTRY_NAMES.some(prefix =>
        name.startsWith(`${prefix}-`)
      ),
    })
  }
  return chunks
}

const chunks = listJsChunks()
if (chunks.length === 0) {
  console.error(
    `FATAL: no JS chunks found in ${DIST_ASSETS}. Did the build succeed?`
  )
  process.exit(1)
}

const totalRaw = chunks.reduce((sum, c) => sum + c.rawBytes, 0)
const totalGzip = chunks.reduce((sum, c) => sum + c.gzipBytes, 0)
const initialChunks = chunks.filter(c => c.isInitial)
const initialGzip = initialChunks.reduce((sum, c) => sum + c.gzipBytes, 0)

console.log('M6 perf — bundle-size budget check')
console.log('================================')
console.log(`  chunks:           ${chunks.length} (${initialChunks.length} initial)`)
console.log(`  total uncompr.:   ${fmtKb(totalRaw)}`)
console.log(`  total gzipped:    ${fmtKb(totalGzip)}`)
console.log(
  `  initial gzipped:  ${fmtKb(initialGzip)} (budget: ${INITIAL_PAYLOAD_BUDGET_KB} KB)`
)
console.log('')

console.log('All chunks by gzipped size:')
const sorted = [...chunks].sort((a, b) => b.gzipBytes - a.gzipBytes)
for (const c of sorted) {
  const marker = c.isInitial ? '*' : ' '
  console.log(
    `  ${marker} ${fmtKb(c.gzipBytes).padStart(10)} gz   ${fmtKb(c.rawBytes).padStart(10)} raw   ${c.name}`
  )
}
console.log('  (* = initial/entry chunk loaded on bootstrap)')

let failed = false

if (initialGzip > INITIAL_PAYLOAD_BUDGET_KB * 1024) {
  console.error(
    `\nFAIL: initial payload ${fmtKb(initialGzip)} exceeds budget ${INITIAL_PAYLOAD_BUDGET_KB} KB`
  )
  failed = true
}

if (totalGzip > TOTAL_BUNDLE_BUDGET_KB * 1024) {
  console.error(
    `FAIL: total bundle ${fmtKb(totalGzip)} exceeds budget ${TOTAL_BUNDLE_BUDGET_KB / 1024} MB`
  )
  failed = true
}

const oversized = chunks.filter(c => c.gzipBytes > SINGLE_CHUNK_BUDGET_KB * 1024)
if (oversized.length > 0) {
  console.error(
    `\nFAIL: ${oversized.length} chunk(s) exceed the per-chunk budget of ${SINGLE_CHUNK_BUDGET_KB} KB gzipped:`
  )
  for (const c of oversized) {
    console.error(`  - ${fmtKb(c.gzipBytes)}  ${c.name}`)
  }
  failed = true
}

if (failed) {
  process.exit(1)
}

console.log(
  `\n✓ bundle-size budgets OK (initial=${fmtKb(initialGzip)}, total=${fmtKb(totalGzip)})`
)