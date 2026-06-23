/**
 * WebdriverIO config for the Collier M0 smoke E2E.
 *
 * Runs against `tauri-driver` started by the CI workflow under Xvfb
 * (see .github/workflows/ci.yml). The driver listens on
 * http://localhost:4444 and launches the Collier Tauri app as a
 * subprocess of the driver — so the app inherits the driver's
 * working directory. The CI job `cd`s into the freshly-generated
 * fixture directory before launching the driver, which makes the
 * app pick up `.beads/` from `current_dir()` (see
 * src-tauri/src/commands/recent_repos.rs).
 *
 * Capability shape: tauri-driver accepts the W3C `tauri:options`
 * object via `wdio.capabilities['tauri:options']`. We pass the
 * absolute path to the built binary so tauri-driver knows which
 * process to spawn.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser } from '@wdio/globals'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// `bun run test:e2e` is invoked from the repo root; resolve relative
// to this file so the config works regardless of cwd.
const repoRoot = path.resolve(__dirname, '..', '..')

const tauriExecutable = process.env.E2E_TAURI_EXECUTABLE
  ? path.resolve(process.env.E2E_TAURI_EXECUTABLE)
  : path.join(repoRoot, 'src-tauri', 'target', 'debug', 'collier')

// `WebdriverIO.Config` is the *full* testrunner config (Testrunner +
// WithRequestedTestrunnerCapabilities). Using `Options.Testrunner`
// alone is missing the `capabilities` field per wdio 9's split
// types (Capabilities.d.ts / Options.d.ts).
export const config: WebdriverIO.Config = {
  // tauri-driver is a W3C WebDriver server.
  hostname: process.env.E2E_WDIO_HOSTNAME ?? '127.0.0.1',
  port: Number.parseInt(process.env.E2E_WDIO_PORT ?? '4444', 10),
  path: '/',
  // tauri-driver is a long-lived server; just retry until it's up.
  //
  // NOTE: in wdio 9, `connectionRetryTimeout` is NOT just the initial
  // connection timeout -- it is also passed to undici as
  // `connectTimeout` / `headersTimeout` / `bodyTimeout` AND used as
  // an `AbortSignal.timeout(...)` for the whole request (see
  // `webdriver/build/node.js`). That makes it the wall-clock budget
  // for EVERY WebDriver request, including the first POST /session
  // -- and that request must wait for tauri-driver to spawn
  // WebKitWebDriver, for WebKitWebDriver to spawn the Tauri app,
  // and for the app + Dolt (Beads) to finish their cold start. On a
  // fresh GitHub runner that whole chain takes 3-5 min (observed on
  // a follow-up CI run: 180s budget still timed out, WebKitWebDriver
  // /status was ready in <1s, but session creation took >3 min).
  // Bump the budget to 10 min to leave headroom; the CI job itself
  // has a 30 min ceiling so a worst-case 10 min handshake is fine.
  connectionRetryTimeout: 600_000,
  connectionRetryCount: 30,

  // No extra services — tauri-driver is a plain WebDriver server,
  // not a Selenium/Appium grid.
  services: [],

  // Look for specs next to this config file. The M0 smoke stays
  // first (alphabetically) as the canonical "app launches and the
  // list renders" gate; M1+ specs follow. Adding a new spec means
  // dropping a `*.spec.ts` file in this directory — no config
  // edit required.
  specs: [path.join(__dirname, '*.spec.ts')],
  // Strict, deterministic spec execution — one spec file, one file.
  specFileRetries: 0,
  specFileRetriesDelay: 0,
  maxInstances: 1,

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    // Match connectionRetryTimeout: the smoke test waits for the
    // bootstrap screen, the "Use CWD" click, and the first issue
    // row to render -- all of which depend on the Beads fixture
    // loading through the Tauri app. 3 min leaves headroom for
    // cold-start Dolt + WebKitWebDriver on a fresh CI runner.
    timeout: 180_000,
  },

  reporters: ['spec'],

  // Don't let wdio spawn its own Xvfb -- tauri-driver is the
  // process that needs the display (it launches the Tauri app
  // which opens a window), and the CI workflow runs tauri-driver
  // under `xvfb-run` explicitly. wdio 9's built-in auto-Xvfb
  // targets the *browser* (Selenium/WebDriver) process, which
  // we don't use here.
  autoXvfb: false,

  // E2E is a real GUI test — the app takes a moment to start
  // and render the first issue row, so be patient on the
  // wait-for-* default timeouts.
  waitforTimeout: 500,
  waitforInterval: 250,

  // Default W3C WebDriver protocol. tauri-driver speaks plain
  // HTTP; outputDir holds the wdio log file (created on demand).
  protocol: 'http',
  outputDir: path.join(__dirname, '.artifacts'),

  capabilities: [
    {
      // No `browserName` here on purpose: WebKitWebDriver (the
      // native driver tauri-driver spawns on Linux) doesn't
      // recognise "wry" and returns "Failed to match capabilities"
      // on POST /session if we set it. The official Tauri
      // webdriverio example
      // (github.com/tauri-apps/webdriver-example/v2/webdriver/webdriverio/wdio.conf.js)
      // also omits browserName; Selenium's example does set
      // "wry" but Selenium uses its own request serializer so
      // the WebKitWebDriver matching path is different. The
      // tauri:options capability below is the contract with
      // tauri-driver; everything else is forwarded to the
      // native driver as-is.
      'tauri:options': {
        // Path to the built Collier binary. Must be an absolute
        // path; tauri-driver does NOT search PATH.
        application: tauriExecutable,
      },
    },
  ],

  // Surface CI-relevant env on every test worker process.
  // wdio 9 renamed the per-worker env from `env` to `runnerEnv`.
  runnerEnv: {
    E2E: '1',
  },

  // Hook the worker lifecycle so CI logs have timestamps around
  // the WebKitWebDriver cold start. `onWorkerStart` fires after
  // the worker process is spawned but BEFORE the WebDriver
  // session is created (which is where the 60s timeout fires);
  // `onWorkerEnd` fires after the worker exits. Pair these with
  // the "Execution of N workers started" line wdio already prints
  // to triangulate whether the next failure is wdio's request
  // budget or an actual tauri-driver hang.
  onWorkerStart: (_cid, _caps, _specs) => {
    console.log(`[e2e] onWorkerStart at ${new Date().toISOString()}`)
  },
  onWorkerEnd: (_cid, _exitCode) => {
    console.log(`[e2e] onWorkerEnd at ${new Date().toISOString()}`)
  },

  // Capture a screenshot on any failed test, plus the wdio log
  // directory, for post-mortem debugging in CI.
  afterTest: async (test, _context, { error }) => {
    if (!error) {
      return
    }
    try {
      // wdio exposes a global `browser` in the hook context.
      const buf = await browser.takeScreenshot()
      const dir = path.join(__dirname, '.artifacts')
      await import('node:fs/promises').then(fs =>
        fs.mkdir(dir, { recursive: true })
      )
      const safe = test.parent ? `${test.parent}-${test.title}` : test.title
      const file = path.join(dir, `${safe.replaceAll(/\W+/g, '-')}.png`)
      await import('node:fs/promises').then(fs =>
        fs.writeFile(file, Buffer.from(buf, 'base64'))
      )
      console.log(`[e2e] screenshot saved: ${file}`)
    } catch (screenshotErr) {
      console.error(
        '[e2e] failed to capture screenshot:',
        screenshotErr instanceof Error ? screenshotErr.message : screenshotErr
      )
    }
  },
}
