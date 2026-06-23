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

## Cards (bounded, dependency-ordered)

1. **t-m0-fixture** (R2) — fixture script + a Rust integration test that loads it via the bd-runner. _(needs bd installed)_
2. **t-m0-e2e** (R3, dep: fixture) — Xvfb E2E job in CI + tauri-driver/WebdriverIO smoke test.
3. **t-m0-virtual** (R4, dep: fixture) — react-virtual on IssueListView + bounded-DOM test.
4. **t-m0-finalize** (dep: all, assignee lead) — `check:all` green, push, open the M0 PR, confirm CI incl. E2E green.

_(Operator prerequisite, not a card: install `bd` in the container — pending your choice of source.)_
