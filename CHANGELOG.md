# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **CI: cross-platform build matrix.** Every PR now runs a cheap
  `tauri build --check` on `macos-latest` and `windows-latest`
  in addition to the existing Linux checks, so platform-specific
  compile errors (MSVC quirks, universal-binary surprises,
  webkit2gtk linking) surface before merge instead of waiting
  for the next tag. Pushes to `main` additionally run the full
  `tauri-action` matrix (`.dmg` / `.msi` / `.AppImage`) and
  upload the bundles as 90-day workflow artifacts for ad-hoc
  testing between tags. A new manual `Build Collier (manual)`
  workflow can be dispatched from the Actions UI with a
  `platforms` input (e.g. `macos,windows`) when you need an
  internal build without cutting a release tag.
- **M5 — accessibility & vim-style keyboard navigation.** The
  issue list is now a real ARIA grid (`role="grid"` with
  `aria-rowcount` / `aria-colcount` / `aria-label` and per-row
  `aria-selected`) so screen readers announce the focused row
  and total count. The left / right sidebars expose
  `aria-expanded` state to assistive tech, the modal dialogs
  trap focus and announce their headings, and every interactive
  control has a descriptive label (no "button with no
  accessible name" violations). Vim-style `j` / `k` / `Enter` /
  `Escape` / `/` / `h` / `l` navigation drives the list, ready,
  blocked, and selected views via a new `useKeyboardNavigation`
  hook; existing `Tab`-based navigation is unchanged.
- **M6 — comments, custom statuses, gates, performance, and
  release hardening.**
  - **Issue comments.** A comments thread on the issue detail
    drawer sorts chronologically (oldest → newest) so the
    order is deterministic regardless of `bd`'s wire order.
    Adding a comment via the UI is covered by a new E2E spec
    that exercises the `bd add-comment` round-trip.
  - **Custom statuses.** The sidebar status list is now
    populated from `commands.bdStatuses()` instead of being
    hard-coded; user-defined statuses defined in `.beads/`
    render without a renderer change. Both the sidebar and the
    issue row are covered by an E2E spec.
  - **Gates GUI view.** A new `GatesView` (sidebar tab +
    `ViewsRouter` case + i18n for en / de / fr / ar) reads from
    `commands.bdGateList` and renders the gate definitions +
    pass / fail state. See docs/specs/m6-comments-gates-statuses.md (Gates GUI section).
  - **Performance pass for large backlogs.** A new
    `scripts/make-large-fixture.sh` seeds 1200 issues (120
    epics + 480 epic children + 600 standalones) via a single
    `bd import` + `bd dep add --file` loop. `IssueListView`
    and `EpicView` both virtualise with
    `@tanstack/react-virtual`; sizing constants are extracted
    to `src/components/beads/views/epicViewSizing.ts` so the
    react-refresh lint rule can keep the component file pure.
    `useBeadsRealtimeSync` patches per-issue cache entries so
    watcher ticks never re-render the full list. A bundle-size
    guard (`scripts/check-bundle-size.js`) asserts initial
    payload < 600 KB gzipped and total bundle < 4 MB gzipped;
    current numbers (257.7 / 258.8 KB) leave ~2x headroom for
    future feature additions.
  - **Release hardening.** `release.yml` is now gated on
    `check:all` AND the Xvfb E2E harness (extracted into the
    reusable `.github/workflows/e2e.yml` so ci.yml and
    release.yml share one source of truth). The release docs
    list the required GitHub secrets
    (`TAURI_PRIVATE_KEY`,
    `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) and document the
    pubkey-rotation procedure; SECURITY.md captures the same
    contract in the security-policy table. A new
    `commands.getAppMetadata()` Tauri command surfaces the
    bundled `tauri.conf.json` to the renderer so the E2E
    suite can pin the name / version / identifier / updater
    endpoint / pubkey fingerprint without parsing the binary.

### Changed

- `IssueListView` no longer re-renders on every watcher tick;
  only the affected row's cache entry is patched (see
  `useBeadsRealtimeSync` in `src/hooks/`). The performance
  delta is large enough that the 1200-issue fixture stays
  smooth on a 30 Hz scroll.

## [0.1.0] - 2026-06-23

First public release of Collier, a cross-platform desktop GUI for
[Beads](https://github.com/steveyegge/beads).

### Added

- Cross-platform desktop app (macOS / Windows / Linux) built with
  Tauri v2, React 19 and TypeScript.
- Beads issue tracker UI: issue list with filtering, drawer-based
  detail view, label management, ready/closed/blocked views.
- `bd` CLI integration via a Tokio-backed Rust runner with a 10 s
  per-invocation timeout, write-locked per repo path, and a
  structured `BdError` envelope surfaced to the renderer.
- Live `.beads/` file-system watcher that pushes invalidation events
  to the React tree via Tauri events.
- Three-layer state management (`useState` → Zustand → TanStack Query)
  with ast-grep rules enforcing the pattern.
- Type-safe Rust ⇄ TypeScript command bridge via tauri-specta
  (`export_bindings` test target).
- Command palette (`Cmd+K`), platform-aware keyboard shortcuts,
  native menus (File / Edit / View) with i18n strings.
- Quick pane floating window with global shortcut and macOS NSPanel
  fullscreen overlay behavior.
- Preferences dialog with Rust-side persistence, icon-strip navigation,
  backdrop-blur surfaces, and a new section header.
- Collapsible left/right sidebars with resizable panels and state
  persistence.
- Light/dark theme system with OS preference detection, synced across
  windows.
- Toast notifications via Sonner plus native OS notifications.
- Auto-updater wired through the Tauri updater plugin and GitHub
  Releases (`latest.json` + `.sig`).
- Internationalization with English / German / French / Arabic and RTL
  support; CI asserts 4-locale parity.
- Static-analysis toolchain: ESLint (`--max-warnings 0`), Prettier,
  ast-grep (architecture rules), knip (unused code), jscpd
  (duplication), React Compiler, Rust clippy (`-D warnings`),
  rustfmt, Vitest with coverage thresholds.
- Single quality gate `bun run check:all` covering typecheck, lint,
  ast-grep, format, rustfmt, clippy, vitest, and `cargo test`.
- GitHub Actions CI running `bun run check:all` on every PR and push
  to `main`.
- GitHub Actions release workflow gated on `bun run check:all`,
  building Tauri bundles for macOS (`.dmg`), Windows (`.msi`) and
  Linux (`.AppImage`), and publishing a draft GitHub Release.

### Security

- Strict Content-Security-Policy in `tauri.conf.json` (no remote
  scripts, no `https:` in `img-src`, no Google Fonts preload).
- Least-privilege Tauri capabilities: `fs`, `log`, `notification`,
  `global-shortcut`, `mcp-bridge` and `window-state` removed from the
  capability surface because the webview never invokes them; quick-pane
  window show/hide/focus driven exclusively from Rust.
- JS dependency audit: zero advisories; `undici` overridden to
  `^7.28.0` to pick up the upstream fix for GHSA-vmh5-mc38-953g.
- Rust dependency audit: zero vulnerabilities; 19 documented
  transitive exceptions (gtk-rs, glib, bincode 1.3.3,
  proc-macro-error, paste and the unic family) recorded in
  `src-tauri/.cargo/audit.toml` and `docs/SECURITY.md`.

[Unreleased]: https://github.com/gardenbaum/Collier/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gardenbaum/Collier/releases/tag/v0.1.0

### Changed

- `build.yml` manual workflow no longer creates draft releases or fake `__manual-*` tags; it now builds with `bun run tauri build <bundles>` and uploads the bundles purely as workflow artifacts.
