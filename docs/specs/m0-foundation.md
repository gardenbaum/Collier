# M0 — Foundation & Verification Harness

**Goal:** Before any feature work, prove the verification loop end-to-end and lay the
performance baseline. After M0, every feature card can rely on: a deterministic test
workspace, a real GUI E2E check in CI, and virtualized lists.

**Key design note — the headless problem is solved in CI, not in the container:**
The Hermes worker runs headless (no display) and CANNOT launch the GUI. Therefore **E2E
runs in GitHub Actions CI under Xvfb** (runners can install a virtual display). The
worker writes the E2E tests + CI job and verifies via `bun run check:all` (unit/integration)
locally; the real "does the app launch and work" check happens on each PR in CI. `bd` is
installed in the container only for **Rust integration tests + fixture generation**.

## Requirements

### R1 — `bd` available and detected

- **Given** a worker/CI environment, **when** Collier's bd-detection runs, **then** `bd --version` resolves and `check_bd_version`/`check_schema_version` pass. (Operator installs `bd`; this card verifies detection + adds a guard test.)

### R2 — Deterministic test `.beads/` fixture

- A committed script (`scripts/make-fixture.sh` or a Rust/TS helper) that creates a temp Beads workspace via `bd init --quiet` and seeds a known dataset: ≥20 issues across all statuses, ≥2 epics with parent-child children, ≥3 dependency edges (incl. one blocked chain), labels, and at least one `bd ready` and one blocked item.
- **Given** a clean dir, **when** the fixture script runs, **then** `bd list --json` returns the seeded, deterministic set (stable IDs or a documented mapping) usable by both Rust integration tests and E2E.

### R3 — Xvfb E2E harness in CI

- Add an **E2E job** to `.github/workflows/ci.yml` (Linux): install Xvfb + Tauri runtime deps, build the app, run the fixture, drive the GUI via `tauri-driver` + WebdriverIO (or Playwright against the Tauri webview) under `xvfb-run`.
- **Smoke test (Given/When/Then):** Given the fixture workspace, when the app launches, then the issue list renders ≥1 row and the window title is "Collier". Capture a screenshot artifact on failure.
- E2E job must be **required** for the production-readiness PRs (gates merges).

### R4 — List virtualization baseline

- Introduce `@tanstack/react-virtual` and virtualize the primary issue list (`IssueListView`).
- **Given** a fixture of ≥1000 synthetic issues, **when** the list renders, **then** only viewport rows mount (assert DOM node count bounded) and scroll stays smooth (no full re-render on watcher tick).

## Acceptance for the milestone

- `bun run check:all` green; coverage thresholds hold.
- CI shows a **green E2E job** (Xvfb) with the smoke test passing on the PR.
- Fixture script reproducible; virtualization assertion test passing.

## Debugging E2E

The E2E job runs `tauri-driver` under `xvfb-run` against the built Collier binary,
then drives it with WebdriverIO 9 (`tests/e2e/smoke.spec.ts`). The harness is
intentionally minimal but has three cold-start costs that are easy to miss:

1. **Xvfb** (~$0.1s) — virtual display.
2. **tauri-driver** (~$2-5s) — the Rust WebDriver relay, listens on `:4444`.
3. **WebKitWebDriver** (~$10-60s on a fresh runner) — the native W3C driver
   that tauri-driver spawns, listens on `:4445`. This is the slow one.

The "Run E2E smoke test" step runs `bun run test:e2e`, which posts `/session`
to `:4444`. tauri-driver forwards the request to `:4445`. The wall-clock
budget for the whole handshake is `connectionRetryTimeout` in
`tests/e2e/wdio.conf.ts` (currently 180 s, see the in-file comment for why
60 s is too tight).

### Useful env vars and timeouts (already set in `.github/workflows/ci.yml`)

- `WEBKIT_DISABLE_SANDBOX_THIS_PROCESS=1` — skip the per-process sandbox
  setup that needs `CAP_SYS_ADMIN` (not available to the runner user).
- `WEBKIT_DISABLE_DMABUF_RENDERER=1` — skip the GPU DMA-BUF path on a
  headless runner.
- `GIO_USE_VFS=local` — use the local GIO VFS instead of Gvfsd (no GVFS
  in CI).
- `NO_AT_BRIDGE=1` — skip the accessibility bridge init that's slow on
  first boot.
- `connectionRetryTimeout: 180_000` — wdio 9 budget for each WebDriver
  request. The wdio 9 default is 120_000; we use 180_000 for headroom.
- `mochaOpts.timeout: 180_000` — matches the above for the smoke test.

### Where the logs go

- `tauri-driver.log` is captured by the workflow's `nohup ... > /tmp/tauri-driver.log 2>&1`
  but is **empty on a healthy start**: tauri-driver (v2.0.6) does no
  logging (its source has zero log calls, see
  `crates/tauri-driver/src/{server,webdriver,main}.rs`), and the native
  WebKitWebDriver's `stdout` is set to `Stdio::null()` by tauri-driver
  to keep the relay's own stdout clean. Anything you see in the log is
  from the WebKitWebDriver's `stderr`.
- The wdio worker prints the session-handshake start time via the
  `onWorkerStart` hook (see `tests/e2e/wdio.conf.ts`). The wdio "RUNNING
  in wry" / "FAILED in wry" lines bracket the whole handshake.
- On a test failure, the `afterTest` hook drops a screenshot into
  `tests/e2e/.artifacts/`, and the workflow uploads that directory as
  the `e2e-screenshots` artifact.

### Common failure shapes

- **"aborted due to timeout" on `POST /session` after 60 s wall** — the
  wdio `connectionRetryTimeout` is too tight. Raise it (the
  `tests/e2e/wdio.conf.ts` comment cites the relevant wdio 9 source).
  The "Pre-warm WebKitWebDriver" step in the workflow should normally
  prevent this by paying the cold start synchronously, but the timeout
  is the last line of defence.
- **`tests/e2e/.artifacts` is empty** — the test never reached
  `afterTest`. The session handshake itself failed. Check the
  `tauri-driver.log` and the wdio worker output (look for the
  `onWorkerStart` timestamp).
- **"tauri-driver is up" never appears** — Xvfb can't start, or
  tauri-driver's port is already taken. The healthcheck polls
  `:4444/status`; failure is reported with the last 50 lines of
  `tauri-driver.log`.

## Cards (bounded, dependency-ordered)

1. **t-m0-fixture** (R2) — fixture script + a Rust integration test that loads it via the bd-runner. _(needs bd installed)_
2. **t-m0-e2e** (R3, dep: fixture) — Xvfb E2E job in CI + tauri-driver/WebdriverIO smoke test.
3. **t-m0-virtual** (R4, dep: fixture) — react-virtual on IssueListView + bounded-DOM test.
4. **t-m0-finalize** (dep: all, assignee lead) — `check:all` green, push, open the M0 PR, confirm CI incl. E2E green.

_(Operator prerequisite, not a card: install `bd` in the container — pending your choice of source.)_
